import * as THREE from 'three';

/**
 * ============================================================================
 * ToddlerInputManager —— 2-3 岁幼儿高容错输入算法（对齐 PRD 第 2 节）
 * ============================================================================
 * 1. 1.45 倍热区膨胀：由 rig 侧构建不可见 hitProxy（尺寸 = 视觉网格 × 1.45），
 *    本模块只负责射线命中，命中即视为有效。
 * 2. 屏幕空间向量投影拖拽：p = clamp(((P-P0)·û) / Lmax, 0, 1)，Lmax = 150px
 * 3. 松开判定三态：p ≥ 0.30 → SNAP(自动磁吸)；< 400ms 且位移 < 30px → TAP 兜底；
 *    否则 REBOUND 回弹
 * 4. ≥ 3 指同时触控 → 判定为手掌拍击，直接对当前目标部件完成一次有效触发
 * ============================================================================
 */

export const HIT_EXPANSION = 1.45;
export const DRAG_FULL_PX = 150;
export const SNAP_THRESHOLD = 0.3;
export const TAP_MAX_MS = 400;
export const TAP_MAX_MOVE_PX = 30;
export const PALM_TOUCH_COUNT = 3;
/** 空闲多久后重播指令并显示小手示范 */
export const IDLE_REPROMPT_MS = 5000;

export interface HitBinding {
  partId: string;
  /** 放大 1.45 倍后的不可见碰撞体（visible 但 colorWrite=false） */
  hitObjects: THREE.Object3D[];
}

export interface DragSample {
  partId: string;
  progress: number;
  /** 屏幕坐标，供小手/光圈跟随 */
  clientX: number;
  clientY: number;
}

export type ReleaseOutcome = 'SNAP' | 'TAP' | 'REBOUND' | 'PALM_SLAP';

export interface ReleaseResult {
  partId: string;
  outcome: ReleaseOutcome;
  progress: number;
  holdMs: number;
  displacement: number;
}

export interface ToddlerInputOptions {
  element: HTMLElement;
  camera: THREE.Camera;
  /** 当前场景中所有可交互部件（含自由探索部件） */
  getBindings: () => HitBinding[];
  /** 当前主线步骤的目标部件 id */
  getTargetPartId: () => string | null;
  /** 当前主线步骤的教学手势方向（屏幕坐标系，x 右为正，y 下为正） */
  getTargetDirection: () => [number, number] | null;
  /** 当前步骤是否允许累积主线进度（ACTING 阶段锁定后仍允许，用于连续拖动） */
  isMainInteractive: () => boolean;
  /** 点击兜底是否开启 */
  allowTapFallback: () => boolean;
  onGrab: (partId: string) => void;
  onDrag: (sample: DragSample) => void;
  onRelease: (result: ReleaseResult) => void;
  /** 命中的是非主线目标部件 → 自由探索即时结果反馈 */
  onFreePartTouch: (partId: string) => void;
}

interface DragSession {
  pointerId: number;
  partId: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  downTime: number;
  progress: number;
  direction: [number, number];
  moved: boolean;
}

export class ToddlerInputManager {
  private readonly opts: ToddlerInputOptions;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly activePointers = new Set<number>();
  private session: DragSession | null = null;
  private palmLatched = false;
  private disposed = false;

  constructor(options: ToddlerInputOptions) {
    this.opts = options;
    const el = options.element;
    el.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    window.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    window.addEventListener('pointerup', this.handlePointerUp, { passive: false });
    window.addEventListener('pointercancel', this.handlePointerCancel, { passive: false });
    el.addEventListener('contextmenu', this.preventDefault);
    el.addEventListener('gesturestart', this.preventDefault as EventListener);
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const el = this.opts.element;
    el.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerCancel);
    el.removeEventListener('contextmenu', this.preventDefault);
    el.removeEventListener('gesturestart', this.preventDefault as EventListener);
    this.activePointers.clear();
    this.session = null;
  }

  /** 外部中断（切换步骤/返回车库）时清理拖拽会话 */
  public cancelSession() {
    this.session = null;
    this.palmLatched = false;
  }

  private preventDefault = (e: Event) => {
    e.preventDefault();
  };

  private toNdc(clientX: number, clientY: number) {
    const rect = this.opts.element.getBoundingClientRect();
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  /** 射线命中：优先响应当前主线目标部件，其次取最靠近相机的自由部件 */
  private pick(clientX: number, clientY: number): string | null {
    const bindings = this.opts.getBindings();
    if (bindings.length === 0) return null;
    this.toNdc(clientX, clientY);
    this.raycaster.setFromCamera(this.ndc, this.opts.camera);

    // 1) 目标部件优先：热区膨胀后相邻部件必然互相覆盖，
    //    引导期只要射线落在目标膨胀区内就判定命中，保证幼儿不卡关
    const targetId = this.opts.getTargetPartId();
    if (targetId) {
      const targetBinding = bindings.find((b) => b.partId === targetId);
      if (targetBinding && this.raycaster.intersectObjects(targetBinding.hitObjects, true).length > 0) {
        return targetId;
      }
    }

    // 2) 其余部件按距离取最近
    let best: { partId: string; distance: number } | null = null;
    for (const binding of bindings) {
      const hits = this.raycaster.intersectObjects(binding.hitObjects, true);
      for (const hit of hits) {
        if (!best || hit.distance < best.distance) {
          best = { partId: binding.partId, distance: hit.distance };
        }
      }
    }
    return best ? best.partId : null;
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();

    this.activePointers.add(e.pointerId);

    // ---- 多指手掌乱拍过滤：≥3 指 → 直接完成当前目标 ----
    if (this.activePointers.size >= PALM_TOUCH_COUNT) {
      const targetId = this.opts.getTargetPartId();
      if (targetId && !this.palmLatched) {
        this.palmLatched = true;
        this.session = null;
        this.opts.onRelease({
          partId: targetId,
          outcome: 'PALM_SLAP',
          progress: 1,
          holdMs: 0,
          displacement: 0,
        });
      }
      return;
    }

    if (this.session) return; // 已有手指在拖拽，忽略第二根手指

    const partId = this.pick(e.clientX, e.clientY);
    if (!partId) return;

    const targetId = this.opts.getTargetPartId();
    const direction = this.opts.getTargetDirection();

    if (partId === targetId && direction && this.opts.isMainInteractive()) {
      this.session = {
        pointerId: e.pointerId,
        partId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        downTime: performance.now(),
        progress: 0,
        direction,
        moved: false,
      };
      this.opts.onGrab(partId);
    } else {
      // 自由探索部件（喇叭 / 车轮 / 眼睛 / 非目标部件）→ 立即结果反馈
      this.opts.onFreePartTouch(partId);
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    const s = this.session;
    if (!s || s.pointerId !== e.pointerId) return;
    e.preventDefault();

    s.lastX = e.clientX;
    s.lastY = e.clientY;

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    // 屏幕空间向量投影：d = v · û
    const d = dx * s.direction[0] + dy * s.direction[1];
    const p = Math.min(Math.max(d / DRAG_FULL_PX, 0), 1);
    s.progress = p;
    s.moved = s.moved || Math.hypot(dx, dy) > 6;

    this.opts.onDrag({ partId: s.partId, progress: p, clientX: e.clientX, clientY: e.clientY });
  };

  private handlePointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size === 0) {
      this.palmLatched = false;
    }

    const s = this.session;
    if (!s || s.pointerId !== e.pointerId) return;
    this.session = null;

    const holdMs = performance.now() - s.downTime;
    const displacement = Math.hypot(s.lastX - s.startX, s.lastY - s.startY);

    let outcome: ReleaseOutcome = 'REBOUND';
    if (s.progress >= SNAP_THRESHOLD) {
      outcome = 'SNAP';
    } else if (
      this.opts.allowTapFallback() &&
      holdMs < TAP_MAX_MS &&
      displacement < TAP_MAX_MOVE_PX
    ) {
      outcome = 'TAP';
    }

    this.opts.onRelease({
      partId: s.partId,
      outcome,
      progress: s.progress,
      holdMs,
      displacement,
    });
  };

  private handlePointerCancel = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size === 0) this.palmLatched = false;
    const s = this.session;
    if (s && s.pointerId === e.pointerId) {
      this.session = null;
    }
  };
}

/**
 * 构建 1.45 倍膨胀的不可见碰撞体。
 * 使用 colorWrite=false + depthWrite=false，既不参与最终像素也不影响深度，但射线可命中。
 */
export function createHitProxy(
  size: THREE.Vector3,
  position: THREE.Vector3,
  parent: THREE.Object3D,
  expansion = HIT_EXPANSION
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(
    Math.max(size.x * expansion, 0.18),
    Math.max(size.y * expansion, 0.18),
    Math.max(size.z * expansion, 0.18)
  );
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  const proxy = new THREE.Mesh(geo, mat);
  proxy.position.copy(position);
  proxy.name = '__hit_proxy__';
  proxy.renderOrder = -1;
  parent.add(proxy);
  return proxy;
}

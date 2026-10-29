import * as THREE from 'three';
import { VehicleScenarioConfig } from '../../config/vehiclesConfig';
import { buildChassis, EyeState, EyesController } from './rigCommon';
import { buildKitFor, PartHandle } from './rigKits';
import { toyMat, starMesh } from '../../engine/toyKit';

/**
 * ============================================================================
 * VehicleRigBuilder —— 参数化萌系工程车 3D 组装器
 * ============================================================================
 * 生命系统（PRD 3.2 完整 4 种状态）：
 *  1. 待机呼吸 Idle Breathing：y = y0 + 0.025·sin(3.5t)，每 3.5s 眨眼 150ms
 *  2. 倾听期待 Listening：车身侧倾 ±4°，瞳孔放大 1.15 并注视目标部件
 *  3. 用力表情 Effort Squint：下眼睑上移遮挡 40%，25Hz / 0.008m 机械震颤
 *  4. 惊喜星星眼 Happy Star-Eyes：金色四角星瞳孔 + 弹簧阻尼跳跃 0.25m
 * ============================================================================
 */

export type { EyeState };

export interface RigUpdateOptions {
  eyeState: EyeState;
  lookAt: THREE.Vector3 | null;
  /** 当前步骤进度，用于侧倾方向与震颤强度 */
  progress?: number;
}

export interface VehicleRig {
  root: THREE.Group;
  body: THREE.Group;
  parts: Map<string, PartHandle>;
  eyes: EyesController;
  config: VehicleScenarioConfig;
  /** 语义化外观：贴纸图标用主色 */
  themeColor: string;
  applyStep: (stepIndex: number, progress: number) => void;
  update: (dt: number, elapsed: number, opts: RigUpdateOptions) => void;
  playHop: () => void;
  playFreePart: (partId: string) => void;
  getAnchorWorld: (partId: string, out: THREE.Vector3) => boolean;
  dispose: () => void;
}

export function buildVehicleRig(config: VehicleScenarioConfig): VehicleRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // 水车走「明黄车头 + 天空蓝水罐」的规范配色，其余车型以主题色为车身主色
  const isWaterTruck = config.id === 'water_truck';
  const chassis = buildChassis({
    bodyColor: isWaterTruck ? config.accentColorHex : config.themeColorHex,
    accentColor: isWaterTruck ? config.themeColorHex : config.accentColorHex,
    wheelColor: config.id === 'dump_truck' ? '#DC2626' : config.id === 'bulldozer' ? '#111827' : '#374151',
    mode: config.id === 'excavator' || config.id === 'bulldozer' ? 'tracks' : 'wheels',
    bodyLength: config.id === 'bulldozer' ? 2.5 : 2.3,
  });

  body.add(chassis.body);
  root.add(chassis.wheels);

  const kit = buildKitFor(config.id, {
    body,
    wheels: chassis.wheels,
    wheelMeshes: chassis.wheelMeshes,
    chassis,
    themeColor: config.themeColorHex,
    accentColor: config.accentColorHex,
  });

  const parts = new Map<string, PartHandle>();
  for (const p of kit.parts) parts.set(p.partId, p);

  /* --------------------------- 生命状态动画状态 --------------------------- */
  let hopY = 0;
  let hopV = 0;
  let hopCooldown = 0;
  let spinBoost = 0;
  let hornPop = 0;
  let liveStep = 0;
  let liveProgress = 0;
  let currentEyeState: EyeState = 'IDLE';

  const hornPart = parts.get('fp_horn');
  const wheelPart = parts.get('fp_wheels');
  const starBits: THREE.Mesh[] = [];

  // 欢呼时车顶飘出的小星星
  for (let i = 0; i < 5; i++) {
    const s = starMesh(0.085, "#FBBF24");
    s.visible = false;
    s.userData.phase = i / 5;
    body.add(s);
    starBits.push(s);
  }

  const wheelGroups = chassis.wheelMeshes.filter((o) => o.type === 'Group');

  const rig: VehicleRig = {
    root,
    body,
    parts,
    eyes: chassis.eyes,
    config,
    themeColor: config.themeColorHex,

    applyStep(stepIndex: number, progress: number) {
      liveStep = stepIndex;
      liveProgress = progress;
      for (const part of parts.values()) {
        part.apply(stepIndex, progress);
      }
    },

    update(dt: number, elapsed: number, opts: RigUpdateOptions) {
      const t = elapsed;

      // ---- 弹簧阻尼跳跃（欢呼）----
      if (hopCooldown > 0) hopCooldown -= dt;
      hopV -= 9.8 * dt;
      hopY += hopV * dt;
      if (hopY <= 0) {
        hopY = 0;
        if (hopV < -0.4) hopV = -hopV * 0.34; // 弹一下再落回
        else hopV = 0;
      }

      // ---- 待机呼吸 / 倾听侧倾 / 用力震颤 ----
      const breathing = 0.025 * Math.sin(3.5 * t);
      let tremble = 0;
      if (opts.eyeState === 'EFFORT' && (opts.progress ?? 0) > 0.05) {
        tremble = 0.008 * Math.sin(2 * Math.PI * 25 * t);
      }
      body.position.y = breathing + tremble + hopY;

      let rollTarget = 0;
      if (opts.eyeState === 'LISTEN') {
        rollTarget = 0.07; // ±4°
      } else if (opts.eyeState === 'STAR') {
        rollTarget = Math.sin(t * 6) * 0.05;
      }
      body.rotation.z += (rollTarget - body.rotation.z) * Math.min(1, dt * 5);

      // ---- 眼睛 ----
      if (currentEyeState !== opts.eyeState) {
        chassis.eyes.setState(opts.eyeState);
        currentEyeState = opts.eyeState;
      }
      const lookingAt = opts.eyeState === 'LISTEN' || opts.eyeState === 'EFFORT' ? opts.lookAt : null;
      chassis.eyes.lookAt(lookingAt);
      chassis.eyes.update(dt, t);

      // ---- 自由部件动画 ----
      if (hornPart) {
        const hornObj = hornPart.anchor.parent as THREE.Object3D | null;
        if (hornObj && hornPop > 0) {
          hornObj.scale.setScalar(1 + Math.sin(hornPop * Math.PI) * 0.22);
          hornPop = Math.max(0, hornPop - dt * 2.4);
          if (hornPop === 0) hornObj.scale.setScalar(1);
        }
      }

      if (wheelPart && spinBoost > 0.001) {
        spinBoost *= Math.pow(0.12, dt);
        for (const w of wheelGroups) w.rotation.z -= spinBoost * dt;
        if (spinBoost < 0.01) spinBoost = 0;
      }

      // ---- 欢呼星星 ----
      const cheering = opts.eyeState === 'STAR';
      starBits.forEach((s, i) => {
        s.visible = cheering;
        if (!cheering) return;
        const phase = (t * 0.7 + (s.userData.phase as number)) % 1;
        s.position.set(-0.6 + i * 0.3 + Math.sin(t * 2 + i) * 0.12, 1.9 + phase * 1.1, 0.3 - i * 0.15);
        s.rotation.y = t * 2 + i;
        s.rotation.z = Math.sin(t * 3 + i) * 0.4;
        s.scale.setScalar(0.8 + Math.sin(phase * Math.PI) * 0.5);
      });

      // ---- 部件专属每帧更新（水柱 / 烟圈 / 搅拌罐）----
      kit.update?.(dt, t, { stepIndex: liveStep, progress: liveProgress });
    },

    playHop() {
      if (hopCooldown > 0) return;
      hopV = 2.2; // √(2·9.8·0.25) ≈ 0.25m
      hopY = 0.001;
      hopCooldown = 0.35;
    },

    playFreePart(partId: string) {
      if (partId === 'fp_horn') hornPop = 1;
      else if (partId === 'fp_wheels') spinBoost = 9;
      else if (partId === 'fp_eyes') chassis.eyes.giggle();
    },

    getAnchorWorld(partId: string, out: THREE.Vector3) {
      const part = parts.get(partId);
      if (!part) return false;
      part.anchor.getWorldPosition(out);
      return true;
    },

    dispose() {
      root.removeFromParent();
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    },
  };

  // 给车身加一个柔和的地面接触阴影
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 32),
    new THREE.MeshBasicMaterial({
      color: '#2F4858',
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.scale.set(1.15, 0.85, 1);
  root.add(shadow);

  // 统一车漆微光，让软胶质感更明显
  const rim = new THREE.PointLight(config.themeColorHex, 0.45, 4.2);
  rim.position.set(-0.6, 2.1, 1.4);
  root.add(rim);

  return rig;
}

export const RIG_TOY_MATERIAL = toyMat;

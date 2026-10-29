import * as THREE from 'three';
import {
  toyMat,
  roundedBox,
  toySphere,
  toyCylinder,
  starMesh,
  MIN_RADIUS,
} from '../../engine/toyKit';

/**
 * 通用萌系工程车零件：底盘 / 车轮 / 履带 / 大眼睛（4 种生命状态）
 * 车头朝向 +X，车身宽沿 Z 轴展开。
 */

export type EyeState = 'IDLE' | 'LISTEN' | 'EFFORT' | 'STAR';

export interface EyesController {
  group: THREE.Group;
  setState: (s: EyeState) => void;
  getState: () => EyeState;
  update: (dt: number, elapsed: number) => void;
  lookAt: (world: THREE.Vector3 | null) => void;
  blinkOnce: () => void;
  /** 点击眼睛的开心回应（快速放大回弹） */
  giggle: () => void;
}

const EYE_RADIUS = 0.2;

export function createEyes(lidColor: string): EyesController {
  const group = new THREE.Group();

  const whiteMat = toyMat('#FFFFFF', { roughness: 0.28 });
  const pupilMat = toyMat('#2B2B3A', { roughness: 0.35 });
  const highlightMat = toyMat('#FFFFFF', { roughness: 0.1, emissive: '#ffffff', emissiveIntensity: 0.35 });
  const lidMat = toyMat(lidColor, { roughness: 0.5 });

  const eyes: {
    root: THREE.Group;
    pupil: THREE.Mesh;
    highlight: THREE.Mesh;
    lid: THREE.Mesh;
    star: THREE.Mesh;
  }[] = [];

  const buildOne = (side: -1 | 1) => {
    const root = new THREE.Group();
    // 两眼沿局部 X 轴左右排列，眼睛朝局部 +Z（外层 group 旋转 90° 后即贴在前挡风玻璃上朝车头）
    root.position.set(side * 0.3, 0, 0);

    const white = toySphere(EYE_RADIUS, whiteMat, 28);
    white.scale.set(0.92, 1, 0.72);
    root.add(white);

    const pupil = toySphere(EYE_RADIUS * 0.52, pupilMat, 20);
    pupil.position.set(0, 0, 0.115);
    pupil.scale.set(1, 1, 0.55);
    root.add(pupil);

    const highlight = toySphere(EYE_RADIUS * 0.17, highlightMat, 12);
    highlight.position.set(-0.045, 0.055, 0.148);
    root.add(highlight);

    // 下半球眼睑（用力时上移遮挡瞳孔 40%，平时收在眼白下方完全隐藏）
    const lidGeo = new THREE.SphereGeometry(EYE_RADIUS * 1.04, 24, 14, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44);
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.scale.set(0.94, 1, 0.74);
    lid.position.y = -0.47;
    root.add(lid);

    const star = starMesh(EYE_RADIUS * 0.62, '#FBBF24');
    star.position.set(0, 0, 0.13);
    star.visible = false;
    root.add(star);

    group.add(root);
    eyes.push({ root, pupil, highlight, lid, star });
    return root;
  };

  buildOne(-1);
  buildOne(1);

  let state: EyeState = 'IDLE';
  let nextBlinkAt = 2.2;
  let blinkStart = -1;
  let pupilScale = 1;
  let pupilScaleTarget = 1;
  let giggleAt = -1;
  let lookTarget: THREE.Vector3 | null = null;
  const tmp = new THREE.Vector3();

  return {
    group,
    setState(s: EyeState) {
      if (state === s) return;
      state = s;
      pupilScaleTarget = s === 'LISTEN' ? 1.15 : s === 'STAR' ? 1.05 : 1;
      for (const e of eyes) {
        e.star.visible = s === 'STAR';
        e.pupil.visible = s !== 'STAR';
      }
      if (s === 'STAR') {
        // 星星眼闪亮登场
        for (const e of eyes) e.star.scale.setScalar(1.5);
      }
    },
    getState: () => state,
    blinkOnce() {
      blinkStart = performance.now() / 1000;
    },
    giggle() {
      giggleAt = performance.now() / 1000;
    },
    lookAt(world: THREE.Vector3 | null) {
      lookTarget = world;
    },
    update(dt: number, elapsed: number) {
      // 眨眼：每 3.5s 一次，单次 150ms
      if (blinkStart < 0 && elapsed >= nextBlinkAt) {
        blinkStart = elapsed;
        nextBlinkAt = elapsed + 3.5 + Math.random() * 0.9;
      }
      let blinkScaleY = 1;
      if (blinkStart >= 0) {
        const t = (elapsed - blinkStart) / 0.15;
        if (t >= 1) {
          blinkStart = -1;
        } else {
          blinkScaleY = 1 - Math.sin(t * Math.PI) * 0.9;
        }
      }

      // 点击眼睛的开心放大
      let giggleScale = 1;
      if (giggleAt >= 0) {
        const t = (elapsed - giggleAt) / 0.42;
        if (t >= 1) giggleAt = -1;
        else giggleScale = 1 + Math.sin(t * Math.PI) * 0.28;
      }

      pupilScale += (pupilScaleTarget - pupilScale) * Math.min(1, dt * 10);

      for (const e of eyes) {
        e.root.scale.set(giggleScale, blinkScaleY * giggleScale, giggleScale);

        // 眼睑：用力时上移遮挡 40%
        const lidTargetY = state === 'EFFORT' ? -0.06 : -0.47;
        e.lid.position.y += (lidTargetY - e.lid.position.y) * Math.min(1, dt * 12);

        // 瞳孔注视（局部 XY 偏移，限制在眼白范围内）
        let px = 0;
        let py = 0;
        if (lookTarget) {
          group.worldToLocal(tmp.copy(lookTarget));
          const dz = Math.max(0.25, tmp.z);
          px = THREE.MathUtils.clamp(tmp.x / dz, -1, 1) * 0.045;
          py = THREE.MathUtils.clamp(tmp.y / dz, -1, 1) * 0.045;
        }
        const k = Math.min(1, dt * 8);
        e.pupil.position.x += (px - e.pupil.position.x) * k;
        e.pupil.position.y += (py - e.pupil.position.y) * k;
        e.pupil.scale.set(pupilScale, pupilScale, 0.55 * pupilScale);
        e.highlight.position.x = e.pupil.position.x - 0.045;
        e.highlight.position.y = e.pupil.position.y + 0.055;
        e.star.position.x = e.pupil.position.x;
        e.star.position.y = e.pupil.position.y;
        e.star.rotation.z += dt * 2.4;
        e.star.scale.lerp(new THREE.Vector3(pupilScale, pupilScale, pupilScale), k);
      }
    },
  };
}

/* ------------------------------- 底盘 ------------------------------- */

export interface ChassisOptions {
  bodyColor: string;
  accentColor: string;
  wheelColor?: string;
  mode?: 'wheels' | 'tracks';
  bodyLength?: number;
  bodyHeight?: number;
  bodyWidth?: number;
  wheelRadius?: number;
  wheelCount?: number;
}

export interface ChassisResult {
  /** 车身组（含底盘、驾驶室、玻璃、眼睛），不含车轮 */
  body: THREE.Group;
  /** 车轮/履带组 */
  wheels: THREE.Group;
  wheelMeshes: THREE.Object3D[];
  eyes: EyesController;
  /** 眼睛世界定位点（供高亮锚点使用） */
  eyeAnchor: THREE.Object3D;
  /** 车头前缘 X 坐标 */
  frontX: number;
  /** 驾驶室中心（放置喇叭/部件） */
  cabinCenter: THREE.Vector3;
}

export function buildChassis(opts: ChassisOptions): ChassisResult {
  const {
    bodyColor,
    accentColor,
    wheelColor = '#374151',
    mode = 'wheels',
    bodyLength = 2.3,
    bodyHeight = 0.78,
    bodyWidth = 1.32,
    wheelRadius = 0.42,
  } = opts;

  const body = new THREE.Group();
  const wheels = new THREE.Group();
  const wheelMeshes: THREE.Object3D[] = [];

  const paint = toyMat(bodyColor);
  const accent = toyMat(accentColor);
  const dark = toyMat('#2F3A46', { roughness: 0.55 });
  const glass = toyMat('#BFE9FF', {
    transparent: true,
    opacity: 0.62,
    roughness: 0.12,
    metalness: 0.1,
  });
  const rubber = toyMat(wheelColor, { roughness: 0.75 });
  const hub = toyMat('#F3F4F6', { roughness: 0.4 });

  const chassisY = wheelRadius + 0.02;

  // 主车体
  const lower = roundedBox(bodyLength, bodyHeight * 0.62, bodyWidth, 0.16, paint);
  lower.position.set(-0.05, chassisY + bodyHeight * 0.31, 0);
  body.add(lower);

  // 驾驶室
  const cabinW = bodyLength * 0.42;
  const cabinH = bodyHeight * 0.72;
  const cabin = roundedBox(cabinW, cabinH, bodyWidth * 0.92, 0.14, paint);
  cabin.position.set(bodyLength * 0.24, chassisY + bodyHeight * 0.62 + cabinH * 0.5 - 0.02, 0);
  body.add(cabin);

  // 车窗（朝车头）
  const windshield = roundedBox(0.07, cabinH * 0.62, bodyWidth * 0.88, 0.04, glass);
  windshield.position.set(cabin.position.x + cabinW * 0.5 + 0.005, cabin.position.y + 0.03, 0);
  body.add(windshield);

  // 车顶棚
  const roof = roundedBox(cabinW * 1.06, 0.11, bodyWidth * 0.96, 0.05, accent);
  roof.position.set(cabin.position.x, cabin.position.y + cabinH * 0.5 + 0.03, 0);
  body.add(roof);

  // 保险杠微笑灯带
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(bodyWidth * 0.26, 0.035, 8, 20, Math.PI * 0.78),
    toyMat('#FFFFFF', { emissive: '#FDE68A', emissiveIntensity: 0.4 })
  );
  smile.position.set(bodyLength * 0.5 - 0.02, chassisY + bodyHeight * 0.28, 0);
  smile.rotation.y = Math.PI / 2;
  smile.rotation.z = -Math.PI * 0.39;
  body.add(smile);

  // 后视镜（小圆耳）
  const mirrorL = roundedBox(0.09, 0.16, 0.09, 0.045, accent);
  mirrorL.position.set(cabin.position.x + cabinW * 0.32, cabin.position.y + cabinH * 0.28, bodyWidth * 0.52);
  const mirrorR = mirrorL.clone();
  mirrorR.position.z = -bodyWidth * 0.52;
  body.add(mirrorL, mirrorR);

  // 大眼睛：贴在前挡风玻璃上，两眼沿车身横向（Z 轴）排列，朝车头方向
  const eyes = createEyes(bodyColor);
  eyes.group.position.set(cabin.position.x + cabinW * 0.5 + 0.055, cabin.position.y + 0.05, 0);
  eyes.group.rotation.y = Math.PI / 2 - 0.2;
  eyes.group.scale.setScalar(1.02);
  body.add(eyes.group);
  const eyeAnchor = new THREE.Object3D();
  eyeAnchor.position.copy(eyes.group.position);
  body.add(eyeAnchor);

  // 车轮
  const wheelWidth = mode === 'tracks' ? 0.36 : 0.3;
  const axleX = bodyLength * 0.29;
  const wheelZ = bodyWidth * 0.5 + 0.03;

  const makeWheel = (x: number, z: number) => {
    const w = new THREE.Group();
    const tire = toyCylinder(wheelRadius, wheelRadius, wheelWidth, rubber, 22);
    tire.rotation.x = Math.PI / 2;
    w.add(tire);
    const hubMesh = toyCylinder(wheelRadius * 0.52, wheelRadius * 0.52, wheelWidth + 0.02, hub, 16);
    hubMesh.rotation.x = Math.PI / 2;
    w.add(hubMesh);
    // 轮辐高光，转起来更有辨识度
    for (let i = 0; i < 4; i++) {
      const spoke = roundedBox(wheelRadius * 0.9, 0.05, wheelWidth + 0.03, 0.02, toyMat('#FDE68A'));
      spoke.rotation.x = Math.PI / 2;
      spoke.rotation.z = (i / 4) * Math.PI;
      spoke.position.z = 0;
      spoke.rotation.y = 0;
      w.add(spoke);
    }
    w.position.set(x, wheelRadius, z);
    wheels.add(w);
    wheelMeshes.push(w);
    return w;
  };

  if (mode === 'wheels') {
    makeWheel(axleX, wheelZ);
    makeWheel(axleX, -wheelZ);
    makeWheel(-axleX, wheelZ);
    makeWheel(-axleX, -wheelZ);
  } else {
    // 履带：长条底盘 + 内部小轮 + 三角前端
    for (const z of [wheelZ, -wheelZ]) {
      const track = roundedBox(bodyLength * 0.98, wheelRadius * 1.5, wheelWidth, 0.16, rubber);
      track.position.set(0, wheelRadius * 0.9, z);
      wheels.add(track);
      wheelMeshes.push(track);

      for (const tx of [-axleX * 0.85, 0, axleX * 0.85]) {
        const idler = toyCylinder(wheelRadius * 0.34, wheelRadius * 0.34, wheelWidth + 0.04, hub, 12);
        idler.rotation.x = Math.PI / 2;
        idler.position.set(tx, wheelRadius * 0.85, z);
        wheels.add(idler);
      }
      // 履带齿纹
      for (let i = 0; i < 7; i++) {
        const tooth = roundedBox(0.1, 0.09, wheelWidth + 0.03, 0.03, toyMat('#4B5563'));
        tooth.position.set(-bodyLength * 0.44 + (i / 6) * bodyLength * 0.88, wheelRadius * 0.28, z);
        wheels.add(tooth);
      }
    }
  }

  return {
    body,
    wheels,
    wheelMeshes,
    eyes,
    eyeAnchor,
    frontX: bodyLength * 0.5,
    cabinCenter: new THREE.Vector3(cabin.position.x, cabin.position.y, 0),
  };
}

/* ------------------------------- 零件 ------------------------------- */

/** 车头小喇叭（自由探索部件 fp_horn） */
export function buildHorn(parent: THREE.Object3D, position: THREE.Vector3, color = '#FBBF24'): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(position);
  const base = toyCylinder(0.09, 0.11, 0.1, toyMat(color), 16);
  base.rotation.z = Math.PI / 2;
  group.add(base);
  const cone = toyCylinder(0.19, 0.08, 0.22, toyMat(color, { roughness: 0.35 }), 18, true);
  cone.rotation.z = -Math.PI / 2;
  cone.position.x = 0.15;
  group.add(cone);
  const inner = toyCylinder(0.14, 0.14, 0.02, toyMat('#FEF3C7'), 16);
  inner.rotation.z = Math.PI / 2;
  inner.position.x = 0.24;
  group.add(inner);
  parent.add(group);
  return group;
}

/** 车头大灯（含可点亮的光束锥） */
export function buildHeadlights(
  parent: THREE.Object3D,
  frontX: number,
  width: number,
  y: number
): { group: THREE.Group; beams: THREE.Mesh[]; lamps: THREE.Mesh[] } {
  const group = new THREE.Group();
  const beams: THREE.Mesh[] = [];
  const lamps: THREE.Mesh[] = [];

  const lampMat = toyMat('#FFF7CC', { emissive: '#FDE047', emissiveIntensity: 0.15, roughness: 0.2 });
  const beamMat = freshBeamMaterial();

  for (const z of [width * 0.32, -width * 0.32]) {
    const lamp = toyCylinder(0.13, 0.13, 0.07, lampMat, 18);
    lamp.rotation.z = Math.PI / 2;
    lamp.position.set(frontX + 0.03, y, z);
    group.add(lamp);
    lamps.push(lamp);

    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.45, 18, 1, true), beamMat);
    beam.rotation.z = -Math.PI / 2;
    beam.position.set(frontX + 0.72, y, z);
    beam.visible = false;
    beam.renderOrder = 2;
    group.add(beam);
    beams.push(beam);
  }

  parent.add(group);
  return { group, beams, lamps };
}

function freshBeamMaterial() {
  return new THREE.MeshBasicMaterial({
    color: '#FDE68A',
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** 空锚点（用于部件高亮位置） */
export function anchorAt(parent: THREE.Object3D, x: number, y: number, z = 0): THREE.Object3D {
  const a = new THREE.Object3D();
  a.position.set(x, y, z);
  parent.add(a);
  return a;
}

export const TOY_MIN_RADIUS = MIN_RADIUS;

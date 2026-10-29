import * as THREE from 'three';
import {
  toyMat,
  freshMat,
  roundedBox,
  toyCylinder,
  toySphere,
  starMesh,
  heartMesh,
  stripeTexture,
  clamp01,
  lerp,
} from '../../engine/toyKit';
import { createHitProxy } from '../../engine/ToddlerInputManager';
import { buildHorn, buildHeadlights, ChassisResult } from './rigCommon';

/**
 * 六大工程车专属可动部件（PRD 第 5 节）
 * 每个部件都注册：1.45 倍放大不可见碰撞体 + 世界锚点 + 进度驱动函数 apply(stepIndex, p)
 */

export interface PartHandle {
  partId: string;
  anchor: THREE.Object3D;
  hitProxy: THREE.Mesh;
  apply: (stepIndex: number, progress: number) => void;
}

export interface KitLive {
  stepIndex: number;
  progress: number;
}

export interface KitResult {
  parts: PartHandle[];
  update?: (dt: number, elapsed: number, live: KitLive) => void;
}

export interface KitContext {
  body: THREE.Group;
  wheels: THREE.Group;
  wheelMeshes: THREE.Object3D[];
  chassis: ChassisResult;
  themeColor: string;
  accentColor: string;
}

/* ------------------------------ 粒子水柱 ------------------------------ */

interface JetStream {
  points: THREE.Points;
  update: (dt: number, origin: THREE.Vector3, target: THREE.Vector3, strength: number) => void;
  dispose: () => void;
}

function createJetStream(color = '#7DD3FC', count = 46): JetStream {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size: 0.15,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;

  let t = 0;
  const tmp = new THREE.Vector3();

  return {
    points,
    update(dt, origin, target, strength) {
      const s = clamp01(strength);
      if (s < 0.03) {
        points.visible = false;
        return;
      }
      points.visible = true;
      mat.opacity = 0.55 + 0.4 * s;
      t += dt;
      const arr = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const phase = (seeds[i] + t * 1.55) % 1;
        // 抛物线：从炮口射向目标，中途起拱
        tmp.lerpVectors(origin, target, phase);
        tmp.y += Math.sin(phase * Math.PI) * 0.55 + 0.05;
        tmp.x += Math.sin(phase * 9 + seeds[i] * 6) * 0.045;
        tmp.z += Math.cos(phase * 8 + seeds[i] * 5) * 0.045;
        arr[i * 3] = tmp.x;
        arr[i * 3 + 1] = tmp.y;
        arr[i * 3 + 2] = tmp.z;
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/* ------------------------------ 烟圈粒子 ------------------------------ */

interface PuffRing {
  group: THREE.Group;
  update: (dt: number, strength: number) => void;
}

function createPuffRings(color = '#FFFFFF', count = 4): PuffRing {
  const group = new THREE.Group();
  const rings: { mesh: THREE.Mesh; speed: number; offset: number }[] = [];

  for (let i = 0; i < count; i++) {
    // 每个烟圈独立材质，才能各自淡出
    const mat = toyMat(color, { roughness: 0.3, transparent: true, opacity: 0.9 }).clone();
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.085, 10, 22), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.visible = false;
    group.add(mesh);
    rings.push({ mesh, speed: 0.8 + i * 0.12, offset: i / count });
  }

  let t = 0;
  return {
    group,
    update(dt, strength) {
      t += dt * clamp01(strength);
      rings.forEach((r, idx) => {
        if (strength < 0.05) {
          r.mesh.visible = false;
          return;
        }
        const phase = (t * r.speed + r.offset) % 1;
        r.mesh.visible = true;
        r.mesh.position.y = phase * 1.5 + idx * 0.12;
        const scale = 0.5 + phase * 1.5;
        r.mesh.scale.setScalar(scale);
        (r.mesh.material as THREE.MeshStandardMaterial).opacity = (1 - phase) * 0.85;
      });
    },
  };
}

function addPart(
  partId: string,
  parentForHit: THREE.Object3D,
  anchor: THREE.Object3D,
  hitSize: [number, number, number],
  hitPos: [number, number, number],
  apply: PartHandle['apply']
): PartHandle {
  const proxy = createHitProxy(
    new THREE.Vector3(hitSize[0], hitSize[1], hitSize[2]),
    new THREE.Vector3(hitPos[0], hitPos[1], hitPos[2]),
    parentForHit
  );
  return { partId, anchor, hitProxy: proxy, apply };
}

/* ============================ 1. 洒水车 ============================ */

export function buildWaterTruckKit(ctx: KitContext): KitResult {
  const { body, chassis } = ctx;
  const blue = toyMat(ctx.themeColor);
  const white = toyMat('#F8FAFC');
  const red = toyMat('#EF4444', { roughness: 0.4 });
  const yellow = toyMat('#FACC15');

  /* ---- 水罐 ---- */
  const tankGroup = new THREE.Group();
  tankGroup.position.set(-0.46, chassis.cabinCenter.y + 0.4, 0);
  body.add(tankGroup);

  const tankShell = toyCylinder(0.51, 0.51, 1.48, toyMat(ctx.themeColor, { transparent: true, opacity: 0.42, roughness: 0.25 }), 26);
  tankShell.rotation.z = Math.PI / 2;
  tankGroup.add(tankShell);
  // 罐体加强箍
  for (const x of [-0.42, 0.42]) {
    const band = toyCylinder(0.535, 0.535, 0.08, toyMat('#0284C7', { roughness: 0.5 }), 26);
    band.rotation.z = Math.PI / 2;
    band.position.x = x;
    tankGroup.add(band);
  }

  // 水位（内部蓝色水体，沿竖直方向随进度上升）
  const waterGeo = new THREE.BoxGeometry(1.34, 0.9, 0.82);
  waterGeo.translate(0, 0.5, 0);
  const waterMat = freshMat('#38BDF8', { transparent: true, opacity: 0.88, roughness: 0.18 });
  const waterFill = new THREE.Mesh(waterGeo, waterMat);
  waterFill.position.set(0, -0.46, 0);
  waterFill.scale.y = 0.01;
  tankGroup.add(waterFill);

  // 水箱小黄鸭
  const duck = new THREE.Group();
  const duckBody = toySphere(0.1, toyMat('#FACC15'), 16);
  duckBody.scale.set(1.15, 0.9, 1);
  duck.add(duckBody);
  const duckHead = toySphere(0.07, toyMat('#FACC15'), 14);
  duckHead.position.set(0.07, 0.09, 0);
  duck.add(duckHead);
  const duckBeak = toyCylinder(0.0, 0.032, 0.05, toyMat('#F97316'), 10);
  duckBeak.rotation.z = -Math.PI / 2;
  duckBeak.position.set(0.14, 0.085, 0);
  duck.add(duckBeak);
  duck.position.set(-0.28, -0.5, 0.1);
  tankGroup.add(duck);

  // 罐顶注水口
  const tankCap = toyCylinder(0.12, 0.16, 0.11, toyMat('#0369A1'), 16);
  tankCap.position.set(0.38, 0.5, 0);
  tankGroup.add(tankCap);

  /* ---- 梅花阀门（part_valve）---- */
  const valveGroup = new THREE.Group();
  valveGroup.position.set(-0.98, chassis.cabinCenter.y + 0.3, 0.5);
  body.add(valveGroup);

  const valveStem = toyCylinder(0.07, 0.07, 0.34, toyMat('#94A3B8'), 12);
  valveStem.rotation.x = Math.PI / 2;
  valveStem.position.z = -0.16;
  valveGroup.add(valveStem);

  const wheel = new THREE.Group();
  wheel.position.z = 0.12;
  const hubCap = toyCylinder(0.13, 0.13, 0.1, red, 18);
  hubCap.rotation.x = Math.PI / 2;
  wheel.add(hubCap);
  for (let i = 0; i < 5; i++) {
    const handle = roundedBox(0.34, 0.11, 0.09, 0.045, red);
    handle.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.17, Math.sin((i / 5) * Math.PI * 2) * 0.17, 0);
    handle.rotation.z = (i / 5) * Math.PI * 2;
    wheel.add(handle);
  }
  valveGroup.add(wheel);

  const valveAnchor = new THREE.Object3D();
  valveAnchor.position.set(0, 0, 0.16);
  wheel.add(valveAnchor);

  /* ---- 云朵白水炮（part_cannon）---- */
  const cannonPivot = new THREE.Group();
  cannonPivot.position.set(0.44, chassis.cabinCenter.y + 0.5, 0);
  body.add(cannonPivot);

  const cannonBase = toyCylinder(0.24, 0.3, 0.22, white, 20);
  cannonBase.position.y = 0.1;
  cannonPivot.add(cannonBase);

  const barrelPivot = new THREE.Group();
  barrelPivot.position.y = 0.24;
  cannonPivot.add(barrelPivot);

  const barrel = toyCylinder(0.11, 0.14, 0.78, white, 18);
  barrel.rotation.z = -Math.PI / 2;
  barrel.position.x = 0.38;
  barrelPivot.add(barrel);

  const muzzle = toyCylinder(0.15, 0.15, 0.09, toyMat('#DBEAFE', { roughness: 0.3 }), 18);
  muzzle.rotation.z = -Math.PI / 2;
  muzzle.position.x = 0.79;
  barrelPivot.add(muzzle);

  const cannonAnchor = new THREE.Object3D();
  cannonAnchor.position.set(0.82, 0, 0);
  barrelPivot.add(cannonAnchor);

  const jet = createJetStream('#7DD3FC');
  body.add(jet.points);

  /* ---- 自由部件：喇叭 / 车轮 / 眼睛 ---- */
  const horn = buildHorn(body, new THREE.Vector3(chassis.frontX * 0.55, chassis.cabinCenter.y - 0.22, 0.86));
  const hornAnchor = new THREE.Object3D();
  horn.add(hornAnchor);

  const wheelAnchor = new THREE.Object3D();
  chassis.wheels.add(wheelAnchor);
  wheelAnchor.position.set(0.66, 0.42, 0.72);

  let jetStrength = 0;

  const parts: PartHandle[] = [
    addPart('part_valve', valveGroup, valveAnchor, [0.5, 0.5, 0.24], [0, 0, 0.12], (si, p) => {
      const fill = si === 0 ? clamp01(p) : 1;
      wheel.rotation.z = si === 0 ? p * Math.PI * 2 : Math.PI * 2;
      waterFill.scale.y = Math.max(0.012, fill * 1.02);
      duck.position.y = -0.46 + fill * 0.92;
      duck.rotation.z = Math.sin(performance.now() / 260) * 0.14 * fill;
      duck.visible = fill > 0.04;
    }),
    addPart('part_cannon', cannonPivot, cannonAnchor, [0.9, 0.55, 0.5], [0.3, 0.2, 0], (si, p) => {
      if (si === 1) {
        barrelPivot.rotation.z = lerp(0.06, 0.5, p);
        barrelPivot.rotation.y = lerp(-0.3, 0.12, p);
        jetStrength = p;
      } else if (si === 2) {
        barrelPivot.rotation.z = lerp(0.5, 0.12, p);
        barrelPivot.rotation.y = lerp(0.12, 0.42, p);
        jetStrength = p;
      } else if (si === 0) {
        barrelPivot.rotation.z = 0.06;
        barrelPivot.rotation.y = -0.3;
        jetStrength = 0;
      } else {
        barrelPivot.rotation.z = 0.12;
        barrelPivot.rotation.y = 0.42;
        jetStrength = 0;
      }
    }),
    addPart('fp_horn', horn, hornAnchor, [0.42, 0.36, 0.36], [0.05, 0, 0], () => {}),
    addPart('fp_wheels', chassis.wheels, wheelAnchor, [1.9, 1.0, 0.5], [0, 0.42, 0.7], () => {}),
    addPart('fp_eyes', chassis.body, chassis.eyeAnchor, [0.62, 0.4, 0.6], [chassis.eyeAnchor.position.x, chassis.eyeAnchor.position.y, 0], () => {}),
  ];

  const muzzleWorld = new THREE.Vector3();
  const targetWorld = new THREE.Vector3(2.55, 0.25, 0.35);

  return {
    parts,
    update(dt) {
      jetStrength += (Math.max(0, jetStrength) - jetStrength) * Math.min(1, dt * 6);
      cannonAnchor.getWorldPosition(muzzleWorld);
      jet.update(dt, muzzleWorld, targetWorld, jetStrength);
    },
  };
}

/* ============================ 2. 挖掘机 ============================ */

export function buildExcavatorKit(ctx: KitContext): KitResult {
  const { body, chassis } = ctx;
  const orange = toyMat('#EA580C', { roughness: 0.42 });
  const yellow = toyMat(ctx.themeColor);
  const steel = toyMat('#CBD5E1', { roughness: 0.5, metalness: 0.15 });

  /* ---- 车门（part_door）---- */
  const doorHinge = new THREE.Group();
  doorHinge.position.set(chassis.cabinCenter.x + 0.42, chassis.cabinCenter.y, chassis.cabinCenter.z + 0.6);
  body.add(doorHinge);

  const doorPanel = roundedBox(0.64, 0.58, 0.1, 0.05, orange);
  doorPanel.position.set(-0.32, 0, 0);
  doorHinge.add(doorPanel);

  const doorGlass = roundedBox(0.32, 0.24, 0.04, 0.03, toyMat('#BFE9FF', { transparent: true, opacity: 0.6, roughness: 0.15 }));
  doorGlass.position.set(-0.2, 0.08, 0.07);
  doorHinge.add(doorGlass);

  const doorHandle = roundedBox(0.14, 0.05, 0.05, 0.02, toyMat('#FDE047'));
  doorHandle.position.set(-0.5, -0.05, 0.08);
  doorHinge.add(doorHandle);

  const doorAnchor = new THREE.Object3D();
  doorAnchor.position.set(-0.33, 0, 0.06);
  doorHinge.add(doorAnchor);

  // 小熊司机（站在车门内侧，开门后挥手）
  const bear = new THREE.Group();
  bear.position.set(chassis.cabinCenter.x - 0.18, chassis.cabinCenter.y, 0.74);
  bear.scale.setScalar(0.85);
  const bearHead = toySphere(0.19, toyMat('#C08457'), 18);
  bear.add(bearHead);
  const earL = toySphere(0.07, toyMat('#A16207'), 12);
  earL.position.set(-0.02, 0.16, 0.13);
  const earR = earL.clone();
  earR.position.z = -0.13;
  bear.add(earL, earR);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    toyMat('#FACC15', { roughness: 0.35 })
  );
  helmet.position.y = 0.06;
  bear.add(helmet);
  const snout = toySphere(0.08, toyMat('#FDE68A'), 12);
  snout.position.set(0.15, -0.04, 0);
  bear.add(snout);
  const paw = toySphere(0.07, toyMat('#C08457'), 12);
  paw.position.set(0.24, 0.02, 0.02);
  bear.add(paw);
  body.add(bear);

  /* ---- 机械臂（part_bucket_arm）---- */
  const armBase = new THREE.Group();
  armBase.position.set(chassis.cabinCenter.x - 0.05, chassis.cabinCenter.y + 0.62, 0);
  body.add(armBase);

  const turret = toyCylinder(0.22, 0.26, 0.16, yellow, 18);
  armBase.add(turret);

  const boomPivot = new THREE.Group();
  boomPivot.position.y = 0.1;
  armBase.add(boomPivot);

  const boom = roundedBox(1.15, 0.2, 0.22, 0.08, yellow);
  boom.position.set(0.52, 0, 0);
  boomPivot.add(boom);

  // 液压缸
  const cylinder = toyCylinder(0.055, 0.055, 0.6, steel, 10);
  cylinder.rotation.z = Math.PI / 2;
  cylinder.position.set(0.34, -0.16, 0.14);
  boomPivot.add(cylinder);

  const stickPivot = new THREE.Group();
  stickPivot.position.set(1.02, 0, 0);
  boomPivot.add(stickPivot);

  const stick = roundedBox(0.72, 0.15, 0.17, 0.06, orange);
  stick.position.set(0.3, -0.02, 0);
  stickPivot.add(stick);

  const bucketPivot = new THREE.Group();
  bucketPivot.position.set(0.62, -0.04, 0);
  stickPivot.add(bucketPivot);

  const bucket = new THREE.Group();
  const bucketBack = roundedBox(0.36, 0.3, 0.46, 0.08, steel);
  bucket.add(bucketBack);
  const bucketLip = roundedBox(0.1, 0.1, 0.46, 0.04, toyMat('#94A3B8'));
  bucketLip.position.set(0.2, 0.12, 0);
  bucket.add(bucketLip);
  for (let i = 0; i < 4; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 8), steel);
    tooth.rotation.z = -Math.PI / 2;
    tooth.position.set(0.26, 0.16, -0.16 + i * 0.11);
    bucket.add(tooth);
  }
  bucketPivot.add(bucket);

  const armAnchor = new THREE.Object3D();
  armAnchor.position.set(0.3, 0, 0);
  boomPivot.add(armAnchor);

  /* ---- 自由部件 ---- */
  const horn = buildHorn(body, new THREE.Vector3(chassis.frontX * 0.55, chassis.cabinCenter.y - 0.22, 0.86), '#F97316');
  const hornAnchor = new THREE.Object3D();
  horn.add(hornAnchor);

  const wheelAnchor = new THREE.Object3D();
  chassis.wheels.add(wheelAnchor);
  wheelAnchor.position.set(0.66, 0.4, 0.75);

  const parts: PartHandle[] = [
    addPart('part_door', doorHinge, doorAnchor, [0.78, 0.7, 0.28], [-0.33, 0, 0], (si, p) => {
      const open = si === 0 ? clamp01(p) : 1;
      doorHinge.rotation.y = open * Math.PI * 0.42; // 75°
      bear.position.x = chassis.cabinCenter.x - 0.18 - 0.12 * open;
      paw.rotation.z = Math.sin(performance.now() / 200) * 0.4 * open;
      paw.position.x = 0.24 + 0.1 * open;
    }),
    addPart('part_bucket_arm', armBase, armAnchor, [2.3, 1.0, 0.6], [0.85, 0.05, 0], (si, p) => {
      if (si === 1) {
        // Step 2 下压挖掘
        boomPivot.rotation.z = lerp(0.12, -0.42, p);
        stickPivot.rotation.z = lerp(-0.9, -0.15, p);
        bucketPivot.rotation.z = lerp(0.55, -0.5, p);
        armBase.rotation.y = 0;
      } else if (si === 2) {
        // Step 3 抬升举宝
        boomPivot.rotation.z = lerp(-0.42, 0.85, p);
        stickPivot.rotation.z = lerp(-0.15, -0.85, p);
        bucketPivot.rotation.z = lerp(-0.5, 0.35, p);
        armBase.rotation.y = lerp(0, -0.25, p);
      } else if (si === 0) {
        boomPivot.rotation.z = 0.12;
        stickPivot.rotation.z = -0.9;
        bucketPivot.rotation.z = 0.55;
        armBase.rotation.y = 0;
      } else {
        boomPivot.rotation.z = 0.85;
        stickPivot.rotation.z = -0.85;
        bucketPivot.rotation.z = 0.35;
        armBase.rotation.y = -0.25;
      }
    }),
    addPart('fp_horn', horn, hornAnchor, [0.42, 0.36, 0.36], [0.05, 0, 0], () => {}),
    addPart('fp_wheels', chassis.wheels, wheelAnchor, [2.0, 1.0, 0.5], [0, 0.4, 0.72], () => {}),
    addPart('fp_eyes', chassis.body, chassis.eyeAnchor, [0.62, 0.4, 0.6], [chassis.eyeAnchor.position.x, chassis.eyeAnchor.position.y, 0], () => {}),
  ];

  return { parts };
}

/* ============================ 3. 自卸翻斗车 ============================ */

export function buildDumpTruckKit(ctx: KitContext): KitResult {
  const { body, chassis } = ctx;
  const lemon = toyMat('#FDE047');
  const green = toyMat(ctx.themeColor);
  const metal = toyMat('#94A3B8', { roughness: 0.55, metalness: 0.2 });

  /* ---- 车头大灯（part_headlights）---- */
  const lights = buildHeadlights(body, chassis.frontX, 1.32, chassis.cabinCenter.y - 0.46);

  const lightAnchor = new THREE.Object3D();
  lightAnchor.position.set(chassis.frontX + 0.1, chassis.cabinCenter.y - 0.46, 0.42);
  body.add(lightAnchor);

  /* ---- 储料拉杆（part_hopper_lever）---- */
  const leverPivot = new THREE.Group();
  leverPivot.position.set(0.04, chassis.cabinCenter.y - 0.08, 0.7);
  body.add(leverPivot);

  const leverPost = toyCylinder(0.05, 0.05, 0.52, metal, 10);
  leverPost.rotation.z = -0.18;
  leverPost.position.y = 0.26;
  leverPivot.add(leverPost);

  const leverKnob = toySphere(0.12, toyMat('#EF4444', { roughness: 0.3 }), 16);
  leverKnob.position.set(0.05, 0.53, 0);
  leverPivot.add(leverKnob);

  const leverAnchor = new THREE.Object3D();
  leverAnchor.position.set(0.05, 0.53, 0);
  leverPivot.add(leverAnchor);

  /* ---- 液压翻斗（part_dump_bed）---- */
  const bedHinge = new THREE.Group();
  bedHinge.position.set(-chassis.frontX * 0.62, chassis.cabinCenter.y - 0.26, 0);
  body.add(bedHinge);

  const bedGroup = new THREE.Group();
  bedHinge.add(bedGroup);

  const bedFloor = roundedBox(1.35, 0.12, 1.28, 0.05, lemon);
  bedFloor.position.set(0.66, 0, 0);
  bedGroup.add(bedFloor);

  for (const z of [0.64, -0.64]) {
    const side = roundedBox(1.35, 0.34, 0.1, 0.05, lemon);
    side.position.set(0.66, 0.17, z);
    bedGroup.add(side);
  }
  const bedFront = roundedBox(0.12, 0.36, 1.3, 0.05, lemon);
  bedFront.position.set(1.3, 0.18, 0);
  bedGroup.add(bedFront);
  const bedTail = roundedBox(0.1, 0.3, 1.24, 0.04, toyMat('#FACC15'));
  bedTail.position.set(0.02, 0.15, 0);
  bedGroup.add(bedTail);

  // 车斗里的彩色海洋球（装满后可见）
  const ballColors = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#C084FC'];
  const balls: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const ball = toySphere(0.1, toyMat(ballColors[i % ballColors.length], { roughness: 0.32 }), 12);
    ball.position.set(0.28 + (i % 5) * 0.21, 0.08 + Math.floor(i / 5) * 0.13, -0.42 + ((i * 3) % 5) * 0.21);
    ball.visible = false;
    bedGroup.add(ball);
    balls.push(ball);
  }

  const bedAnchor = new THREE.Object3D();
  bedAnchor.position.set(0.7, 0.15, 0);
  bedHinge.add(bedAnchor);

  // 液压杆
  const ram = toyCylinder(0.07, 0.07, 0.5, metal, 12);
  ram.rotation.z = Math.PI / 2;
  ram.position.set(-0.28, 0.1, 0);
  body.add(ram);

  /* ---- 自由部件 ---- */
  const horn = buildHorn(body, new THREE.Vector3(chassis.frontX * 0.55, chassis.cabinCenter.y - 0.22, 0.86), '#F87171');
  const hornAnchor = new THREE.Object3D();
  horn.add(hornAnchor);

  const wheelAnchor = new THREE.Object3D();
  chassis.wheels.add(wheelAnchor);
  wheelAnchor.position.set(0.66, 0.42, 0.72);

  const parts: PartHandle[] = [
    addPart('part_headlights', lights.group, lightAnchor, [0.45, 0.4, 1.15], [chassis.frontX + 0.1, chassis.cabinCenter.y - 0.46, 0], (si, p) => {
      const on = si === 0 ? clamp01(p) : 1;
      lights.beams.forEach((b) => {
        b.visible = on > 0.02;
        const m = b.material as THREE.MeshBasicMaterial;
        m.opacity = 0.2 * on;
        b.scale.set(0.55 + 0.45 * on, 0.55 + 0.45 * on, 0.55 + 0.45 * on);
      });
      lights.lamps.forEach((l) => {
        const m = l.material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = 0.15 + on * 1.2;
      });
    }),
    addPart('part_hopper_lever', leverPivot, leverAnchor, [0.7, 0.9, 0.4], [0.05, 0.28, 0], (si, p) => {
      const pull = si === 1 ? clamp01(p) : si > 1 ? 1 : 0;
      leverPivot.rotation.z = -pull * 1.05;
    }),
    addPart('part_dump_bed', bedHinge, bedAnchor, [1.6, 0.8, 1.5], [0.66, 0.16, 0], (si, p) => {
      const tilt = si === 2 ? clamp01(p) : si > 2 ? 1 : 0;
      bedHinge.rotation.z = tilt * Math.PI * 0.28; // 50°
      ram.scale.y = 1 + tilt * 0.5;
      ram.position.y = 0.1 + tilt * 0.18;
      const filled = si === 1 ? clamp01(p) : si > 1 ? 1 : 0;
      balls.forEach((b, i) => {
        b.visible = filled > 0.15 + (i % 5) * 0.02;
      });
    }),
    addPart('fp_horn', horn, hornAnchor, [0.42, 0.36, 0.36], [0.05, 0, 0], () => {}),
    addPart('fp_wheels', chassis.wheels, wheelAnchor, [1.9, 1.0, 0.5], [0, 0.42, 0.7], () => {}),
    addPart('fp_eyes', chassis.body, chassis.eyeAnchor, [0.62, 0.4, 0.6], [chassis.eyeAnchor.position.x, chassis.eyeAnchor.position.y, 0], () => {}),
  ];

  return { parts };
}

/* ============================ 4. 起重吊车 ============================ */

export function buildCraneTruckKit(ctx: KitContext): KitResult {
  const { body, chassis } = ctx;
  const yellow = toyMat(ctx.themeColor);
  const orange = toyMat('#F97316', { roughness: 0.42 });
  const blue = toyMat('#2563EB', { roughness: 0.35 });
  const steel = toyMat('#CBD5E1', { metalness: 0.2, roughness: 0.5 });

  /* ---- 支腿（part_outriggers）---- */
  const outriggerLegs: THREE.Group[] = [];
  const outriggerRoot = new THREE.Group();
  outriggerRoot.position.set(0, chassis.cabinCenter.y - 0.24, 0);
  body.add(outriggerRoot);

  const legDefs: [number, number][] = [
    [0.78, 0.62],
    [0.78, -0.62],
    [-0.82, 0.62],
    [-0.82, -0.62],
  ];
  for (const [lx, lz] of legDefs) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0, lz);
    outriggerRoot.add(pivot);

    const arm = roundedBox(0.12, 0.72, 0.12, 0.05, yellow);
    arm.position.y = -0.36;
    pivot.add(arm);

    const foot = toyCylinder(0.16, 0.16, 0.1, toyMat('#475569'), 14);
    foot.position.y = -0.74;
    pivot.add(foot);

    pivot.rotation.x = (lz > 0 ? 1 : -1) * -1.3;
    outriggerLegs.push(pivot);
  }

  const outriggerAnchor = new THREE.Object3D();
  outriggerAnchor.position.set(0, -0.5, 0.6);
  outriggerRoot.add(outriggerAnchor);

  /* ---- 伸缩吊臂（part_crane_boom）---- */
  const boomBase = new THREE.Group();
  boomBase.position.set(-0.18, chassis.cabinCenter.y + 0.3, 0);
  body.add(boomBase);

  const boomTurret = toyCylinder(0.3, 0.36, 0.26, orange, 20);
  boomBase.add(boomTurret);

  const boomPivot = new THREE.Group();
  boomPivot.position.y = 0.18;
  boomBase.add(boomPivot);

  const boomMain = roundedBox(0.95, 0.24, 0.26, 0.08, orange);
  boomMain.position.set(0.44, 0, 0);
  boomPivot.add(boomMain);

  const boomInner = roundedBox(0.95, 0.18, 0.2, 0.06, yellow);
  boomInner.position.set(1.18, 0, 0);
  boomPivot.add(boomInner);

  // 钢丝绳 + 吊钩
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), toyMat('#334155'));
  cable.position.set(1.62, -0.5, 0);
  boomPivot.add(cable);

  const hook = new THREE.Group();
  const hookRing = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 16), blue);
  hookRing.rotation.x = Math.PI / 2;
  hook.add(hookRing);
  const hookClaw = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.042, 8, 16, Math.PI * 1.2), blue);
  hookClaw.position.y = -0.16;
  hook.add(hookClaw);
  hook.position.set(1.62, -1.02, 0);
  boomPivot.add(hook);

  // 吊钩磁吸光环
  const magnetRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.03, 8, 24),
    toyMat('#60A5FA', { emissive: '#3B82F6', emissiveIntensity: 0.8 })
  );
  magnetRing.rotation.x = Math.PI / 2;
  magnetRing.position.set(1.62, -1.24, 0);
  magnetRing.visible = false;
  boomPivot.add(magnetRing);

  const boomAnchor = new THREE.Object3D();
  boomAnchor.position.set(1.0, 0, 0);
  boomPivot.add(boomAnchor);

  /* ---- 自由部件 ---- */
  const horn = buildHorn(body, new THREE.Vector3(chassis.frontX * 0.55, chassis.cabinCenter.y - 0.22, 0.86), '#FBBF24');
  const hornAnchor = new THREE.Object3D();
  horn.add(hornAnchor);

  const wheelAnchor = new THREE.Object3D();
  chassis.wheels.add(wheelAnchor);
  wheelAnchor.position.set(0.66, 0.42, 0.72);

  const parts: PartHandle[] = [
    addPart('part_outriggers', outriggerRoot, outriggerAnchor, [2.0, 1.4, 1.8], [0, -0.4, 0], (si, p) => {
      const down = si === 0 ? clamp01(p) : si > 0 ? 1 : 0;
      outriggerLegs.forEach((leg, i) => {
        const sign = leg.position.z > 0 ? 1 : -1;
        leg.rotation.x = lerp(sign * 1.3, 0, down);
        leg.position.z = (i % 2 === 0 ? 0.62 : -0.62) + sign * 0.28 * down;
      });
    }),
    addPart('part_crane_boom', boomBase, boomAnchor, [2.4, 1.0, 0.7], [0.9, 0.1, 0], (si, p) => {
      if (si === 1) {
        const ext = clamp01(p);
        boomInner.scale.x = 0.5 + ext * 0.9;
        boomInner.position.x = 0.75 + ext * 0.85;
        cable.position.x = boomInner.position.x + boomInner.scale.x * 0.42;
        hook.position.x = cable.position.x;
        magnetRing.position.x = hook.position.x;
        cable.visible = ext > 0.25;
        hook.visible = ext > 0.25;
        magnetRing.visible = ext > 0.6;
        (magnetRing.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(performance.now() / 120) * 0.4;
        boomPivot.rotation.z = lerp(0.38, 0.56, ext);
        boomBase.rotation.y = lerp(0, 0.15, ext);
      } else if (si === 2) {
        boomInner.scale.x = 1.4;
        boomInner.position.x = 1.6;
        cable.position.x = 2.0;
        hook.position.x = 2.0;
        magnetRing.position.x = 2.0;
        cable.visible = true;
        hook.visible = true;
        magnetRing.visible = true;
        boomPivot.rotation.z = lerp(0.5, 0.8, p);
        boomBase.rotation.y = lerp(0.15, -0.35, p);
      } else if (si === 0) {
        boomInner.scale.x = 0.5;
        boomInner.position.x = 0.75;
        cable.visible = false;
        hook.visible = false;
        magnetRing.visible = false;
        boomPivot.rotation.z = 0.38;
        boomBase.rotation.y = 0;
      } else {
        boomInner.scale.x = 1.4;
        boomInner.position.x = 1.6;
        cable.position.x = 2.0;
        hook.position.x = 2.0;
        magnetRing.position.x = 2.0;
        cable.visible = true;
        hook.visible = true;
        magnetRing.visible = false;
        boomPivot.rotation.z = 0.8;
        boomBase.rotation.y = -0.35;
      }
      // 钢丝绳长度跟随吊钩
      const cableLen = Math.max(0.2, hook.position.y - boomPivot.position.y - 0.1);
      cable.scale.y = Math.max(0.3, (hook.position.y * -1 + 0.2) * 1.2);
      cable.position.y = hook.position.y + 0.3;
    }),
    addPart('fp_horn', horn, hornAnchor, [0.42, 0.36, 0.36], [0.05, 0, 0], () => {}),
    addPart('fp_wheels', chassis.wheels, wheelAnchor, [1.9, 1.0, 0.5], [0, 0.42, 0.7], () => {}),
    addPart('fp_eyes', chassis.body, chassis.eyeAnchor, [0.62, 0.4, 0.6], [chassis.eyeAnchor.position.x, chassis.eyeAnchor.position.y, 0], () => {}),
  ];

  return { parts };
}

/* ============================ 5. 水泥搅拌车 ============================ */

export function buildCementMixerKit(ctx: KitContext): KitResult {
  const { body, chassis } = ctx;
  const mint = toyMat(ctx.themeColor);
  const violet = toyMat('#8B5CF6', { roughness: 0.4 });
  const steel = toyMat('#CBD5E1', { metalness: 0.2, roughness: 0.5 });

  /* ---- 进料漏斗（part_funnel）---- */
  const funnelPivot = new THREE.Group();
  funnelPivot.position.set(-1.12, chassis.cabinCenter.y + 0.84, 0);
  body.add(funnelPivot);

  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.16, 0.42, 18, 1, true), toyMat('#A7F3D0', { side: THREE.DoubleSide, roughness: 0.45 }));
  funnel.position.y = 0.2;
  funnelPivot.add(funnel);

  const funnelRim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 8, 20), mint);
  funnelRim.rotation.x = Math.PI / 2;
  funnelRim.position.y = 0.41;
  funnelPivot.add(funnelRim);

  const funnelAnchor = new THREE.Object3D();
  funnelAnchor.position.set(0, 0.2, 0);
  funnelPivot.add(funnelAnchor);

  // 罐尾进料口，让漏斗“插在罐子上”而不是悬空
  const intake = toyCylinder(0.26, 0.3, 0.26, toyMat('#6EE7B7', { roughness: 0.45 }), 18);
  intake.rotation.z = Math.PI / 2;
  intake.position.set(-0.82, chassis.cabinCenter.y + 0.62, 0);
  body.add(intake);

  /* ---- 糖果条纹搅拌罐（part_mixer_drum）---- */
  const drumPivot = new THREE.Group();
  drumPivot.position.set(-0.42, chassis.cabinCenter.y + 0.62, 0);
  body.add(drumPivot);

  const stripeTex = stripeTexture(['#FDF2F8', '#F9A8D4', '#A7F3D0', '#FDE68A'], 12);
  stripeTex.repeat.set(2, 1);
  const drumMat = toyMat('#FFFFFF', { roughness: 0.4 });
  drumMat.map = stripeTex;

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 1.55, 24), drumMat);
  drum.rotation.z = Math.PI / 2;
  drum.castShadow = true;
  drumPivot.add(drum);

  const drumBack = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), drumMat);
  drumBack.rotation.z = Math.PI / 2;
  drumBack.position.x = -0.77;
  drumPivot.add(drumBack);

  const drumFront = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 20), mint);
  drumFront.rotation.y = Math.PI / 2;
  drumFront.position.x = 0.78;
  drumPivot.add(drumFront);

  const drumAnchor = new THREE.Object3D();
  drumAnchor.position.set(0, 0.1, 0);
  drumPivot.add(drumAnchor);

  // 罐口飘出的彩色泡泡
  const bubbles: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const b = toySphere(0.07 + (i % 3) * 0.02, toyMat(['#F9A8D4', '#FDE68A', '#A7F3D0'][i % 3], { transparent: true, opacity: 0.85, roughness: 0.2 }), 10);
    b.visible = false;
    drumPivot.add(b);
    bubbles.push(b);
  }

  /* ---- 卸料溜槽（part_chute）---- */
  const chutePivot = new THREE.Group();
  chutePivot.position.set(-1.32, chassis.cabinCenter.y + 0.62, 0);
  body.add(chutePivot);

  const chute = roundedBox(1.45, 0.11, 0.58, 0.05, violet);
  chute.position.set(-0.68, 0, 0);
  chute.rotation.z = 0.05;
  chutePivot.add(chute);

  for (const z of [0.28, -0.28]) {
    const wall = roundedBox(1.45, 0.2, 0.07, 0.03, toyMat('#A78BFA'));
    wall.position.set(-0.68, 0.1, z);
    chutePivot.add(wall);
  }

  const chuteAnchor = new THREE.Object3D();
  chuteAnchor.position.set(-0.8, 0.06, 0);
  chutePivot.add(chuteAnchor);

  const chuteJet = createJetStream('#E9D5FF', 30);
  body.add(chuteJet.points);

  /* ---- 自由部件 ---- */
  const horn = buildHorn(body, new THREE.Vector3(chassis.frontX * 0.55, chassis.cabinCenter.y - 0.22, 0.86), '#34D399');
  const hornAnchor = new THREE.Object3D();
  horn.add(hornAnchor);

  const wheelAnchor = new THREE.Object3D();
  chassis.wheels.add(wheelAnchor);
  wheelAnchor.position.set(0.66, 0.42, 0.72);

  let drumVelocity = 0;
  let chuteStrength = 0;
  const chuteWorld = new THREE.Vector3();

  const parts: PartHandle[] = [
    addPart('part_funnel', funnelPivot, funnelAnchor, [0.78, 0.62, 0.72], [0, 0.2, 0], (si, p) => {
      const tilt = si === 0 ? clamp01(p) : si > 0 ? 1 : 0;
      funnelPivot.rotation.z = -tilt * 0.55;
      funnelPivot.rotation.x = Math.sin(tilt * Math.PI * 2) * 0.12;
    }),
    addPart('part_mixer_drum', drumPivot, drumAnchor, [1.62, 1.1, 1.18], [0, 0.05, 0], (si, p) => {
      const spin = si === 1 ? clamp01(p) : si > 1 ? 1 : 0;
      drumVelocity = spin * 12.5; // 720°/s ≈ 12.5 rad/s
      bubbles.forEach((b, i) => {
        b.visible = spin > 0.1;
        if (b.visible) {
          const t = ((performance.now() / 1000) * 0.5 + i / bubbles.length) % 1;
          b.position.set(0.6 + Math.sin(i * 2.1 + t * 4) * 0.18, 0.42 + t * 0.55, Math.cos(i * 1.7 + t * 3) * 0.3);
        }
      });
    }),
    addPart('part_chute', chutePivot, chuteAnchor, [1.4, 0.7, 0.75], [-0.5, 0.05, 0], (si, p) => {
      const down = si === 2 ? clamp01(p) : si > 2 ? 1 : 0;
      chutePivot.rotation.z = -down * 0.62;
      chuteStrength = down;
    }),
    addPart('fp_horn', horn, hornAnchor, [0.42, 0.36, 0.36], [0.05, 0, 0], () => {}),
    addPart('fp_wheels', chassis.wheels, wheelAnchor, [1.9, 1.0, 0.5], [0, 0.42, 0.7], () => {}),
    addPart('fp_eyes', chassis.body, chassis.eyeAnchor, [0.62, 0.4, 0.6], [chassis.eyeAnchor.position.x, chassis.eyeAnchor.position.y, 0], () => {}),
  ];

  return {
    parts,
    update(dt) {
      drum.rotation.x += drumVelocity * dt;
      drumBack.rotation.y += drumVelocity * dt;
      drumFront.rotation.z += drumVelocity * dt * 0.6;
      chuteAnchor.getWorldPosition(chuteWorld);
      chuteStrength += (chuteStrength - chuteStrength) * 0.1;
    },
  };
}

/* ============================ 6. 推土机 ============================ */

export function buildBulldozerKit(ctx: KitContext): KitResult {
  const { body, chassis } = ctx;
  const silver = toyMat('#E5E7EB', { roughness: 0.4, metalness: 0.18 });
  const dark = toyMat('#1F2937', { roughness: 0.55 });
  const yellow = toyMat(ctx.themeColor);

  /* ---- 排气管（part_exhaust_pipe）---- */
  const pipePivot = new THREE.Group();
  pipePivot.position.set(chassis.frontX * 0.46, chassis.cabinCenter.y + 0.62, 0.34);
  body.add(pipePivot);

  const pipe = toyCylinder(0.09, 0.11, 0.72, dark, 14);
  pipe.position.y = 0.36;
  pipePivot.add(pipe);

  const pipeCap = toyCylinder(0.12, 0.12, 0.08, toyMat('#374151'), 14);
  pipeCap.position.y = 0.74;
  pipePivot.add(pipeCap);

  const pipeAnchor = new THREE.Object3D();
  pipeAnchor.position.set(0, 0.5, 0);
  pipePivot.add(pipeAnchor);

  const puffs = createPuffRings('#FFFFFF', 4);
  puffs.group.position.set(0, 0.78, 0);
  pipePivot.add(puffs.group);

  /* ---- 巨型推铲（part_dozer_blade）---- */
  const bladePivot = new THREE.Group();
  bladePivot.position.set(chassis.frontX + 0.42, chassis.cabinCenter.y - 0.06, 0);
  body.add(bladePivot);

  const blade = roundedBox(0.22, 0.92, 1.72, 0.09, silver);
  bladePivot.add(blade);

  const bladeTop = roundedBox(0.26, 0.14, 1.78, 0.06, toyMat('#F3F4F6'));
  bladeTop.position.y = 0.46;
  bladePivot.add(bladeTop);

  for (const z of [0.6, -0.6]) {
    const rib = roundedBox(0.3, 0.7, 0.08, 0.03, toyMat('#9CA3AF'));
    rib.position.set(-0.14, 0, z);
    bladePivot.add(rib);
  }

  // 推铲液压臂（从车身伸向铲背）
  const armL = toyCylinder(0.055, 0.055, 0.5, dark, 10);
  armL.rotation.z = -1.15;
  armL.position.set(-0.26, 0.3, 0.42);
  bladePivot.add(armL);
  const armR = armL.clone();
  armR.position.z = -0.42;
  bladePivot.add(armR);

  const bladeAnchor = new THREE.Object3D();
  bladeAnchor.position.set(0, 0.05, 0);
  bladePivot.add(bladeAnchor);

  /* ---- 自由部件 ---- */
  const horn = buildHorn(body, new THREE.Vector3(chassis.frontX * 0.55, chassis.cabinCenter.y - 0.22, 0.86), '#F59E0B');
  const hornAnchor = new THREE.Object3D();
  horn.add(hornAnchor);

  const wheelAnchor = new THREE.Object3D();
  chassis.wheels.add(wheelAnchor);
  wheelAnchor.position.set(0.6, 0.4, 0.78);

  let advance = 0;
  let puffStrength = 0;

  const parts: PartHandle[] = [
    addPart('part_exhaust_pipe', pipePivot, pipeAnchor, [0.5, 1.15, 0.5], [0, 0.42, 0], (si, p) => {
      const on = si === 0 ? clamp01(p) : si > 0 ? 1 : 0;
      puffStrength = on;
      pipe.rotation.z = on * (Math.sin(performance.now() / 45) * 0.035);
      pipePivot.position.y = chassis.cabinCenter.y + 0.62 + (on > 0.9 ? Math.sin(performance.now() / 40) * 0.012 : 0);
    }),
    addPart('part_dozer_blade', bladePivot, bladeAnchor, [0.85, 1.3, 2.1], [0, 0, 0], (si, p) => {
      if (si === 1) {
        bladePivot.position.y = lerp(chassis.cabinCenter.y + 0.12, chassis.cabinCenter.y - 0.56, clamp01(p));
      } else if (si === 2) {
        bladePivot.position.y = chassis.cabinCenter.y - 0.56;
        advance = clamp01(p) * 0.55;
      } else {
        bladePivot.position.y = chassis.cabinCenter.y - 0.56;
        advance = 0;
      }
    }),
    addPart('fp_horn', horn, hornAnchor, [0.42, 0.36, 0.36], [0.05, 0, 0], () => {}),
    addPart('fp_wheels', chassis.wheels, wheelAnchor, [2.0, 1.0, 0.55], [0, 0.4, 0.72], () => {}),
    addPart('fp_eyes', chassis.body, chassis.eyeAnchor, [0.62, 0.4, 0.6], [chassis.eyeAnchor.position.x, chassis.eyeAnchor.position.y, 0], () => {}),
  ];

  return {
    parts,
    update(dt) {
      body.position.x = advance;
      puffs.update(dt, puffStrength);
    },
  };
}

export function buildKitFor(vehicleId: string, ctx: KitContext): KitResult {
  switch (vehicleId) {
    case 'water_truck':
      return buildWaterTruckKit(ctx);
    case 'excavator':
      return buildExcavatorKit(ctx);
    case 'dump_truck':
      return buildDumpTruckKit(ctx);
    case 'crane_truck':
      return buildCraneTruckKit(ctx);
    case 'cement_mixer':
      return buildCementMixerKit(ctx);
    case 'bulldozer':
      return buildBulldozerKit(ctx);
    default:
      return buildWaterTruckKit(ctx);
  }
}

export const PART_STAR = starMesh;
export const PART_HEART = heartMesh;
export const PART_SPHERE = toySphere;

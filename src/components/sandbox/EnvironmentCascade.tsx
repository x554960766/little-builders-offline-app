import * as THREE from 'three';
import {
  toyMat,
  freshMat,
  roundedBox,
  toyCylinder,
  toySphere,
  starMesh,
  heartMesh,
  clamp01,
  lerp,
  easeOutCubic,
  easeOutBack,
} from '../../engine/toyKit';

/**
 * ============================================================================
 * EnvironmentCascade —— 连贯环境级联反馈渲染器（PRD 第 5 节六大场景）
 * ============================================================================
 * 每个场景都由「当前步骤进度 p」连续驱动，而不是开关式跳变：
 *  泥土湿润渐变 / 花朵发芽盛开 / 沙堆挖宝 / 沙坑填满 / 树屋吊装 / 星星步道点亮 / 推平障碍
 * ============================================================================
 */

export interface EnvLive {
  stepIndex: number;
  progress: number;
  completedSteps: number[];
}

export interface EnvironmentCascade {
  group: THREE.Group;
  update: (dt: number, elapsed: number, live: EnvLive) => void;
  celebrate: (stepIndex: number) => void;
  dispose: () => void;
}

const tmpV = new THREE.Vector3();

/* ------------------------------- 通用小工具 ------------------------------- */

function plant(parent: THREE.Object3D, x: number, y: number, z: number, petalColor: string) {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const stemMat = toyMat('#4ADE80', { roughness: 0.55 });
  const stem = toyCylinder(0.028, 0.04, 0.62, stemMat, 8);
  stem.position.y = 0.31;
  group.add(stem);

  const leafMat = toyMat('#22C55E', { roughness: 0.5 });
  for (const side of [-1, 1]) {
    const leaf = toySphere(0.1, leafMat, 12);
    leaf.scale.set(1.5, 0.28, 0.8);
    leaf.position.set(side * 0.12, 0.24, 0);
    leaf.rotation.z = side * 0.5;
    group.add(leaf);
  }

  const bud = toySphere(0.085, toyMat('#86EFAC', { roughness: 0.45 }), 12);
  bud.position.y = 0.64;
  group.add(bud);

  const flower = new THREE.Group();
  flower.position.y = 0.68;
  const petalMat = toyMat(petalColor, { roughness: 0.38 });
  for (let i = 0; i < 5; i++) {
    const petal = toySphere(0.1, petalMat, 12);
    petal.scale.set(1.25, 0.42, 0.78);
    const a = (i / 5) * Math.PI * 2;
    petal.position.set(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1);
    petal.rotation.y = -a;
    flower.add(petal);
  }
  const core = toySphere(0.075, toyMat('#FDE047', { roughness: 0.35 }), 12);
  core.position.y = 0.015;
  flower.add(core);
  flower.visible = false;
  group.add(flower);

  group.scale.set(1, 0.1, 1);
  parent.add(group);

  return {
    group,
    setGrowth(p: number) {
      const grow = clamp01(p / 0.55);
      group.scale.y = lerp(0.1, 1, easeOutCubic(grow));
      const budT = clamp01((p - 0.5) / 0.22);
      bud.scale.setScalar(0.6 + budT * 1.5);
      bud.visible = p < 0.92;
      const bloom = clamp01((p - 0.72) / 0.28);
      flower.visible = bloom > 0.01;
      flower.scale.setScalar(Math.max(0.02, easeOutBack(bloom)));
      flower.rotation.y = (1 - bloom) * 1.2;
      flower.position.y = 0.68 + Math.sin(bloom * Math.PI) * 0.06;
    },
  };
}

function butterfly(parent: THREE.Object3D, color: string, radius: number, phase: number) {
  const group = new THREE.Group();
  const wingMat = toyMat(color, { roughness: 0.35, side: THREE.DoubleSide });
  const bodyMat = toyMat('#4B5563', { roughness: 0.5 });

  const body = toyCylinder(0.02, 0.03, 0.16, bodyMat, 8);
  body.rotation.z = Math.PI / 2;
  group.add(body);

  const wings: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const wing = toySphere(0.09, wingMat, 12);
    wing.scale.set(1.3, 0.16, 0.85);
    wing.position.set(0, 0, side * 0.08);
    group.add(wing);
    wings.push(wing);
  }

  group.visible = false;
  parent.add(group);

  return {
    group,
    update(t: number, strength: number) {
      group.visible = strength > 0.02;
      if (!group.visible) return;
      const a = t * 0.9 + phase;
      const r = radius * (0.7 + Math.sin(t * 0.6 + phase) * 0.18);
      group.position.set(Math.cos(a) * r, 1.15 + Math.sin(t * 1.7 + phase) * 0.22, Math.sin(a) * r * 0.6 + 0.2);
      group.rotation.y = -a;
      wings.forEach((w, i) => {
        w.rotation.x = Math.sin(t * 16 + i * Math.PI) * 0.7 * strength;
      });
      group.scale.setScalar(strength);
    },
  };
}

function makePit(radius: number, depth: number, color: string) {
  const group = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.9, depth, 26, 1, true),
    toyMat(color, { side: THREE.DoubleSide, roughness: 0.7 })
  );
  wall.position.y = -depth / 2;
  group.add(wall);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.9, 26), toyMat(color, { roughness: 0.75 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -depth + 0.02;
  group.add(floor);
  return group;
}

/* ============================ 1. 洒水车 · 干旱小花园 ============================ */

function buildGarden(): EnvironmentCascade {
  const group = new THREE.Group();

  // 花坛边框（圆润石墩圈）
  const bedX = 3.0;
  const bedZ = 0.8;
  const bedR = 0.95;

  const rimRing = new THREE.Mesh(
    new THREE.TorusGeometry(bedR, 0.09, 10, 34),
    toyMat('#E7E5E4', { roughness: 0.7 })
  );
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.set(bedX, 0.13, bedZ);
  group.add(rimRing);

  // 一圈小石墩，边界更清晰
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const stone = toySphere(0.11, toyMat(i % 2 === 0 ? '#D6D3D1' : '#A8A29E', { roughness: 0.85 }), 12);
    stone.scale.set(1, 0.8, 1);
    stone.position.set(bedX + Math.cos(a) * bedR, 0.1, bedZ + Math.sin(a) * bedR);
    group.add(stone);
  }

  // 干裂浅黄泥土 → 湿润深褐
  const soilMat = freshMat('#C0885A', { roughness: 0.85 });
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(bedR - 0.04, bedR - 0.04, 0.16, 30), soilMat);
  soil.position.set(bedX, 0.08, bedZ);
  soil.receiveShadow = true;
  group.add(soil);

  const dryColor = new THREE.Color('#C0885A');
  const wetColor = new THREE.Color('#5C3A21');

  // 水洼波纹
  const puddleMat = freshMat('#7DD3FC', { transparent: true, opacity: 0, roughness: 0.1 });
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(bedR - 0.18, 26), puddleMat);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(bedX, 0.17, bedZ);
  group.add(puddle);

  // 5 株植物
  const colors = ['#F472B6', '#FBBF24', '#C084FC', '#FB7185', '#60A5FA'];
  const plants = colors.map((c, i) => {
    const a = (i / colors.length) * Math.PI * 2 + 0.4;
    return plant(group, bedX + Math.cos(a) * 0.5, 0.16, bedZ + Math.sin(a) * 0.5, c);
  });

  // 3 只蝴蝶
  const flies = [butterfly(group, '#F472B6', 1.1, 0), butterfly(group, '#FBBF24', 1.3, 2.1), butterfly(group, '#60A5FA', 0.95, 4.2)];

  // 水雾彩虹
  const rainbow = new THREE.Group();
  ['#F87171', '#FBBF24', '#4ADE80'].forEach((c, i) => {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(1.0 + i * 0.12, 0.045, 8, 28, Math.PI * 0.8),
      toyMat(c, { transparent: true, opacity: 0.55, roughness: 0.2 })
    );
    arc.rotation.z = Math.PI * 0.1;
    rainbow.add(arc);
  });
  rainbow.position.set(1.5, 0.9, 0.2);
  rainbow.visible = false;
  group.add(rainbow);

  return {
    group,
    update(dt, t, live) {
      const wet = live.stepIndex === 1 ? live.progress : live.stepIndex > 1 || live.completedSteps.includes(1) ? 1 : 0;
      soilMat.color.lerpColors(dryColor, wetColor, easeOutCubic(clamp01(wet)));
      puddleMat.opacity = 0.5 * easeOutCubic(clamp01(wet));

      const bloom = live.stepIndex === 2 ? live.progress : live.completedSteps.includes(2) ? 1 : 0;
      plants.forEach((p, i) => {
        const local = clamp01((bloom - i * 0.06) / 0.82);
        p.setGrowth(local);
      });

      const flyStrength = clamp01((bloom - 0.55) / 0.45);
      flies.forEach((f) => f.update(t, flyStrength));

      rainbow.visible = wet > 0.25 && bloom < 0.2;
      if (rainbow.visible) {
        rainbow.scale.setScalar(0.8 + wet * 0.25);
        rainbow.children.forEach((c, i) => {
          (c as THREE.Mesh).rotation.z = Math.PI * 0.1 + Math.sin(t * 1.5 + i) * 0.02;
        });
      }
    },
    celebrate() {
      rainbow.visible = true;
    },
    dispose() {
      group.removeFromParent();
    },
  };
}

/* ============================ 2. 挖掘机 · 砂石场寻宝 ============================ */

function buildDigSite(): EnvironmentCascade {
  const group = new THREE.Group();

  const pileX = 2.5;
  const pileZ = 0.1;

  const sandMat = freshMat('#F2D0A4', { roughness: 0.9 });
  const pile = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.15, 22), sandMat);
  pile.position.set(pileX, 0.56, pileZ);
  pile.castShadow = true;
  pile.receiveShadow = true;
  group.add(pile);

  // 沙堆小碎石（分布在沙堆外圈，避免被埋住）
  const pebbles: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const p = toySphere(0.07 + (i % 3) * 0.022, toyMat(['#C9A27C', '#B08F6B'][i % 2], { roughness: 0.9 }), 10);
    const a = (i / 8) * Math.PI * 2 + 0.3;
    p.position.set(pileX + Math.cos(a) * 1.12, 0.09, pileZ + Math.sin(a) * 1.12);
    group.add(p);
    pebbles.push(p);
  }

  // 金色宝箱
  const chest = new THREE.Group();
  chest.position.set(pileX, 0.05, pileZ);
  const wood = toyMat('#B45309', { roughness: 0.5 });
  const gold = toyMat('#FBBF24', { metalness: 0.35, roughness: 0.3, emissive: '#F59E0B', emissiveIntensity: 0.12 });
  const box = roundedBox(0.6, 0.4, 0.5, 0.06, wood);
  box.position.y = 0.2;
  chest.add(box);
  for (const y of [0.1, 0.3]) {
    const band = roundedBox(0.63, 0.06, 0.53, 0.02, gold);
    band.position.y = y;
    chest.add(band);
  }
  const lid = new THREE.Group();
  lid.position.set(0, 0.4, -0.25);
  const lidMesh = roundedBox(0.62, 0.16, 0.5, 0.05, wood);
  lidMesh.position.set(0, 0.04, 0.25);
  lid.add(lidMesh);
  const lidGold = roundedBox(0.64, 0.05, 0.52, 0.02, gold);
  lidGold.position.set(0, 0.12, 0.25);
  lid.add(lidGold);
  chest.add(lid);
  const lock = toyCylinder(0.07, 0.07, 0.06, gold, 12);
  lock.rotation.x = Math.PI / 2;
  lock.position.set(0, 0.26, 0.27);
  chest.add(lock);
  group.add(chest);

  // 宝石喷泉
  const gems: THREE.Mesh[] = [];
  const gemColors = ['#F87171', '#34D399', '#60A5FA', '#C084FC', '#FBBF24'];
  for (let i = 0; i < 18; i++) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), toyMat(gemColors[i % gemColors.length], { metalness: 0.4, roughness: 0.2, emissive: gemColors[i % gemColors.length], emissiveIntensity: 0.25 }));
    gem.visible = false;
    gem.userData.seed = Math.random();
    group.add(gem);
    gems.push(gem);
  }

  // 宝箱光晕
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.03, 8, 26),
    toyMat('#FDE047', { emissive: '#FBBF24', emissiveIntensity: 0.9 })
  );
  glow.rotation.x = Math.PI / 2;
  glow.visible = false;
  group.add(glow);

  let gemBurst = 0;
  let gemT = 0;

  return {
    group,
    update(dt, t, live) {
      const dig = live.stepIndex === 1 ? live.progress : live.completedSteps.includes(1) ? 1 : 0;
      const lift = live.stepIndex === 2 ? live.progress : live.completedSteps.includes(2) ? 1 : 0;

      // 沙堆缩小一半
      const shrink = 1 - 0.5 * easeOutCubic(clamp01(dig));
      pile.scale.set(shrink, 1 - 0.45 * easeOutCubic(clamp01(dig)), shrink);
      pile.position.y = 0.56 * (1 - 0.45 * easeOutCubic(clamp01(dig)));
      pebbles.forEach((p) => {
        p.position.y = 0.09;
      });

      // 宝箱从沙中升起 → 抬到空中
      chest.position.y = 0.05 + dig * 0.25 + lift * 1.35;
      chest.position.x = pileX + lift * 0.1;
      chest.rotation.y = Math.sin(t * 0.8) * 0.08;
      glow.visible = dig > 0.55;
      if (glow.visible) {
        glow.position.set(chest.position.x, chest.position.y + 0.22, chest.position.z);
        glow.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
        glow.rotation.z = t * 1.5;
      }

      // 开盖 + 宝石喷发
      const open = clamp01((lift - 0.62) / 0.38);
      lid.rotation.x = -open * 2.1;
      if (open > 0.05 && gemBurst < 0.99) {
        gemBurst = Math.min(1, gemBurst + dt * 1.2);
        gemT += dt;
      } else if (open <= 0.05) {
        gemBurst = 0;
        gemT = 0;
      }

      gems.forEach((gem, i) => {
        const active = gemBurst > 0 && i / gems.length < gemBurst;
        gem.visible = active;
        if (!active) return;
        const seed = gem.userData.seed as number;
        const cycle = ((gemT * 0.55 + seed) % 1);
        const spread = (i / gems.length) * Math.PI * 2;
        gem.position.set(
          chest.position.x + Math.cos(spread) * (0.25 + cycle * 0.75),
          chest.position.y + 0.42 + Math.sin(cycle * Math.PI) * 0.85 - cycle * 0.35,
          chest.position.z + Math.sin(spread) * (0.25 + cycle * 0.5)
        );
        gem.rotation.x += dt * 3;
        gem.rotation.y += dt * 2;
      });
    },
    celebrate() {
      gemBurst = 0.01;
    },
    dispose() {
      group.removeFromParent();
    },
  };
}

/* ============================ 3. 翻斗车 · 游乐场沙坑 ============================ */

function buildPlayground(): EnvironmentCascade {
  const group = new THREE.Group();

  /* ---- 储料塔（框架式料仓）---- */
  const towerX = -2.85;
  const tower = new THREE.Group();
  tower.position.set(towerX, 0, -0.15);
  const postMat = toyMat('#F87171', { roughness: 0.45 });
  const beamMat2 = toyMat('#DC2626', { roughness: 0.5 });

  // 四根立柱
  for (const z of [0.5, -0.5]) {
    for (const x of [0.14, -0.14]) {
      const post = roundedBox(0.15, 2.4, 0.15, 0.05, postMat);
      post.position.set(x, 1.2, z);
      tower.add(post);
    }
  }
  // 三道横梁
  for (const y of [0.36, 1.28, 2.22]) {
    for (const z of [0.5, -0.5]) {
      const beam = roundedBox(0.44, 0.13, 0.13, 0.04, beamMat2);
      beam.position.set(0, y, z);
      tower.add(beam);
    }
  }
  // 侧向斜撑（只在中段，避免像三脚架）
  for (const z of [0.5, -0.5]) {
    const brace = roundedBox(0.07, 1.0, 0.07, 0.025, toyMat('#FCA5A5'));
    brace.position.set(-0.16, 0.82, z);
    brace.rotation.z = 0.36;
    tower.add(brace);
  }

  // 顶部料斗
  const hopper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.76, 0.26, 0.86, 22, 1, true),
    toyMat('#FDE047', { side: THREE.DoubleSide, roughness: 0.42 })
  );
  hopper.position.y = 1.95;
  tower.add(hopper);
  const hopperRim = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.06, 8, 26), toyMat('#F59E0B'));
  hopperRim.rotation.x = Math.PI / 2;
  hopperRim.position.y = 2.38;
  tower.add(hopperRim);

  // 出料颈 + 闸门
  const spout = toyCylinder(0.24, 0.19, 0.34, toyMat('#EAB308', { roughness: 0.5 }), 16);
  spout.position.y = 1.4;
  tower.add(spout);

  const gatePivot = new THREE.Group();
  gatePivot.position.set(0.22, 1.24, 0);
  const gate = roundedBox(0.06, 0.36, 0.44, 0.025, toyMat('#94A3B8', { metalness: 0.2 }));
  gate.position.set(0, -0.18, 0);
  gatePivot.add(gate);
  tower.add(gatePivot);
  group.add(tower);

  /* ---- 沙池（凸起矮池，视觉上能"装满") ---- */
  const pitX = -3.95;
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 0.96, 0.3, 30), toyMat('#C9A57C', { roughness: 0.8 }));
  pool.position.set(pitX, 0.15, 1.6);
  pool.receiveShadow = true;
  group.add(pool);

  const poolInner = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.86, 0.22, 30), toyMat('#9C7A57', { roughness: 0.9 }));
  poolInner.position.set(pitX, 0.25, 1.6);
  group.add(poolInner);

  const pitRim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.075, 8, 30), toyMat('#93C5FD', { roughness: 0.5 }));
  pitRim.rotation.x = Math.PI / 2;
  pitRim.position.set(pitX, 0.32, 1.6);
  group.add(pitRim);

  // 坑内彩色海洋球
  const ballColors = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#C084FC', '#FB7185'];
  const pitBalls: THREE.Mesh[] = [];
  for (let i = 0; i < 26; i++) {
    const b = toySphere(0.115, toyMat(ballColors[i % ballColors.length], { roughness: 0.32 }), 12);
    b.visible = false;
    group.add(b);
    pitBalls.push(b);
  }

  /* ---- 倾泻粒子（金沙 + 球）---- */
  const pourGroup = new THREE.Group();
  const pourBalls: THREE.Mesh[] = [];
  for (let i = 0; i < 16; i++) {
    const b = toySphere(0.09, toyMat(ballColors[i % ballColors.length], { roughness: 0.32 }), 10);
    b.visible = false;
    pourGroup.add(b);
    pourBalls.push(b);
  }
  group.add(pourGroup);

  /* ---- 风车 + 气球 ---- */
  const pinwheel = new THREE.Group();
  pinwheel.position.set(pitX - 0.15, 0, 2.78);
  const stick = toyCylinder(0.035, 0.035, 1.05, toyMat('#FDE047'), 8);
  stick.position.y = 0.52;
  pinwheel.add(stick);
  const fan = new THREE.Group();
  fan.position.y = 1.05;
  for (let i = 0; i < 4; i++) {
    const blade = roundedBox(0.34, 0.16, 0.03, 0.02, toyMat(ballColors[i], { roughness: 0.35 }));
    blade.position.set(0.17, 0, 0);
    const holder = new THREE.Group();
    holder.rotation.z = (i / 4) * Math.PI * 2;
    holder.add(blade);
    fan.add(holder);
  }
  pinwheel.add(fan);
  pinwheel.scale.setScalar(0.001);
  group.add(pinwheel);

  const balloons: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const bg = new THREE.Group();
    const ball = toySphere(0.16, toyMat(ballColors[i + 1], { roughness: 0.3 }), 14);
    ball.scale.set(1, 1.15, 1);
    bg.add(ball);
    const string = toyCylinder(0.008, 0.008, 0.7, toyMat('#9CA3AF'), 4);
    string.position.y = -0.45;
    bg.add(string);
    bg.position.set(pitX + 0.55 + i * 0.28, 1.2 + i * 0.12, 2.86);
    bg.scale.setScalar(0.001);
    group.add(bg);
    balloons.push(bg);
  }

  let pourBoost = 0;

  return {
    group,
    update(dt, t, live) {
      const lever = live.stepIndex === 1 ? live.progress : live.completedSteps.includes(1) ? 1 : 0;
      const dump = live.stepIndex === 2 ? live.progress : live.completedSteps.includes(2) ? 1 : 0;

      gatePivot.rotation.z = -lever * 1.1;

      // 从料塔倾泻到车斗
      const pouring = clamp01((lever - 0.25) / 0.6) * (1 - clamp01((dump - 0.55) / 0.4));
      pourBoost += (pouring - pourBoost) * Math.min(1, dt * 6);
      pourBalls.forEach((b, i) => {
        b.visible = pourBoost > 0.05;
        if (!b.visible) return;
        const phase = ((t * 1.1 + i / pourBalls.length) % 1);
        b.position.set(
          towerX + 0.25 + phase * 1.95 + Math.sin(phase * 5 + i) * 0.05,
          1.42 - phase * phase * 0.36,
          -0.15 + (i % 5 - 2) * 0.07
        );
      });

      // 沙池被彩色球填满
      pitBalls.forEach((b, i) => {
        const threshold = 0.15 + (i / pitBalls.length) * 0.8;
        b.visible = dump > threshold;
        if (!b.visible) return;
        const idx = i;
        const layer = Math.floor(idx / 9);
        const ring = idx % 9;
        const a = (ring / 9) * Math.PI * 2 + layer;
        const r = 0.24 + (layer % 2) * 0.28;
        b.position.set(pitX + Math.cos(a) * r, 0.3 + layer * 0.19, 1.6 + Math.sin(a) * r);
      });

      // 风车与气球升起
      const rise = clamp01((dump - 0.72) / 0.28);
      pinwheel.scale.setScalar(Math.max(0.001, easeOutBack(rise)));
      fan.rotation.z -= dt * (2 + rise * 3);
      balloons.forEach((b, i) => {
        b.scale.setScalar(Math.max(0.001, easeOutBack(clamp01(rise - i * 0.08))));
        b.position.y = 1.2 + i * 0.12 + Math.sin(t * 1.4 + i) * 0.08;
        b.rotation.z = Math.sin(t * 1.1 + i) * 0.12;
      });
    },
    celebrate() {
      pourBoost = 1;
    },
    dispose() {
      group.removeFromParent();
    },
  };
}

/* ============================ 4. 吊车 · 森林树屋 ============================ */

function buildTreehouse(): EnvironmentCascade {
  const group = new THREE.Group();

  const treeX = 2.6;
  const treeZ = -0.55;

  // 树干
  const trunkMat = toyMat('#B07A46', { roughness: 0.7 });
  const trunk = toyCylinder(0.24, 0.36, 3.0, trunkMat, 16);
  trunk.position.set(treeX, 1.5, treeZ);
  trunk.castShadow = true;
  group.add(trunk);

  // 树冠
  const leafMat = toyMat('#4ADE80', { roughness: 0.55 });
  const crowns: THREE.Mesh[] = [];
  const crownDefs: [number, number, number, number][] = [
    [0, 3.15, 0, 0.82],
    [0.5, 2.8, 0.18, 0.54],
    [-0.55, 2.8, -0.15, 0.58],
    [0.1, 3.55, -0.1, 0.5],
  ];
  for (const [dx, y, dz, r] of crownDefs) {
    const c = toySphere(r, leafMat, 16);
    c.position.set(treeX + dx, y, treeZ + dz);
    c.castShadow = true;
    group.add(c);
    crowns.push(c);
  }

  // 木屋
  const house = new THREE.Group();
  house.position.set(treeX, 1.62, treeZ);
  const wallMat = toyMat('#DEB887', { roughness: 0.6 });
  const body = roundedBox(1.15, 0.78, 1.15, 0.08, wallMat);
  house.add(body);
  const door = roundedBox(0.34, 0.46, 0.06, 0.03, toyMat('#A16207'));
  door.position.set(0, -0.18, 0.58);
  house.add(door);
  const windowMat = freshMat('#8B5A2B', { roughness: 0.4, emissive: '#000000', emissiveIntensity: 0 });
  for (const z of [0.58, -0.58]) {
    const w = roundedBox(0.28, 0.26, 0.05, 0.03, windowMat);
    w.position.set(z > 0 ? 0.3 : -0.3, 0.12, z * 0.98);
    w.rotation.y = z > 0 ? 0 : Math.PI;
    house.add(w);
  }
  const balcony = roundedBox(1.3, 0.08, 0.42, 0.03, toyMat('#C89B6A'));
  balcony.position.set(0, -0.4, 0.7);
  house.add(balcony);
  group.add(house);

  // 红色三角屋顶（可从地面被吊起）
  const roof = new THREE.Group();
  const roofMat = toyMat('#EF4444', { roughness: 0.42 });
  const roofCone = new THREE.Mesh(new THREE.ConeGeometry(0.82, 0.62, 4), roofMat);
  roofCone.rotation.y = Math.PI / 4;
  roofCone.castShadow = true;
  roof.add(roofCone);
  const roofTrim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.035, 6, 4), toyMat('#FCA5A5'));
  roofTrim.rotation.x = Math.PI / 2;
  roofTrim.rotation.z = Math.PI / 4;
  roofTrim.position.y = -0.3;
  roof.add(roofTrim);
  roof.position.set(1.35, 0.4, 1.5);
  group.add(roof);

  // 烟囱 + 心形云
  const chimney = roundedBox(0.18, 0.34, 0.18, 0.04, toyMat('#B91C1C'));
  chimney.position.set(treeX + 0.3, 2.35, treeZ - 0.2);
  chimney.visible = false;
  group.add(chimney);
  const hearts: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const h = heartMesh(0.11, '#FB7185');
    h.visible = false;
    group.add(h);
    hearts.push(h);
  }

  // 小鸟
  const birds: THREE.Group[] = [];
  for (let i = 0; i < 2; i++) {
    const bird = new THREE.Group();
    const b = toySphere(0.09, toyMat('#60A5FA', { roughness: 0.35 }), 12);
    bird.add(b);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 8), toyMat('#FBBF24'));
    beak.rotation.z = -Math.PI / 2;
    beak.position.x = 0.1;
    bird.add(beak);
    bird.visible = false;
    group.add(bird);
    birds.push(bird);
  }

  // 支腿冲击波光圈
  const shock = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.5, 32),
    new THREE.MeshBasicMaterial({ color: '#FDE047', transparent: true, opacity: 0, side: THREE.DoubleSide })
  );
  shock.rotation.x = -Math.PI / 2;
  shock.position.set(0, 0.03, 0);
  group.add(shock);

  let shockT = 0;
  let lampOn = 0;

  return {
    group,
    update(dt, t, live) {
      const legs = live.stepIndex === 0 ? live.progress : live.completedSteps.includes(0) ? 1 : 0;
      const hook = live.stepIndex === 1 ? live.progress : live.completedSteps.includes(1) ? 1 : 0;
      const place = live.stepIndex === 2 ? live.progress : live.completedSteps.includes(2) ? 1 : 0;

      // 支腿冲击波
      if (legs > 0.92 && shockT < 1) {
        shockT = Math.min(1, shockT + dt * 0.9);
        const m = shock.material as THREE.MeshBasicMaterial;
        m.opacity = (1 - shockT) * 0.8;
        shock.scale.setScalar(0.6 + shockT * 3.2);
      } else if (legs < 0.5) {
        shockT = 0;
        (shock.material as THREE.MeshBasicMaterial).opacity = 0;
      }

      // 屋顶：地面 → 被吊钩吸起 → 移到木屋顶部
      const liftT = easeOutCubic(clamp01(hook / 0.7));
      const fromX = 1.35;
      const fromY = 0.4;
      const fromZ = 1.5;
      const midX = 2.15;
      const midY = 2.05;
      const midZ = 0.55;
      const topY = 2.55;
      roof.position.set(
        lerp(fromX, midX, liftT) + Math.sin(t * 0.9) * 0.02 * hook,
        lerp(fromY, midY, liftT),
        lerp(fromZ, midZ, liftT)
      );
      if (place > 0) {
        const p = easeOutCubic(clamp01(place));
        roof.position.x = lerp(midX, treeX, p);
        roof.position.y = lerp(midY, topY, p);
        roof.position.z = lerp(midZ, treeZ, p);
      }
      roof.rotation.y = Math.sin(t * 0.7) * 0.06 * (1 - place);

      // 窗户亮灯 + 烟囱心形云 + 小鸟
      lampOn += ((place > 0.85 ? 1 : 0) - lampOn) * Math.min(1, dt * 4);
      windowMat.emissive.setRGB(1, 0.72, 0.25);
      windowMat.emissiveIntensity = lampOn * 1.5;
      chimney.visible = lampOn > 0.05;
      if (chimney.visible) {
        chimney.position.y = 2.35 + place * 0.02;
      }

      hearts.forEach((h, i) => {
        h.visible = lampOn > 0.3;
        if (!h.visible) return;
        const phase = ((t * 0.42 + i / hearts.length) % 1);
        h.position.set(treeX + 0.3 + Math.sin(phase * 4 + i) * 0.1, 2.55 + phase * 1.0, treeZ - 0.2);
        h.scale.setScalar(0.7 + Math.sin(phase * Math.PI) * 0.5);
        h.rotation.z = Math.sin(phase * 6 + i) * 0.4;
      });

      birds.forEach((b, i) => {
        b.visible = lampOn > 0.5;
        if (!b.visible) return;
        const a = t * 1.2 + i * Math.PI;
        b.position.set(treeX + Math.cos(a) * 1.25, 3.0 + Math.sin(t * 2 + i) * 0.25, treeZ + Math.sin(a) * 0.8);
        b.rotation.y = -a;
      });

      // 树冠轻微摇曳
      crowns.forEach((c, i) => {
        c.position.y = crownDefs[i][1] + Math.sin(t * 0.9 + i) * 0.03;
      });
    },
    celebrate() {
      shockT = 0;
    },
    dispose() {
      group.removeFromParent();
    },
  };
}

/* ============================ 5. 搅拌车 · 彩虹星星步道 ============================ */

function buildStarRoad(): EnvironmentCascade {
  const group = new THREE.Group();

  const moldMat = toyMat('#CBD5E1', { roughness: 0.7 });
  const tiles: { group: THREE.Group; star: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = [];
  const colors = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#C084FC'];

  // 地面模具 + 5 块星砖
  for (let i = 0; i < 5; i++) {
    const x = 1.35 + i * 0.72;
    const z = 1.75;
    const mold = roundedBox(0.62, 0.09, 0.62, 0.04, moldMat);
    mold.position.set(x, 0.05, z);
    group.add(mold);

    const tileGroup = new THREE.Group();
    const mat = freshMat('#B7C4D8', { roughness: 0.4, emissive: '#000000', emissiveIntensity: 0 });
    const tile = roundedBox(0.56, 0.12, 0.56, 0.05, mat);
    tile.position.set(x, 0.1, z);
    tileGroup.add(tile);

    const star = starMesh(0.17, '#FDE047');
    star.position.set(x, 0.17, z);
    star.rotation.x = -Math.PI / 2;
    star.scale.setScalar(0.001);
    tileGroup.add(star);

    group.add(tileGroup);
    tiles.push({ group: tileGroup, star, mat });
  }

  // 彩色水泥流（溜槽 → 地面）
  const pourMat = freshMat('#C4B5FD', { transparent: true, opacity: 0, roughness: 0.25 });
  const pour = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.6, 12), pourMat);
  pour.rotation.z = 0.9;
  pour.position.set(-0.9, 0.7, 0.4);
  pour.visible = false;
  group.add(pour);

  // 尽头小拱桥
  const bridge = new THREE.Group();
  bridge.position.set(5.0, 0, 1.75);
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.09, 8, 20, Math.PI),
    toyMat('#FCA5A5', { roughness: 0.45 })
  );
  arch.rotation.y = Math.PI / 2;
  arch.position.y = 0.1;
  bridge.add(arch);
  const deck = roundedBox(0.5, 0.08, 1.0, 0.03, toyMat('#FDE047'));
  deck.position.y = 0.62;
  bridge.add(deck);
  bridge.scale.setScalar(0.001);
  group.add(bridge);

  // 彩虹光柱
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.7, 3.2, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#FDE047',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  beam.position.set(3.2, 1.6, 1.75);
  group.add(beam);

  return {
    group,
    update(dt, t, live) {
      const mix = live.stepIndex === 1 ? live.progress : live.completedSteps.includes(1) ? 1 : 0;
      const pave = live.stepIndex === 2 ? live.progress : live.completedSteps.includes(2) ? 1 : 0;

      pour.visible = pave > 0.02 && pave < 0.99;
      pourMat.opacity = 0.85 * Math.min(1, pave * 3) * (1 - clamp01((pave - 0.8) / 0.2));
      const flow = (t * 2.2) % 1;
      pour.position.y = 0.75 - flow * 0.25;

      tiles.forEach((tile, i) => {
        const threshold = (i / tiles.length) * 0.75;
        const local = clamp01((pave - threshold) / 0.35);
        const lit = clamp01((pave - threshold) / 0.2);
        tile.star.scale.setScalar(Math.max(0.001, easeOutBack(lit)));
        tile.star.rotation.z = t * 1.2 + i;
        const c = new THREE.Color(colors[i]);
        tile.mat.color.lerpColors(new THREE.Color('#B7C4D8'), c, lit);
        tile.mat.emissive.copy(c);
        tile.mat.emissiveIntensity = lit * (0.25 + Math.abs(Math.sin(t * 2 + i)) * 0.25);
        tile.group.position.y = local * 0.03;
      });

      const bridgeRise = clamp01((pave - 0.82) / 0.18);
      bridge.scale.setScalar(Math.max(0.001, easeOutBack(bridgeRise)));

      beam.visible = mix > 0.5 && pave > 0.5;
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.12 * Math.max(0, Math.sin(t * 1.6)) * pave;
      beam.rotation.y = t * 0.3;
    },
    celebrate() {
      /* 星砖点亮由进度驱动 */
    },
    dispose() {
      group.removeFromParent();
    },
  };
}

/* ============================ 6. 推土机 · 清障通路 ============================ */

function buildRoadBlock(): EnvironmentCascade {
  const group = new THREE.Group();

  // 道路（抬高到草地之上，否则会被草地圆盘完全遮住）
  const road = roundedBox(6.6, 0.1, 1.5, 0.05, toyMat('#A8AFB8', { roughness: 0.75 }));
  road.position.set(1.2, 0.16, 2.3);
  road.receiveShadow = true;
  group.add(road);

  // 沟壑（贴地的深色缺口，避免与实心草地冲突）
  const gapX = 3.05;
  const gap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 1.5), toyMat('#4B5563', { roughness: 0.9 }));
  gap.position.set(gapX, 0.18, 2.3);
  group.add(gap);

  const gapWater = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 1.4),
    toyMat('#60A5FA', { roughness: 0.15, transparent: true, opacity: 0.65 })
  );
  gapWater.rotation.x = -Math.PI / 2;
  gapWater.position.set(gapX, 0.23, 2.3);
  group.add(gapWater);

  // 积木巨石障碍
  const blocks: { mesh: THREE.Mesh; from: THREE.Vector3; rot: number }[] = [];
  const blockDefs: [number, number, number, number, string][] = [
    [1.7, 0.28, 2.35, 0.5, '#F87171'],
    [2.25, 0.24, 2.05, 0.42, '#60A5FA'],
    [2.2, 0.62, 2.35, 0.36, '#FBBF24'],
    [2.7, 0.26, 2.55, 0.44, '#34D399'],
    [2.95, 0.5, 2.2, 0.34, '#C084FC'],
  ];
  for (const [x, y, z, s, c] of blockDefs) {
    const mesh = roundedBox(s, s, s, 0.07, toyMat(c, { roughness: 0.45 }));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    blocks.push({ mesh, from: new THREE.Vector3(x, y, z), rot: (Math.random() - 0.5) * 0.6 });
  }

  // 填平后的桥面
  const bridgeDeck = roundedBox(1.05, 0.16, 1.5, 0.05, toyMat('#E5E7EB', { roughness: 0.6 }));
  bridgeDeck.position.set(gapX, 0.24, 2.3);
  bridgeDeck.scale.y = 0.001;
  group.add(bridgeDeck);

  // 绿灯通行牌
  const sign = new THREE.Group();
  sign.position.set(4.9, 0, 1.35);
  const pole = toyCylinder(0.05, 0.05, 1.5, toyMat('#6B7280'), 10);
  pole.position.y = 0.75;
  sign.add(pole);
  const board = roundedBox(0.5, 0.62, 0.08, 0.06, toyMat('#1F2937', { roughness: 0.4 }));
  board.position.y = 1.55;
  sign.add(board);
  const lamp = toySphere(0.14, toyMat('#4ADE80', { emissive: '#22C55E', emissiveIntensity: 0 }), 14);
  lamp.position.set(0, 1.55, 0.09);
  sign.add(lamp);
  sign.scale.setScalar(0.001);
  group.add(sign);

  // 礼花粒子
  const confetti: THREE.Mesh[] = [];
  const confColors = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#C084FC', '#FB7185'];
  for (let i = 0; i < 24; i++) {
    const c = roundedBox(0.11, 0.05, 0.02, 0.01, toyMat(confColors[i % confColors.length], { roughness: 0.3 }));
    c.visible = false;
    c.userData.seed = Math.random();
    c.userData.spread = (i / 24) * Math.PI * 2;
    group.add(c);
    confetti.push(c);
  }

  let burst = 0;
  let burstT = 0;

  return {
    group,
    update(dt, t, live) {
      const blade = live.stepIndex === 1 ? live.progress : live.completedSteps.includes(1) ? 1 : 0;
      const push = live.stepIndex === 2 ? live.progress : live.completedSteps.includes(2) ? 1 : 0;

      // 积木被推入沟壑
      blocks.forEach((b, i) => {
        const local = clamp01((push - i * 0.08) / 0.7);
        const e = easeOutCubic(local);
        b.mesh.position.x = lerp(b.from.x, gapX + (i % 2 === 0 ? -0.12 : 0.14), e);
        b.mesh.position.z = lerp(b.from.z, 2.3 + ((i % 3) - 1) * 0.28, e);
        b.mesh.position.y = lerp(b.from.y, 0.06 + (i % 2) * 0.1, e);
        b.mesh.rotation.z = b.rot + e * 1.4;
        b.mesh.rotation.y = e * 1.1;
      });

      // 沟壑被填平 → 桥面升起
      const fill = clamp01((push - 0.65) / 0.35);
      bridgeDeck.scale.y = Math.max(0.001, easeOutBack(fill));
      bridgeDeck.position.y = 0.24 + fill * 0.02;
      gapWater.visible = fill < 0.6;

      // 绿灯牌
      const signUp = clamp01((push - 0.78) / 0.22);
      sign.scale.setScalar(Math.max(0.001, easeOutBack(signUp)));
      (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = signUp * (1.2 + Math.sin(t * 3) * 0.4);

      // 礼花
      if (push > 0.92 && burst < 1) {
        burst = Math.min(1, burst + dt * 1.6);
        burstT += dt;
      }
      confetti.forEach((c, i) => {
        const active = burst > 0 && i / confetti.length < burst;
        c.visible = active;
        if (!active) return;
        const seed = c.userData.seed as number;
        const spread = c.userData.spread as number;
        const cycle = ((burstT * 0.5 + seed) % 1);
        c.position.set(
          3.2 + Math.cos(spread) * cycle * 1.7,
          1.4 + Math.sin(cycle * Math.PI) * 1.5 - cycle * 0.9,
          2.3 + Math.sin(spread) * cycle * 0.9
        );
        c.rotation.x = burstT * 3 + i;
        c.rotation.y = burstT * 2 + i;
      });

      // 推铲落地扬尘环
      if (blade > 0.9) {
        /* 由 rig 侧体现 */
      }
    },
    celebrate() {
      burst = 0.01;
    },
    dispose() {
      group.removeFromParent();
    },
  };
}

/* ------------------------------- 出口 ------------------------------- */

export function buildEnvironment(vehicleId: string): EnvironmentCascade {
  switch (vehicleId) {
    case 'water_truck':
      return buildGarden();
    case 'excavator':
      return buildDigSite();
    case 'dump_truck':
      return buildPlayground();
    case 'crane_truck':
      return buildTreehouse();
    case 'cement_mixer':
      return buildStarRoad();
    case 'bulldozer':
      return buildRoadBlock();
    default:
      return buildGarden();
  }
}

export const ENV_TMP = tmpV;

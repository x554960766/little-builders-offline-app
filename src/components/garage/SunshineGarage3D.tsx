import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { VEHICLES_CONFIG, VehicleScenarioConfig } from '../../config/vehiclesConfig';
import { roundedBox, toyMat, toySphere, toyCylinder, radialTexture, starMesh, easeOutCubic, clamp01 } from '../../engine/toyKit';
import { audio } from '../../engine/audio';
import { createEyes, EyesController } from '../sandbox/rigCommon';
import { SparkleGlyph, StickerBoxGlyph } from '../ui/icons';

/**
 * SunshineGarage3D —— 3D 阳光车库选车大厅
 * 单排弧形 6 个拱形车位 + 半开卷帘门 + 车辆呼吸待机 + 点击发车过渡
 * 零文字：车辆身份只由颜色、车形与已获贴纸星星表达
 */

interface Props {
  stickers: string[];
  onSelect: (vehicle: VehicleScenarioConfig) => void;
}

interface GarageSlot {
  vehicle: VehicleScenarioConfig;
  root: THREE.Group;
  car: THREE.Group;
  door: THREE.Group;
  doorBaseY: number;
  pad: THREE.Mesh;
  hit: THREE.Mesh;
  index: number;
  eyes: EyesController;
}

export function SunshineGarage3D({ stickers, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const stickerRef = useRef(stickers);
  stickerRef.current = stickers;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#FBE6C2', 22, 46);

    const camera = new THREE.PerspectiveCamera(40, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 90);
    const camBase = new THREE.Vector3(0, 5.0, 13.4);
    camera.position.copy(camBase);
    camera.lookAt(0, 1.25, 0);

    /* ------------------------------ 光照 ------------------------------ */
    scene.add(new THREE.HemisphereLight('#FFF7ED', '#F5D9B0', 1.55));

    const sun = new THREE.DirectionalLight('#FFF3D6', 2.25);
    sun.position.set(-6, 11, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -7;
    sun.shadow.camera.far = 36;
    sun.shadow.bias = -0.0008;
    scene.add(sun);

    const warm = new THREE.PointLight('#FDE68A', 0.85, 26);
    warm.position.set(0, 4.2, 5.5);
    scene.add(warm);

    /* ------------------------------ 地板与墙 ------------------------------ */
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 26),
      new THREE.MeshStandardMaterial({ color: '#EFD2A8', roughness: 0.72 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    for (let i = -13; i <= 13; i++) {
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.01, 24),
        new THREE.MeshStandardMaterial({ color: '#DFBE8F', roughness: 0.8 })
      );
      seam.position.set(i * 1.5, 0.006, 0);
      scene.add(seam);
    }

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(34, 10, 0.5),
      new THREE.MeshStandardMaterial({ color: '#FDE9C8', roughness: 0.9 })
    );
    wall.position.set(0, 4.8, -4.4);
    wall.receiveShadow = true;
    scene.add(wall);

    // 踢脚线
    const baseboard = roundedBox(33, 0.28, 0.24, 0.08, new THREE.MeshStandardMaterial({ color: '#E7C79B', roughness: 0.7 }));
    baseboard.position.set(0, 0.14, -4.15);
    scene.add(baseboard);

    /* ------------------------------ 车位 ------------------------------ */
    const slots: GarageSlot[] = [];
    const CAR_SCALE = 0.72;

    const positions: [number, number][] = [
      [-6.1, 0.5],
      [-3.66, 0.05],
      [-1.22, -0.4],
      [1.22, -0.4],
      [3.66, 0.05],
      [6.1, 0.5],
    ];

    VEHICLES_CONFIG.forEach((vehicle, index) => {
      const [x, z] = positions[index] ?? [0, 0];
      const slotRoot = new THREE.Group();
      slotRoot.position.set(x, 0, z);
      slotRoot.rotation.y = (index - 2.5) * -0.035;
      scene.add(slotRoot);

      /* ---- 车位地垫 ---- */
      const padMat = new THREE.MeshStandardMaterial({
        color: vehicle.themeColorHex,
        roughness: 0.6,
        emissive: new THREE.Color(vehicle.themeColorHex),
        emissiveIntensity: 0.1,
      });
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.06, 0.07, 36), padMat);
      pad.position.y = 0.035;
      pad.receiveShadow = true;
      slotRoot.add(pad);

      const padRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.06, 0.05, 8, 40),
        new THREE.MeshStandardMaterial({
          color: '#FFFFFF',
          roughness: 0.45,
          emissive: new THREE.Color('#FFFFFF'),
          emissiveIntensity: 0.2,
        })
      );
      padRing.rotation.x = Math.PI / 2;
      padRing.position.y = 0.075;
      slotRoot.add(padRing);

      /* ---- 拱形门洞 ---- */
      const frameMat = toyMat('#F3D3A2', { roughness: 0.7 });
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.13, 10, 36, Math.PI), frameMat);
      arch.position.set(0, 2.42, -0.95);
      slotRoot.add(arch);

      for (const side of [-1, 1]) {
        const jamb = roundedBox(0.17, 2.42, 0.22, 0.07, frameMat);
        jamb.position.set(side * 1.18, 1.21, -0.95);
        slotRoot.add(jamb);
      }

      /* ---- 卷起的卷帘门（门轴 + 一小段垂下的门帘）---- */
      const door = new THREE.Group();
      const curtain = roundedBox(2.2, 0.58, 0.11, 0.05, toyMat('#F8FAFC', { roughness: 0.55 }));
      curtain.position.y = -0.3;
      door.add(curtain);

      for (let i = 0; i < 2; i++) {
        const slat = roundedBox(2.14, 0.08, 0.13, 0.035, toyMat(vehicle.accentColorHex, { roughness: 0.45 }));
        slat.position.set(0, -0.16 - i * 0.24, 0.02);
        door.add(slat);
      }

      const roller = toyCylinder(0.19, 0.19, 2.28, toyMat('#FFFFFF', { roughness: 0.4 }), 18);
      roller.rotation.z = Math.PI / 2;
      door.add(roller);

      for (const x of [-1.14, 1.14]) {
        const cap = toyCylinder(0.21, 0.21, 0.07, toyMat(vehicle.accentColorHex, { roughness: 0.4 }), 16);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = x;
        door.add(cap);
      }

      const doorBaseY = 2.42; // 卷起的门轴高度
      door.position.set(0, doorBaseY, -0.88);
      slotRoot.add(door);

      /* ---- 车辆 ---- */
      const carRoot = new THREE.Group();
      carRoot.scale.setScalar(CAR_SCALE);
      carRoot.rotation.y = -0.95; // 车头朝右前方（面向相机 3/4 侧）
      slotRoot.add(carRoot);
      const garageEyes = buildGarageCar(carRoot, vehicle);

      /* ---- 点击热区（1.45 倍膨胀） ---- */
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(1.55 * 1.45, 1.5 * 1.45, 1.6 * 1.45),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
      );
      hit.position.set(0, 0.72, 0.05);
      slotRoot.add(hit);

      /* ---- 已获贴纸星星 ---- */
      for (let s = 0; s < 2; s++) {
        const star = starMesh(0.13, '#FBBF24');
        star.position.set(-0.42 + s * 0.42, 1.72, 0.75);
        star.visible = false;
        star.userData.slot = vehicle.id;
        slotRoot.add(star);
      }

      slots.push({ vehicle, root: slotRoot, car: carRoot, door, doorBaseY, pad, hit, index, eyes: garageEyes });
    });

    // 阳光光束
    const beamMat = new THREE.MeshBasicMaterial({
      color: '#FEF3C7',
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 3; i++) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 12, 1, true), beamMat);
      beam.position.set(-5 + i * 5.4, 5.4, 2.2);
      beam.rotation.z = 0.22;
      scene.add(beam);
    }

    // 悬浮星尘
    const dust: THREE.Sprite[] = [];
    const dustTex = radialTexture('rgba(255,246,200,0.95)', 'rgba(255,246,200,0)');
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: dustTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.5,
        })
      );
      s.position.set((Math.random() - 0.5) * 16, Math.random() * 5.5 + 0.4, (Math.random() - 0.5) * 8);
      s.scale.setScalar(0.16 + Math.random() * 0.16);
      s.userData.speed = 0.1 + Math.random() * 0.2;
      scene.add(s);
      dust.push(s);
    }

    /* ------------------------------ 交互 ------------------------------ */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let selected: GarageSlot | null = null;
    let transitionT = -1;
    let hoverSlot: GarageSlot | null = null;
    let elapsed = 0;
    let parallaxX = 0;
    let parallaxY = 0;
    let targetParallaxX = 0;
    let targetParallaxY = 0;

    const pick = (clientX: number, clientY: number): GarageSlot | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(slots.map((s) => s.hit), false);
      if (hits.length === 0) return null;
      const obj = hits[0].object;
      return slots.find((s) => s.hit === obj) ?? null;
    };

    const onDown = (e: PointerEvent) => {
      if (transitionT >= 0) return;
      const slot = pick(e.clientX, e.clientY);
      if (!slot) return;
      audio.ensureContext();
      audio.playProceduralSfx('pop');
      selected = slot;
      transitionT = 0;
    };

    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      targetParallaxX = ((e.clientX - rect.left) / rect.width - 0.5) * 0.6;
      targetParallaxY = ((e.clientY - rect.top) / rect.height - 0.5) * 0.3;
      if (e.pointerType === 'mouse' && transitionT < 0) {
        hoverSlot = pick(e.clientX, e.clientY);
        renderer.domElement.style.cursor = hoverSlot ? 'pointer' : 'default';
      }
    };

    const onContext = (e: Event) => e.preventDefault();

    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('contextmenu', onContext);

    /* ------------------------------ 循环 ------------------------------ */
    const clock = new THREE.Clock();
    let raf = 0;

    const loop = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;

      parallaxX += (targetParallaxX - parallaxX) * Math.min(1, dt * 3);
      parallaxY += (targetParallaxY - parallaxY) * Math.min(1, dt * 3);
      const fit = 1 + Math.max(0, (1.5 - camera.aspect) * 0.45);
      camera.position.set(camBase.x + parallaxX, camBase.y - parallaxY, camBase.z * fit);
      camera.lookAt(parallaxX * 0.6, 1.35, 0);

      slots.forEach((slot, i) => {
        const bob = Math.sin(elapsed * 1.7 + i * 1.1) * 0.03;
        slot.car.position.y = 0.02 + bob;
        slot.car.rotation.z = Math.sin(elapsed * 1.2 + i) * 0.012;
        slot.eyes.update(dt, elapsed);

        const padMat = slot.pad.material as THREE.MeshStandardMaterial;
        padMat.emissiveIntensity = 0.07 + Math.max(0, Math.sin(elapsed * 2 + i * 0.7)) * 0.15;

        slot.root.children.forEach((c) => {
          if (c.userData && c.userData.slot) {
            c.visible = stickerRef.current.includes(slot.vehicle.id);
            c.rotation.y = elapsed * 1.4 + i;
          }
        });

        const isHover = hoverSlot === slot;
        const targetScale = isHover ? 1.035 : 1;
        slot.root.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), Math.min(1, dt * 8));
      });

      if (selected) {
        transitionT += dt;
        const doorT = easeOutCubic(clamp01(transitionT / 0.5));
        selected.door.position.y = selected.doorBaseY + doorT * 0.6;

        const driveT = clamp01((transitionT - 0.2) / 0.8);
        selected.car.position.z = easeOutCubic(driveT) * 2.2;
        selected.car.position.y = 0.02 + driveT * 0.35;
        selected.car.scale.setScalar(CAR_SCALE * (1 + driveT * 0.55));
        selected.car.rotation.y = -0.95 + driveT * 0.28;

        slots.forEach((s) => {
          if (s === selected) return;
          const k = 1 - clamp01(transitionT / 0.55) * 0.3;
          s.root.scale.setScalar(k);
        });

        if (transitionT > 1.1) {
          const target = selected.vehicle;
          selected = null;
          transitionT = -1;
          selectRef.current(target);
        }
      }

      dust.forEach((s) => {
        s.position.y += (s.userData.speed as number) * dt;
        if (s.position.y > 6.4) s.position.y = 0.3;
      });

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };

    const onResize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(host);

    loop();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('contextmenu', onContext);
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, []);

  const collected = stickers.length;

  return (
    <div className="garage-root">
      <div ref={hostRef} className="garage-canvas-host" />
      <div className="garage-stickerbox" aria-hidden="true">
        <StickerBoxGlyph size={46} />
        <div className="garage-stickerbox-stars">
          {Array.from({ length: Math.min(collected, 6) }).map((_, i) => (
            <span key={i} className="garage-stickerbox-star">
              <SparkleGlyph color="#FBBF24" size={13} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------- 车库简化预览车（保证 60fps） --------------------- */

function buildGarageCar(parent: THREE.Group, vehicle: VehicleScenarioConfig): EyesController {
  const body = new THREE.Group();
  parent.add(body);

  const paint = toyMat(vehicle.themeColorHex);
  const accent = toyMat(vehicle.accentColorHex);

  const lower = roundedBox(2.3, 0.72, 1.35, 0.16, paint);
  lower.position.set(0, 0.62, 0);
  body.add(lower);

  const cabin = roundedBox(1.05, 0.72, 1.2, 0.14, paint);
  cabin.position.set(0.42, 1.2, 0);
  body.add(cabin);

  const glass = roundedBox(0.08, 0.44, 1.06, 0.04, toyMat('#BFE9FF', { transparent: true, opacity: 0.6, roughness: 0.12 }));
  glass.position.set(0.96, 1.22, 0);
  body.add(glass);

  const roof = roundedBox(1.12, 0.1, 1.26, 0.05, accent);
  roof.position.set(0.42, 1.58, 0);
  body.add(roof);

  // 大眼睛（与沙盒同一套 4 状态控制器）
  const eyes = createEyes(vehicle.themeColorHex);
  eyes.group.position.set(1.0, 1.16, 0);
  eyes.group.rotation.y = Math.PI / 2 - 0.2;
  eyes.group.scale.setScalar(1.08);
  eyes.setState('LISTEN');
  body.add(eyes.group);

  // 微笑灯带
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.035, 6, 16, Math.PI * 0.8),
    toyMat('#FFFFFF', { emissive: '#FDE68A', emissiveIntensity: 0.5 })
  );
  smile.position.set(1.12, 0.62, 0);
  smile.rotation.y = Math.PI / 2;
  smile.rotation.z = -Math.PI * 0.4;
  body.add(smile);

  // 四轮
  const wheelMat = toyMat('#374151', { roughness: 0.75 });
  const hubMat = toyMat('#F3F4F6');
  for (const x of [0.72, -0.72]) {
    for (const z of [0.72, -0.72]) {
      const tire = toyCylinder(0.42, 0.42, 0.3, wheelMat, 18);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(x, 0.42, z);
      body.add(tire);
      const hub = toyCylinder(0.18, 0.18, 0.32, hubMat, 12);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(x, 0.42, z);
      body.add(hub);
    }
  }

  // 车种辨识装饰
  if (vehicle.id === 'water_truck') {
    const tank = toyCylinder(0.55, 0.55, 1.5, accent, 22);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(-0.4, 1.5, 0);
    body.add(tank);
  } else if (vehicle.id === 'excavator') {
    const arm = roundedBox(1.1, 0.18, 0.2, 0.06, accent);
    arm.position.set(0.55, 1.85, 0);
    arm.rotation.z = 0.6;
    body.add(arm);
  } else if (vehicle.id === 'dump_truck') {
    const bed = roundedBox(1.35, 0.34, 1.24, 0.06, accent);
    bed.position.set(-0.62, 1.2, 0);
    body.add(bed);
  } else if (vehicle.id === 'crane_truck') {
    const boom = roundedBox(1.5, 0.16, 0.2, 0.05, accent);
    boom.position.set(0.35, 2.0, 0);
    boom.rotation.z = 0.5;
    body.add(boom);
  } else if (vehicle.id === 'cement_mixer') {
    const drum = toyCylinder(0.42, 0.5, 1.35, accent, 18);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(-0.45, 1.35, 0);
    body.add(drum);
  } else if (vehicle.id === 'bulldozer') {
    const blade = roundedBox(0.18, 0.8, 1.55, 0.06, toyMat('#E5E7EB'));
    blade.position.set(1.35, 0.5, 0);
    body.add(blade);
  }

  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  return eyes;
}

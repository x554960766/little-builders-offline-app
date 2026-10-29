import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { LanguageLevel, VehicleScenarioConfig } from '../../config/vehiclesConfig';
import { ScenarioStateMachine, ScenarioPhase } from '../../engine/ScenarioStateMachine';
import { ToddlerInputManager, HitBinding } from '../../engine/ToddlerInputManager';
import { buildVehicleRig, VehicleRig, EyeState } from './VehicleRigBuilder';
import { buildEnvironment, EnvironmentCascade } from './EnvironmentCascade';
import { audio } from '../../engine/audio';
import { radialTexture } from '../../engine/toyKit';

/**
 * SandboxCanvas3D —— 2.5D 锁定视角工地沙盘渲染容器
 * 相机：俯角 18° / 偏航 -25° / FOV 38°（禁止自由旋转）
 * 环境：晨光渐变天空（CSS）+ 3D 云朵 + 圆形微缩生态沙盘底座
 */

export interface SandboxStateView {
  phase: ScenarioPhase;
  stepIndex: number;
  stepCount: number;
  level: LanguageLevel;
  showGuideHand: boolean;
  speaking: boolean;
}

export interface GuideTarget {
  x: number;
  y: number;
  visible: boolean;
  dirX: number;
  dirY: number;
}

export interface SandboxHandle {
  replayPrompt: () => void;
  setLevel: (level: LanguageLevel) => void;
  restart: () => void;
}

interface Props {
  vehicle: VehicleScenarioConfig;
  level: LanguageLevel;
  paused: boolean;
  onState: (view: SandboxStateView) => void;
  onAllComplete: () => void;
  guideRef: MutableRefObject<GuideTarget>;
}

const CAM_DISTANCE = 9.4;
const CAM_PHI = THREE.MathUtils.degToRad(18);
/** 偏航 +45°：机位落在车辆右前方，既能看清前挡风玻璃上的双眼，也保留斜侧立体感 */
const CAM_THETA = THREE.MathUtils.degToRad(45);

/** 每辆车的构图焦点：让车与环境道具一起落在画面里 */
const FOCUS_BY_VEHICLE: Record<string, [number, number, number]> = {
  water_truck: [0.85, 0.95, 0.1],
  excavator: [0.8, 0.95, 0.1],
  dump_truck: [-1.0, 0.95, 0.2],
  crane_truck: [0.85, 1.05, 0],
  cement_mixer: [1.0, 1.08, 0.3],
  bulldozer: [1.0, 0.95, 0.3],
};
const CAM_TARGET = new THREE.Vector3(0.85, 0.95, 0.1);

export const SandboxCanvas3D = forwardRef<SandboxHandle, Props>(function SandboxCanvas3D(
  { vehicle, level, paused, onState, onAllComplete, guideRef },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const machineRef = useRef<ScenarioStateMachine | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useImperativeHandle(
    ref,
    () => ({
      replayPrompt: () => machineRef.current?.replayPrompt(),
      setLevel: (l: LanguageLevel) => machineRef.current?.setLevel(l),
      restart: () => machineRef.current?.reset(),
    }),
    []
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    /* ------------------------------ 渲染器 ------------------------------ */
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#FEF3C7', 24, 52);

    const camera = new THREE.PerspectiveCamera(
      38,
      host.clientWidth / Math.max(1, host.clientHeight),
      0.1,
      120
    );
    const focus = new THREE.Vector3(...(FOCUS_BY_VEHICLE[vehicle.id] ?? [0.85, 0.95, 0.1]));

    /* ------------------------------ 光照 ------------------------------ */
    const hemi = new THREE.HemisphereLight('#E0F2FE', '#FDE68A', 1.65);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight('#FFF7ED', 2.15);
    sun.position.set(5.5, 9.5, 6.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 30;
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    const fill = new THREE.DirectionalLight('#BAE6FD', 0.55);
    fill.position.set(-6, 4, -5);
    scene.add(fill);

    /* --------------------------- 木地板与沙盘 --------------------------- */
    const roomFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: '#F3D7AE', roughness: 0.82, metalness: 0 })
    );
    roomFloor.rotation.x = -Math.PI / 2;
    roomFloor.position.y = -0.52;
    roomFloor.receiveShadow = true;
    scene.add(roomFloor);

    // 木地板拼缝
    for (let i = -8; i <= 8; i++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.01, 44),
        new THREE.MeshStandardMaterial({ color: '#E2C08F', roughness: 0.8 })
      );
      line.position.set(i * 2.4, -0.51, 0);
      scene.add(line);
    }

    const baseH = 0.5;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(6.5, 6.25, baseH, 64),
      new THREE.MeshStandardMaterial({ color: '#EFD3AA', roughness: 0.72 })
    );
    base.position.y = -baseH / 2;
    base.receiveShadow = true;
    base.castShadow = true;
    scene.add(base);

    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(6.18, 6.18, 0.1, 64),
      new THREE.MeshStandardMaterial({ color: vehicle.groundColorHex, roughness: 0.86 })
    );
    grass.position.y = 0.03;
    grass.receiveShadow = true;
    scene.add(grass);

    // 草地点缀
    const tuftMat = new THREE.MeshStandardMaterial({ color: '#84CC16', roughness: 0.7 });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4.6 + Math.random() * 1.4;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 5), tuftMat);
      tuft.position.set(Math.cos(a) * r, 0.14, Math.sin(a) * r);
      tuft.rotation.z = (Math.random() - 0.5) * 0.4;
      scene.add(tuft);
    }

    // 沙盘外圈圆角护栏
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(6.42, 0.14, 10, 72),
      new THREE.MeshStandardMaterial({ color: '#E7C79B', roughness: 0.62 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    scene.add(rim);

    /* ------------------------------ 云朵 ------------------------------ */
    const clouds: THREE.Group[] = [];
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.95, metalness: 0 });
    for (let i = 0; i < 5; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.6 + Math.random() * 0.4, 14, 10), cloudMat);
        puff.position.set(j * 0.55 - 0.8, Math.random() * 0.2, Math.random() * 0.3);
        puff.scale.y = 0.75;
        cloud.add(puff);
      }
      cloud.position.set(-9 + i * 4.6, 2.95 + (i % 3) * 0.5, -4.2 - (i % 2) * 1.6);
      cloud.scale.setScalar(0.72 + (i % 3) * 0.18);
      scene.add(cloud);
      clouds.push(cloud);
    }

    /* --------------------------- 车辆与环境 --------------------------- */
    const rig: VehicleRig = buildVehicleRig(vehicle);
    rig.root.position.set(-0.35, 0, 0);
    rig.root.rotation.y = -0.16;
    rig.root.scale.setScalar(1.26);
    scene.add(rig.root);

    const env: EnvironmentCascade = buildEnvironment(vehicle.id);
    scene.add(env.group);

    /* ------------------------------ 状态机 ------------------------------ */
    const machine = new ScenarioStateMachine(vehicle, level, {
      onAllComplete: () => {
        rig.playHop();
        audio.playProceduralSfx('treasure_fanfare');
        onAllComplete();
      },
      onStepComplete: (stepIndex) => {
        env.celebrate(stepIndex);
        rig.playHop();
      },
    });
    machineRef.current = machine;

    /* ------------------------------ 高亮光环 ------------------------------ */
    const haloTexture = radialTexture('rgba(253,224,71,0.95)', 'rgba(253,224,71,0)');
    const haloMat = new THREE.SpriteMaterial({
      map: haloTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(1.15, 1.15, 1);
    halo.renderOrder = 999;
    halo.visible = false;
    scene.add(halo);

    const ringTexture = radialTexture('rgba(255,255,255,0)', 'rgba(253,224,71,0)');
    const ringMat = new THREE.SpriteMaterial({
      map: ringTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.55,
    });
    const ring = new THREE.Sprite(ringMat);
    ring.scale.set(1.55, 1.55, 1);
    ring.renderOrder = 998;
    ring.visible = false;
    scene.add(ring);

    /* ------------------------------ 输入 ------------------------------ */
    let elapsed = 0;
    let eyeOverrideUntil = -1;

    const bindings: HitBinding[] = [];
    for (const [partId, part] of rig.parts) {
      bindings.push({ partId, hitObjects: [part.hitProxy] });
    }

    const input = new ToddlerInputManager({
      element: renderer.domElement,
      camera,
      getBindings: () => bindings,
      getTargetPartId: () => machine.getSnapshot().targetPartId,
      getTargetDirection: () => machine.getSnapshot().dragDirection,
      isMainInteractive: () => !pausedRef.current && machine.getSnapshot().phase === 'PROMPT',
      allowTapFallback: () => {
        const snap = machine.getSnapshot();
        const step = vehicle.steps[snap.stepIndex];
        return step?.allowTapFallback ?? true;
      },
      onGrab: (partId) => machine.handleGrab(partId),
      onDrag: (s) => machine.handleDragProgress(s.progress),
      onRelease: (r) => machine.handleRelease(r),
      onFreePartTouch: (partId) => {
        const freePart = vehicle.freePlayParts.find((p) => p.partId === partId);
        if (freePart) {
          machine.handleFreePlayPart(partId, freePart.sfxType);
          rig.playFreePart(partId);
          if (partId === 'fp_eyes') {
            eyeOverrideUntil = elapsed + 1.4;
          }
        } else {
          // 非目标主线部件：只给轻快拟声反馈，绝不打断主线
          audio.playProceduralSfx('pop');
        }
      },
    });

    /* ------------------------------ 循环 ------------------------------ */
    const clock = new THREE.Clock();
    let raf = 0;
    let camDist = CAM_DISTANCE;
    let camVel = 0;
    let lastPhase: ScenarioPhase | null = null;
    let lastStep = -1;
    let lastLevel = level;
    let lastGuide = false;
    let lastSpeaking = false;

    const lookTarget = new THREE.Vector3();
    const anchorWorld = new THREE.Vector3();
    const projected = new THREE.Vector3();

    const updateCamera = (dt: number) => {
      const live = machine.getLive();
      const targetDist = live.phase === 'CASCADE_FEEDBACK' ? CAM_DISTANCE * 0.85 : CAM_DISTANCE;
      // 二阶弹簧阻尼
      const stiffness = 26;
      const damping = 9;
      camVel += (targetDist - camDist) * stiffness * dt;
      camVel *= Math.max(0, 1 - damping * dt);
      camDist += camVel * dt;

      camera.position.set(
        focus.x + camDist * Math.cos(CAM_PHI) * Math.sin(CAM_THETA),
        focus.y + camDist * Math.sin(CAM_PHI),
        focus.z + camDist * Math.cos(CAM_PHI) * Math.cos(CAM_THETA)
      );
      camera.lookAt(focus);
    };

    const updateGuide = () => {
      const snap = machine.getSnapshot();
      const targetPartId = snap.targetPartId;
      if (!targetPartId) {
        halo.visible = false;
        ring.visible = false;
        guideRef.current.visible = false;
        return;
      }

      const has = rig.getAnchorWorld(targetPartId, anchorWorld);
      if (!has) {
        halo.visible = false;
        ring.visible = false;
        guideRef.current.visible = false;
        return;
      }

      halo.visible = true;
      ring.visible = true;
      halo.position.copy(anchorWorld);
      ring.position.copy(anchorWorld);
      const pulse = 1.0 + 0.15 * Math.sin(5 * elapsed);
      halo.scale.set(0.9 * pulse, 0.9 * pulse, 1);
      ring.scale.set(1.32 * (2 - pulse), 1.32 * (2 - pulse), 1);
      haloMat.opacity = 0.55 + 0.3 * Math.sin(5 * elapsed);
      ringMat.opacity = 0.3 + 0.15 * Math.sin(5 * elapsed + 1);

      // 投影到屏幕（给 DOM 引导小手）
      projected.copy(anchorWorld).project(camera);
      const rect = host.getBoundingClientRect();
      const x = ((projected.x + 1) / 2) * rect.width;
      const y = ((1 - projected.y) / 2) * rect.height;
      const dir = snap.dragDirection ?? [1, 0];
      guideRef.current.x = x;
      guideRef.current.y = y;
      guideRef.current.dirX = dir[0];
      guideRef.current.dirY = dir[1];
      guideRef.current.visible = snap.phase === 'PROMPT' && snap.showGuideHand;
    };

    const pushState = () => {
      const snap = machine.getSnapshot();
      if (
        snap.phase !== lastPhase ||
        snap.stepIndex !== lastStep ||
        snap.level !== lastLevel ||
        snap.showGuideHand !== lastGuide ||
        snap.speaking !== lastSpeaking
      ) {
        lastPhase = snap.phase;
        lastStep = snap.stepIndex;
        lastLevel = snap.level;
        lastGuide = snap.showGuideHand;
        lastSpeaking = snap.speaking;
        onState({
          phase: snap.phase,
          stepIndex: snap.stepIndex,
          stepCount: snap.stepCount,
          level: snap.level,
          showGuideHand: snap.showGuideHand,
          speaking: snap.speaking,
        });
      }
    };

    const loop = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;

      machine.update(dt);
      const live = machine.getLive();

      rig.applyStep(live.stepIndex, live.progress);

      // 生命状态
      let eyeState: EyeState = 'IDLE';
      if (elapsed < eyeOverrideUntil) {
        eyeState = 'STAR';
      } else if (live.phase === 'CASCADE_FEEDBACK' || live.phase === 'REWARD') {
        eyeState = 'STAR';
      } else if (live.phase === 'ACTING' && live.progress > 0.05 && live.progress < 0.97) {
        eyeState = 'EFFORT';
      } else if (live.phase === 'PROMPT' || live.phase === 'IDLE') {
        eyeState = 'LISTEN';
      }

      const snap = machine.getSnapshot();
      const targetId = snap.targetPartId;
      if (targetId && rig.getAnchorWorld(targetId, lookTarget)) {
        rig.eyes.lookAt(lookTarget);
      } else {
        rig.eyes.lookAt(null);
      }

      rig.update(dt, elapsed, { eyeState, lookAt: lookTarget, progress: live.progress });
      env.update(dt, elapsed, live);

      // 云朵缓慢飘动
      clouds.forEach((c, i) => {
        c.position.x += dt * (0.08 + i * 0.012);
        if (c.position.x > 13) c.position.x = -13;
      });

      updateCamera(dt);
      updateGuide();
      pushState();

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };

    /* ------------------------------ 交互启动 ------------------------------ */
    const unlockOnce = () => {
      audio.ensureContext();
    };
    renderer.domElement.addEventListener('pointerdown', unlockOnce, { once: true });

    machine.start();

    /* ------------------ 调试探针（自动化测试用，不参与 UI） ------------------ */
    const debugApi = {
      machine,
      vehicleId: vehicle.id,
      partScreen(partId: string): { x: number; y: number } | null {
        if (!rig.getAnchorWorld(partId, anchorWorld)) return null;
        const rect = host.getBoundingClientRect();
        projected.copy(anchorWorld).project(camera);
        return {
          x: ((projected.x + 1) / 2) * rect.width,
          y: ((1 - projected.y) / 2) * rect.height,
        };
      },
    };
    (window as unknown as Record<string, unknown>).__lbDebug = debugApi;

    /* ------------------------------ 尺寸 ------------------------------ */
    const onResize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(host);

    const onVisibility = () => {
      if (document.hidden) audio.stopSpeaking();
    };
    document.addEventListener('visibilitychange', onVisibility);

    loop();

    return () => {
      delete (window as unknown as Record<string, unknown>).__lbDebug;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('pointerdown', unlockOnce);
      input.dispose();
      machine.dispose();
      machineRef.current = null;
      env.dispose();
      rig.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
    // 车辆变化时整体重建场景
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle.id]);

  return <div ref={hostRef} className="sandbox-canvas-host" data-paused={paused ? '1' : '0'} />;
});

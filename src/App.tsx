import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LanguageLevel, VEHICLES_CONFIG, VehicleScenarioConfig } from './config/vehiclesConfig';
import { SunshineGarage3D } from './components/garage/SunshineGarage3D';
import {
  SandboxCanvas3D,
  SandboxHandle,
  SandboxStateView,
  GuideTarget,
} from './components/sandbox/SandboxCanvas3D';
import { GuideHandOverlay3D } from './components/sandbox/GuideHandOverlay3D';
import { ZeroTextHUD } from './components/ui/ZeroTextHUD';
import { StickerCelebration } from './components/ui/StickerCelebration';
import { audio, unlockAudio } from './engine/audio';

/**
 * 顶层状态路由：GARAGE_LOBBY（阳光车库） <-> VEHICLE_SANDBOX（工程车工地）
 * 100% 纯离线、纯用户端、无登录、无家长中心、无任何文字 UI。
 */

type Route = 'GARAGE' | 'SANDBOX';

const STICKER_KEY = 'little_builders_stickers_v1';
const LEVEL_KEY = 'little_builders_level_v1';

function loadStickers(): string[] {
  try {
    const raw = localStorage.getItem(STICKER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
    return [];
  } catch {
    return [];
  }
}

function loadLevel(): LanguageLevel {
  try {
    const raw = localStorage.getItem(LEVEL_KEY);
    if (raw === 'L1' || raw === 'L2' || raw === 'L3') return raw;
  } catch {
    /* 忽略 */
  }
  return 'L2';
}

export default function App() {
  const [route, setRoute] = useState<Route>('GARAGE');
  const [vehicle, setVehicle] = useState<VehicleScenarioConfig | null>(null);
  const [level, setLevel] = useState<LanguageLevel>(loadLevel);
  const [stickers, setStickers] = useState<string[]>(loadStickers);
  const [view, setView] = useState<SandboxStateView | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  const guideRef = useRef<GuideTarget>({ x: 0, y: 0, visible: false, dirX: 1, dirY: 0 });
  const sandboxRef = useRef<SandboxHandle | null>(null);
  const vehicleRef = useRef<VehicleScenarioConfig | null>(null);
  vehicleRef.current = vehicle;

  /* -------------------- 首个手势解锁 WebAudio（iOS 要求） -------------------- */
  useEffect(() => {
    const onFirstTouch = () => unlockAudio();
    window.addEventListener('pointerdown', onFirstTouch, { once: true });
    return () => window.removeEventListener('pointerdown', onFirstTouch);
  }, []);

  /* ----------------------------- 全局防误触 ----------------------------- */
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('gesturestart', prevent as EventListener);
    document.addEventListener('dblclick', prevent);
    const onMultiTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener('touchmove', onMultiTouch, { passive: false });
    return () => {
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('gesturestart', prevent as EventListener);
      document.removeEventListener('dblclick', prevent);
      document.removeEventListener('touchmove', onMultiTouch);
    };
  }, []);

  /* ----------------------------- 等级持久化 ----------------------------- */
  const changeLevel = useCallback((next: LanguageLevel) => {
    setLevel(next);
    try {
      localStorage.setItem(LEVEL_KEY, next);
    } catch {
      /* 忽略 */
    }
    sandboxRef.current?.setLevel(next);
  }, []);

  /* ----------------------------- 选车 / 回车库 ----------------------------- */
  const handleSelect = useCallback((v: VehicleScenarioConfig) => {
    audio.playProceduralSfx('light');
    setCelebrating(false);
    setView(null);
    setVehicle(v);
    setRoute('SANDBOX');
  }, []);

  const handleBack = useCallback(() => {
    audio.stopSpeaking();
    audio.playProceduralSfx('pop');
    setCelebrating(false);
    setView(null);
    setVehicle(null);
    setRoute('GARAGE');
  }, []);

  const handleReplayVoice = useCallback(() => {
    sandboxRef.current?.replayPrompt();
  }, []);

  /* ----------------------------- 三关全通庆祝 ----------------------------- */
  const allCompleteRef = useRef<() => void>(() => {});
  allCompleteRef.current = () => {
    const v = vehicleRef.current;
    if (!v) return;
    setCelebrating(true);
    setStickers((prev) => {
      if (prev.includes(v.id)) return prev;
      const next = [...prev, v.id];
      try {
        localStorage.setItem(STICKER_KEY, JSON.stringify(next));
      } catch {
        /* 忽略 */
      }
      return next;
    });
    // 律动儿歌
    window.setTimeout(() => {
      audio.speakEnglish(v.chantVoice.text, v.chantVoice.id, level);
    }, 420);
  };
  const onAllComplete = useCallback(() => allCompleteRef.current(), []);

  const onState = useCallback((next: SandboxStateView) => setView(next), []);

  /* ----------------------------- 再来一次 ----------------------------- */
  const handleRestart = useCallback(() => {
    setCelebrating(false);
    sandboxRef.current?.restart();
  }, []);

  const celebratingVehicle = useMemo(() => vehicle, [vehicle]);
  const hudVisible = route === 'SANDBOX' && !!vehicle && !celebrating && view?.phase !== 'REWARD';

  return (
    <div className="app-root">
      {route === 'GARAGE' && <SunshineGarage3D stickers={stickers} onSelect={handleSelect} />}

      {route === 'SANDBOX' && vehicle && (
        <>
          <SandboxCanvas3D
            ref={sandboxRef}
            vehicle={vehicle}
            level={level}
            paused={celebrating}
            onState={onState}
            onAllComplete={onAllComplete}
            guideRef={guideRef}
          />
          <GuideHandOverlay3D guideRef={guideRef} />
        </>
      )}

      {hudVisible && vehicle && (
        <ZeroTextHUD
          level={level}
          onLevelChange={changeLevel}
          onBack={handleBack}
          onReplay={handleReplayVoice}
          stepIndex={view?.stepIndex ?? 0}
          stepCount={view?.stepCount ?? 3}
          speaking={view?.speaking ?? false}
        />
      )}

      {celebrating && celebratingVehicle && (
        <StickerCelebration
          vehicle={celebratingVehicle}
          visible={celebrating}
          onReplay={handleRestart}
          onBack={handleBack}
        />
      )}
    </div>
  );
}

export const ALL_VEHICLES = VEHICLES_CONFIG;

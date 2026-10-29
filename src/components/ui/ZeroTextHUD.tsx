import { useCallback, useEffect, useRef, useState } from 'react';
import { LanguageLevel } from '../../config/vehiclesConfig';
import { audio } from '../../engine/audio';
import { GarageGlyph, LevelSprouts, SpeakerGlyph } from './icons';

/**
 * ZeroTextHUD —— 纯图形零文字 HUD（PRD 第 9 节）
 * 左上：长按 1.5s 环形蓄力返回键（防边缘误触）
 * 右上：1~3 株幼苗语料等级切换胶囊（绝无 L1/L2/L3 字样）
 * 右下：重播语音小喇叭
 */

const HOLD_MS = 1500;
const RADIUS = 25;
const CIRCUM = 2 * Math.PI * RADIUS;

const LEVEL_ORDER: LanguageLevel[] = ['L1', 'L2', 'L3'];

interface Props {
  level: LanguageLevel;
  onLevelChange: (level: LanguageLevel) => void;
  onBack: () => void;
  onReplay: () => void;
  stepIndex: number;
  stepCount: number;
  speaking: boolean;
}

export function ZeroTextHUD({ level, onLevelChange, onBack, onReplay, stepIndex, stepCount, speaking }: Props) {
  const ringRef = useRef<SVGCircleElement | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const firedRef = useRef(false);
  const [flash, setFlash] = useState(false);
  const [wave, setWave] = useState(0);

  const resetRing = useCallback((animate: boolean) => {
    const ring = ringRef.current;
    if (!ring) return;
    if (animate) {
      ring.style.transition = 'stroke-dashoffset 280ms ease-out';
      ring.style.strokeDashoffset = String(CIRCUM);
      window.setTimeout(() => {
        if (ringRef.current) ringRef.current.style.transition = '';
      }, 300);
    } else {
      ring.style.transition = '';
      ring.style.strokeDashoffset = String(CIRCUM);
    }
  }, []);

  const stopHold = useCallback(
    (cancelled: boolean) => {
      const started = holdStartRef.current;
      holdStartRef.current = null;
      cancelAnimationFrame(rafRef.current);

      if (firedRef.current) return;

      if (started !== null && cancelled) {
        // 未满 1.5s：轻柔啵声 + 外圈闪动，不执行退出
        audio.playSoftBoop();
        setFlash(true);
        window.setTimeout(() => setFlash(false), 340);
      }
      resetRing(true);
    },
    [resetRing]
  );

  const beginHold = useCallback(() => {
    if (holdStartRef.current !== null) return;
    firedRef.current = false;
    holdStartRef.current = performance.now();
    resetRing(false);

    const tick = () => {
      const start = holdStartRef.current;
      if (start === null) return;
      const p = Math.min(1, (performance.now() - start) / HOLD_MS);
      const ring = ringRef.current;
      if (ring) ring.style.strokeDashoffset = String(CIRCUM * (1 - p));

      if (p >= 1) {
        if (!firedRef.current) {
          firedRef.current = true;
          audio.playProceduralSfx('star_magic');
          holdStartRef.current = null;
          resetRing(false);
          onBack();
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [onBack, resetRing]);

  useEffect(() => {
    const onUp = () => {
      if (holdStartRef.current !== null) stopHold(true);
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, [stopHold]);

  useEffect(() => {
    resetRing(false);
  }, [resetRing]);

  const cycleLevel = () => {
    const idx = LEVEL_ORDER.indexOf(level);
    const next = LEVEL_ORDER[(idx + 1) % LEVEL_ORDER.length];
    audio.playLevelChime(LEVEL_ORDER.indexOf(next) + 1);
    onLevelChange(next);
  };

  const replay = () => {
    setWave((w) => w + 1);
    onReplay();
  };

  const sproutCount = LEVEL_ORDER.indexOf(level) + 1;

  return (
    <div className="hud" aria-hidden="true">
      {/* 左上角：长按 1.5s 返回车库 */}
      <button
        className={`hud-back jelly ${flash ? 'is-flash' : ''}`}
        onPointerDown={(e) => {
          e.preventDefault();
          beginHold();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg className="hud-back-ring" width="62" height="62" viewBox="0 0 62 62">
          <circle cx="31" cy="31" r={RADIUS} fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="5" />
          <circle
            ref={ringRef}
            cx="31"
            cy="31"
            r={RADIUS}
            fill="none"
            stroke="#FBBF24"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeDasharray={CIRCUM}
            strokeDashoffset={CIRCUM}
            transform="rotate(-90 31 31)"
          />
        </svg>
        <span className="hud-back-icon">
          <GarageGlyph size={30} />
        </span>
      </button>

      {/* 右上角：1~3 株幼苗等级胶囊 */}
      <button className="hud-level jelly" onClick={cycleLevel} onContextMenu={(e) => e.preventDefault()}>
        <LevelSprouts count={sproutCount} />
      </button>

      {/* 右下角：重播语音小喇叭 */}
      <button className="hud-replay jelly" onClick={replay} onContextMenu={(e) => e.preventDefault()}>
        <span className={`hud-replay-wave ${speaking ? 'speaking' : ''}`} key={wave} />
        <SpeakerGlyph size={30} />
      </button>

      {/* 底部：纯图形步骤进度（圆点，无数字） */}
      <div className="hud-progress">
        {Array.from({ length: stepCount }).map((_, i) => (
          <span key={i} className={`hud-dot ${i < stepIndex ? 'done' : ''} ${i === stepIndex ? 'current' : ''}`} />
        ))}
      </div>
    </div>
  );
}

import { CSSProperties, useMemo } from 'react';
import { VehicleScenarioConfig } from '../../config/vehiclesConfig';
import { GarageGlyph, ReplayGlyph, SparkleGlyph, StickerBoxGlyph, TruckGlyph } from './icons';

/**
 * StickerCelebration —— 过关庆典层（PRD 第 9.4 节）
 * 漫天纸屑 + 3D 贴纸飞入贴纸盒 + 律动儿歌 + 两个超大纯图形果冻按钮
 * 贴纸持久化由 App 层写入 localStorage。
 */

interface Props {
  vehicle: VehicleScenarioConfig;
  visible: boolean;
  onReplay: () => void;
  onBack: () => void;
}

const CONFETTI_COLORS = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#C084FC', '#FB7185', '#FDE047'];

export function StickerCelebration({ vehicle, visible, onReplay, onBack }: Props) {
  const confetti = useMemo(
    () =>
      Array.from({ length: 46 }).map((_, i) => ({
        left: Math.random() * 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 2.4,
        duration: 2.4 + Math.random() * 1.8,
        rotate: Math.random() * 360,
        width: 7 + Math.random() * 8,
        height: 10 + Math.random() * 10,
        round: i % 3 === 0,
      })),
    [visible]
  );

  if (!visible) return null;

  return (
    <div
      className="celebration"
      style={
        {
          '--celeb-theme': vehicle.themeColorHex,
          '--celeb-accent': vehicle.accentColorHex,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <div className="celebration-glow" />

      {confetti.map((c, i) => (
        <span
          key={i}
          className="celebration-confetti"
          style={{
            left: `${c.left}%`,
            width: c.width,
            height: c.height,
            background: c.color,
            borderRadius: c.round ? '50%' : '2px',
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
            transform: `rotate(${c.rotate}deg)`,
          }}
        />
      ))}

      {/* 3D 立体贴纸：放大登场 → 摇曳 → 飞入左下角贴纸盒 */}
      <div className="celebration-stage">
        <div className="celebration-sticker">
          <span className="sticker-disc" />
          <span className="sticker-shine" />
          <span className="sticker-truck">
            <TruckGlyph color="var(--celeb-theme)" size={132} />
          </span>
          <span className="sticker-sparkle s1">
            <SparkleGlyph color="#FDE047" size={26} />
          </span>
          <span className="sticker-sparkle s2">
            <SparkleGlyph color="#FFFFFF" size={18} />
          </span>
          <span className="sticker-sparkle s3">
            <SparkleGlyph color="#FBBF24" size={22} />
          </span>
        </div>
      </div>

      <div className="celebration-box">
        <StickerBoxGlyph size={58} />
        <span className="celebration-box-insert" />
        <span className="celebration-box-count">
          <SparkleGlyph color="#FBBF24" size={18} />
        </span>
      </div>

      <div className="celebration-actions">
        <button className="celebration-btn jelly is-secondary" onClick={onReplay} onContextMenu={(e) => e.preventDefault()}>
          <ReplayGlyph size={54} />
        </button>
        <button className="celebration-btn jelly is-primary" onClick={onBack} onContextMenu={(e) => e.preventDefault()}>
          <GarageGlyph size={50} />
        </button>
      </div>
    </div>
  );
}

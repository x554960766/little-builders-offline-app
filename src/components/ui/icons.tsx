/**
 * 纯图形 SVG 图标库 —— 全界面严禁任何字母/数字/文字
 * 所有图标仅由形状与色彩表达语义
 */

interface IconProps {
  size?: number;
  className?: string;
}

/** 单株幼苗 */
export function SproutGlyph({ size = 34, dim = false }: { size?: number; dim?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <ellipse cx="16" cy="28.4" rx="8.4" ry="1.7" fill="#A16207" opacity="0.18" />
      <path
        d="M16 28c0-4.6 0-8 0-10.6"
        stroke={dim ? '#8FC7A4' : '#15803D'}
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M16 19C14 14 9.2 11.2 5.4 12.9c.7 4.8 4.6 7.3 10.6 6.1z"
        fill={dim ? '#B7E9C7' : '#4ADE80'}
      />
      <path
        d="M16 15.2C17.2 10.2 21.8 7.2 26.2 8.8c-.4 5-4.2 7.7-10.2 6.4z"
        fill={dim ? '#93D9AC' : '#22C55E'}
      />
      {!dim && <circle cx="9.4" cy="15.2" r="1.3" fill="#FEF08A" />}
    </svg>
  );
}

/** 1~3 株幼苗等级（纯图形，绝无 L1/L2/L3 字样） */
export function LevelSprouts({ count }: { count: number }) {
  return (
    <span className="level-sprouts">
      {Array.from({ length: Math.min(Math.max(count, 1), 3) }).map((_, i) => (
        <span key={i} className="level-sprout on" style={{ animationDelay: `${i * 60}ms` }}>
          <SproutGlyph size={29} />
        </span>
      ))}
    </span>
  );
}

/** 车库小屋（返回阳光车库） */
export function GarageGlyph({ size = 34 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M6 17.6 20 6l14 11.6" fill="#F87171" stroke="#DC2626" strokeWidth="2" strokeLinejoin="round" />
      <rect x="8.4" y="17" width="23.2" height="17" rx="3.6" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.8" />
      <rect x="12" y="20.4" width="16" height="13.6" rx="2.2" fill="#F8FAFC" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x="12.6" y={21.4 + i * 3.2} width="14.8" height="1.7" rx="0.85" fill="#93C5FD" />
      ))}
      <circle cx="20" cy="14" r="1.9" fill="#FBBF24" />
    </svg>
  );
}

/** 小喇叭（重播语音） */
export function SpeakerGlyph({ size = 30 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7 12.5h4.2L17 7.4v17.2l-5.8-5.1H7a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z" fill="#F59E0B" stroke="#B45309" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M21.4 11.6c1.8 1.6 1.8 7.2 0 8.8" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M25 8.6c3.4 3 3.4 11.8 0 14.8" stroke="#FBBF24" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** 旋转环形箭头（再来一次） */
export function ReplayGlyph({ size = 46 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M37 24a13 13 0 1 1-4.6-9.9"
        fill="none"
        stroke="#0284C7"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M37.6 7.6v8.8h-8.8" fill="none" stroke="#0284C7" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="4.4" fill="#7DD3FC" />
    </svg>
  );
}

/** 贴纸盒（收集贴纸） */
export function StickerBoxGlyph({ size = 40 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="18" width="36" height="24" rx="6" fill="#FDE68A" stroke="#F59E0B" strokeWidth="2.2" />
      <rect x="4" y="12" width="40" height="10" rx="5" fill="#FCA5A5" stroke="#EF4444" strokeWidth="2.2" />
      <circle cx="24" cy="30" r="6.4" fill="#FFFFFF" stroke="#FBBF24" strokeWidth="2" />
      <path d="m24 25.6 1.7 3.4 3.7.5-2.7 2.6.7 3.7-3.4-1.8-3.4 1.8.7-3.7-2.7-2.6 3.7-.5z" fill="#FBBF24" />
    </svg>
  );
}

/** 迷你工程车（贴纸图案 / 车库卡片） */
export function TruckGlyph({ color = '#38BDF8', size = 64 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="7" y="26" width="27" height="16" rx="5" fill={color} />
      <rect x="30" y="18" width="22" height="24" rx="6" fill={color} />
      <rect x="35" y="22" width="12" height="9" rx="3" fill="#E0F2FE" />
      <circle cx="20" cy="44" r="6.6" fill="#374151" />
      <circle cx="20" cy="44" r="2.6" fill="#E5E7EB" />
      <circle cx="46" cy="44" r="6.6" fill="#374151" />
      <circle cx="46" cy="44" r="2.6" fill="#E5E7EB" />
      <circle cx="41" cy="27" r="3.6" fill="#1F2937" />
      <circle cx="50" cy="27" r="3.6" fill="#1F2937" />
      <circle cx="42" cy="26" r="1.2" fill="#FFFFFF" />
      <circle cx="51" cy="26" r="1.2" fill="#FFFFFF" />
      <path d="M41 35c2 1.8 5 1.8 7 0" stroke="#1F2937" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** 星星（贴纸奖励装饰） */
export function SparkleGlyph({ color = '#FBBF24', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.4 14.7 9l6.9.5-5.3 4.5 1.7 6.8L12 17l-6 3.8 1.7-6.8L2.4 9.5 9.3 9z" fill={color} />
    </svg>
  );
}

/** 小手（HUD 提示用，与 3D 引导手同款） */
export function HandGlyph({ size = 60 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <g fill="#FFFFFF" stroke="#FBBF24" strokeWidth="2.6" strokeLinejoin="round">
        <rect x="20" y="26" width="26" height="26" rx="11" />
        <rect x="23" y="11" width="9" height="23" rx="4.5" />
        <rect x="33" y="14" width="9" height="20" rx="4.5" />
        <rect x="43" y="19" width="8" height="15" rx="4" />
        <rect x="12" y="29" width="9" height="15" rx="4.5" transform="rotate(-28 16.5 36.5)" />
      </g>
    </svg>
  );
}

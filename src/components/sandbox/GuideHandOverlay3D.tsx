import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { GuideTarget } from './SandboxCanvas3D';

/**
 * GuideHandOverlay3D —— 3D 空间投影到 2D 的呼吸光圈 + 半透明引导小手滑动示范
 * 3D 呼吸光环由 SandboxCanvas3D 的 Sprite 负责，
 * 本组件负责屏幕空间的小手：沿 dragDirectionScreen 方向往返滑动（2 岁幼儿一眼可模仿）。
 */
export function GuideHandOverlay3D({ guideRef }: { guideRef: MutableRefObject<GuideTarget> }) {
  const handRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const el = handRef.current;
      if (!el) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const g = guideRef.current;
      if (!g.visible) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        raf = requestAnimationFrame(tick);
        return;
      }

      const t = ((now - start) % 1700) / 1700;
      // 三角波：0 → 1 → 0，让小手来回示范
      const k = 1 - Math.abs(2 * t - 1);
      const eased = k * k * (3 - 2 * k);
      const travel = 62;
      const dx = g.dirX * travel * eased;
      const dy = g.dirY * travel * eased;

      // 起手处有个按压收缩，终点处微微放大
      const scale = 0.92 + 0.12 * eased;
      const fade = Math.min(1, t * 6) * Math.min(1, (1 - t) * 6);

      el.style.opacity = String(0.55 + 0.35 * fade);
      el.style.transform = `translate3d(${g.x + dx}px, ${g.y + dy}px, 0) translate(-50%, -50%) scale(${scale})`;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [guideRef]);

  return (
    <div className="guide-hand-layer" aria-hidden="true">
      <div ref={handRef} className="guide-hand">
        <svg viewBox="0 0 64 64" width="76" height="76">
          <defs>
            <filter id="handGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#0EA5E9" floodOpacity="0.35" />
            </filter>
          </defs>
          <g filter="url(#handGlow)" fill="#FFFFFF" stroke="#FBBF24" strokeWidth="2.6" strokeLinejoin="round">
            <rect x="20" y="26" width="26" height="26" rx="11" />
            <rect x="23" y="11" width="9" height="23" rx="4.5" />
            <rect x="33" y="14" width="9" height="20" rx="4.5" />
            <rect x="43" y="19" width="8" height="15" rx="4" />
            <rect x="12" y="29" width="9" height="15" rx="4.5" transform="rotate(-28 16.5 36.5)" />
          </g>
          <circle cx="33.5" cy="40" r="3.4" fill="#FDE68A" />
        </svg>
      </div>
    </div>
  );
}

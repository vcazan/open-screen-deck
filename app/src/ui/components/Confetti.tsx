import { useEffect, useRef } from 'react';

/** Dependency-free canvas confetti burst — for the big moments only. */
export function Confetti({ duration = 2800 }: { duration?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const colors = ['#2fd4c4', '#e0a52f', '#d84c4c', '#a06ee0', '#f2f5f7', '#4c9ed8'];
    const pieces = Array.from({ length: 140 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 80,
      y: h * 0.45,
      vx: (Math.random() - 0.5) * 11,
      vy: -(Math.random() * 11 + 5),
      size: Math.random() * 7 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.3,
    }));

    const start = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, w, h);
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.28; // gravity
        p.vx *= 0.99;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - elapsed / duration);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
        ctx.restore();
      }
      if (elapsed < duration) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden />;
}

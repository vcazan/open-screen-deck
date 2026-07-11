import { useCallback, useEffect, useRef, useState } from 'react';
import { FRAME_WIDTH } from '../../protocol/constants';

const VIEW = 280; // on-screen crop viewport (px)

interface ImageCropperProps {
  file: File;
  onApply: (cropped: HTMLCanvasElement) => void;
  onCancel: () => void;
}

/**
 * Square avatar-style cropper: the crop window is fixed, the image pans and
 * zooms underneath it. Default position is a centered cover fit, so nothing
 * ever stretches.
 */
export function ImageCropper({ file, onApply, onCancel }: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1); // 1 = cover fit
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [, forceRender] = useState(0);

  const coverScale = useCallback(() => {
    const img = imgRef.current;
    if (!img) return 1;
    return VIEW / Math.min(img.naturalWidth, img.naturalHeight);
  }, []);

  const scale = coverScale() * zoom;

  const clampOffset = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const s = coverScale() * zoom;
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    const o = offsetRef.current;
    o.x = Math.min(0, Math.max(VIEW - w, o.x));
    o.y = Math.min(0, Math.max(VIEW - h, o.y));
  }, [coverScale, zoom]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = coverScale() * zoom;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#07090b';
    ctx.fillRect(0, 0, VIEW, VIEW);
    ctx.drawImage(img, offsetRef.current.x, offsetRef.current.y, img.naturalWidth * s, img.naturalHeight * s);

    // rule-of-thirds guides
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo((VIEW / 3) * i, 0);
      ctx.lineTo((VIEW / 3) * i, VIEW);
      ctx.moveTo(0, (VIEW / 3) * i);
      ctx.lineTo(VIEW, (VIEW / 3) * i);
      ctx.stroke();
    }
  }, [coverScale, zoom]);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // center the cover fit
      const s = VIEW / Math.min(img.naturalWidth, img.naturalHeight);
      offsetRef.current = {
        x: (VIEW - img.naturalWidth * s) / 2,
        y: (VIEW - img.naturalHeight * s) / 2,
      };
      setLoaded(true);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, [file]);

  useEffect(() => {
    clampOffset();
    draw();
  }, [loaded, zoom, clampOffset, draw]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    offsetRef.current.x += e.clientX - dragRef.current.x;
    offsetRef.current.y += e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    clampOffset();
    draw();
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleZoom = (next: number) => {
    const img = imgRef.current;
    if (!img) {
      setZoom(next);
      return;
    }
    // keep the viewport centre anchored while zooming
    const s0 = coverScale() * zoom;
    const s1 = coverScale() * next;
    const cx = (VIEW / 2 - offsetRef.current.x) / s0;
    const cy = (VIEW / 2 - offsetRef.current.y) / s0;
    offsetRef.current.x = VIEW / 2 - cx * s1;
    offsetRef.current.y = VIEW / 2 - cy * s1;
    setZoom(next);
    forceRender((n) => n + 1);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const next = Math.min(5, Math.max(1, zoom * (1 - e.deltaY * 0.0015)));
    handleZoom(next);
  };

  const handleApply = () => {
    const img = imgRef.current;
    if (!img) return;
    const out = document.createElement('canvas');
    out.width = FRAME_WIDTH;
    out.height = FRAME_WIDTH;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const sx = -offsetRef.current.x / scale;
    const sy = -offsetRef.current.y / scale;
    const sSize = VIEW / scale;
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, FRAME_WIDTH, FRAME_WIDTH);
    onApply(out);
  };

  return (
    <div className="crop-overlay" role="dialog" aria-label="Crop image">
      <div className="crop-modal">
        <header className="crop-modal-head">
          <h3>Crop for key screen</h3>
          <button type="button" className="inspector-close" onClick={onCancel} aria-label="Cancel crop">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="crop-stage">
          <canvas
            ref={canvasRef}
            width={VIEW}
            height={VIEW}
            className="crop-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          />
        </div>

        <div className="crop-zoom-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3M8 11h6" />
          </svg>
          <input
            type="range"
            min={1}
            max={5}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="crop-zoom-slider"
            aria-label="Zoom"
          />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3M8 11h6M11 8v6" />
          </svg>
        </div>

        <p className="crop-hint">Drag to position · scroll or slide to zoom</p>

        <footer className="crop-modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleApply} disabled={!loaded}>
            Set as key image
          </button>
        </footer>
      </div>
    </div>
  );
}

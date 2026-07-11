import { useEffect, useRef, useState } from 'react';
import type { SimulatedDevice } from '../simulator/SimulatedDevice';
import { hidCodeToLabel } from '../protocol/constants';

export type DeckMode = 'edit' | 'test';

interface DeviceViewProps {
  device: SimulatedDevice | null;
  /** Selected key POSITION on the current page (0..5) */
  selectedKey: number | null;
  mode: DeckMode;
  /** 0 portrait · 1 landscape CW · 2 flipped · 3 landscape CCW */
  orientation: number;
  /** The inspector overlays the stage below 1280px — scale around it */
  inspectorOpen: boolean;
  /** Physical deck connected over USB — lights up the port indicator */
  usbConnected: boolean;
  /** Currently shown page, how many exist, and the storage ceiling */
  page: number;
  pages: number;
  maxPages: number;
  onPageChange: (page: number) => void;
  onAddPage: () => void;
  onRemovePage: () => void;
  onModeChange: (mode: DeckMode) => void;
  onSelectKey: (index: number) => void;
  onPressKey: (index: number) => void;
  onReleaseKey: (index: number) => void;
  /** Edit mode: drag one key onto another to swap their full identities */
  onSwapKeys: (fromPos: number, toPos: number) => void;
  refreshTick: number;
  showHint: boolean;
  stageFocused?: boolean;
}

interface KeyChip {
  id: number;
  index: number;
  label: string;
}

export function DeviceView({
  device,
  selectedKey,
  mode,
  orientation,
  inspectorOpen,
  usbConnected,
  page,
  pages,
  maxPages,
  onPageChange,
  onAddPage,
  onRemovePage,
  onModeChange,
  onSelectKey,
  onPressKey,
  onReleaseKey,
  onSwapKeys,
  refreshTick,
  showHint,
}: DeviceViewProps) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const landscape = orientation % 2 === 1;
  // The physical USB-C port sits on the deck's rear edge (top in portrait).
  // Rotating the deck moves it: this is your bearings marker.
  const usbSide = (['top', 'right', 'bottom', 'left'] as const)[orientation] ?? 'top';
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [pressedKey, setPressedKey] = useState<number | null>(null);
  const [chips, setChips] = useState<KeyChip[]>([]);
  const chipIdRef = useRef(0);

  // Fit-to-stage scaling: the deck never clips — it shrinks (and slides
  // left when the inspector overlays the stage on narrow windows).
  const stageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, shiftX: 0 });

  useEffect(() => {
    const stage = stageRef.current;
    const container = containerRef.current;
    if (!stage || !container) return;

    const compute = () => {
      // offsetWidth/Height ignore transforms — this is the natural size
      const naturalW = container.offsetWidth;
      const naturalH = container.offsetHeight;
      if (!naturalW || !naturalH) return;
      const rect = stage.getBoundingClientRect();
      // Below 1280px the inspector overlays the stage instead of shrinking it
      const overlay = inspectorOpen && window.innerWidth < 1280 ? 344 : 0;
      const availW = rect.width - overlay - 48;
      const availH = rect.height - 170; // room for the mode toggle + hint
      setFit({
        scale: Math.max(0.4, Math.min(1, availW / naturalW, availH / naturalH)),
        shiftX: -overlay / 2,
      });
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(stage);
    window.addEventListener('resize', compute);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [landscape, inspectorOpen]);

  useEffect(() => {
    if (!device) return;
    for (let i = 0; i < 6; i++) {
      const srcCanvas = device.getCanvas(i);
      const dstCanvas = canvasRefs.current[i];
      if (dstCanvas) {
        const ctx = dstCanvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(srcCanvas, 0, 0, dstCanvas.width, dstCanvas.height);
        }
      }
    }

    const state = device.getState();
    if (state.lastHidSent) {
      const { index, label } = state.lastHidSent;
      const id = ++chipIdRef.current;
      setChips((prev) => [...prev.slice(-2), { id, index, label }]);
      const timer = setTimeout(() => {
        setChips((prev) => prev.filter((c) => c.id !== id));
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [device, refreshTick]);

  const handleMouseDown = (index: number) => {
    if (mode === 'edit') {
      // Editing: select for the inspector, never fire the action
      onSelectKey(index);
      return;
    }
    setPressedKey(index);
    onPressKey(index);
  };

  const handleMouseUp = (index: number) => {
    if (mode !== 'test') return;
    setPressedKey(null);
    onReleaseKey(index);
  };

  const gridOrder = [0, 1, 2, 3, 4, 5];

  return (
    <div className="deck-stage" ref={stageRef}>
      <div
        className="deck-controls"
        style={{ transform: `translateX(calc(-50% + ${fit.shiftX}px))` }}
      >
        <div className="deck-mode-toggle" role="tablist" aria-label="Deck mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'edit'}
          className={`deck-mode-btn ${mode === 'edit' ? 'active' : ''}`}
          onClick={() => onModeChange('edit')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
          Edit
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'test'}
          className={`deck-mode-btn ${mode === 'test' ? 'active' : ''}`}
          onClick={() => onModeChange('test')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 4l14 8-14 8V4z" />
          </svg>
          Test
        </button>
        </div>
        {(pages > 1 || mode === 'edit') && (
          <div className="deck-pages" role="tablist" aria-label="Deck pages">
            {Array.from({ length: pages }, (_, p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={page === p}
                className={`deck-page-btn ${page === p ? 'active' : ''}`}
                onClick={() => onPageChange(p)}
              >
                {p + 1}
              </button>
            ))}
            {mode === 'edit' && pages > 1 && (
              <button
                type="button"
                className="deck-page-btn deck-page-edit"
                onClick={onRemovePage}
                title="Remove the last page (its keys reset)"
                aria-label="Remove last page"
              >
                −
              </button>
            )}
            {mode === 'edit' && pages < maxPages && (
              <button
                type="button"
                className="deck-page-btn deck-page-edit"
                onClick={onAddPage}
                title="Add a page"
                aria-label="Add page"
              >
                +
              </button>
            )}
          </div>
        )}
        {(showHint || mode === 'test') && (
          <div className="deck-hint">
            <span>
              {mode === 'test' ? 'Click keys to fire their actions' : 'Click a key to configure'}
            </span>
            <span className="hint-arrow" aria-hidden>
              ↓
            </span>
          </div>
        )}
      </div>
      <div
        className="deck-container"
        ref={containerRef}
        style={{ transform: `translateX(${fit.shiftX}px) scale(${fit.scale})` }}
      >
        <div className="deck-shadow" aria-hidden />
        <div className={`deck ${landscape ? 'landscape' : ''}`}>
          <div className="deck-bezel">
            <div className={`deck-grid ${landscape ? 'landscape' : ''}`}>
              {gridOrder.map((index) => (
                <div
                  key={index}
                  className={`key-cap ${mode === 'edit' && selectedKey === index ? 'selected' : ''} ${pressedKey === index ? 'pressed' : ''} ${dragFrom === index ? 'dragging' : ''} ${dragOver === index && dragFrom !== null && dragFrom !== index ? 'drop-target' : ''}`}
                  onMouseDown={() => handleMouseDown(index)}
                  onMouseUp={() => handleMouseUp(index)}
                  onMouseLeave={() => pressedKey === index && handleMouseUp(index)}
                  draggable={mode === 'edit'}
                  onDragStart={(e) => {
                    if (mode !== 'edit') return;
                    setDragFrom(index);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/osd-key', String(index));
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  onDragOver={(e) => {
                    if (dragFrom === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOver(index);
                  }}
                  onDragLeave={() => {
                    if (dragOver === index) setDragOver(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = parseInt(e.dataTransfer.getData('text/osd-key'), 10);
                    setDragFrom(null);
                    setDragOver(null);
                    if (!isNaN(from) && from !== index) onSwapKeys(from, index);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Key ${index + 1}`}
                  aria-pressed={selectedKey === index}
                >
                  <div className="key-screen">
                    <canvas
                      ref={(el) => {
                        canvasRefs.current[index] = el;
                      }}
                      width={256}
                      height={256}
                    />
                  </div>
                  {chips
                    .filter((c) => c.index === index)
                    .map((chip) => (
                      <span key={chip.id} className="key-hid-chip">
                        {chip.label} ↗ sent
                      </span>
                    ))}
                </div>
              ))}
            </div>
          </div>
          <div className="deck-nameplate">
            <span className="deck-nameplate-text">OPEN SCREEN DECK</span>
            <span className="deck-nameplate-led" aria-hidden />
          </div>
          <div
            key={usbSide}
            className={`deck-usb usb-${usbSide} ${usbConnected ? 'live' : ''}`}
            title={`USB-C port (${usbSide} edge)`}
          >
            <span className="usb-cable" aria-hidden />
            <span className="usb-port" aria-hidden />
          </div>
        </div>

      </div>
    </div>
  );
}

export function getKeyEventLabel(index: number, action: 'press' | 'release', hid?: number): string {
  const keyNum = index + 1;
  if (action === 'press' && hid !== undefined) {
    return `key ${keyNum} press · ${hidCodeToLabel(hid)}`;
  }
  return `key ${keyNum} ${action}`;
}

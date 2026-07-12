import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeCommand } from '../protocol/codec';
import { rgb565ToRgb888, rgb888ToRgb565, canvasToRgb565Alpha } from '../protocol/rgb565';
import type { SimulatedDevice } from '../simulator/SimulatedDevice';
import { decodeVideoFrames, decodeGifFrames, formatBytes } from '../utils/animation';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';
import type { KeyAction } from '../actions/types';
import {
  clearKeyMediaImage,
  loadKeyMedia,
  rgb565ToDataUrl,
  saveKeyMediaImage,
} from '../utils/keyMedia';
import { ActionEditor } from './ActionEditor';
import { Button } from './components/Button';
import { ImageCropper } from './components/ImageCropper';
import { Input } from './components/Input';
import { SegmentedControl } from './components/SegmentedControl';
import { IconPicker } from './components/IconPicker';

interface KeyInspectorProps {
  keyIndex: number;
  device: SimulatedDevice | null;
  action: KeyAction;
  /** Double / triple press actions — null = unbound (no tap-window latency) */
  actionDouble: KeyAction | null;
  actionTriple: KeyAction | null;
  onActionChange: (
    level: 'single' | 'double' | 'triple',
    action: KeyAction | null,
  ) => void;
  onTestAction: (index: number) => void;
  onSendCommand: (line: string) => void;
  onSendSetImage: (index: number, rgb565: Uint8Array) => Promise<void>;
  onSendAnimation: (
    index: number,
    frames: Uint8Array[],
    fps: number,
    onProgress?: (done: number, total: number) => void,
  ) => Promise<void>;
  onDeleteSdPath: (path: string) => Promise<void>;
  onClose: () => void;
  onResetKey: () => void;
  refreshTick: number;
}

function hexTo565(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return rgb888ToRgb565(r, g, b);
}

const PRESET_SWATCHES = [
  { name: 'Blue', hex: '#2f4fe0' },
  { name: 'Gray', hex: '#8a8f98' },
  { name: 'Red', hex: '#c53131' },
  { name: 'Green', hex: '#1f9d4d' },
  { name: 'Navy', hex: '#182a5e' },
  { name: 'Black', hex: '#161a20' },
  { name: 'Teal', hex: '#1f8f9d' },
  { name: 'Orange', hex: '#e07b1a' },
].map((s) => ({ ...s, value: hexTo565(s.hex) }));

function faceGradient(bg565: number): string {
  const { r, g, b } = rgb565ToRgb888(bg565);
  const c = (amt: number) =>
    `rgb(${Math.max(0, Math.min(255, r + amt))},${Math.max(0, Math.min(255, g + amt))},${Math.max(0, Math.min(255, b + amt))})`;
  return `linear-gradient(157deg, ${c(34)} 0%, ${c(0)} 52%, ${c(-30)} 100%)`;
}

function SectionTitle({ children }: { children: string }) {
  return <div className="ins-section-title">{children}</div>;
}

export function KeyInspector({
  keyIndex,
  device,
  action,
  actionDouble,
  actionTriple,
  onActionChange,
  onTestAction,
  onSendCommand,
  onSendSetImage,
  onSendAnimation,
  onDeleteSdPath,
  onClose,
  onResetKey,
  refreshTick,
}: KeyInspectorProps) {
  const [label, setLabel] = useState('');
  const [sublabel, setSublabel] = useState('');
  const [hid, setHid] = useState(240);
  const [bg, setBg] = useState(0x2a7c);
  const [icon, setIcon] = useState<string>('bolt');
  const [customHidOpen, setCustomHidOpen] = useState(false);
  const [customHid, setCustomHid] = useState('');
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [animFps, setAnimFps] = useState(10);
  const [animStats, setAnimStats] = useState<string | null>(null);
  const [animFrames, setAnimFrames] = useState<Uint8Array[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dragIcon, setDragIcon] = useState(false);
  const [dragAnim, setDragAnim] = useState(false);
  const [overlayOn, setOverlayOn] = useState(true);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [tapLevel, setTapLevel] = useState<'single' | 'double' | 'triple'>('single');
  const rawIconRef = useRef<Uint8Array | null>(null);

  // Selecting another key returns the editor to the single-press action
  useEffect(() => {
    setTapLevel('single');
  }, [keyIndex]);

  useEffect(() => {
    if (!device) return;
    const state = device.getState();
    const k = state.keys[keyIndex];
    if (k) {
      setLabel(k.label);
      setSublabel(k.sublabel);
      setHid(k.hidKey);
      setBg(k.bgColor);
      setIcon(k.icon ?? 'bolt');
      setCustomHid(String(k.hidKey));
      // Reflect the device's actual flag — no optimistic default
      setOverlayOn(k.overlay === true);
    }
  }, [device, keyIndex, refreshTick]);

  // Selecting a different key: drop staged animation frames, restore the
  // stored raw image (thumbnail only — text is composited on-device now)
  useEffect(() => {
    setAnimFrames([]);
    setAnimStats(null);
    const stored = loadKeyMedia(keyIndex);
    rawIconRef.current = stored.image;
    setIconPreview(
      stored.image
        ? rgb565ToDataUrl(stored.image, device?.getState().keys[keyIndex]?.bgColor)
        : null,
    );
  }, [keyIndex]);

  // What's actually stored on the device for this key (simulator mirror)
  const media = device?.getState().media[keyIndex] ?? null;

  const handleRemoveIcon = async () => {
    try {
      await onDeleteSdPath(`/osd/keys/${keyIndex}/icon.rgb565`);
    } catch {
      // Nothing stored — treat as already removed
    }
    onSendCommand(encodeCommand({ type: 'DRAW', index: keyIndex }));
    setIconPreview(null);
    rawIconRef.current = null;
    clearKeyMediaImage(keyIndex);
  };

  /**
   * Action edits flow through here so auto-applied media can follow the
   * action: an app logo that arrived WITH a Launch action leaves with it.
   * Deliberately chosen images (uploads, library icons) always stay.
   */
  const handleActionEdit = (
    level: 'single' | 'double' | 'triple',
    next: KeyAction | null,
  ) => {
    const prior =
      level === 'single' ? action : level === 'double' ? actionDouble : actionTriple;
    if (prior?.type === 'launch' && next?.type !== 'launch') {
      if (loadKeyMedia(keyIndex).source === 'app') {
        void handleRemoveIcon();
      }
    }
    // A plugin's branded face leaves with the plugin action
    if (prior?.type === 'plugin' && next?.type !== 'plugin') {
      if (loadKeyMedia(keyIndex).source === 'plugin') {
        void handleRemoveIcon();
      }
    }
    onActionChange(level, next);
  };

  /** Plugin actions own the key's look — the manual face editors step aside */
  const pluginOwned = action.type === 'plugin';

  const handleRemoveAnimation = () => {
    onSendCommand(encodeCommand({ type: 'ANIM_CLEAR', index: keyIndex }));
    onSendCommand(encodeCommand({ type: 'DRAW', index: keyIndex }));
    setAnimFrames([]);
    setAnimStats(null);
  };

  const sendSetKey = useCallback(
    (updates: {
      label?: string;
      sublabel?: string;
      hid?: number;
      bg?: number;
      icon?: string;
      ov?: number;
    }) => {
      const payload = {
        index: keyIndex,
        label: updates.label ?? label,
        sublabel: updates.sublabel ?? sublabel,
        hid: updates.hid ?? hid,
        bg: updates.bg ?? bg,
        icon: updates.icon ?? icon,
        ov: updates.ov ?? (overlayOn ? 1 : 0),
      };
      onSendCommand(encodeCommand({ type: 'SET_KEY', payload }));
    },
    [keyIndex, label, sublabel, hid, bg, icon, overlayOn, onSendCommand],
  );

  const debouncedSendSetKey = useDebouncedCallback(sendSetKey, 300);

  /**
   * Typing a label on a key that shows media implies wanting to SEE it —
   * auto-enable the overlay so the edit is never silently invisible.
   */
  const overlayForTextEdit = (val: string): number | undefined => {
    const hasVisibleMedia = (media?.hasIcon || (media?.animFrames ?? 0) > 0) ?? false;
    if (val && hasVisibleMedia && !overlayOn) {
      setOverlayOn(true);
      return 1;
    }
    return undefined;
  };

  const handleLabelChange = (val: string) => {
    setLabel(val);
    debouncedSendSetKey({ label: val, ov: overlayForTextEdit(val) });
  };

  const handleSublabelChange = (val: string) => {
    setSublabel(val);
    debouncedSendSetKey({ sublabel: val, ov: overlayForTextEdit(val) });
  };

  const handleBgChange = (color: number) => {
    setBg(color);
    sendSetKey({ bg: color });
  };

  const handleHidChange = (code: number) => {
    setHid(code);
    setCustomHid(String(code));
    sendSetKey({ hid: code });
  };

  const bgToHex = (color: number): string => {
    const { r, g, b } = rgb565ToRgb888(color);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  const handleColorPicker = (hex: string) => {
    handleBgChange(hexTo565(hex));
  };

  /**
   * Media uploads are RAW — the device composites label/sublabel over the
   * image at draw time (overlay flag), so text edits never re-upload pixels.
   */
  const applyAnimation = useCallback(
    (rawFrames: Uint8Array[], fps: number) => {
      if (rawFrames.length === 0) return;
      setUploadProgress(0);
      onSendAnimation(keyIndex, rawFrames, fps, (done, total) => {
        setUploadProgress(Math.round((done / total) * 100));
      })
        .then(() => {
          setAnimStats(
            `${rawFrames.length} frames · ${formatBytes(rawFrames.length * 32768)} · playing at ${fps} fps`,
          );
        })
        .catch(() => {
          setAnimStats('Upload failed — check the connection and try again.');
        })
        .finally(() => {
          setTimeout(() => setUploadProgress(null), 400);
        });
    },
    [keyIndex, onSendAnimation],
  );

  const applyStaticIcon = useCallback(
    (raw: Uint8Array) => {
      onSendSetImage(keyIndex, raw).catch(() => {
        setAnimStats('Image upload failed — check the connection and try again.');
      });
    },
    [keyIndex, onSendSetImage],
  );

  const handleIconUpload = async (file: File) => {
    // Animated files dropped here belong to the Animation flow
    if (file.type.startsWith('video/') || file.type === 'image/gif') {
      handleAnimUpload(file);
      return;
    }
    // Static images go through the cropper — no stretching
    setCropFile(file);
  };

  const handleCropApply = (cropped: HTMLCanvasElement) => {
    setCropFile(null);
    // Alpha-aware: transparent PNG regions adopt the key's background color
    const rgb565 = canvasToRgb565Alpha(cropped);
    rawIconRef.current = rgb565;
    saveKeyMediaImage(keyIndex, rgb565, 'upload'); // kept for the inspector thumbnail
    applyStaticIcon(rgb565);
    sendSetKey({}); // pushes the current overlay flag alongside the new image
    setIconPreview(cropped.toDataURL());
  };

  /** Icon chosen from the searchable library — becomes the key's image. */
  const handlePickLibraryIcon = (canvas: HTMLCanvasElement, name: string) => {
    // Transparent background → sentinel pixels: the icon rides the key's
    // background color and follows recolors without re-uploading.
    const rgb565 = canvasToRgb565Alpha(canvas);
    rawIconRef.current = rgb565;
    saveKeyMediaImage(keyIndex, rgb565, 'library');
    applyStaticIcon(rgb565);
    sendSetKey({ icon: name });
    setIconPreview(canvas.toDataURL());
  };

  /** Launch action picked from the app list — put the app's logo on the key. */
  const handleUseAppIcon = (dataUrl: string, appName: string) => {
    const img = new Image();
    img.onload = () => {
      // Keep transparency: the logo's surroundings become sentinel pixels,
      // so the key's background color composites at draw time — recolor
      // the key any time without touching the image.
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 8, 8, 112, 112);

      const rgb565 = canvasToRgb565Alpha(canvas);
      rawIconRef.current = rgb565;
      // Tagged 'app': this logo auto-applied with the Launch action, so it
      // auto-removes when the action changes to something else
      saveKeyMediaImage(keyIndex, rgb565, 'app');
      applyStaticIcon(rgb565);
      setIconPreview(canvas.toDataURL());

      // Label the key after the app if it still has a stock/empty label
      if (!label || label === appName.toUpperCase() || /^SCENE|MUTE|CLIP|BROWSER|MACRO/.test(label)) {
        const next = appName.slice(0, 12).toUpperCase();
        setLabel(next);
        sendSetKey({ label: next });
      }
    };
    img.src = dataUrl;
  };

  const handleAnimUpload = async (file: File) => {
    const isVideo = file.type.startsWith('video/');
    setAnimStats(isVideo ? 'Decoding video…' : 'Decoding GIF…');
    setAnimFrames([]);

    let result;
    try {
      result = isVideo
        ? await decodeVideoFrames(file, animFps)
        : await decodeGifFrames(file, animFps);
    } catch {
      setAnimStats('Could not decode this file. Try an MP4 (H.264), WebM, or GIF.');
      return;
    }

    if (result.frames.length === 0) {
      setAnimStats('No frames decoded from this file.');
      return;
    }

    setAnimFrames(result.frames);
    applyAnimation(result.frames, animFps);
    sendSetKey({}); // ensure the overlay flag rides along with new media
  };

  /** Overlay is a device-side flag now — flipping it is one SET_KEY, no re-upload. */
  const handleOverlayToggle = (on: boolean) => {
    setOverlayOn(on);
    sendSetKey({ ov: on ? 1 : 0 });
  };

  const handleUploadToSd = () => {
    if (animFrames.length === 0) return;
    applyAnimation(animFrames, animFps);
  };

  const handlePlayAnim = () => {
    onSendCommand(encodeCommand({ type: 'ANIM', index: keyIndex, fps: animFps }));
  };

  const handleStopAnim = () => {
    onSendCommand(encodeCommand({ type: 'ANIM_STOP' }));
  };

  const isPresetActive = (value: number) => bg === value;
  const anyPresetActive = PRESET_SWATCHES.some((s) => s.value === bg);

  return (
    <aside
      className="inspector-panel open"
      aria-label={`Key ${(keyIndex % 6) + 1} inspector`}
    >
      <header className="inspector-header">
        <div className="inspector-header-id">
          <span className="inspector-face-chip" style={{ background: faceGradient(bg) }} aria-hidden />
          <h2>Key {(keyIndex % 6) + 1}</h2>
          {keyIndex >= 6 && (
            <span className="inspector-page-chip">Page {Math.floor(keyIndex / 6) + 1}</span>
          )}
        </div>
        <div className="inspector-header-right">
          <span className="inspector-idx">slot {keyIndex}</span>
          <button type="button" className="inspector-close" onClick={onClose} aria-label="Close inspector">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <div className="inspector-scroll">
        <section className="ins-section" hidden={pluginOwned}>
          <SectionTitle>IDENTITY</SectionTitle>
          <Input
            label="Label"
            value={label}
            maxLength={15}
            onChange={(e) => handleLabelChange(e.target.value)}
          />
          <Input
            label="Sublabel"
            value={sublabel}
            maxLength={15}
            onChange={(e) => handleSublabelChange(e.target.value)}
          />
        </section>

        <section className="ins-section" hidden={pluginOwned}>
          <SectionTitle>APPEARANCE</SectionTitle>
          <div className="swatch-grid">
            {PRESET_SWATCHES.map((s) => (
              <button
                key={s.name}
                type="button"
                className={`color-swatch ${isPresetActive(s.value) ? 'active' : ''}`}
                style={{ background: s.hex }}
                title={s.name}
                onClick={() => handleBgChange(s.value)}
                aria-label={s.name}
              />
            ))}
            <label
              className={`color-swatch custom ${!anyPresetActive ? 'active' : ''}`}
              title="Custom color"
            >
              <input
                type="color"
                value={bgToHex(bg)}
                onChange={(e) => handleColorPicker(e.target.value)}
                aria-label="Custom color"
              />
            </label>
          </div>
        </section>

        <section className="ins-section">
          <SectionTitle>ACTION</SectionTitle>
          <SegmentedControl
            options={[
              { value: 'single' as const, label: 'Press' },
              { value: 'double' as const, label: 'Double' },
              { value: 'triple' as const, label: 'Triple' },
            ]}
            value={tapLevel}
            onChange={setTapLevel}
          />
          {tapLevel !== 'single' && (
            <p className="tap-level-hint">
              {tapLevel === 'double' ? 'Double' : 'Triple'}-press action — optional. Keys
              with one fire single presses after a short tap window; keys without stay
              instant.
            </p>
          )}
          {tapLevel === 'single' ? (
            <ActionEditor
              action={action}
              hidFallback={hid}
              onChange={(a) => handleActionEdit('single', a)}
              onHidChange={handleHidChange}
              onUseAppIcon={handleUseAppIcon}
            />
          ) : (
            <ActionEditor
              action={tapLevel === 'double' ? actionDouble : actionTriple}
              allowNone
              hidFallback={hid}
              onChange={(a) => handleActionEdit(tapLevel, a)}
              onHidChange={() => {}}
              onUseAppIcon={handleUseAppIcon}
            />
          )}
          <button
            type="button"
            className="action-test-btn"
            onClick={() => onTestAction(keyIndex)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 4l14 8-14 8V4z" />
            </svg>
            Test this action now
          </button>
          {tapLevel === 'single' && action.type === 'hid' && (
            <>
              <button
                type="button"
                className="expander-trigger"
                onClick={() => setCustomHidOpen(!customHidOpen)}
                aria-expanded={customHidOpen}
              >
                <span>Custom code</span>
                <span className={`expander-chevron ${customHidOpen ? 'open' : ''}`} aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
              <div className={`expander-panel ${customHidOpen ? 'open' : ''}`}>
                <Input
                  label="HID code"
                  type="number"
                  value={customHid}
                  min={0}
                  max={255}
                  onChange={(e) => {
                    const code = parseInt(e.target.value, 10);
                    if (!isNaN(code)) {
                      handleHidChange(code);
                      onActionChange('single', { type: 'hid', code });
                    }
                  }}
                />
              </div>
            </>
          )}
        </section>

        <section className="ins-section" hidden={pluginOwned}>
          <SectionTitle>ICON</SectionTitle>
          <IconPicker onPick={handlePickLibraryIcon} />
          <div
            className={`upload-dashed ${dragIcon ? 'dragover' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragIcon(true);
            }}
            onDragLeave={() => setDragIcon(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragIcon(false);
              const file = e.dataTransfer.files[0];
              if (file) handleIconUpload(file);
            }}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = () => {
                const file = input.files?.[0];
                if (file) handleIconUpload(file);
              };
              input.click();
            }}
            role="button"
            tabIndex={0}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Upload image · crop to fit
          </div>
          {(media?.hasIcon || iconPreview) && (
            <div className="media-status">
              {iconPreview && <img src={iconPreview} alt="Icon preview" className="icon-preview" />}
              <span className="media-status-text">Custom image on this key</span>
              <button type="button" className="media-remove-btn" onClick={handleRemoveIcon}>
                Remove
              </button>
            </div>
          )}
        </section>

        <section className="ins-section" hidden={pluginOwned}>
          <SectionTitle>ANIMATION</SectionTitle>
          <SegmentedControl
            options={[
              { value: 5, label: '5 fps' },
              { value: 10, label: '10 fps' },
              { value: 15, label: '15 fps' },
            ]}
            value={animFps}
            onChange={setAnimFps}
          />
          <div
            className={`upload-dashed ${dragAnim ? 'dragover' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragAnim(true);
            }}
            onDragLeave={() => setDragAnim(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragAnim(false);
              const file = e.dataTransfer.files[0];
              if (file) handleAnimUpload(file);
            }}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/gif,video/*';
              input.onchange = () => {
                const file = input.files?.[0];
                if (file) handleAnimUpload(file);
              };
              input.click();
            }}
            role="button"
            tabIndex={0}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <path d="M23 7l-7 5 7 5V7z M3 5h11a2 2 0 012 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2z" />
            </svg>
            Drop GIF or video
          </div>
          <label className="overlay-toggle">
            <input
              type="checkbox"
              className="custom-checkbox"
              checked={overlayOn}
              onChange={(e) => handleOverlayToggle(e.target.checked)}
            />
            <span className="overlay-toggle-text">
              <span className="overlay-toggle-title">Show label over media</span>
              <span className="overlay-toggle-meta">
                Drawn live by the device — edit text any time, no re-upload
              </span>
            </span>
          </label>
          {animStats && <div className="anim-stats">{animStats}</div>}
          {uploadProgress !== null && (
            <div className="progress-bar">
              <span className="progress-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
          {(media === null || media.animFrames > 0) && (
            <div className="media-status">
              <span className="media-status-text">
                {media ? `${media.animFrames} frames on device` : 'Animation controls'}
              </span>
              <div className="media-status-actions">
                <button type="button" className="media-ctl-btn" onClick={handlePlayAnim}>
                  Play
                </button>
                <button type="button" className="media-ctl-btn" onClick={handleStopAnim}>
                  Stop
                </button>
                <button type="button" className="media-remove-btn" onClick={handleRemoveAnimation}>
                  Remove
                </button>
              </div>
            </div>
          )}
          {animFrames.length > 0 && (
            <div className="anim-controls">
              <Button variant="primary" onClick={handleUploadToSd}>
                Re-upload
              </Button>
            </div>
          )}
        </section>
      </div>

      <footer className="inspector-footer">
        <span className="inspector-caption">Changes apply live</span>
        <Button variant="ghost" className="inspector-reset" onClick={onResetKey}>
          Reset key
        </Button>
      </footer>

      {cropFile && (
        <ImageCropper
          file={cropFile}
          onApply={handleCropApply}
          onCancel={() => setCropFile(null)}
        />
      )}
    </aside>
  );
}

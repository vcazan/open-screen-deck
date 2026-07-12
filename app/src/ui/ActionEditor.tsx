import { rgb565ToRgb888, rgb888ToRgb565 } from '../protocol/rgb565';
import {
  HID_F_KEYS,
  HID_PAGE_BASE,
  HID_PAGE_NEXT,
  HID_PAGE_PREV,
  MAX_PAGES,
} from '../protocol/constants';
import {
  ACTION_TYPE_META,
  DEFAULT_MIC_FACES,
  TILE_KIND_META,
  defaultActionForType,
  type KeyAction,
  type KeyActionType,
  type StateFace,
  type TileKind,
} from '../actions/types';
import { isTauri } from '../transport/TauriSerialTransport';
import { fieldDefaults, getActionDefaults, pluginHost } from '../plugins/host';
import { ActionPicker, type PickerValue } from './components/ActionPicker';
import { PluginFields } from './components/PluginFields';
import { AppPicker } from './components/AppPicker';
import { HotkeyInput } from './components/HotkeyInput';
import { Input } from './components/Input';

interface ActionEditorProps {
  /** null = unbound (only valid with allowNone, for double/triple slots) */
  action: KeyAction | null;
  /** Offer a "None" choice — unbound multi-tap slots keep keys latency-free */
  allowNone?: boolean;
  hidFallback: number;
  onChange: (action: KeyAction | null) => void;
  onHidChange: (code: number) => void;
  /** Apply an app's icon (PNG data URL) as the key image. */
  onUseAppIcon?: (dataUrl: string, appName: string) => void;
}

/** Macro steps use the single-param action types only. */
const MACRO_STEP_TYPES: KeyActionType[] = ['hotkey', 'launch', 'open_url', 'shell', 'mic_mute'];

function bgToHex(color: number): string {
  const { r, g, b } = rgb565ToRgb888(color);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexTo565(hex: string): number {
  return rgb888ToRgb565(
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  );
}

function FaceEditor({
  title,
  face,
  onChange,
}: {
  title: string;
  face: StateFace;
  onChange: (face: StateFace) => void;
}) {
  return (
    <div className="face-editor">
      <span className="face-editor-title">{title}</span>
      <input
        className="face-editor-label"
        value={face.label}
        maxLength={15}
        onChange={(e) => onChange({ ...face, label: e.target.value })}
        aria-label={`${title} label`}
      />
      <label className="face-editor-color" style={{ background: bgToHex(face.bg) }}>
        <input
          type="color"
          value={bgToHex(face.bg)}
          onChange={(e) => onChange({ ...face, bg: hexTo565(e.target.value) })}
          aria-label={`${title} color`}
        />
      </label>
    </div>
  );
}

function macroStepParam(step: KeyAction): string {
  switch (step.type) {
    case 'hotkey':
      return step.keys;
    case 'launch':
      return step.target;
    case 'open_url':
      return step.url;
    case 'shell':
      return step.command;
    default:
      return '';
  }
}

function withMacroParam(step: KeyAction, value: string): KeyAction {
  switch (step.type) {
    case 'hotkey':
      return { ...step, keys: value };
    case 'launch':
      return { ...step, target: value };
    case 'open_url':
      return { ...step, url: value };
    case 'shell':
      return { ...step, command: value };
    default:
      return step;
  }
}

export function ActionEditor({
  action,
  allowNone = false,
  hidFallback,
  onChange,
  onHidChange,
  onUseAppIcon,
}: ActionEditorProps) {
  const meta = action ? ACTION_TYPE_META[action.type] : null;
  const companionMissing = (meta?.needsCompanion ?? false) && !isTauri();

  const changeType = (value: PickerValue) => {
    if (value === 'none') {
      onChange(null);
      return;
    }
    if (value.startsWith('plugin:')) {
      const actionId = value.slice(7);
      // New plugin keys start from the plugin's declared field defaults,
      // overridden by any defaults the user saved on the plugin's page
      const spec = pluginHost.get(actionId);
      onChange({
        type: 'plugin',
        plugin: actionId,
        settings: {
          ...(spec ? fieldDefaults(spec.fields) : {}),
          ...getActionDefaults(actionId),
        },
      });
      return;
    }
    if (value.startsWith('tile:')) {
      onChange({ type: 'tile', kind: value.slice(5) as TileKind });
      return;
    }
    const type = value as KeyActionType;
    onChange(defaultActionForType(type, hidFallback));
    // Page actions ride on reserved HID codes so the FIRMWARE performs the
    // switch — the key works even with the companion app closed.
    if (type === 'page_next') onHidChange(HID_PAGE_NEXT);
    else if (type === 'page_prev') onHidChange(HID_PAGE_PREV);
    else if (type === 'page') onHidChange(HID_PAGE_BASE);
  };

  const pluginSpec =
    action?.type === 'plugin' ? pluginHost.get(action.plugin) : undefined;

  return (
    <div className="action-editor">
      <ActionPicker action={action} allowNone={allowNone} onPick={changeType} />

      {action === null ? (
        <p className="action-hint">
          Unbound — single presses on this key fire instantly, with no tap-window delay.
        </p>
      ) : (
        <p className={`action-hint ${companionMissing ? 'warn' : ''}`}>
          {companionMissing
            ? 'Needs the desktop companion app — in the browser this action only dry-runs.'
            : action.type === 'tile'
              ? TILE_KIND_META[action.kind].hint
              : meta?.hint}
        </p>
      )}

      {action?.type === 'hid' && (
        <div className="hid-grid">
          {HID_F_KEYS.map((k) => (
            <button
              key={k.code}
              type="button"
              className={`hid-btn ${action.code === k.code ? 'active' : ''}`}
              onClick={() => {
                onChange({ type: 'hid', code: k.code });
                onHidChange(k.code);
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      {action?.type === 'hotkey' && (
        <div className="field">
          <span className="field-label">Hotkey chord</span>
          <HotkeyInput
            value={action.keys}
            onChange={(keys) => onChange({ ...action, keys })}
          />
        </div>
      )}

      {action?.type === 'launch' &&
        (isTauri() ? (
          <div className="field">
            <span className="field-label">Application</span>
            <AppPicker
              value={action.target}
              onChangeText={(target) => onChange({ ...action, target })}
              onSelect={(path, name, icon) => {
                onChange({ ...action, target: path });
                if (icon && onUseAppIcon) onUseAppIcon(icon, name);
              }}
            />
            <span className="action-hint">
              Picking an app also puts its logo on the key.
            </span>
          </div>
        ) : (
          <Input
            label="App or file"
            placeholder="Slack — or /Applications/Slack.app"
            value={action.target}
            onChange={(e) => onChange({ ...action, target: e.target.value })}
          />
        ))}

      {action?.type === 'open_url' && (
        <Input
          label="URL"
          placeholder="https://…"
          value={action.url}
          onChange={(e) => onChange({ ...action, url: e.target.value })}
        />
      )}

      {action?.type === 'plugin' && pluginSpec && (
        <div className="field">
          <div className="plugin-action-brand">
            {pluginSpec.pluginIcon && (
              <img src={pluginSpec.pluginIcon} alt="" draggable={false} />
            )}
            <span>
              {pluginSpec.label} · {pluginSpec.pluginName}
            </span>
          </div>
          {pluginSpec.hint && <span className="action-hint">{pluginSpec.hint}</span>}
          <PluginFields
            fields={pluginSpec.fields}
            values={action.settings}
            onChange={(key, value) =>
              onChange({ ...action, settings: { ...action.settings, [key]: value } })
            }
          />
        </div>
      )}


      {action?.type === 'page' && (
        <div className="field">
          <span className="field-label">Target page</span>
          <div className="hid-grid">
            {Array.from({ length: MAX_PAGES }, (_, p) => (
              <button
                key={p}
                type="button"
                className={`hid-btn ${action.page === p ? 'active' : ''}`}
                onClick={() => {
                  onChange({ type: 'page', page: p });
                  onHidChange(HID_PAGE_BASE + p);
                }}
              >
                Page {p + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {action?.type === 'shell' && (
        <Input
          label="Command"
          placeholder="say 'hello'"
          value={action.command}
          onChange={(e) => onChange({ ...action, command: e.target.value })}
        />
      )}

      {action?.type === 'mic_mute' && (
        <div className="face-editor-stack">
          <FaceEditor
            title="Mic live"
            face={action.faces?.live ?? DEFAULT_MIC_FACES.live}
            onChange={(face) =>
              onChange({
                ...action,
                faces: { muted: action.faces?.muted ?? DEFAULT_MIC_FACES.muted, live: face },
              })
            }
          />
          <FaceEditor
            title="Mic muted"
            face={action.faces?.muted ?? DEFAULT_MIC_FACES.muted}
            onChange={(face) =>
              onChange({
                ...action,
                faces: { live: action.faces?.live ?? DEFAULT_MIC_FACES.live, muted: face },
              })
            }
          />
        </div>
      )}

      {action?.type === 'obs_scene' && (
        <Input
          label="Scene name"
          placeholder="Exactly as named in OBS"
          value={action.scene}
          onChange={(e) => onChange({ ...action, scene: e.target.value })}
        />
      )}

      {action?.type === 'multi' && (
        <div className="macro-editor">
          {action.steps.map((step, i) => (
            <div key={i} className="macro-step">
              <select
                className="macro-step-type"
                value={step.type}
                onChange={(e) => {
                  const steps = action.steps.slice();
                  steps[i] = defaultActionForType(e.target.value as KeyActionType, hidFallback);
                  onChange({ ...action, steps });
                }}
                aria-label={`Step ${i + 1} type`}
              >
                {MACRO_STEP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACTION_TYPE_META[t].label}
                  </option>
                ))}
              </select>
              {step.type === 'hotkey' ? (
                <HotkeyInput
                  compact
                  value={step.keys}
                  onChange={(keys) => {
                    const steps = action.steps.slice();
                    steps[i] = { ...step, keys };
                    onChange({ ...action, steps });
                  }}
                />
              ) : (
                step.type !== 'mic_mute' && (
                  <input
                    className="macro-step-param"
                    value={macroStepParam(step)}
                    placeholder="value"
                    onChange={(e) => {
                      const steps = action.steps.slice();
                      steps[i] = withMacroParam(step, e.target.value);
                      onChange({ ...action, steps });
                    }}
                    aria-label={`Step ${i + 1} value`}
                  />
                )
              )}
              <button
                type="button"
                className="macro-step-remove"
                onClick={() =>
                  onChange({ ...action, steps: action.steps.filter((_, j) => j !== i) })
                }
                aria-label={`Remove step ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="macro-editor-foot">
            <button
              type="button"
              className="macro-add-step"
              onClick={() =>
                onChange({
                  ...action,
                  steps: [...action.steps, { type: 'hotkey', keys: '' }],
                })
              }
            >
              + Add step
            </button>
            <label className="macro-delay">
              Delay
              <input
                type="number"
                min={0}
                max={5000}
                value={action.delay_ms ?? 150}
                onChange={(e) => onChange({ ...action, delay_ms: Number(e.target.value) })}
                aria-label="Delay between steps (ms)"
              />
              ms
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

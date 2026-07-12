/**
 * Visual action picker — replaces the old action-type dropdown. A trigger
 * button shows what the key currently does; clicking it opens a searchable
 * gallery where every option is a card with an icon and a one-liner,
 * grouped by where it runs (device / computer / live faces / plugins).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  mdiAppleKeyboardCommand,
  mdiArrowLeftBoldBoxOutline,
  mdiArrowRightBoldBoxOutline,
  mdiBroadcast,
  mdiChip,
  mdiCircleOffOutline,
  mdiClockOutline,
  mdiConsole,
  mdiKeyboardOutline,
  mdiMicrophoneOff,
  mdiMusicNote,
  mdiNumeric,
  mdiPlaylistPlay,
  mdiPuzzleOutline,
  mdiRocketLaunchOutline,
  mdiTimerOutline,
  mdiVolumeHigh,
  mdiWeb,
} from '@mdi/js';
import { ACTION_TYPE_META, TILE_KIND_META, type KeyAction } from '../../actions/types';
import { pluginHost } from '../../plugins/host';

export type PickerValue = string; // 'none' | KeyActionType | 'tile:kind' | 'plugin:actionId'

type Group = 'device' | 'computer' | 'tiles' | 'plugins';

interface PickerOption {
  value: PickerValue;
  label: string;
  hint: string;
  path?: string;
  img?: string;
  group: Group;
}

const GROUP_META: Record<Group, { title: string; sub: string; accent: string }> = {
  device: {
    title: 'On the device',
    sub: 'work standalone, no app needed',
    accent: '#2fd4c4',
  },
  computer: { title: 'On this computer', sub: 'run through the companion app', accent: '#4c9ed8' },
  tiles: { title: 'Live faces', sub: 'the key face becomes live data', accent: '#b48ce8' },
  plugins: { title: 'Plugins', sub: 'from your installed plugins', accent: '#e0a52f' },
};

const GROUP_ORDER: Group[] = ['device', 'computer', 'tiles', 'plugins'];

const TILE_ICONS: Record<string, string> = {
  clock: mdiClockOutline,
  timer: mdiTimerOutline,
  cpu: mdiChip,
  volume: mdiVolumeHigh,
  now_playing: mdiMusicNote,
  obs_scene: mdiBroadcast,
};

function buildOptions(): PickerOption[] {
  const opt = (
    value: string,
    label: string,
    hint: string,
    path: string,
    group: Group,
  ): PickerOption => ({ value, label, hint, path, group });

  const options: PickerOption[] = [
    opt('hid', 'Keystroke', ACTION_TYPE_META.hid.hint, mdiKeyboardOutline, 'device'),
    opt('page_next', 'Next page', ACTION_TYPE_META.page_next.hint, mdiArrowRightBoldBoxOutline, 'device'),
    opt('page_prev', 'Previous page', ACTION_TYPE_META.page_prev.hint, mdiArrowLeftBoldBoxOutline, 'device'),
    opt('page', 'Go to page', ACTION_TYPE_META.page.hint, mdiNumeric, 'device'),
    opt('hotkey', 'Hotkey', ACTION_TYPE_META.hotkey.hint, mdiAppleKeyboardCommand, 'computer'),
    opt('launch', 'Launch app', ACTION_TYPE_META.launch.hint, mdiRocketLaunchOutline, 'computer'),
    opt('open_url', 'Open URL', ACTION_TYPE_META.open_url.hint, mdiWeb, 'computer'),
    opt('shell', 'Shell command', ACTION_TYPE_META.shell.hint, mdiConsole, 'computer'),
    opt('mic_mute', 'Mic mute toggle', ACTION_TYPE_META.mic_mute.hint, mdiMicrophoneOff, 'computer'),
    opt('multi', 'Macro', ACTION_TYPE_META.multi.hint, mdiPlaylistPlay, 'computer'),
    opt('obs_scene', 'OBS scene (legacy)', ACTION_TYPE_META.obs_scene.hint, mdiBroadcast, 'computer'),
  ];

  for (const [kind, meta] of Object.entries(TILE_KIND_META)) {
    options.push(opt(`tile:${kind}`, meta.label, meta.hint, TILE_ICONS[kind] ?? mdiClockOutline, 'tiles'));
  }

  for (const p of pluginHost.list()) {
    options.push({
      value: `plugin:${p.id}`,
      label: p.label,
      hint: p.hint ? `${p.hint} — ${p.pluginName}` : p.pluginName,
      img: p.pluginIcon,
      path: p.pluginIcon ? undefined : mdiPuzzleOutline,
      group: 'plugins',
    });
  }

  return options;
}

/** Picker value for the current action (drives the trigger + selection). */
export function actionToPickerValue(action: KeyAction | null): PickerValue {
  if (!action) return 'none';
  if (action.type === 'tile') return `tile:${action.kind}`;
  if (action.type === 'plugin') return `plugin:${action.plugin}`;
  return action.type;
}

function OptionIcon({ option, accent }: { option: PickerOption; accent: string }) {
  if (option.img) {
    return <img className="action-option-icon" src={option.img} alt="" draggable={false} />;
  }
  return (
    <span className="action-option-icon" style={{ color: accent }}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={option.path ?? mdiPuzzleOutline} fill="currentColor" />
      </svg>
    </span>
  );
}

interface ActionPickerProps {
  action: KeyAction | null;
  allowNone: boolean;
  onPick: (value: PickerValue) => void;
}

export function ActionPicker({ action, allowNone, onPick }: ActionPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Plugin actions come and go with installs/reloads
  const [pluginTick, setPluginTick] = useState(0);
  useEffect(() => pluginHost.onChange(() => setPluginTick((t) => t + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(buildOptions, [pluginTick]);

  const current = actionToPickerValue(action);
  const currentOption =
    current === 'none'
      ? { label: 'None', hint: '', group: 'device' as Group, value: 'none', path: mdiCircleOffOutline }
      : options.find((o) => o.value === current) ?? {
          value: current,
          label:
            action?.type === 'plugin' ? `${action.plugin} (not installed)` : current,
          hint: '',
          path: mdiPuzzleOutline,
          group: 'plugins' as Group,
        };

  useEffect(() => {
    if (open) {
      setQuery('');
      // Focus after the opening animation starts
      setTimeout(() => searchRef.current?.focus(), 60);
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const visible = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.hint.toLowerCase().includes(q),
      )
    : options;

  const pick = (value: PickerValue) => {
    setOpen(false);
    onPick(value);
  };

  return (
    <>
      <button
        type="button"
        className="action-picker-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Choose action"
      >
        <OptionIcon
          option={currentOption as PickerOption}
          accent={GROUP_META[currentOption.group].accent}
        />
        <span className="action-picker-trigger-label">{currentOption.label}</span>
        <svg className="action-picker-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="action-picker-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Choose an action"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <div className="action-picker-panel">
            <header className="action-picker-head">
              <h2>What should this key do?</h2>
              <button
                type="button"
                className="plugin-update-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            <input
              ref={searchRef}
              className="action-picker-search"
              placeholder="Search actions — try “page”, “mute”, “clock”…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search actions"
            />

            <div className="action-picker-scroll">
              {allowNone && !q && (
                <button
                  type="button"
                  className={`action-option wide ${current === 'none' ? 'active' : ''}`}
                  data-value="none"
                  onClick={() => pick('none')}
                >
                  <span className="action-option-icon" style={{ color: '#7d8894' }}>
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d={mdiCircleOffOutline} fill="currentColor" />
                    </svg>
                  </span>
                  <span className="action-option-text">
                    <span className="action-option-label">None</span>
                    <span className="action-option-hint">
                      Unbound — keeps single presses instant, no tap-window delay.
                    </span>
                  </span>
                </button>
              )}

              {GROUP_ORDER.map((group) => {
                const groupOptions = visible.filter((o) => o.group === group);
                if (groupOptions.length === 0) return null;
                const meta = GROUP_META[group];
                return (
                  <section key={group} className="action-picker-group">
                    <h3>
                      <span className="action-picker-group-dot" style={{ background: meta.accent }} />
                      {meta.title}
                      <span className="action-picker-group-sub">{meta.sub}</span>
                    </h3>
                    <div className="action-picker-grid">
                      {groupOptions.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className={`action-option ${current === o.value ? 'active' : ''}`}
                          data-value={o.value}
                          onClick={() => pick(o.value)}
                          title={o.hint}
                        >
                          <OptionIcon option={o} accent={meta.accent} />
                          <span className="action-option-text">
                            <span className="action-option-label">{o.label}</span>
                            <span className="action-option-hint">{o.hint}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}

              {visible.length === 0 && (
                <p className="action-picker-empty">
                  Nothing matches “{query}” — try a shorter word, or browse the Plugins page
                  for more actions.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

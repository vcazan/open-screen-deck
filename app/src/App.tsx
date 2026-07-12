import { useCallback, useEffect, useRef, useState } from 'react';
import './styles/tokens.css';
import './styles/global.css';
import './styles/shell.css';
import './styles/deck.css';
import './styles/inspector.css';
import './styles/console.css';
import './styles/views.css';
import './styles/onboarding.css';
import { useDeviceManager } from './hooks/useDevice';
import { useProfileStore } from './hooks/useProfileStore';
import { ProfileStore } from './utils/profileStore';
import { DeviceView } from './ui/DeviceView';
import { KeyInspector } from './ui/KeyInspector';
import { IconRail } from './ui/shell/IconRail';
import { Sidebar } from './ui/shell/Sidebar';
import { StageTopbar } from './ui/shell/StageTopbar';
import { ConsoleDrawer, StatusBar } from './ui/shell/StatusBar';
import {
  dismissFirstRunHint,
  isFirstRunHintVisible,
  moveKeySelection,
  viewDirection,
  type AppView,
} from './ui/shell/types';
import { ConsoleView } from './ui/views/ConsoleView';
import { PluginsView } from './ui/views/PluginsView';
import { ProfilesView, exportAllProfiles } from './ui/views/ProfilesView';
import { SettingsView } from './ui/views/SettingsView';
import { StorageView } from './ui/views/StorageView';
import {
  buildProfile,
  exportProfileFile,
  loadProfileFromFile,
  parsePortableProfile,
  profilePageCount,
  profileToKeyConfigs,
  profileToMultiActions,
} from './utils/profiles';
import {
  deleteProfileMedia,
  hasMedia,
  loadProfileMedia,
  mediaSignature,
  saveProfileMedia,
} from './utils/profileMedia';
import {
  HID_PAGE_BASE,
  HID_PAGE_NEXT,
  HID_PAGE_PREV,
  HID_TAP_ARM,
  KEY_COUNT,
  MAX_PAGES,
  TOTAL_KEYS,
  defaultKeyForSlot,
} from './protocol/constants';
import { encodeCommand } from './protocol/codec';
import { rgb565ToRgb888 } from './protocol/rgb565';
import { useKeyActions } from './hooks/useKeyActions';
import { useTiles } from './tiles/useTiles';
import { useUndoStack } from './hooks/useUndoStack';
import {
  pasteKeySlot,
  swapKeySlots,
  takeDeckSnapshot,
  type KeySnapshot,
} from './utils/deckSnapshot';
import { executeAction } from './actions/executor';
import { createTapResolver } from './utils/tapResolver';
import { saveKeyMediaImage } from './utils/keyMedia';
import { DEFAULT_MIC_FACES } from './actions/types';
import { profileToActions } from './utils/profiles';
import { isTauri } from './transport/TauriSerialTransport';
import { obsClient, loadObsSettings, saveObsSettings } from './integrations/obs';
import { Onboarding, isOnboardingPending } from './ui/Onboarding';
import {
  PluginUpdatePrompt,
  UPDATE_DISMISS_KEY,
  updateSignature,
} from './ui/components/PluginUpdatePrompt';
import type { PluginUpdate } from './plugins/host';
import { Confetti } from './ui/components/Confetti';
import { pluginHost } from './plugins/host';
import { starterToProfileData, type StarterProfile } from './assets/starterProfiles';

const ACTIVE_PROFILE_KEY = 'osd-active-profile';

export default function App() {
  const device = useDeviceManager();
  const {
    profiles,
    save: saveProfile,
    update: updateProfile,
    rename: renameProfile,
    setAutoApp,
    remove: removeProfile,
    importJson,
  } = useProfileStore();

  const [activeProfileId, setActiveProfileId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_PROFILE_KEY),
  );
  const [activeView, setActiveView] = useState<AppView>('deck');
  const [transitionDir, setTransitionDir] = useState<'up' | 'down'>('down');
  const [showHint, setShowHint] = useState(isFirstRunHintVisible);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [showTx, setShowTx] = useState(true);
  const [showRx, setShowRx] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [deckMode, setDeckMode] = useState<'edit' | 'test'>(
    () => (localStorage.getItem('osd-deck-mode') as 'edit' | 'test') || 'edit',
  );
  const [onboarding, setOnboarding] = useState(isOnboardingPending);
  const [celebration, setCelebration] = useState<string | null>(null);

  const celebrate = useCallback((message: string) => {
    setCelebration(message);
    setTimeout(() => setCelebration(null), 3200);
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);

  const keyActions = useKeyActions();

  const fwVersion =
    device.deviceInfo && 'fw' in device.deviceInfo
      ? (device.deviceInfo as { fw: string }).fw
      : null;

  const connected = device.connectionState === 'connected';

  const connectionLabel =
    device.connectionState === 'connected'
      ? device.transportMode === 'simulator'
        ? 'Simulator connected'
        : 'USB connected'
      : device.connectionState === 'connecting'
        ? 'Connecting…'
        : device.connectionState === 'error'
          ? 'Connection error'
          : 'Disconnected';

  const txCount = device.consoleEntries.filter((e) => e.direction === 'tx').length;
  const rxCount = device.consoleEntries.length - txCount;

  const deckState = device.device?.getState() ?? null;
  const orientation = deckState?.orientation ?? 0;
  const deckPage = deckState?.page ?? 0;
  const deckPages = deckState?.pages ?? 1;
  const deckMaxPages = deckState?.maxPages ?? MAX_PAGES;

  const miniKeyColors = (() => {
    if (!deckState) return Array(KEY_COUNT).fill('#1c2128');
    // Sidebar mini-deck shows the page currently on the screens
    return deckState.keys
      .slice(deckPage * KEY_COUNT, deckPage * KEY_COUNT + KEY_COUNT)
      .map((k) => {
        const { r, g, b } = rgb565ToRgb888(k.bgColor);
        return `rgb(${r},${g},${b})`;
      });
  })();

  /** Selected key is a POSITION (0..5); the inspector edits the global slot. */
  const selectedSlot =
    device.selectedKey !== null ? deckPage * KEY_COUNT + device.selectedKey : null;

  const handlePageChange = useCallback(
    (page: number) => {
      device.sendCommand(encodeCommand({ type: 'SET_PAGE', page }));
    },
    [device],
  );

  /** Does the LAST page hold anything worth warning about before removal? */
  const lastPageDirty = (() => {
    if (!deckState || deckPages <= 1) return false;
    const p = deckPages - 1;
    for (let pos = 0; pos < KEY_COUNT; pos++) {
      const slot = p * KEY_COUNT + pos;
      const m = deckState.media[slot];
      if (m?.hasIcon || m?.animFrames) return true;
      const k = deckState.keys[slot];
      const d = defaultKeyForSlot(slot);
      if (
        k &&
        (k.label !== d.label ||
          k.sublabel !== d.sublabel ||
          k.hidKey !== d.hid ||
          k.bgColor !== d.bg)
      ) {
        return true;
      }
      const a = keyActions.actions[slot];
      if (a && !(a.type === 'hid' && a.code === d.hid)) return true;
    }
    return false;
  })();

  // ── Editing: undo/redo, copy/paste, drag-swap ────────────────
  const undoActionsRef = useRef(keyActions.actions);
  undoActionsRef.current = keyActions.actions;
  const undoMultiRef = useRef({ double: keyActions.double, triple: keyActions.triple });
  undoMultiRef.current = { double: keyActions.double, triple: keyActions.triple };
  const deckOps = useRef({
    sendCommand: (line: string) => device.sendCommand(line),
    sendSetImage: (i: number, b: Uint8Array) => device.sendSetImage(i, b),
    sendAnimation: (i: number, f: Uint8Array[], fps: number) => device.sendAnimation(i, f, fps),
    deleteSdPath: (p: string) => device.deleteSdPath(p),
    setAllActions: (
      s: Parameters<typeof keyActions.setAll>[0],
      d: Parameters<typeof keyActions.setAll>[1],
      t: Parameters<typeof keyActions.setAll>[2],
    ) => keyActions.setAll(s, d, t),
  });
  deckOps.current.sendCommand = (line) => device.sendCommand(line);
  deckOps.current.sendSetImage = (i, b) => device.sendSetImage(i, b);
  deckOps.current.sendAnimation = (i, f, fps) => device.sendAnimation(i, f, fps);
  deckOps.current.deleteSdPath = (p) => device.deleteSdPath(p);
  deckOps.current.setAllActions = (s, d, t) => keyActions.setAll(s, d, t);

  const { checkpoint, undo, redo } = useUndoStack(
    device.device,
    undoActionsRef,
    undoMultiRef,
    deckOps.current,
  );

  const copiedKeyRef = useRef<KeySnapshot | null>(null);

  const handleAddPage = useCallback(() => {
    if (deckPages >= deckMaxPages) return;
    checkpoint(false); // ⌘Z removes the page again
    device.sendCommand(encodeCommand({ type: 'SET_PAGES', pages: deckPages + 1 }));
    // Jump to the fresh page so it's immediately editable
    device.sendCommand(encodeCommand({ type: 'SET_PAGE', page: deckPages }));
  }, [device, deckPages, deckMaxPages, checkpoint]);

  const handleRemovePage = useCallback(() => {
    if (deckPages <= 1) return;
    checkpoint(false); // ⌘Z restores the page, keys and media included
    // Clean the dropped page's media before the slots disappear
    const dropped = deckPages - 1;
    for (let pos = 0; pos < KEY_COUNT; pos++) {
      const slot = dropped * KEY_COUNT + pos;
      const media = device.device?.getState().media[slot];
      if (media?.animFrames) {
        device.sendCommand(encodeCommand({ type: 'ANIM_CLEAR', index: slot }));
      }
      if (media?.hasIcon) {
        void device.deleteSdPath(`/osd/keys/${slot}/icon.rgb565`).catch(() => {});
      }
    }
    device.sendCommand(encodeCommand({ type: 'SET_PAGES', pages: deckPages - 1 }));
  }, [device, deckPages, checkpoint]);

  const handleSwapKeys = useCallback(
    (fromPos: number, toPos: number) => {
      if (!device.device || fromPos === toPos) return;
      checkpoint(false);
      const a = deckPage * KEY_COUNT + fromPos;
      const b = deckPage * KEY_COUNT + toPos;
      void swapKeySlots(
        a,
        b,
        device.device,
        undoActionsRef.current,
        undoMultiRef.current,
        deckOps.current,
      );
      device.logLocal(`swapped key ${fromPos + 1} ↔ key ${toPos + 1}`);
    },
    [device, deckPage, checkpoint],
  );

  // Live tiles: clock/timer/CPU/volume/now-playing faces streamed via SET_FACE
  const { handleTilePress } = useTiles({
    actions: keyActions.actions,
    deckPage,
    connected: device.connectionState === 'connected',
    sendSetFace: device.sendSetFace,
  });
  const handleTilePressRef = useRef(handleTilePress);
  handleTilePressRef.current = handleTilePress;

  const handleOrientChange = useCallback(
    (orient: number) => {
      device.sendCommand(encodeCommand({ type: 'SET_ORIENT', orient }));
    },
    [device],
  );

  const handleViewChange = (view: AppView) => {
    if (view === activeView) return;
    setTransitionDir(viewDirection(activeView, view));
    setActiveView(view);
  };

  const handleSelectKey = useCallback(
    (index: number) => {
      device.setSelectedKey(index);
      if (showHint) {
        dismissFirstRunHint();
        setShowHint(false);
      }
    },
    [device, showHint],
  );

  // ── Test-mode presses ────────────────────────────────────────
  // Simulator mode goes through the sim's firmware-twin tap engine. With
  // real hardware connected, on-screen clicks never reach the firmware, so
  // the app runs the SAME smart tap rule locally (utils/tapResolver).
  const testActionsRef = useRef({
    single: keyActions.actions,
    double: keyActions.double,
    triple: keyActions.triple,
  });
  testActionsRef.current = {
    single: keyActions.actions,
    double: keyActions.double,
    triple: keyActions.triple,
  };
  const deckPageRef = useRef(deckPage);
  deckPageRef.current = deckPage;
  const deckPagesRef = useRef(deckPages);
  deckPagesRef.current = deckPages;
  const deviceRef = useRef(device);
  deviceRef.current = device;

  const testTapResolverRef = useRef(
    createTapResolver((slot, taps) => {
      const d = deviceRef.current;
      const store = testActionsRef.current;
      const level = taps >= 3 ? 'triple' : taps === 2 ? 'double' : 'single';
      const action = level === 'single' ? store.single[slot] : store[level][slot];
      if (!action) return;
      d.logLocal(`test: key ${(slot % KEY_COUNT) + 1} ${level} press`);
      if (action.type === 'tile') {
        handleTilePressRef.current(slot);
        return;
      }
      // On-screen presses never hit the firmware, so firmware-owned page
      // actions are performed over the protocol instead
      const pages = deckPagesRef.current;
      const page = deckPageRef.current;
      if (action.type === 'page_next') {
        d.sendCommand(encodeCommand({ type: 'SET_PAGE', page: (page + 1) % pages }));
        return;
      }
      if (action.type === 'page_prev') {
        d.sendCommand(encodeCommand({ type: 'SET_PAGE', page: (page + pages - 1) % pages }));
        return;
      }
      if (action.type === 'page') {
        if (action.page < pages) {
          d.sendCommand(encodeCommand({ type: 'SET_PAGE', page: action.page }));
        }
        return;
      }
      executeAction(action, { log: d.logLocal, slot });
    }),
  );
  useEffect(() => {
    const resolver = testTapResolverRef.current;
    return () => resolver.dispose();
  }, []);

  const handleTestPressRef = useRef<(position: number) => void>(() => {});

  /** Test mode: fire a key's action from the app, as if pressed on hardware. */
  const handleTestPress = useCallback(
    (position: number) => {
      if (device.transportMode === 'simulator') {
        // Full pipeline: sim press → tap engine → key event → action router
        device.pressKey(position);
        return;
      }
      const slot = deckPage * KEY_COUNT + position;
      const store = testActionsRef.current;
      const maxTaps = store.triple[slot] ? 3 : store.double[slot] ? 2 : 1;
      testTapResolverRef.current.press(slot, maxTaps);
    },
    [device, deckPage],
  );
  handleTestPressRef.current = handleTestPress;

  const handleDeckModeChange = useCallback(
    (mode: 'edit' | 'test') => {
      setDeckMode(mode);
      localStorage.setItem('osd-deck-mode', mode);
      if (mode === 'test') device.setSelectedKey(null); // close inspector while testing
    },
    [device],
  );

  const setActiveProfile = useCallback((id: string | null) => {
    setActiveProfileId(id);
    if (id) localStorage.setItem(ACTIVE_PROFILE_KEY, id);
    else localStorage.removeItem(ACTIVE_PROFILE_KEY);
  }, []);

  const applyProfileData = useCallback(
    (data: ReturnType<typeof buildProfile>) => {
      // Pure protocol — works on both the simulator and real hardware.
      // Each SET_KEY persists to device NVS, so profiles survive reboot.
      // The profile owns the page count: the deck resizes to match.
      device.sendCommand(
        encodeCommand({ type: 'SET_PAGES', pages: profilePageCount(data) }),
      );
      const configs = profileToKeyConfigs(data);
      for (let i = 0; i < configs.length; i++) {
        device.sendCommand(
          encodeCommand({
            type: 'SET_KEY',
            payload: {
              index: i,
              label: configs[i].label,
              sublabel: configs[i].sublabel,
              hid: configs[i].hidKey,
              bg: configs[i].bgColor,
              icon: configs[i].icon,
            },
          }),
        );
      }
      // Host-side actions travel with the profile (v2); v1 maps to HID.
      // Multi-tap bindings re-arm the device via the tap-arm effect.
      const multi = profileToMultiActions(data);
      const actions = profileToActions(data);
      keyActions.setAll(actions, multi.double, multi.triple);
      // Plugin keys own their faces — let each plugin paint its slot.
      // Sequential so network-backed plugins (weather, crypto) don't stampede.
      void (async () => {
        for (let i = 0; i < configs.length; i++) {
          const a = actions[i];
          if (a?.type === 'plugin' && a.plugin) {
            await pluginHost.notifyAssigned(a.plugin, a.settings, i).catch(() => {});
          }
        }
      })();
    },
    [device, keyActions],
  );

  /** Rendered face thumbnails straight from the live key canvases. */
  const makeThumbs = useCallback((): string[] => {
    if (!device.device) return [];
    return Array.from({ length: 6 }, (_, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 48;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(device.device!.getCanvas(i), 0, 0, 48, 48);
      return canvas.toDataURL('image/jpeg', 0.75);
    });
  }, [device.device]);

  /** Push a profile's media (icons + animations) to the deck. */
  const applyProfileMedia = useCallback(
    async (profileId: string) => {
      const media = await loadProfileMedia(profileId);
      const current = device.device?.getState().media ?? [];
      for (let i = 0; i < TOTAL_KEYS; i++) {
        const anim = media?.animations[i];
        const icon = media?.icons[i];
        const had = current[i];
        try {
          if (anim && anim.frames.length > 0) {
            await device.sendAnimation(i, anim.frames, anim.fps);
          } else if (had?.animFrames) {
            device.sendCommand(encodeCommand({ type: 'ANIM_CLEAR', index: i }));
          }
          if (icon) {
            await device.sendSetImage(i, icon);
          } else if (!anim && had?.hasIcon) {
            await device
              .deleteSdPath(`/osd/keys/${i}/icon.rgb565`)
              .catch(() => {});
            device.sendCommand(encodeCommand({ type: 'DRAW', index: i }));
          }
        } catch {
          device.logLocal(`profile media: key slot ${i + 1} failed to apply`);
        }
      }
    },
    [device],
  );

  /** Apply a stored profile (config + media) and make it the active one. */
  const handleApplyProfile = useCallback(
    (profile: { id: string; data: ReturnType<typeof buildProfile>; hasMedia?: boolean }) => {
      checkpoint(false); // Cmd+Z brings the previous deck back
      applyProfileData(profile.data);
      setActiveProfile(profile.id);
      void applyProfileMedia(profile.id);
    },
    [applyProfileData, setActiveProfile, applyProfileMedia, checkpoint],
  );

  /** Snapshot the current deck (config, actions, media) into a new profile. */
  const handleCreateProfile = useCallback(() => {
    if (!device.device) return;
    const deckNow = device.device.getState();
    const data = buildProfile(deckNow.keys, keyActions.actions, deckNow.pages, {
      double: keyActions.double,
      triple: keyActions.triple,
    });
    const media = device.device.getMediaSnapshot();
    const profile = saveProfile(`Profile ${profiles.length + 1}`, data, {
      thumbs: makeThumbs(),
      hasMedia: hasMedia(media),
    });
    void saveProfileMedia(profile.id, media);
    setActiveProfile(profile.id);
    if (activeView !== 'profiles') handleViewChange('profiles');
  }, [
    device.device,
    profiles.length,
    saveProfile,
    setActiveProfile,
    activeView,
    keyActions.actions,
    makeThumbs,
  ]);

  const handleRenameProfile = useCallback(
    (id: string, name: string) => {
      renameProfile(id, name);
    },
    [renameProfile],
  );

  const handleDuplicateProfile = useCallback(
    (id: string) => {
      const source = profiles.find((p) => p.id === id);
      if (!source) return;
      const copy = saveProfile(`${source.name} copy`, source.data, {
        thumbs: source.thumbs,
        hasMedia: source.hasMedia,
      });
      void loadProfileMedia(id).then((media) => {
        if (media) return saveProfileMedia(copy.id, media);
      });
    },
    [profiles, saveProfile],
  );

  const handleDeleteProfile = useCallback(
    (id: string) => {
      removeProfile(id);
      void deleteProfileMedia(id);
      if (id === activeProfileId) setActiveProfile(null);
    },
    [removeProfile, activeProfileId, setActiveProfile],
  );

  /** Share a profile as a single file — config, actions, media, thumbnails. */
  const handleExportProfile = useCallback(async (profile: (typeof profiles)[number]) => {
    const media = await loadProfileMedia(profile.id);
    exportProfileFile(profile.name, profile.data, media, profile.thumbs);
  }, []);

  // Auto-save: while a profile is active, key/action/media edits flow into it.
  // Runs on an interval (not a refresh-debounce) so a looping animation —
  // which redraws constantly — can't starve the save.
  const mediaSigRef = useRef('');
  const keyActionsForSaveRef = useRef(keyActions.actions);
  keyActionsForSaveRef.current = keyActions.actions;
  const multiForSaveRef = useRef({ double: keyActions.double, triple: keyActions.triple });
  multiForSaveRef.current = { double: keyActions.double, triple: keyActions.triple };
  useEffect(() => {
    if (!activeProfileId || !device.device) return;
    const sim = device.device;
    const timer = setInterval(() => {
      const stored = ProfileStore.get(activeProfileId);
      if (!stored) {
        setActiveProfile(null);
        return;
      }
      const simState = sim.getState();
      const current = buildProfile(
        simState.keys,
        keyActionsForSaveRef.current,
        simState.pages,
        multiForSaveRef.current,
      );
      const media = sim.getMediaSnapshot();
      const mediaSig = `${activeProfileId}:${mediaSignature(media)}`;
      const configChanged = JSON.stringify(stored.data) !== JSON.stringify(current);
      const mediaChanged = mediaSigRef.current !== mediaSig;
      if (configChanged || mediaChanged) {
        mediaSigRef.current = mediaSig;
        updateProfile(activeProfileId, current, undefined, {
          thumbs: makeThumbs(),
          hasMedia: hasMedia(media),
        });
        if (mediaChanged) void saveProfileMedia(activeProfileId, media);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [device.device, activeProfileId, updateProfile, setActiveProfile, makeThumbs]);

  // ── Action routing + host state feedback ─────────────────────
  const keyActionsRef = useRef(keyActions.actions);
  keyActionsRef.current = keyActions.actions;
  const multiActionsRef = useRef({ double: keyActions.double, triple: keyActions.triple });
  multiActionsRef.current = { double: keyActions.double, triple: keyActions.triple };
  const transportModeRef = useRef(device.transportMode);
  transportModeRef.current = device.transportMode;

  // Key press → execute the action bound to the resolved tap level.
  // The firmware/simulator already did the smart waiting: single-only keys
  // arrive instantly with taps=1, multi-tap keys arrive once, resolved.
  useEffect(() => {
    device.setKeyPressHandler((index, taps) => {
      const action =
        taps >= 3
          ? multiActionsRef.current.triple[index]
          : taps === 2
            ? multiActionsRef.current.double[index]
            : keyActionsRef.current[index];
      if (!action) return;
      if (action.type === 'tile') {
        handleTilePressRef.current(index); // timer start/stop
        return;
      }
      executeAction(action, {
        log: device.logLocal,
        slot: index,
        simToggleMic:
          transportModeRef.current === 'simulator' ? () => setMicMuted((m) => !m) : undefined,
      });
    });
    return () => device.setKeyPressHandler(null);
  }, [device.setKeyPressHandler, device.logLocal]);

  // Arm multi-tap detection on the device: derive each slot's h2/h3 from its
  // double/triple actions. HID-mappable actions get their real code (works
  // standalone); host-only actions get the silent TAP_ARM sentinel so the
  // firmware waits and reports taps. Unbound = 0 = zero-latency singles.
  const tapArmSigRef = useRef('');
  useEffect(() => {
    const derive = (a: (typeof keyActions.double)[number]): number => {
      if (!a) return 0;
      switch (a.type) {
        case 'hid':
          return a.code;
        case 'page_next':
          return HID_PAGE_NEXT;
        case 'page_prev':
          return HID_PAGE_PREV;
        case 'page':
          return HID_PAGE_BASE + a.page;
        default:
          return HID_TAP_ARM;
      }
    };
    const arm = () => {
      const wanted = Array.from({ length: TOTAL_KEYS }, (_, i) => ({
        h2: derive(keyActions.double[i]),
        h3: derive(keyActions.triple[i]),
      }));
      const state = device.device?.getState();
      wanted.forEach(({ h2, h3 }, i) => {
        const k = state?.keys[i];
        if ((k?.hid2 ?? 0) === h2 && (k?.hid3 ?? 0) === h3) return;
        device.sendCommand(
          encodeCommand({ type: 'SET_KEY', payload: { index: i, h2, h3 } }),
        );
      });
      return JSON.stringify(wanted);
    };

    const sig = `${connected}:${JSON.stringify([keyActions.double, keyActions.triple])}`;
    if (tapArmSigRef.current === sig) return;
    tapArmSigRef.current = sig;

    if (!connected) return;
    // On a fresh USB connect, wait for GET_KEYS to fill the mirror before
    // diffing — otherwise we'd arm against stale state.
    const timer = setTimeout(arm, device.transportMode === 'webserial' ? 1500 : 0);
    return () => clearTimeout(timer);
  }, [keyActions.double, keyActions.triple, device, connected]);

  // Plugins: connect the host bridge, then load installed plugins (Tauri)
  const pluginLogTapRef = useRef<((line: string) => void) | null>(null);
  useEffect(() => {
    pluginHost.connect({
      log: (line) => {
        device.logLocal(line);
        pluginLogTapRef.current?.(line); // debug-channel capture
      },
      setKeyFace: (slot, face) => {
        device.sendCommand(
          encodeCommand({
            type: 'SET_KEY',
            payload: { index: slot, label: face.label, sublabel: face.sublabel, bg: face.bg },
          }),
        );
      },
      // Custom plugin visuals: live frames stream via SET_FACE, branded
      // faces persist via SET_IMAGE (tagged so they follow the action)
      sendFace: (slot, rgb565) => device.sendSetFace(slot, rgb565),
      sendImage: async (slot, rgb565) => {
        saveKeyMediaImage(slot, rgb565, 'plugin');
        await device.sendSetImage(slot, rgb565);
      },
      // OBS rides the app's shared obs-websocket client; the obs-control
      // plugin owns the connection settings. Lazy-connects on first use.
      obsRequest: async (requestType, requestData) => {
        if (!obsClient.isConnected()) {
          const s = loadObsSettings();
          if (!s.url) throw new Error('set the OBS address in the plugin settings first');
          await obsClient.connect(s.url, s.password);
        }
        return obsClient.call(requestType, requestData ?? {});
      },
      obsConfigure: async (url, password, autoConnect) => {
        saveObsSettings({ url, password, autoConnect });
        if (!url) {
          obsClient.disconnect();
        } else if (autoConnect) {
          await obsClient.connect(url, password);
        }
      },
    });
    void pluginHost.loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.logLocal, device.sendCommand]);

  // Plugin updates: check the registry shortly after launch and ask before
  // installing. "Later" snoozes that exact version set — the prompt only
  // returns when something newer lands.
  const [pluginUpdates, setPluginUpdates] = useState<PluginUpdate[] | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    const timer = setTimeout(async () => {
      try {
        const updates = await pluginHost.checkForUpdates();
        if (updates.length === 0) return;
        const sig = updateSignature(updates);
        if (localStorage.getItem(UPDATE_DISMISS_KEY) === sig) return;
        setPluginUpdates(updates);
      } catch {
        // registry unreachable — the Plugins view surfaces that state
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  // Test seam: lets e2e drive the update prompt with fixture data
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__osdShowUpdates = (updates: PluginUpdate[]) => setPluginUpdates(updates);
    return () => {
      delete w.__osdShowUpdates;
    };
  }, []);

  // Diagnostics hooks for the companion's --debug-js channel (Tauri only)
  useEffect(() => {
    if (!isTauri()) return;
    const w = window as unknown as Record<string, unknown>;
    w.__osd = {
      state: () => ({
        conn: device.connectionState,
        mode: device.transportMode,
        media: device.device?.getState().media,
      }),
      /** Visible-face fingerprint — proves the editor deck actually repainted. */
      face: (idx: number) => {
        const el = document.querySelectorAll('.key-cap canvas')[idx] as HTMLCanvasElement;
        return el ? el.toDataURL().slice(-48) : 'no-canvas';
      },
      tick: () => device.refreshTick,
      sendCmd: (line: string) => {
        device.sendCommand(line);
        return 'sent';
      },
      plugins: () => pluginHost.list().map((p) => p.id),
      pluginsInstalled: () =>
        pluginHost.listInstalled().map((p) => `${p.id}@${p.version} icon:${p.icon ? 'yes' : 'no'}`),
      /** Registry vs installed — what the update prompt would show. */
      pluginUpdates: async () => {
        const updates = await pluginHost.checkForUpdates();
        return updates.map(
          (u) =>
            `${u.entry.id} ${u.installed.version} -> ${u.entry.version}: ` +
            (u.notes.map((n) => `[${n.version}] ${n.note}`).join(' | ') || 'no notes'),
        );
      },
      /** Force the update prompt open (bypasses the snooze). */
      showUpdatePrompt: async () => {
        const updates = await pluginHost.checkForUpdates();
        if (updates.length === 0) return 'no updates';
        localStorage.removeItem(UPDATE_DISMISS_KEY);
        setPluginUpdates(updates);
        return `prompt open with ${updates.length} update(s)`;
      },
      setRegistry: async (url: string) => {
        const { setRegistryUrl } = await import('./plugins/host');
        setRegistryUrl(url);
        return `registry -> ${url || 'default'}`;
      },
      /** Render a plugin action's preview face (sandboxed onAssign). */
      pluginPreview: async (actionId: string, settings?: Record<string, string>) => {
        const url = await pluginHost.previewFace(actionId, settings ?? {});
        return url ?? 'no preview';
      },
      pluginSettingsSpec: (pluginId: string) =>
        pluginHost.getSettingsSpec(pluginId)?.fields.map((f) => f.key) ?? 'none',
      applyStarter: async (id: string) => {
        const { STARTER_PROFILES } = await import('./assets/starterProfiles');
        const starter = STARTER_PROFILES.find((s) => s.id === id);
        if (!starter) return `unknown starter: ${id}`;
        handleApplyStarter(starter);
        return `applied ${starter.name}`;
      },
      pluginScaffold: (id: string) => pluginHost.scaffold(id),
      /** Execute a plugin action and return the log lines it produced. */
      pluginExec: async (actionId: string, settings: Record<string, string>, slot = 0) => {
        const lines: string[] = [];
        pluginLogTapRef.current = (l) => lines.push(l);
        try {
          await pluginHost.execute(actionId, settings, slot);
          await new Promise((r) => setTimeout(r, 400)); // async logs settle
        } finally {
          pluginLogTapRef.current = null;
        }
        return lines;
      },
      /** Fire a plugin's onAssign hook (branded face) and return its logs. */
      pluginAssign: async (actionId: string, settings: Record<string, string>, slot = 0) => {
        const lines: string[] = [];
        pluginLogTapRef.current = (l) => lines.push(l);
        try {
          await pluginHost.notifyAssigned(actionId, settings, slot);
          await new Promise((r) => setTimeout(r, 400));
        } finally {
          pluginLogTapRef.current = null;
        }
        return lines;
      },
      keyLabel: (slot: number) => {
        const k = device.device?.getState().keys[slot];
        return k ? `${k.label} | ${k.sublabel}` : 'no key';
      },
      resetRegistry: async () => {
        const { setRegistryUrl } = await import('./plugins/host');
        setRegistryUrl(''); // back to the GitHub default
        const entries = await pluginHost.fetchRegistry();
        return entries.map((p) => `${p.id}@${p.version}`);
      },
      pluginUninstall: (id: string) => pluginHost.uninstall(id).then(() => 'ok'),
      pluginInstallFrom: async (registryUrl: string, id: string) => {
        const { getRegistryUrl, setRegistryUrl } = await import('./plugins/host');
        const previous = getRegistryUrl();
        setRegistryUrl(registryUrl);
        try {
          const entries = await pluginHost.fetchRegistry();
          const entry = entries.find((p) => p.id === id);
          if (!entry) return `not in registry: ${id}`;
          await pluginHost.install(entry);
          return `installed ${id}`;
        } finally {
          setRegistryUrl(previous);
        }
      },
      pages: () => device.device?.getState().pages,
      page: () => device.device?.getState().page,
      sdList: (path: string) => device.listSdDir(path),
      /** Simulate N on-screen Test-mode presses (multi-tap verification). */
      testPress: async (position: number, count = 1) => {
        for (let i = 0; i < count; i++) {
          handleTestPressRef.current(position);
          if (i < count - 1) await new Promise((r) => setTimeout(r, 120));
        }
        return `pressed ${count}x`;
      },
      setDouble: (slot: number, type: string) => {
        keyActions.setAction(
          slot,
          'double',
          type === 'none' ? null : ({ type } as never),
        );
        return `double[${slot}] = ${type}`;
      },
      recoverDeck: async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        const ports = (await invoke('serial_list')) as {
          path: string;
          vid: number | null;
          product: string | null;
        }[];
        const boot = ports.find(
          (p) => p.vid === 0x303a && p.product?.toLowerCase().includes('jtag'),
        );
        if (!boot) return 'no bootloader port found';
        return invoke('deck_recover', { port: boot.path });
      },
      flashFirmware: async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        const port = (await invoke('serial_is_open')) as string | null;
        if (!port) return 'no port open';
        return invoke('flash_firmware', { port });
      },
      uploadTestImage: async (idx: number) => {
        // Top half green, bottom half transparent sentinel — the bottom
        // must render in the key's background color and follow recolors.
        const bytes = new Uint8Array(32768);
        for (let i = 0; i < bytes.length; i += 2) {
          if (i < 16384) {
            bytes[i] = 0x07;
            bytes[i + 1] = 0xe0; // green
          } else {
            bytes[i] = 0x08;
            bytes[i + 1] = 0x21; // TRANSPARENT_565
          }
        }
        await device.sendSetImage(idx, bytes);
        return `uploaded to key ${idx + 1}; mirror hasIcon=${device.device?.getState().media[idx]?.hasIcon}`;
      },
    };
    return () => {
      delete w.__osd;
    };
  }, [device]);

  // Real mic state from the companion backend (polled from the OS)
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    import('@tauri-apps/api/event').then(({ listen }) =>
      listen('mic-state', (e) => {
        setMicMuted((e.payload as { muted: boolean }).muted);
      }).then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      }),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Push two-state faces to mic keys whenever mute state or config changes
  const micFaceSigRef = useRef('');
  useEffect(() => {
    const sig = JSON.stringify([
      micMuted,
      keyActions.actions.map((a) => (a.type === 'mic_mute' ? a.faces ?? DEFAULT_MIC_FACES : null)),
    ]);
    if (micFaceSigRef.current === sig) return;
    micFaceSigRef.current = sig;
    keyActions.actions.forEach((a, i) => {
      if (a.type !== 'mic_mute') return;
      const faces = a.faces ?? DEFAULT_MIC_FACES;
      const face = micMuted ? faces.muted : faces.live;
      device.sendCommand(
        encodeCommand({
          type: 'SET_KEY',
          payload: { index: i, label: face.label, sublabel: face.sublabel, bg: face.bg },
        }),
      );
    });
  }, [micMuted, keyActions.actions, device]);

  // First time real hardware connects: that moment deserves more than a
  // status dot (once ever, per the delight budget).
  useEffect(() => {
    if (device.transportMode !== 'webserial' || !connected) return;
    if (localStorage.getItem('osd-first-usb-celebrated') === '1') return;
    localStorage.setItem('osd-first-usb-celebrated', '1');
    celebrate('Deck connected — welcome to the club');
  }, [connected, device.transportMode, celebrate]);

  // Companion mode: suppress firmware HID while we're alive (Tauri + USB)
  useEffect(() => {
    if (!isTauri() || device.transportMode !== 'webserial' || !connected) return;
    device.sendCommand('MODE COMPANION');
    const heartbeat = setInterval(() => device.sendCommand('PING'), 2000);
    return () => {
      clearInterval(heartbeat);
      device.sendCommand('MODE HID');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, device.transportMode]);

  // OBS: auto-connect if configured; track the program scene
  const [obsScene, setObsScene] = useState<string | null>(null);
  useEffect(() => {
    const settings = loadObsSettings();
    if (settings.autoConnect && settings.url) {
      obsClient.connect(settings.url, settings.password).catch(() => {});
    }
    const unScene = obsClient.onScene(setObsScene);
    return () => {
      unScene();
    };
  }, []);

  // Scene indicator: obs_scene keys light teal while their scene is live
  const obsFaceSigRef = useRef('');
  useEffect(() => {
    const sig = JSON.stringify([
      obsScene,
      keyActions.actions.map((a) => (a.type === 'obs_scene' ? a.scene : null)),
    ]);
    if (obsFaceSigRef.current === sig) return;
    obsFaceSigRef.current = sig;
    keyActions.actions.forEach((a, i) => {
      if (a.type !== 'obs_scene' || !a.scene) return;
      const active = obsScene === a.scene;
      device.sendCommand(
        encodeCommand({
          type: 'SET_KEY',
          payload: { index: i, sublabel: active ? 'ON AIR' : 'Scene', bg: active ? 0x1c73 : 0x194b },
        }),
      );
    });
  }, [obsScene, keyActions.actions, device]);

  // Frontmost app → auto-switch profiles (companion only)
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const activeProfileIdRef = useRef(activeProfileId);
  activeProfileIdRef.current = activeProfileId;
  const handleApplyProfileRef = useRef(handleApplyProfile);
  handleApplyProfileRef.current = handleApplyProfile;
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    import('@tauri-apps/api/event').then(({ listen }) =>
      listen('frontmost-app', (e) => {
        const name = (e.payload as { name: string }).name.toLowerCase();
        const match = profilesRef.current.find(
          (p) => p.autoApp && name.includes(p.autoApp.toLowerCase()),
        );
        if (match && match.id !== activeProfileIdRef.current) {
          handleApplyProfileRef.current(match);
        }
      }).then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      }),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  /** Onboarding: apply a bundled starter profile and save it. */
  const handleApplyStarter = useCallback(
    (starter: StarterProfile) => {
      const { data } = starterToProfileData(starter);
      applyProfileData(data);
      const profile = saveProfile(starter.name, data, { hasMedia: false });
      setActiveProfile(profile.id);
    },
    [applyProfileData, saveProfile, setActiveProfile],
  );

  /** Import a shareable profile file (v3 with media, or legacy config-only). */
  const importProfileFile = useCallback(
    async (file: File, applyAfter: boolean) => {
      const text = await file.text();

      const portable = parsePortableProfile(text);
      if (portable) {
        const profile = saveProfile(portable.name, portable.data, {
          thumbs: portable.thumbs,
          hasMedia: hasMedia(portable.media),
        });
        await saveProfileMedia(profile.id, portable.media);
        if (applyAfter) {
          applyProfileData(portable.data);
          setActiveProfile(profile.id);
          void applyProfileMedia(profile.id);
        }
        return;
      }

      // Legacy formats: plain ProfileData or an export-all bundle
      try {
        const data = await loadProfileFromFile(file);
        const name = file.name.replace(/(\.osdprofile)?\.json$/i, '') || 'Imported profile';
        const profile = saveProfile(name, data);
        if (applyAfter) {
          applyProfileData(data);
          setActiveProfile(profile.id);
        }
      } catch {
        importJson(text);
      }
    },
    [saveProfile, applyProfileData, setActiveProfile, applyProfileMedia, importJson],
  );

  const pickProfileFile = (applyAfter: boolean) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        await importProfileFile(file, applyAfter);
      } catch (err) {
        console.error('Failed to import profile:', err);
      }
    };
    input.click();
  };

  const handleLoadProfile = () => pickProfileFile(true);
  const handleImportProfiles = () => pickProfileFile(false);

  const handleReset = () => {
    checkpoint(false);
    if (device.transportMode === 'simulator') {
      // Full local wipe including simulated SD
      device.device?.resetToDefaults();
    } else {
      // Real hardware: restore defaults over the protocol (mirrored locally)
      for (let i = 0; i < TOTAL_KEYS; i++) {
        const def = defaultKeyForSlot(i);
        device.sendCommand(
          encodeCommand({
            type: 'SET_KEY',
            payload: {
              index: i,
              label: def.label,
              sublabel: def.sublabel,
              hid: def.hid,
              bg: def.bg,
              icon: def.icon,
            },
          }),
        );
      }
    }
    keyActions.reset();
  };

  const handleResetKey = () => {
    if (!device.device || selectedSlot === null) return;
    checkpoint(false);
    const i = selectedSlot;
    const def = defaultKeyForSlot(i);
    device.sendCommand(
      encodeCommand({
        type: 'SET_KEY',
        payload: {
          index: i,
          label: def.label,
          sublabel: def.sublabel,
          hid: def.hid,
          bg: def.bg,
        },
      }),
    );
    device.sendCommand(encodeCommand({ type: 'DRAW', index: i }));
  };

  const handleModeChange = async (mode: 'simulator' | 'webserial') => {
    await device.setTransportMode(mode);
    if (mode === 'simulator') {
      await device.connect();
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Undo/redo work everywhere on the deck view except inside text fields
      if (activeView === 'deck' && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (inField) return; // let the field handle its own undo
        e.preventDefault();
        if (e.shiftKey) void redo();
        else void undo();
        return;
      }

      if (inField) return;

      if (e.key === 'Escape' && device.selectedKey !== null) {
        device.setSelectedKey(null);
        return;
      }

      if (activeView !== 'deck' || deckMode === 'test') return;

      // Copy / paste a key's full identity (config + action + media)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && selectedSlot !== null) {
        if (device.device) {
          copiedKeyRef.current = takeDeckSnapshot(
            device.device,
            keyActionsRef.current,
            multiActionsRef.current,
          ).keys[selectedSlot];
          device.logLocal(`copied key ${(selectedSlot % KEY_COUNT) + 1}`);
        }
        e.preventDefault();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v' && selectedSlot !== null) {
        if (device.device && copiedKeyRef.current) {
          checkpoint(false);
          void pasteKeySlot(
            copiedKeyRef.current,
            selectedSlot,
            device.device,
            keyActionsRef.current,
            multiActionsRef.current,
            deckOps.current,
          );
          device.logLocal(`pasted onto key ${(selectedSlot % KEY_COUNT) + 1}`);
        }
        e.preventDefault();
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const dir = e.key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right';
        const cols = orientation % 2 === 1 ? 3 : 2;
        const next = moveKeySelection(device.selectedKey, dir, cols);
        handleSelectKey(next);
        stageRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeView,
    deckMode,
    device,
    handleSelectKey,
    orientation,
    selectedSlot,
    undo,
    redo,
    checkpoint,
  ]);

  const inspectorOpen = device.selectedKey !== null && activeView === 'deck';

  // Inspector edits register undo checkpoints before hitting the wire.
  // Rapid keystrokes coalesce into one step (see useUndoStack).
  const editSendCommand = useCallback(
    (line: string) => {
      checkpoint();
      device.sendCommand(line);
    },
    [checkpoint, device],
  );
  const editSendSetImage = useCallback(
    (index: number, rgb565: Uint8Array) => {
      checkpoint(false);
      return device.sendSetImage(index, rgb565);
    },
    [checkpoint, device],
  );
  const editSendAnimation = useCallback(
    (
      index: number,
      frames: Uint8Array[],
      fps: number,
      onProgress?: (done: number, total: number) => void,
    ) => {
      checkpoint(false);
      return device.sendAnimation(index, frames, fps, onProgress);
    },
    [checkpoint, device],
  );
  const editDeleteSdPath = useCallback(
    (path: string) => {
      checkpoint(false);
      return device.deleteSdPath(path);
    },
    [checkpoint, device],
  );
  const assignNotifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editActionChange = useCallback(
    (
      level: Parameters<typeof keyActions.setAction>[1],
      a: Parameters<typeof keyActions.setAction>[2],
    ) => {
      checkpoint();
      keyActions.setAction(selectedSlot!, level, a);
      // Plugin actions own their key's look — let the plugin paint it.
      // Debounced so typing in a settings field repaints once, not per key.
      if (a?.type === 'plugin' && a.plugin) {
        const { plugin, settings } = a;
        const slot = selectedSlot!;
        if (assignNotifyTimer.current) clearTimeout(assignNotifyTimer.current);
        assignNotifyTimer.current = setTimeout(() => {
          void pluginHost.notifyAssigned(plugin, settings, slot);
        }, 500);
      }
    },
    [checkpoint, keyActions, selectedSlot],
  );

  return (
    <div className={`app-shell ${inspectorOpen ? 'inspector-open' : ''}`}>
      {onboarding && (
        <Onboarding
          usbConnected={device.transportMode === 'webserial' && connected}
          simulatorReady={device.transportMode === 'simulator' && connected}
          onApplyStarter={handleApplyStarter}
          onDone={() => setOnboarding(false)}
        />
      )}
      {celebration && (
        <div className="celebration-layer" aria-hidden>
          <Confetti />
          <div className="celebration-text">{celebration}</div>
        </div>
      )}
      {pluginUpdates && !onboarding && (
        <PluginUpdatePrompt updates={pluginUpdates} onClose={() => setPluginUpdates(null)} />
      )}
      <IconRail
        activeView={activeView}
        onViewChange={handleViewChange}
        connected={connected}
        fwVersion={fwVersion}
        onSecret={() => celebrate('You found the secret. The deck salutes you.')}
      />

      <Sidebar
        activeView={activeView}
        transportMode={device.transportMode}
        connectionState={device.connectionState}
        webSerialSupported={device.webSerialSupported}
        fwVersion={fwVersion}
        miniKeyColors={miniKeyColors}
        profileCount={profiles.length}
        activeProfile={(() => {
          const p = profiles.find((x) => x.id === activeProfileId);
          return p
            ? {
                name: p.name,
                pages: Math.max(1, Math.ceil(p.data.keys.length / 6)),
                updatedAt: p.updatedAt,
                hasMedia: !!p.hasMedia,
              }
            : null;
        })()}
        mediaStats={(() => {
          const media = device.device?.getState().media ?? [];
          return {
            icons: media.filter((m) => m.hasIcon).length,
            anims: media.filter((m) => m.animFrames > 0).length,
          };
        })()}
        showTxFilter={showTx}
        showRxFilter={showRx}
        onTxFilterChange={setShowTx}
        onRxFilterChange={setShowRx}
        onClearConsole={device.clearConsole}
        onModeChange={handleModeChange}
        onConnect={device.connect}
        onDisconnect={device.disconnect}
        onSaveProfile={handleCreateProfile}
        onLoadProfile={handleLoadProfile}
        onImportProfiles={handleImportProfiles}
        onExportAll={exportAllProfiles}
        onResetDefaults={handleReset}
        onCheckPluginUpdates={async () => {
          const updates = await pluginHost.checkForUpdates();
          if (updates.length > 0) {
            localStorage.removeItem(UPDATE_DISMISS_KEY);
            setPluginUpdates(updates);
          }
          return updates.length;
        }}
        micMuted={micMuted}
        onSimToggleMic={
          device.transportMode === 'simulator' ? () => setMicMuted((m) => !m) : undefined
        }
        orientation={orientation}
        onOrientChange={handleOrientChange}
      />

      <div className="workspace">
        <StageTopbar
          activeView={activeView}
          fwVersion={fwVersion}
          connected={connected}
          connectionLabel={connectionLabel}
        />

        <div className="workspace-body">
          <div
            className={`stage-area ${inspectorOpen ? 'with-inspector' : ''}`}
            ref={stageRef}
            tabIndex={-1}
          >
            <div
              className={`deck-layer ${activeView === 'deck' ? 'visible' : 'hidden'}`}
              aria-hidden={activeView !== 'deck'}
            >
              <DeviceView
                device={device.device}
                selectedKey={device.selectedKey}
                mode={deckMode}
                orientation={orientation}
                inspectorOpen={inspectorOpen}
                usbConnected={device.transportMode === 'webserial' && connected}
                page={deckPage}
                pages={deckPages}
                maxPages={deckMaxPages}
                lastPageDirty={lastPageDirty}
                onPageChange={handlePageChange}
                onAddPage={handleAddPage}
                onRemovePage={handleRemovePage}
                onModeChange={handleDeckModeChange}
                onSelectKey={handleSelectKey}
                onPressKey={handleTestPress}
                onReleaseKey={device.releaseKey}
                onSwapKeys={handleSwapKeys}
                refreshTick={device.refreshTick}
                showHint={showHint && activeView === 'deck' && deckMode === 'edit'}
              />
            </div>

            {activeView !== 'deck' && (
              <div
                className={`view-layer view-${activeView} from-${transitionDir}`}
                key={activeView}
              >
                {activeView === 'profiles' && (
                  <ProfilesView
                    profiles={profiles}
                    activeProfileId={activeProfileId}
                    onApply={handleApplyProfile}
                    onCreateNew={handleCreateProfile}
                    onRename={handleRenameProfile}
                    onSetAutoApp={setAutoApp}
                    onDuplicate={handleDuplicateProfile}
                    onDelete={handleDeleteProfile}
                    onExport={handleExportProfile}
                    onImport={handleImportProfiles}
                    onExportAll={exportAllProfiles}
                    onApplyStarter={handleApplyStarter}
                  />
                )}
                {activeView === 'plugins' && <PluginsView />}
                {activeView === 'storage' && (
                  <StorageView
                    connected={connected}
                    listSdDir={device.listSdDir}
                    deleteSdPath={device.deleteSdPath}
                    fetchSdInfo={device.fetchSdInfo}
                  />
                )}
                {activeView === 'console' && (
                  <ConsoleView
                    entries={device.consoleEntries}
                    showTx={showTx}
                    showRx={showRx}
                    onClear={device.clearConsole}
                  />
                )}
                {activeView === 'settings' && (
                  <SettingsView
                    deviceFw={fwVersion}
                    usbConnected={device.transportMode === 'webserial' && connected}
                  />
                )}
              </div>
            )}
          </div>

          {inspectorOpen && selectedSlot !== null && (
            <KeyInspector
              keyIndex={selectedSlot}
              device={device.device}
              onTestAction={() => handleTestPress(selectedSlot % KEY_COUNT)}
              action={
                keyActions.actions[selectedSlot] ?? {
                  type: 'hid',
                  code: defaultKeyForSlot(selectedSlot).hid,
                }
              }
              actionDouble={keyActions.double[selectedSlot] ?? null}
              actionTriple={keyActions.triple[selectedSlot] ?? null}
              onActionChange={editActionChange}
              onSendCommand={editSendCommand}
              onSendSetImage={editSendSetImage}
              onSendAnimation={editSendAnimation}
              onDeleteSdPath={editDeleteSdPath}
              onClose={() => device.setSelectedKey(null)}
              onResetKey={handleResetKey}
              refreshTick={device.refreshTick}
            />
          )}
        </div>

        <ConsoleDrawer
          open={consoleOpen}
          entries={device.consoleEntries}
          showTx={showTx}
          showRx={showRx}
          onClear={device.clearConsole}
          onCollapse={() => setConsoleOpen(false)}
        />

        <StatusBar
          connectionLabel={connectionLabel}
          connected={connected}
          deviceLabel="Open Screen Deck · 6 keys"
          txCount={txCount}
          rxCount={rxCount}
          consoleOpen={consoleOpen}
          onToggleConsole={() => setConsoleOpen((o) => !o)}
        />
      </div>
    </div>
  );
}

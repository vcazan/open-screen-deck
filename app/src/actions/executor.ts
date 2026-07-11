/**
 * Action execution — native via the Tauri backend when available,
 * logged (dry-run) in the browser/simulator.
 */

import { isTauri } from '../transport/TauriSerialTransport';
import { obsClient } from '../integrations/obs';
import { pluginHost } from '../plugins/host';
import { describeAction, type KeyAction } from './types';

export interface ExecuteContext {
  /** Write a line to the app's protocol console (simulator dry-runs, errors). */
  log: (line: string) => void;
  /** Simulator-only mic state toggle so the UX is testable without hardware. */
  simToggleMic?: () => void;
  /** Key slot that fired the action (plugins can paint their own key). */
  slot?: number;
}

export async function executeAction(action: KeyAction, ctx: ExecuteContext): Promise<void> {
  // OBS actions run from the webview in every environment (plain WebSocket)
  if (action.type === 'obs_scene') {
    if (!action.scene) return;
    try {
      await obsClient.setScene(action.scene);
      ctx.log(`action: OBS scene → ${action.scene}`);
    } catch (err) {
      ctx.log(`action failed: OBS — ${err instanceof Error ? err.message : 'not connected'}`);
    }
    return;
  }

  // HID is executed by the firmware itself (or suppressed in companion mode
  // and re-sent natively below when running in Tauri).
  if (action.type === 'hid') return;

  // Page switching is firmware-owned (reserved HID codes) — by the time the
  // key event reaches us, the device has already flipped its page.
  if (action.type === 'page' || action.type === 'page_next') return;

  // Tile presses are handled by the tile scheduler (timer start/stop) in App
  if (action.type === 'tile') return;

  // Plugin actions run inside the webview via the plugin host
  if (action.type === 'plugin') {
    await pluginHost.execute(action.plugin, action.settings, ctx.slot ?? 0);
    return;
  }

  if (!isTauri()) {
    if (action.type === 'mic_mute' && ctx.simToggleMic) {
      ctx.simToggleMic();
      ctx.log('action (simulated): toggle mic mute');
      return;
    }
    ctx.log(`action (dry-run, needs companion app): ${describeAction(action)}`);
    return;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('execute_action', { action: toRustAction(action) });
    ctx.log(`action: ${describeAction(action)}`);
  } catch (err) {
    ctx.log(`action failed: ${describeAction(action)} — ${String(err)}`);
  }
}

/** Strip UI-only fields (faces) and map to the Rust enum shape. */
function toRustAction(action: KeyAction): Record<string, unknown> {
  switch (action.type) {
    case 'mic_mute':
      return { type: 'mic_mute' };
    case 'multi':
      return {
        type: 'multi',
        steps: action.steps.map(toRustAction),
        delay_ms: action.delay_ms ?? 150,
      };
    case 'obs_scene':
      return { type: 'obs', request: { scene: action.scene } };
    default:
      return action as unknown as Record<string, unknown>;
  }
}

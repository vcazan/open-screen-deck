/**
 * Diagnostics tracing into the packaged app's debug log
 * ($TMPDIR/osd-companion-debug.log). No-op outside the desktop shell.
 */

function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function dbgTrace(msg: string): void {
  if (!inTauri()) return;
  void import('@tauri-apps/api/core').then(({ invoke }) =>
    invoke('debug_log', { msg }).catch(() => {}),
  );
}

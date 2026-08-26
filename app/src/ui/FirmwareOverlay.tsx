import { Button } from './components/Button';
import type { FlashState } from '../hooks/useFirmwareUpdate';

interface FirmwareOverlayProps {
  flash: FlashState;
  stuckInBootloader: boolean;
  recovering: boolean;
  usbConnected: boolean;
  onRecover: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}

function friendlyError(message: string): string {
  return message.replace(/^Error:\s*/i, '').replace(/"/g, '');
}

export function FirmwareOverlay({
  flash,
  stuckInBootloader,
  recovering,
  usbConnected,
  onRecover,
  onRetry,
  onDismiss,
}: FirmwareOverlayProps) {
  const flashing = flash.phase === 'flashing';
  if (!flashing && !stuckInBootloader && flash.phase !== 'done' && flash.phase !== 'error') {
    return null;
  }

  const title = flashing
    ? 'Updating firmware'
    : flash.phase === 'done'
      ? 'Firmware updated'
      : flash.phase === 'error'
        ? 'Update didn’t finish'
        : 'Bootloader mode';

  const percent = flashing ? flash.percent : flash.phase === 'done' ? 100 : 0;

  return (
    <div
      className={`fw-overlay ${flash.phase} ${stuckInBootloader && !flashing ? 'bootloader' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="fw-overlay-sheet">
        <header className="fw-overlay-head">
          <div>
            <p className="fw-overlay-kicker">
              {flashing ? 'Keep USB plugged in' : stuckInBootloader ? 'Deck waiting' : 'Firmware'}
            </p>
            <h2 className="fw-overlay-title">{title}</h2>
          </div>
          {!flashing && !stuckInBootloader && (
            <button type="button" className="fw-overlay-dismiss" onClick={onDismiss} aria-label="Dismiss">
              ×
            </button>
          )}
        </header>

        {flashing && (
          <>
            <div className="fw-overlay-meter">
              <span className="fw-overlay-pct">{percent}%</span>
              <div className="fw-overlay-track" aria-hidden>
                <span className="fw-overlay-fill" style={{ width: `${percent}%` }} />
              </div>
            </div>
            <p className="fw-overlay-stage">{flash.stage}</p>
            <p className="fw-overlay-hint">The keys freeze on BOOT / LOADER until the deck restarts. Don’t unplug.</p>
          </>
        )}

        {stuckInBootloader && flash.phase !== 'flashing' && flash.phase !== 'done' && (
          <>
            <p className="fw-overlay-copy">
              The deck is sitting in its ROM bootloader — usually an interrupted flash. The six
              screens can’t update from here. Recover boots the last firmware so the keys come
              back.
            </p>
            <div className="fw-overlay-actions">
              <Button variant="primary" onClick={onRecover} disabled={recovering}>
                {recovering ? 'Recovering…' : 'Recover deck'}
              </Button>
            </div>
          </>
        )}

        {flash.phase === 'done' && (
          <p className="fw-overlay-copy">
            The deck is restarting on its own. It’ll reconnect in a few seconds.
          </p>
        )}

        {flash.phase === 'error' && (
          <>
            <p className="fw-overlay-copy">{friendlyError(flash.message)}</p>
            <div className="fw-overlay-actions">
              {stuckInBootloader && (
                <Button variant="primary" onClick={onRecover} disabled={recovering}>
                  {recovering ? 'Recovering…' : 'Recover deck'}
                </Button>
              )}
              {usbConnected && (
                <Button variant={stuckInBootloader ? 'ghost' : 'primary'} onClick={onRetry}>
                  Try again
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

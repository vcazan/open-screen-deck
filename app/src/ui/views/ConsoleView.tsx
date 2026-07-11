import { ProtocolLog } from '../shell/StatusBar';
import type { ConsoleEntry } from '../../hooks/useDevice';

interface ConsoleViewProps {
  entries: ConsoleEntry[];
  showTx: boolean;
  showRx: boolean;
  onClear: () => void;
}

export function ConsoleView({ entries, showTx, showRx, onClear }: ConsoleViewProps) {
  return (
    <div className="console-view">
      <ProtocolLog
        entries={entries}
        showTx={showTx}
        showRx={showRx}
        onClear={onClear}
        fullHeight
      />
    </div>
  );
}

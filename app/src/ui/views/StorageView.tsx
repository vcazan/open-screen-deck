import { useCallback, useEffect, useState } from 'react';
import type { SdEntry } from '../../hooks/useDevice';
import { formatBytes } from '../../utils/animation';

interface StorageViewProps {
  connected: boolean;
  listSdDir: (path: string) => Promise<SdEntry[]>;
  deleteSdPath: (path: string) => Promise<void>;
  fetchSdInfo: () => Promise<{ sizeMb: number; usedMb: number } | null>;
}

function joinPath(base: string, name: string): string {
  return base === '/' ? `/${name}` : `${base}/${name}`;
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M3 6a2 2 0 012-2h4l2 3h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function StorageView({ connected, listSdDir, deleteSdPath, fetchSdInfo }: StorageViewProps) {
  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState<SdEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdInfo, setSdInfo] = useState<{ sizeMb: number; usedMb: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = useCallback(
    async (target: string) => {
      setLoading(true);
      setError(null);
      setConfirmDelete(null);
      try {
        const list = await listSdDir(target);
        list.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
        setEntries(list);
        setPath(target);
      } catch (err) {
        setError(
          err instanceof Error && err.message.includes('sd_unmounted')
            ? 'No SD card mounted. Insert a card and refresh.'
            : 'Could not read this folder.',
        );
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [listSdDir],
  );

  useEffect(() => {
    if (!connected) return;
    refresh('/');
    fetchSdInfo().then(setSdInfo).catch(() => setSdInfo(null));
  }, [connected, refresh, fetchSdInfo]);

  const handleDelete = async (entry: SdEntry) => {
    const target = joinPath(path, entry.name);
    if (confirmDelete !== target) {
      setConfirmDelete(target);
      return;
    }
    try {
      await deleteSdPath(target);
    } catch {
      setError(`Could not delete ${entry.name}.`);
    }
    await refresh(path);
    fetchSdInfo().then(setSdInfo).catch(() => {});
  };

  const crumbs = path === '/' ? [''] : path.split('/');
  const usedPct = sdInfo && sdInfo.sizeMb > 0 ? Math.min(100, (sdInfo.usedMb / sdInfo.sizeMb) * 100) : 0;

  return (
    <div className="storage-view">
      <div className="storage-toolbar">
        <nav className="storage-crumbs" aria-label="SD card path">
          {crumbs.map((seg, i) => {
            const target = i === 0 ? '/' : crumbs.slice(0, i + 1).join('/');
            const isLast = i === crumbs.length - 1;
            return (
              <span key={target} className="crumb-wrap">
                <button
                  type="button"
                  className={`crumb ${isLast ? 'current' : ''}`}
                  onClick={() => !isLast && refresh(target)}
                  disabled={isLast}
                >
                  {i === 0 ? 'SD' : seg}
                </button>
                {!isLast && <span className="crumb-sep">/</span>}
              </span>
            );
          })}
        </nav>
        <button type="button" className="storage-refresh" onClick={() => refresh(path)} disabled={loading}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={loading ? 'spinning' : ''}
            aria-hidden
          >
            <path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" />
            <path d="M3 4v4h4" />
          </svg>
          Refresh
        </button>
      </div>

      {sdInfo && (
        <div className="storage-usage">
          <div className="storage-usage-bar">
            <span style={{ width: `${Math.max(usedPct, 0.5)}%` }} />
          </div>
          <span className="storage-usage-label">
            {sdInfo.usedMb} MB of {sdInfo.sizeMb} MB used
          </span>
        </div>
      )}

      {error && <div className="storage-error">{error}</div>}

      {!error && entries.length === 0 && !loading && (
        <div className="storage-empty">
          <FolderIcon />
          <div className="storage-empty-title">Empty folder</div>
          <div className="storage-empty-sub">
            Icons land in /osd/keys/N, animations in /osd/keys/N/anim.
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="storage-list" role="list">
          {entries.map((entry) => {
            const target = joinPath(path, entry.name);
            return (
              <div key={entry.name} className="storage-row" role="listitem">
                <button
                  type="button"
                  className="storage-row-main"
                  onClick={() => entry.dir && refresh(target)}
                  disabled={!entry.dir}
                >
                  <span className={`storage-row-icon ${entry.dir ? 'folder' : ''}`}>
                    {entry.dir ? <FolderIcon /> : <FileIcon />}
                  </span>
                  <span className="storage-row-name">{entry.name}</span>
                  {!entry.dir && (
                    <span className="storage-row-size">{formatBytes(entry.size)}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`storage-row-delete ${confirmDelete === target ? 'confirm' : ''}`}
                  onClick={() => handleDelete(entry)}
                  title={entry.dir ? 'Delete folder' : 'Delete file'}
                >
                  {confirmDelete === target ? 'Confirm?' : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                      <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

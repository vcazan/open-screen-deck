import { useEffect, useRef, useState } from 'react';
import { rgb565ToRgb888 } from '../../protocol/rgb565';
import { Button } from '../components/Button';
import type { StoredProfile } from '../../utils/profileStore';
import { ProfileStore } from '../../utils/profileStore';
import { STARTER_PROFILES, type StarterProfile } from '../../assets/starterProfiles';

interface ProfilesViewProps {
  profiles: StoredProfile[];
  activeProfileId: string | null;
  onApply: (profile: StoredProfile) => void;
  onCreateNew: () => void;
  onRename: (id: string, name: string) => void;
  onSetAutoApp: (id: string, autoApp: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (profile: StoredProfile) => void;
  onImport: () => void;
  onExportAll: () => void;
  onApplyStarter: (starter: StarterProfile) => void;
}

function bgToCss(color: number): string {
  const { r, g, b } = rgb565ToRgb888(color);
  return `rgb(${r}, ${g}, ${b})`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function ProfileName({
  profile,
  onRename,
}: {
  profile: StoredProfile;
  onRename: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== profile.name) onRename(profile.id, name);
    else setDraft(profile.name);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="profile-name-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(profile.name);
            setEditing(false);
          }
        }}
        maxLength={40}
      />
    );
  }

  return (
    <button
      type="button"
      className="profile-card-name"
      onClick={() => {
        setDraft(profile.name);
        setEditing(true);
      }}
      title="Click to rename"
    >
      {profile.name}
    </button>
  );
}

export function ProfilesView({
  profiles,
  activeProfileId,
  onApply,
  onCreateNew,
  onRename,
  onSetAutoApp,
  onDuplicate,
  onDelete,
  onExport,
  onImport,
  onExportAll,
  onApplyStarter,
}: ProfilesViewProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="profiles-view">
      <div className="profiles-toolbar">
        <Button variant="primary" onClick={onCreateNew}>
          New profile
        </Button>
        <Button onClick={onImport}>Import</Button>
        <Button variant="ghost" onClick={onExportAll}>
          Export all
        </Button>
      </div>

      <p className="profiles-hint">
        A profile is a saved deck layout. The <strong>active</strong> profile keeps itself up to
        date — edit keys on the Deck and the changes are saved into it automatically.
      </p>

      {profiles.length === 0 ? (
        <div className="profiles-empty">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M12 4v16" />
          </svg>
          <div className="profiles-empty-title">No profiles yet</div>
          <div className="profiles-empty-sub">
            "New profile" captures your current deck so you can switch layouts any time.
          </div>
        </div>
      ) : (
        <div className="profiles-grid">
          {profiles.map((profile) => {
            const isActive = profile.id === activeProfileId;
            return (
              <article key={profile.id} className={`profile-card ${isActive ? 'active' : ''}`}>
                {isActive && (
                  <span className="profile-active-badge">
                    <span className="profile-active-dot" aria-hidden />
                    Active · auto-saves
                  </span>
                )}
                {profile.thumbs && profile.thumbs.filter(Boolean).length === 6 ? (
                  <div className="profile-thumb-grid" aria-hidden>
                    {profile.thumbs.map((thumb, i) => (
                      <img key={i} src={thumb} alt="" className="profile-thumb" />
                    ))}
                  </div>
                ) : (
                  <div className="profile-swatch-grid" aria-hidden>
                    {profile.data.keys.slice(0, 6).map((k, i) => (
                      <span key={i} style={{ background: bgToCss(k.bg ?? 0) }} />
                    ))}
                  </div>
                )}
                {profile.hasMedia && (
                  <span className="profile-media-badge">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                    includes media
                  </span>
                )}
                <div className="profile-card-foot">
                  <div className="profile-card-id">
                    <ProfileName profile={profile} onRename={onRename} />
                    <div className="profile-card-meta">
                      {Math.max(1, Math.ceil(profile.data.keys.length / 6))}{' '}
                      {profile.data.keys.length > 6 ? 'pages' : 'page'} · updated{' '}
                      {timeAgo(profile.updatedAt)}
                    </div>
                  </div>
                  {!isActive && (
                    <button
                      type="button"
                      className="profile-apply-btn"
                      onClick={() => onApply(profile)}
                    >
                      Apply
                    </button>
                  )}
                </div>
                <label className="profile-autoapp">
                  <span>Auto-activate for app</span>
                  <input
                    defaultValue={profile.autoApp ?? ''}
                    placeholder="e.g. OBS, Slack — blank = off"
                    onBlur={(e) => onSetAutoApp(profile.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                </label>
                <div className="profile-card-actions">
                  <button
                    type="button"
                    className="profile-minor-btn"
                    onClick={() => onExport(profile)}
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    className="profile-minor-btn"
                    onClick={() => onDuplicate(profile.id)}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className={`profile-minor-btn danger ${confirmDelete === profile.id ? 'confirm' : ''}`}
                    onClick={() => {
                      if (confirmDelete === profile.id) {
                        setConfirmDelete(null);
                        onDelete(profile.id);
                      } else {
                        setConfirmDelete(profile.id);
                      }
                    }}
                    onBlur={() => setConfirmDelete(null)}
                  >
                    {confirmDelete === profile.id ? 'Confirm delete?' : 'Delete'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="profiles-templates">
        <h3>Templates</h3>
        <p className="profiles-hint">
          Ready-made layouts — adding one applies it to the deck and saves it as a new profile.
        </p>
        <div className="profiles-template-grid">
          {STARTER_PROFILES.map((starter) => {
            const firstPage = starter.pages?.[0] ?? starter.keys;
            const pageCount = starter.pages?.length ?? 2;
            return (
              <article key={starter.id} className="profile-template-card">
                <div className="profile-swatch-grid" aria-hidden>
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} style={{ background: bgToCss(firstPage[i]?.bg ?? 0x2965) }} />
                  ))}
                </div>
                <div className="profile-template-info">
                  <span className="profile-template-name">
                    {starter.name}
                    <span className="profile-template-pages">
                      {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                    </span>
                  </span>
                  <span className="profile-template-desc">{starter.description}</span>
                </div>
                <Button onClick={() => onApplyStarter(starter)}>Add</Button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function exportAllProfiles(): void {
  const blob = new Blob([ProfileStore.exportAll()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'osd-profiles.json';
  a.click();
  URL.revokeObjectURL(url);
}

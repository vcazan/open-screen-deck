import { useEffect, useState } from 'react';
import { STARTER_PROFILES, type StarterProfile } from '../assets/starterProfiles';
import { rgb565ToRgb888 } from '../protocol/rgb565';
import { isTauri } from '../transport/TauriSerialTransport';
import { Confetti } from './components/Confetti';

function bg565ToCss(bg: number): string {
  const { r, g, b } = rgb565ToRgb888(bg);
  return `rgb(${r},${g},${b})`;
}

interface OnboardingProps {
  usbConnected: boolean;
  simulatorReady: boolean;
  onApplyStarter: (starter: StarterProfile) => void;
  onDone: () => void;
}

const STEPS = ['welcome', 'permissions', 'profile', 'done'] as const;
type Step = (typeof STEPS)[number];

export const ONBOARDING_KEY = 'osd-onboarding-done';

export function isOnboardingPending(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) !== '1';
}

export function Onboarding({
  usbConnected,
  simulatorReady,
  onApplyStarter,
  onDone,
}: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [axGranted, setAxGranted] = useState<boolean | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const stepIdx = STEPS.indexOf(step);
  const next = () => {
    // The permissions step only exists in the desktop companion
    if (step === 'welcome' && !isTauri()) setStep('profile');
    else setStep(STEPS[Math.min(stepIdx + 1, STEPS.length - 1)]);
  };

  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    onDone();
  };

  // Live Accessibility status while the permissions step is showing
  useEffect(() => {
    if (step !== 'permissions' || !isTauri()) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const check = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        setAxGranted((await invoke('check_accessibility')) as boolean);
      } catch {
        setAxGranted(null);
      }
    };
    void check();
    timer = setInterval(check, 1500);
    return () => clearInterval(timer);
  }, [step]);

  const openAxSettings = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_accessibility_settings');
    } catch {
      // Browser build — nothing to open
    }
  };

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-card" role="dialog" aria-label="Welcome to Open Screen Deck">
        <div className="onboarding-progress" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={`onboarding-dot ${i <= stepIdx ? 'active' : ''}`} />
          ))}
        </div>

        {step === 'welcome' && (
          <div className="onboarding-step">
            <div className="onboarding-hero" aria-hidden>
              <div className="onboarding-minideck">
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            </div>
            <h2>Welcome to Open Screen Deck</h2>
            <p>
              {usbConnected
                ? 'Your deck is connected and ready to configure.'
                : simulatorReady
                  ? 'No deck plugged in — the built-in simulator mirrors real hardware, so everything you set up here transfers when you connect one.'
                  : 'Connect your deck over USB, or explore with the simulator.'}
            </p>
            <div className="onboarding-actions">
              <button type="button" className="onboarding-skip" onClick={finish}>
                Skip setup
              </button>
              <button type="button" className="onboarding-next" onClick={next}>
                Get started
              </button>
            </div>
          </div>
        )}

        {step === 'permissions' && (
          <div className="onboarding-step">
            <h2>One permission</h2>
            <p>
              Hotkey actions and the shortcut recorder need macOS{' '}
              <strong>Accessibility</strong> access. Everything else works without it.
            </p>
            <div className={`onboarding-ax ${axGranted ? 'granted' : ''}`}>
              <span className="onboarding-ax-dot" aria-hidden />
              {axGranted === null
                ? 'Checking…'
                : axGranted
                  ? 'Accessibility granted — you’re all set'
                  : 'Not granted yet'}
            </div>
            <div className="onboarding-actions">
              {!axGranted && (
                <button type="button" className="onboarding-skip" onClick={openAxSettings}>
                  Open System Settings
                </button>
              )}
              <button type="button" className="onboarding-next" onClick={next}>
                {axGranted ? 'Continue' : 'Do this later'}
              </button>
            </div>
          </div>
        )}

        {step === 'profile' && (
          <div className="onboarding-step">
            <h2>Pick a starting point</h2>
            <p>Starter profiles fill your deck with useful keys — change anything later.</p>
            <div className="onboarding-profiles">
              {STARTER_PROFILES.map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  className={`onboarding-profile ${picked === sp.id ? 'picked' : ''}`}
                  onClick={() => setPicked(sp.id)}
                >
                  <span className="onboarding-profile-swatches" aria-hidden>
                    {sp.keys.slice(0, 6).map((k, i) => (
                      <i key={i} style={{ background: k ? bg565ToCss(k.bg) : '#1c2128' }} />
                    ))}
                  </span>
                  <span className="onboarding-profile-name">{sp.name}</span>
                  <span className="onboarding-profile-desc">{sp.description}</span>
                </button>
              ))}
            </div>
            <div className="onboarding-actions">
              <button type="button" className="onboarding-skip" onClick={next}>
                Start from scratch
              </button>
              <button
                type="button"
                className="onboarding-next"
                disabled={!picked}
                onClick={() => {
                  const starter = STARTER_PROFILES.find((s) => s.id === picked);
                  if (starter) onApplyStarter(starter);
                  next();
                }}
              >
                Apply profile
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="onboarding-step onboarding-done">
            <Confetti />
            <h2>You’re all set</h2>
            <p>
              Click any key to configure it. Drag keys to rearrange, ⌘Z to undo — and
              everything works on the deck even with this app closed.
            </p>
            <div className="onboarding-actions">
              <button type="button" className="onboarding-next" onClick={finish}>
                Open my deck
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

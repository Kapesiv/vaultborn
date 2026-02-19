import { render, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { AIStatus } from '../ai/NPCAIManager';

// ── Persistent settings store ──────────────────────────────────
const STORAGE_KEY = 'vaultborn_settings';

export interface GameSettings {
  muted: boolean;
  volume: number;       // 0-1
  sensitivity: number;  // 0.001-0.01
}

const DEFAULTS: GameSettings = {
  muted: false,
  volume: 0.3,
  sensitivity: 0.003,
};

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed };
    }
  } catch { /* ignore corrupt data */ }
  return { ...DEFAULTS };
}

function saveSettings(s: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* storage full or unavailable */ }
}

/** Read saved settings (call once at startup). */
export function getSavedSettings(): GameSettings {
  return loadSettings();
}

// ── Settings menu UI ───────────────────────────────────────────
interface SettingsMenuState {
  visible: boolean;
  settings: GameSettings;
  aiStatus: AIStatus;
  aiProgress: number;
  aiProgressText: string;
}

let setMenuState: ((s: Partial<SettingsMenuState>) => void) | null = null;
let currentState: SettingsMenuState = {
  visible: false,
  settings: loadSettings(),
  aiStatus: 'idle',
  aiProgress: 0,
  aiProgressText: '',
};

function SettingsMenuComponent() {
  const [state, setState] = useState<SettingsMenuState>({
    visible: false,
    settings: loadSettings(),
    aiStatus: 'idle',
    aiProgress: 0,
    aiProgressText: '',
  });

  setMenuState = (partial) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      if (partial.settings) {
        next.settings = { ...prev.settings, ...partial.settings };
      }
      currentState = next;
      return next;
    });
  };

  useEffect(() => {
    currentState = state;
  }, [state]);

  if (!state.visible) return null;

  const { settings } = state;

  const updateSetting = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    const next = { ...settings, [key]: value };
    setMenuState?.({ settings: next });
    saveSettings(next);
    if (key === 'muted') onSoundToggle?.(next.muted);
    if (key === 'volume') onVolumeChange?.(next.volume);
    if (key === 'sensitivity') onSensitivityChange?.(next.sensitivity);
  };

  const btnStyle = {
    background: '#ffd700',
    color: '#000',
    border: 'none',
    padding: '10px 32px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold' as const,
    fontSize: '16px',
    minWidth: '180px',
  };

  const labelStyle = {
    color: '#ccc',
    fontSize: '14px',
    textAlign: 'left' as const,
    width: '100%',
  };

  const sliderContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
  };

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'auto',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'rgba(20,20,30,0.95)',
        border: '2px solid #ffd700',
        borderRadius: '16px',
        padding: '40px 50px',
        textAlign: 'center',
        minWidth: '320px',
      }}>
        <div style={{
          color: '#ffd700',
          fontSize: '32px',
          fontWeight: 'bold',
          letterSpacing: '6px',
          marginBottom: '32px',
        }}>
          PAUSED
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
          <button
            style={btnStyle}
            onClick={() => updateSetting('muted', !settings.muted)}
          >
            Sound: {settings.muted ? 'OFF' : 'ON'}
          </button>

          {!settings.muted && (
            <div style={labelStyle}>
              <div style={{ marginBottom: '4px' }}>Volume: {Math.round(settings.volume * 100)}%</div>
              <div style={sliderContainerStyle}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(settings.volume * 100)}
                  onInput={(e) => updateSetting('volume', (e.target as HTMLInputElement).valueAsNumber / 100)}
                  style={{ flex: 1, accentColor: '#ffd700' }}
                />
              </div>
            </div>
          )}

          <div style={labelStyle}>
            <div style={{ marginBottom: '4px' }}>Mouse Sensitivity: {settings.sensitivity.toFixed(4)}</div>
            <div style={sliderContainerStyle}>
              <input
                type="range"
                min="10"
                max="100"
                value={Math.round(settings.sensitivity * 10000)}
                onInput={(e) => updateSetting('sensitivity', (e.target as HTMLInputElement).valueAsNumber / 10000)}
                style={{ flex: 1, accentColor: '#ffd700' }}
              />
            </div>
          </div>

          {/* AI Brain section */}
          <div style={{
            width: '100%',
            borderTop: '1px solid rgba(255,215,0,0.3)',
            paddingTop: '14px',
            marginTop: '4px',
          }}>
            {state.aiStatus === 'idle' && (
              <button
                style={btnStyle}
                onClick={() => onDownloadAI?.()}
              >
                Download AI Brain
              </button>
            )}

            {state.aiStatus === 'loading' && (
              <div style={{ width: '100%' }}>
                <div style={{ color: '#ccc', fontSize: '13px', marginBottom: '6px', textAlign: 'left' }}>
                  AI Brain: {state.aiProgressText || 'Loading...'}
                </div>
                <div style={{
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  height: '8px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    background: '#ffd700',
                    height: '100%',
                    width: `${Math.round(state.aiProgress * 100)}%`,
                    borderRadius: '4px',
                    transition: 'width 0.3s',
                  }} />
                </div>
                <div style={{ color: '#888', fontSize: '12px', marginTop: '6px' }}>
                  {Math.round(state.aiProgress * 100)}% - First time download, cached for future visits
                </div>
              </div>
            )}

            {state.aiStatus === 'ready' && (
              <div style={{ color: '#4caf50', fontSize: '14px', fontWeight: 'bold' }}>
                AI Brain: Ready
              </div>
            )}
          </div>

          <button
            style={btnStyle}
            onClick={() => hideSettings()}
          >
            Resume
          </button>

          <div style={{ color: '#888', fontSize: '13px', marginTop: '8px' }}>
            Press ESC to resume
          </div>
        </div>
      </div>
    </div>
  );
}

let onSoundToggle: ((muted: boolean) => void) | null = null;
let onVolumeChange: ((volume: number) => void) | null = null;
let onSensitivityChange: ((sensitivity: number) => void) | null = null;
let onResume: (() => void) | null = null;
let onDownloadAI: (() => void) | null = null;
let getAIStatus: (() => AIStatus) | null = null;

export function mountSettingsMenu(
  container: HTMLElement,
  callbacks: {
    onSoundToggle: (muted: boolean) => void;
    onVolumeChange: (volume: number) => void;
    onSensitivityChange: (sensitivity: number) => void;
    onResume: () => void;
    onDownloadAI: () => void;
    getAIStatus: () => AIStatus;
  },
) {
  onSoundToggle = callbacks.onSoundToggle;
  onVolumeChange = callbacks.onVolumeChange;
  onSensitivityChange = callbacks.onSensitivityChange;
  onResume = callbacks.onResume;
  onDownloadAI = callbacks.onDownloadAI;
  getAIStatus = callbacks.getAIStatus;
  const div = document.createElement('div');
  div.id = 'settings-menu-root';
  container.appendChild(div);
  render(<SettingsMenuComponent />, div);
}

export function showSettings() {
  const status = getAIStatus?.() ?? 'idle';
  setMenuState?.({ visible: true, aiStatus: status });
}

export function hideSettings() {
  setMenuState?.({ visible: false });
  onResume?.();
}

export function isSettingsOpen(): boolean {
  return currentState.visible;
}

export function updateAIStatus(status: AIStatus, progress?: number, text?: string) {
  setMenuState?.({
    aiStatus: status,
    ...(progress !== undefined ? { aiProgress: progress } : {}),
    ...(text !== undefined ? { aiProgressText: text } : {}),
  });
}

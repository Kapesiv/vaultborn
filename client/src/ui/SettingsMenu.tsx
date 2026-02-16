import { render, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

interface SettingsMenuState {
  visible: boolean;
  muted: boolean;
}

let setMenuState: ((s: Partial<SettingsMenuState>) => void) | null = null;
let currentState: SettingsMenuState = { visible: false, muted: false };

function SettingsMenuComponent() {
  const [state, setState] = useState<SettingsMenuState>({ visible: false, muted: false });

  setMenuState = (partial) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      currentState = next;
      return next;
    });
  };

  useEffect(() => {
    currentState = state;
  }, [state]);

  if (!state.visible) return null;

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
            onClick={() => {
              setMenuState?.({ muted: !state.muted });
              onSoundToggle?.(!state.muted);
            }}
          >
            Sound: {state.muted ? 'OFF' : 'ON'}
          </button>

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
let onResume: (() => void) | null = null;

export function mountSettingsMenu(
  container: HTMLElement,
  callbacks: { onSoundToggle: (muted: boolean) => void; onResume: () => void },
) {
  onSoundToggle = callbacks.onSoundToggle;
  onResume = callbacks.onResume;
  const div = document.createElement('div');
  div.id = 'settings-menu-root';
  container.appendChild(div);
  render(<SettingsMenuComponent />, div);
}

export function showSettings() {
  setMenuState?.({ visible: true });
}

export function hideSettings() {
  setMenuState?.({ visible: false });
  onResume?.();
}

export function isSettingsOpen(): boolean {
  return currentState.visible;
}

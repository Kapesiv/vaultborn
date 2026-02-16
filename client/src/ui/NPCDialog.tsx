import { render, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

interface NPCDialogState {
  npcName: string;
  lines: string[];
  visible: boolean;
}

let setDialogState: ((state: NPCDialogState) => void) | null = null;

function NPCDialogComponent() {
  const [state, setState] = useState<NPCDialogState>({ npcName: '', lines: [], visible: false });
  const [lineIndex, setLineIndex] = useState(0);

  setDialogState = (s) => {
    setState(s);
    setLineIndex(0);
  };

  if (!state.visible || !state.lines.length) return null;

  const currentLine = state.lines[lineIndex];
  const isLast = lineIndex >= state.lines.length - 1;

  return (
    <div style={{
      position: 'absolute',
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.85)',
      border: '2px solid #ffd700',
      borderRadius: '12px',
      padding: '20px 30px',
      maxWidth: '600px',
      width: '90%',
      pointerEvents: 'auto',
    }}>
      <div style={{ color: '#ffd700', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
        {state.npcName}
      </div>
      <div style={{ color: '#eee', fontSize: '15px', lineHeight: '1.5', marginBottom: '12px' }}>
        {currentLine}
      </div>
      <div style={{ textAlign: 'right' }}>
        {!isLast ? (
          <button
            onClick={() => setLineIndex(i => i + 1)}
            style={{
              background: '#ffd700', color: '#000', border: 'none',
              padding: '6px 20px', borderRadius: '4px', cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => setState(s => ({ ...s, visible: false }))}
            style={{
              background: '#666', color: '#fff', border: 'none',
              padding: '6px 20px', borderRadius: '4px', cursor: 'pointer',
            }}
          >
            Close [ESC]
          </button>
        )}
      </div>
    </div>
  );
}

export function mountNPCDialog(container: HTMLElement) {
  const dialogDiv = document.createElement('div');
  dialogDiv.id = 'npc-dialog-root';
  container.appendChild(dialogDiv);
  render(<NPCDialogComponent />, dialogDiv);
}

export function showNPCDialog(npcName: string, lines: string[]) {
  setDialogState?.({ npcName, lines, visible: true });
}

export function hideNPCDialog() {
  setDialogState?.({ npcName: '', lines: [], visible: false });
}

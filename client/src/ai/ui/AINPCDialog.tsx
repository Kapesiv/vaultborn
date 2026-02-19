import { render, h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';

interface ChatMessage {
  role: 'player' | 'npc';
  text: string;
  streaming?: boolean;
}

interface AINPCDialogState {
  visible: boolean;
  npcName: string;
  messages: ChatMessage[];
  inputEnabled: boolean;
}

const INITIAL_STATE: AINPCDialogState = {
  visible: false,
  npcName: '',
  messages: [],
  inputEnabled: true,
};

let setState: ((updater: (s: AINPCDialogState) => AINPCDialogState) => void) | null = null;
let onPlayerSend: ((text: string) => void) | null = null;

function AINPCDialogComponent() {
  const [state, setStateLocal] = useState<AINPCDialogState>(INITIAL_STATE);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  setState = setStateLocal;

  useEffect(() => {
    if (state.visible && state.inputEnabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state.visible, state.inputEnabled]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [state.messages]);

  if (!state.visible) return null;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || !input.value.trim() || !state.inputEnabled) return;
    const text = input.value.trim();
    input.value = '';
    onPlayerSend?.(text);
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.9)',
      border: '2px solid #ffd700',
      borderRadius: '12px',
      padding: '16px 20px',
      maxWidth: '600px',
      width: '90%',
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '400px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
        paddingBottom: '8px',
        borderBottom: '1px solid rgba(255,215,0,0.3)',
      }}>
        <div style={{ color: '#ffd700', fontSize: '16px', fontWeight: 'bold' }}>
          {state.npcName}
        </div>
        <div style={{ color: '#888', fontSize: '12px' }}>ESC to close</div>
      </div>

      {/* Messages */}
      <div
        ref={messagesRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          marginBottom: '10px',
          minHeight: '80px',
          maxHeight: '250px',
        }}
      >
        {state.messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: '8px',
              textAlign: msg.role === 'player' ? 'right' : 'left',
            }}
          >
            <span style={{
              display: 'inline-block',
              background: msg.role === 'player'
                ? 'rgba(100,150,255,0.2)'
                : 'rgba(255,215,0,0.1)',
              border: msg.role === 'player'
                ? '1px solid rgba(100,150,255,0.3)'
                : '1px solid rgba(255,215,0,0.2)',
              borderRadius: '8px',
              padding: '6px 12px',
              maxWidth: '85%',
              color: msg.role === 'player' ? '#cde' : '#eee',
              fontSize: '14px',
              lineHeight: '1.4',
            }}>
              {msg.text}
              {msg.streaming && (
                <span style={{ opacity: 0.5 }}>|</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={state.inputEnabled ? 'Type a message...' : 'Waiting for response...'}
          disabled={!state.inputEnabled}
          onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
          onKeyUp={(e: KeyboardEvent) => e.stopPropagation()}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,215,0,0.3)',
            borderRadius: '6px',
            padding: '8px 12px',
            color: '#eee',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!state.inputEnabled}
          style={{
            background: state.inputEnabled ? '#ffd700' : '#555',
            color: '#000',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: state.inputEnabled ? 'pointer' : 'default',
            fontWeight: 'bold',
            fontSize: '14px',
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

export function mountAINPCDialog(container: HTMLElement) {
  const div = document.createElement('div');
  div.id = 'ai-npc-dialog-root';
  container.appendChild(div);
  render(<AINPCDialogComponent />, div);
}

export function showAINPCDialog(npcName: string, greeting: string, sendHandler: (text: string) => void) {
  onPlayerSend = sendHandler;
  const messages: ChatMessage[] = greeting
    ? [{ role: 'npc', text: greeting }]
    : [];
  setState?.(() => ({
    visible: true,
    npcName,
    messages,
    inputEnabled: true,
  }));
}

export function hideAINPCDialog() {
  onPlayerSend = null;
  setState?.(() => INITIAL_STATE);
}

export function isAINPCDialogVisible(): boolean {
  let visible = false;
  setState?.((s) => {
    visible = s.visible;
    return s;
  });
  return visible;
}

export function addPlayerMessage(text: string) {
  setState?.((s) => ({
    ...s,
    messages: [...s.messages, { role: 'player', text }],
    inputEnabled: false,
  }));
}

export function startNPCStreaming() {
  setState?.((s) => ({
    ...s,
    messages: [...s.messages, { role: 'npc', text: '', streaming: true }],
  }));
}

export function appendNPCToken(token: string) {
  setState?.((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'npc' && last.streaming) {
      msgs[msgs.length - 1] = { ...last, text: last.text + token };
    }
    return { ...s, messages: msgs };
  });
}

export function finishNPCStreaming() {
  setState?.((s) => {
    const msgs = [...s.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'npc' && last.streaming) {
      msgs[msgs.length - 1] = { ...last, streaming: false };
    }
    return { ...s, messages: msgs, inputEnabled: true };
  });
}

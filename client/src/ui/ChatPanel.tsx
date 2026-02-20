import { render, h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';

interface ChatMessage {
  name: string;
  message: string;
  self?: boolean;
  timestamp: number;
}

const MAX_MESSAGES = 50;
const FADE_AFTER_MS = 8000;

let addMessageFn: ((msg: ChatMessage) => void) | null = null;
let focusChatFn: (() => void) | null = null;

export function addChatMessage(name: string, message: string, self = false) {
  addMessageFn?.({ name, message, self, timestamp: Date.now() });
}

export function focusChat() {
  focusChatFn?.();
}

interface ChatPanelProps {
  onSend: (message: string) => void;
}

function ChatPanelComponent({ onSend }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    addMessageFn = (msg) => {
      setMessages((prev) => {
        const next = [...prev, msg];
        return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
      });
    };
    focusChatFn = () => {
      setFocused(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    return () => {
      addMessageFn = null;
      focusChatFn = null;
    };
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Tick for fading
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      onSend(trimmed);
      addChatMessage('', trimmed, true);
    }
    setInputValue('');
    setFocused(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setInputValue('');
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  const visibleMessages = focused
    ? messages
    : messages.filter((m) => now - m.timestamp < FADE_AFTER_MS);

  return (
    <div style={{
      position: 'absolute',
      bottom: '10px',
      left: '10px',
      width: '360px',
      pointerEvents: focused ? 'auto' : 'none',
      zIndex: 100,
    }}>
      {/* Message list */}
      <div
        ref={listRef}
        style={{
          maxHeight: '200px',
          overflowY: focused ? 'auto' : 'hidden',
          marginBottom: '4px',
          pointerEvents: focused ? 'auto' : 'none',
        }}
      >
        {visibleMessages.map((msg, i) => {
          const age = now - msg.timestamp;
          const opacity = focused ? 1 : Math.max(0, 1 - (age - FADE_AFTER_MS * 0.6) / (FADE_AFTER_MS * 0.4));
          return (
            <div
              key={`${msg.timestamp}-${i}`}
              style={{
                fontSize: '13px',
                color: msg.self ? '#aaddff' : '#fff',
                textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
                padding: '2px 6px',
                background: focused ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)',
                borderRadius: '3px',
                marginBottom: '1px',
                opacity,
                transition: 'opacity 0.3s',
                wordBreak: 'break-word',
              }}
            >
              {msg.self ? (
                <span><span style={{ color: '#88ccff', fontWeight: 'bold' }}>You</span>: {msg.message}</span>
              ) : (
                <span><span style={{ color: '#ffd700', fontWeight: 'bold' }}>{msg.name}</span>: {msg.message}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Input */}
      {focused ? (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          maxLength={200}
          placeholder="Type a message..."
          onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setTimeout(() => {
              setFocused(false);
              setInputValue('');
            }, 100);
          }}
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: '13px',
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '4px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <div style={{
          fontSize: '11px',
          color: 'rgba(255,255,255,0.4)',
          padding: '2px 6px',
          pointerEvents: 'auto',
          cursor: 'pointer',
        }}
          onClick={() => focusChat()}
        >
          Press Enter to chat
        </div>
      )}
    </div>
  );
}

let onSendCallback: ((message: string) => void) | null = null;

export function mountChatPanel(container: HTMLElement, onSend: (message: string) => void) {
  onSendCallback = onSend;
  const root = document.createElement('div');
  root.id = 'chat-panel-root';
  container.appendChild(root);
  render(<ChatPanelComponent onSend={onSend} />, root);
}

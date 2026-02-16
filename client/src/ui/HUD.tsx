import { render, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

interface HUDProps {
  getState: () => HUDState | null;
}

export interface HUDState {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  level: number;
  xp: number;
  xpToNext: number;
  gold: number;
  playerCount: number;
  roomType: string;
  fps: number;
}

function HUDComponent({ getState }: HUDProps) {
  const [state, setState] = useState<HUDState | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setState(getState());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  if (!state) return null;

  const hpPercent = (state.hp / state.maxHp) * 100;
  const manaPercent = (state.mana / state.maxMana) * 100;
  const xpPercent = (state.xp / state.xpToNext) * 100;

  return (
    <div style={{
      position: 'absolute', top: '10px', left: '10px',
      background: 'rgba(0,0,0,0.7)', padding: '12px', borderRadius: '8px',
      minWidth: '200px', pointerEvents: 'none',
    }}>
      <div style={{ fontSize: '14px', color: '#ffd700', marginBottom: '8px' }}>
        Lv.{state.level} | {state.roomType.toUpperCase()} | Gold: {state.gold}
      </div>

      {/* HP Bar */}
      <div style={{ marginBottom: '4px' }}>
        <div style={{ fontSize: '11px', color: '#ccc' }}>HP</div>
        <div style={{ background: '#333', height: '16px', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            width: `${hpPercent}%`, height: '100%',
            background: hpPercent > 50 ? '#44bb44' : hpPercent > 25 ? '#bbbb44' : '#bb4444',
            transition: 'width 0.2s',
          }} />
        </div>
        <div style={{ fontSize: '10px', color: '#aaa', textAlign: 'right' }}>{state.hp}/{state.maxHp}</div>
      </div>

      {/* Mana Bar */}
      <div style={{ marginBottom: '4px' }}>
        <div style={{ fontSize: '11px', color: '#ccc' }}>MP</div>
        <div style={{ background: '#333', height: '12px', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            width: `${manaPercent}%`, height: '100%',
            background: '#4488cc',
            transition: 'width 0.2s',
          }} />
        </div>
        <div style={{ fontSize: '10px', color: '#aaa', textAlign: 'right' }}>{state.mana}/{state.maxMana}</div>
      </div>

      {/* XP Bar */}
      <div style={{ marginBottom: '4px' }}>
        <div style={{ fontSize: '11px', color: '#ccc' }}>XP</div>
        <div style={{ background: '#333', height: '8px', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            width: `${xpPercent}%`, height: '100%',
            background: '#aa44cc',
          }} />
        </div>
      </div>

      {/* Info */}
      <div style={{ fontSize: '11px', color: '#888', marginTop: '6px' }}>
        Players: {state.playerCount} | FPS: {state.fps}
      </div>
    </div>
  );
}

export function mountHUD(container: HTMLElement, getState: () => HUDState | null) {
  render(<HUDComponent getState={getState} />, container);
}

import { render, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { MELEE_SKILL_TREE, MAX_HOTBAR_SLOTS } from '@saab/shared';
import { skillManager } from '../systems/SkillManager.js';

function SkillHotbarComponent() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = skillManager.subscribe(() => setTick(t => t + 1));
    // Poll cooldowns for smooth countdown display
    const interval = setInterval(() => setTick(t => t + 1), 100);
    return () => { unsub(); clearInterval(interval); };
  }, []);

  const hotbar = skillManager.getHotbar();
  const slots: (string | null)[] = [];
  for (let i = 0; i < MAX_HOTBAR_SLOTS; i++) {
    const entry = hotbar.find(h => h.slot === i);
    slots.push(entry?.skillId || null);
  }

  // Don't render if no skills allocated
  if (skillManager.getAllocations().length === 0) return null;

  return (
    <div style={{
      position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: '4px', pointerEvents: 'none',
    }}>
      {slots.map((skillId, idx) => {
        const node = skillId ? MELEE_SKILL_TREE.find(n => n.id === skillId) : null;
        const cdRemaining = skillId ? skillManager.getCooldownRemaining(skillId) : 0;
        const cdTotal = node?.effects[0]?.cooldown || 1;
        const cdPercent = cdRemaining > 0 ? (cdRemaining / cdTotal) * 100 : 0;

        return (
          <div key={idx} style={{
            width: '52px', height: '52px', position: 'relative',
            background: 'rgba(0,0,0,0.75)', border: `1px solid ${node ? '#666' : '#333'}`,
            borderRadius: '6px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {/* Hotkey label */}
            <div style={{
              position: 'absolute', top: '2px', left: '4px',
              fontSize: '9px', color: '#888', zIndex: 2,
            }}>{idx + 1}</div>

            {/* Skill name or empty */}
            {node ? (
              <div style={{
                fontSize: '9px', color: cdRemaining > 0 ? '#777' : '#ddd',
                textAlign: 'center', padding: '2px', zIndex: 2,
                lineHeight: '1.1',
              }}>
                {node.name}
              </div>
            ) : (
              <div style={{ fontSize: '18px', color: '#333', zIndex: 2 }}>-</div>
            )}

            {/* Mana cost */}
            {node?.effects[0]?.manaCost && (
              <div style={{
                position: 'absolute', bottom: '2px', left: '4px',
                fontSize: '8px', color: '#4488cc', zIndex: 2,
              }}>
                {node.effects[0].manaCost}
              </div>
            )}

            {/* Cooldown overlay */}
            {cdRemaining > 0 && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: `${cdPercent}%`,
                background: 'rgba(0,0,0,0.6)', borderRadius: '6px 6px 0 0',
                zIndex: 1,
              }} />
            )}
            {cdRemaining > 0 && (
              <div style={{
                position: 'absolute', bottom: '2px', right: '4px',
                fontSize: '10px', color: '#ff8800', fontWeight: 'bold', zIndex: 2,
              }}>
                {cdRemaining.toFixed(1)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function mountSkillHotbar(container: HTMLElement) {
  const div = document.createElement('div');
  div.id = 'skill-hotbar-root';
  container.appendChild(div);
  render(<SkillHotbarComponent />, div);
}

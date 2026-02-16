import { render, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { ITEM_DEFS, RARITY_COLORS, INVENTORY_MAX_SLOTS, type ItemInstance } from '@saab/shared';
import { inventoryManager } from '../systems/InventoryManager.js';

interface InvState {
  visible: boolean;
}

let setInvState: ((s: InvState | ((prev: InvState) => InvState)) => void) | null = null;

function InventoryPanelComponent() {
  const [state, setState] = useState<InvState>({ visible: false });
  const [hover, setHover] = useState<string | null>(null);
  const [, setTick] = useState(0);

  setInvState = setState;

  useEffect(() => {
    return inventoryManager.subscribe(() => setTick((t) => t + 1));
  }, []);

  if (!state.visible) return null;

  const items = inventoryManager.getItems();
  const gold = inventoryManager.getGold();
  const cols = 6;
  const rows = 5;
  const totalSlots = cols * rows;

  // Build slot array
  const slots: (ItemInstance | null)[] = [];
  for (let i = 0; i < totalSlots; i++) {
    slots.push(items[i] || null);
  }

  const hoveredItem = hover ? items.find((i) => i.instanceId === hover) : null;
  const hoveredDef = hoveredItem ? ITEM_DEFS[hoveredItem.defId] : null;

  return (
    <div style={{
      position: 'absolute', top: '50%', right: '20px', transform: 'translateY(-50%)',
      background: 'rgba(15,10,5,0.95)', border: '2px solid #555',
      borderRadius: '12px', padding: '16px', pointerEvents: 'auto',
      width: '280px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ color: '#ccc', fontSize: '14px', fontWeight: 'bold' }}>
          Inventory
        </div>
        <div style={{ color: '#ffd700', fontSize: '13px' }}>
          Gold: {gold}
        </div>
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '3px',
      }}>
        {slots.map((item, idx) => {
          const def = item ? ITEM_DEFS[item.defId] : null;
          const rarityColor = item ? RARITY_COLORS[item.rarity] : '#333';
          return (
            <div
              key={idx}
              onMouseEnter={() => item && setHover(item.instanceId)}
              onMouseLeave={() => setHover(null)}
              style={{
                width: '40px', height: '40px',
                background: item ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${item ? rarityColor : '#333'}`,
                borderRadius: '4px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', position: 'relative', cursor: item ? 'pointer' : 'default',
              }}
            >
              {def && (
                <div style={{
                  fontSize: '10px', color: rarityColor, textAlign: 'center',
                  lineHeight: '1.1', overflow: 'hidden', padding: '2px',
                  userSelect: 'none',
                }}>
                  {def.icon === 'health_potion' ? 'HP' :
                   def.type === 'weapon' ? 'WPN' :
                   def.type === 'material' ? 'MAT' :
                   def.slot === 'head' ? 'HLM' :
                   def.slot === 'chest' ? 'CHT' :
                   def.slot === 'legs' ? 'LEG' :
                   def.slot === 'feet' ? 'BOT' : '?'}
                </div>
              )}
              {item && (item.quantity || 1) > 1 && (
                <div style={{
                  position: 'absolute', bottom: '1px', right: '2px',
                  fontSize: '9px', color: '#fff', textShadow: '0 0 2px #000',
                }}>
                  {item.quantity}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Slots counter */}
      <div style={{ color: '#666', fontSize: '11px', marginTop: '6px', textAlign: 'right' }}>
        {items.length}/{INVENTORY_MAX_SLOTS}
      </div>

      {/* Tooltip */}
      {hoveredItem && hoveredDef && (
        <div style={{
          marginTop: '8px', padding: '8px',
          background: 'rgba(0,0,0,0.8)', borderRadius: '6px',
          border: `1px solid ${RARITY_COLORS[hoveredItem.rarity]}`,
        }}>
          <div style={{ color: RARITY_COLORS[hoveredItem.rarity], fontSize: '13px', fontWeight: 'bold' }}>
            {hoveredDef.name}
          </div>
          <div style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
            {hoveredItem.rarity} {hoveredDef.type}
          </div>
          <div style={{ color: '#aaa', fontSize: '11px' }}>
            {hoveredDef.description}
          </div>
          {hoveredDef.baseDamage && (
            <div style={{ color: '#cc8844', fontSize: '11px', marginTop: '2px' }}>
              Damage: {hoveredDef.baseDamage}
            </div>
          )}
          {hoveredDef.baseArmor && (
            <div style={{ color: '#4488cc', fontSize: '11px', marginTop: '2px' }}>
              Armor: {hoveredDef.baseArmor}
            </div>
          )}
          {hoveredItem.bonusStats.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              {hoveredItem.bonusStats.map((bs, i) => (
                <div key={i} style={{ color: '#44cc44', fontSize: '11px' }}>
                  +{bs.value} {bs.stat}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function mountInventoryPanel(container: HTMLElement) {
  const div = document.createElement('div');
  div.id = 'inventory-panel-root';
  container.appendChild(div);
  render(<InventoryPanelComponent />, div);
}

export function toggleInventoryPanel() {
  setInvState?.((prev: InvState) => ({ visible: !prev.visible }));
}

export function hideInventoryPanel() {
  setInvState?.({ visible: false });
}

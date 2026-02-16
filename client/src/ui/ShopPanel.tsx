import { render, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { BLACKSMITH_SHOP, ITEM_DEFS, RARITY_COLORS, type ShopEntry } from '@saab/shared';
import { inventoryManager } from '../systems/InventoryManager.js';
import { shopBuy, shopSell } from '../network/actions.js';

interface ShopState {
  visible: boolean;
}

let setShopState: ((s: ShopState) => void) | null = null;

function ShopPanelComponent() {
  const [state, setState] = useState<ShopState>({ visible: false });
  const [, setTick] = useState(0);

  setShopState = setState;

  useEffect(() => {
    return inventoryManager.subscribe(() => setTick((t) => t + 1));
  }, []);

  if (!state.visible) return null;

  const gold = inventoryManager.getGold();
  const items = inventoryManager.getItems();

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      background: 'rgba(15,10,5,0.95)', border: '2px solid #aa6622',
      borderRadius: '12px', padding: '20px', width: '700px', maxHeight: '80vh',
      pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: '12px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#ffd700', fontSize: '18px', fontWeight: 'bold' }}>
          Blacksmith Toivo
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ color: '#ffd700', fontSize: '16px' }}>
            Gold: {gold}
          </div>
          <button
            onClick={() => setState({ visible: false })}
            style={{
              background: '#666', color: '#fff', border: 'none',
              padding: '4px 12px', borderRadius: '4px', cursor: 'pointer',
            }}
          >
            Close [ESC]
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', overflow: 'hidden' }}>
        {/* Buy side */}
        <div style={{ flex: 1 }}>
          <div style={{ color: '#88cc88', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
            Buy
          </div>
          <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            {BLACKSMITH_SHOP.map((entry: ShopEntry) => {
              const def = ITEM_DEFS[entry.defId];
              if (!def) return null;
              const canAfford = gold >= entry.buyPrice;
              return (
                <div key={entry.defId} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 8px', marginBottom: '4px',
                  background: 'rgba(255,255,255,0.05)', borderRadius: '4px',
                  borderLeft: `3px solid ${RARITY_COLORS[def.rarity]}`,
                }}>
                  <div>
                    <div style={{ color: RARITY_COLORS[def.rarity], fontSize: '13px', fontWeight: 'bold' }}>
                      {def.name}
                    </div>
                    <div style={{ color: '#888', fontSize: '11px' }}>
                      {def.type} {def.baseDamage ? `| DMG: ${def.baseDamage}` : ''}{def.baseArmor ? `| ARM: ${def.baseArmor}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => shopBuy(entry.defId)}
                    disabled={!canAfford}
                    style={{
                      background: canAfford ? '#44883a' : '#444',
                      color: canAfford ? '#fff' : '#888',
                      border: 'none', padding: '4px 12px', borderRadius: '4px',
                      cursor: canAfford ? 'pointer' : 'default', fontSize: '12px',
                    }}
                  >
                    Buy {entry.buyPrice}g
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sell side */}
        <div style={{ flex: 1 }}>
          <div style={{ color: '#cc8888', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
            Sell
          </div>
          <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            {items.length === 0 && (
              <div style={{ color: '#666', fontSize: '12px', fontStyle: 'italic' }}>
                No items to sell
              </div>
            )}
            {items.map((item) => {
              const def = ITEM_DEFS[item.defId];
              if (!def) return null;
              const shopEntry = BLACKSMITH_SHOP.find((e) => e.defId === item.defId);
              const sellPrice = shopEntry ? shopEntry.sellPrice : Math.max(1, Math.floor(def.tier * 5));
              const totalPrice = sellPrice * (item.quantity || 1);
              return (
                <div key={item.instanceId} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 8px', marginBottom: '4px',
                  background: 'rgba(255,255,255,0.05)', borderRadius: '4px',
                  borderLeft: `3px solid ${RARITY_COLORS[item.rarity]}`,
                }}>
                  <div>
                    <div style={{ color: RARITY_COLORS[item.rarity], fontSize: '13px', fontWeight: 'bold' }}>
                      {def.name} {(item.quantity || 1) > 1 ? `x${item.quantity}` : ''}
                    </div>
                    <div style={{ color: '#888', fontSize: '11px' }}>
                      {item.rarity} {def.type}
                    </div>
                  </div>
                  <button
                    onClick={() => shopSell(item.instanceId)}
                    style={{
                      background: '#883a3a', color: '#fff', border: 'none',
                      padding: '4px 12px', borderRadius: '4px', cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Sell {totalPrice}g
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function mountShopPanel(container: HTMLElement) {
  const div = document.createElement('div');
  div.id = 'shop-panel-root';
  container.appendChild(div);
  render(<ShopPanelComponent />, div);
}

export function showShopPanel() {
  setShopState?.({ visible: true });
}

export function hideShopPanel() {
  setShopState?.({ visible: false });
}

export function isShopVisible(): boolean {
  return !!setShopState;
}

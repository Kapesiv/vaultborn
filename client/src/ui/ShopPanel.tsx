import { render, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { BLACKSMITH_SHOP, ITEM_DEFS, RARITY_COLORS, getDefaultSellPrice, type ShopEntry, type ItemDef } from '@saab/shared';
import { inventoryManager } from '../systems/InventoryManager.js';
import { shopBuy, shopSell } from '../network/actions.js';

// ── Style constants — Fantasy RPG parchment & gold theme ──────
const LEATHER_DARK = '#0d0805';
const LEATHER_BG = '#1a120a';
const PARCHMENT = '#2a1f14';
const PARCHMENT_LIGHT = '#3a2c1e';
const GOLD = '#ffd700';
const GOLD_DIM = '#b8960f';
const GOLD_BORDER = '#8b6914';
const GOLD_GLOW = 'rgba(255,215,0,0.15)';
const GOLD_TEXT_SHADOW = '0 0 8px rgba(255,215,0,0.4), 0 0 16px rgba(255,215,0,0.15)';
const CREAM = '#e8dcc8';
const DUST = '#9a8b76';
const IRON = '#6e6458';
const BORDER_INNER = 'rgba(212,168,68,0.13)';
const COIN_GOLD = '#e8c84a';

const RARITY_BORDER: Record<string, string> = {
  common: '#8a8a8a',
  uncommon: '#1edd3c',
  rare: '#3290ff',
  epic: '#b446ff',
  legendary: '#ff8c14',
};

const RARITY_GLOW: Record<string, string> = {
  common: 'rgba(138,138,138,0.25)',
  uncommon: 'rgba(30,221,60,0.3)',
  rare: 'rgba(50,144,255,0.35)',
  epic: 'rgba(180,70,255,0.35)',
  legendary: 'rgba(255,140,20,0.45)',
};

function getSlotLabel(def: ItemDef): string {
  if (def.type === 'consumable') return 'POT';
  if (def.type === 'material') return 'MAT';
  if (def.type === 'weapon') return 'WPN';
  if (def.slot === 'head') return 'HLM';
  if (def.slot === 'chest') return 'CHT';
  if (def.slot === 'legs') return 'LEG';
  if (def.slot === 'feet') return 'BOT';
  return 'MISC';
}

function getItemIcon(def: ItemDef): string {
  if (def.icon === 'health_potion') return '\u2764';
  if (def.type === 'weapon' && def.slot === 'mainHand') return '\u2694';
  if (def.type === 'material') return '\u25C6';
  if (def.slot === 'head') return '\u26D1';
  if (def.slot === 'chest') return '\u{1F6E1}';
  if (def.slot === 'legs') return '\u229E';
  if (def.slot === 'feet') return '\u{1F462}';
  return '\u2726';
}

// ── Types ────────────────────────────────────────────────────
type Tab = 'buy' | 'sell';

interface ShopState {
  visible: boolean;
}

let setShopState: ((s: ShopState) => void) | null = null;

// ── Component ────────────────────────────────────────────────
function ShopPanelComponent() {
  const [state, setState] = useState<ShopState>({ visible: false });
  const [activeTab, setActiveTab] = useState<Tab>('buy');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [, setTick] = useState(0);

  setShopState = setState;

  useEffect(() => {
    return inventoryManager.subscribe(() => setTick((t) => t + 1));
  }, []);

  useEffect(() => {
    setSelectedItem(null);
  }, [activeTab, state.visible]);

  if (!state.visible) return null;

  const gold = inventoryManager.getGold();
  const items = inventoryManager.getItems();

  // Resolve detail panel data
  const detailKey = selectedItem || hoveredCard;
  let detailDef: ItemDef | null = null;
  let detailRarity = 'common';
  let detailPrice = 0;
  let detailInstanceId: string | null = null;
  let canAfford = false;
  let detailQty = 1;

  if (detailKey && activeTab === 'buy') {
    const entry = BLACKSMITH_SHOP.find((e) => e.defId === detailKey);
    if (entry) {
      detailDef = ITEM_DEFS[entry.defId] || null;
      detailRarity = detailDef?.rarity || 'common';
      detailPrice = entry.buyPrice;
      canAfford = gold >= entry.buyPrice;
    }
  } else if (detailKey && activeTab === 'sell') {
    const item = items.find((i) => i.instanceId === detailKey);
    if (item) {
      detailDef = ITEM_DEFS[item.defId] || null;
      detailRarity = item.rarity;
      detailInstanceId = item.instanceId;
      detailQty = item.quantity || 1;
      const se = BLACKSMITH_SHOP.find((e) => e.defId === item.defId);
      detailPrice = (se ? se.sellPrice : getDefaultSellPrice(detailDef?.tier || 1, item.rarity)) * detailQty;
      canAfford = true;
    }
  }

  const rc = RARITY_COLORS[detailRarity] || RARITY_COLORS.common;
  const rarityBorder = RARITY_BORDER[detailRarity] || RARITY_BORDER.common;

  // ─── Build item list for current tab ───
  const buyItems = BLACKSMITH_SHOP.map((entry) => {
    const def = ITEM_DEFS[entry.defId];
    if (!def) return null;
    return { key: entry.defId, def, rarity: def.rarity, price: entry.buyPrice, qty: 1, affordable: gold >= entry.buyPrice };
  }).filter(Boolean) as { key: string; def: ItemDef; rarity: string; price: number; qty: number; affordable: boolean }[];

  const sellItems = items.map((item) => {
    const def = ITEM_DEFS[item.defId];
    if (!def) return null;
    const se = BLACKSMITH_SHOP.find((e) => e.defId === item.defId);
    const unitPrice = se ? se.sellPrice : getDefaultSellPrice(def.tier, item.rarity);
    const qty = item.quantity || 1;
    return { key: item.instanceId, def, rarity: item.rarity, price: unitPrice * qty, qty, affordable: true };
  }).filter(Boolean) as { key: string; def: ItemDef; rarity: string; price: number; qty: number; affordable: boolean }[];

  const displayItems = activeTab === 'buy' ? buyItems : sellItems;

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      background: `radial-gradient(ellipse at 50% 30%, ${LEATHER_BG} 0%, ${LEATHER_DARK} 100%)`,
      border: `3px solid ${GOLD_BORDER}`,
      borderRadius: '8px',
      width: '780px',
      maxHeight: '82vh',
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif',
      overflow: 'hidden',
      boxShadow: `0 0 60px rgba(0,0,0,0.9), 0 0 30px rgba(139,105,20,0.2), inset 0 0 30px ${GOLD_GLOW}, inset 0 0 1px ${BORDER_INNER}`,
    }}>

      {/* ═══ Top ornamental gold line ═══ */}
      <div style={{
        height: '2px',
        background: `linear-gradient(90deg, transparent 2%, ${GOLD_BORDER}66 15%, ${GOLD}88 50%, ${GOLD_BORDER}66 85%, transparent 98%)`,
      }} />

      {/* ═══ Header ═══ */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 24px 12px',
        background: `linear-gradient(180deg, rgba(42,31,20,0.8) 0%, transparent 100%)`,
        borderBottom: `1px solid ${GOLD_BORDER}44`,
      }}>
        {/* NPC name — ornamental gold */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: `radial-gradient(circle at 35% 35%, ${PARCHMENT_LIGHT} 0%, ${LEATHER_DARK} 100%)`,
            border: `2px solid ${GOLD_BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '17px',
            boxShadow: `0 0 10px ${GOLD_GLOW}`,
          }}>
            {'\u2692'}
          </div>
          <div>
            <div style={{
              color: GOLD, fontSize: '20px', fontWeight: 700,
              textShadow: GOLD_TEXT_SHADOW,
              letterSpacing: '0.5px',
            }}>
              Blacksmith Toivo
            </div>
          </div>
        </div>

        {/* Gold display + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(232,200,74,0.08)',
            border: `1px solid ${GOLD_BORDER}55`,
            borderRadius: '20px',
            padding: '5px 14px 5px 10px',
          }}>
            <div style={{
              width: '16px', height: '16px', borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #f0d060, #b89830)',
              border: '1.5px solid #d4a844',
              boxShadow: '0 0 6px rgba(232,200,74,0.3)',
            }} />
            <span style={{ color: COIN_GOLD, fontSize: '15px', fontWeight: 700 }}>
              {gold}g
            </span>
          </div>
          <button
            onClick={() => setState({ visible: false })}
            style={{
              background: PARCHMENT,
              color: GOLD_DIM,
              border: `1px solid ${GOLD_BORDER}`,
              fontSize: '16px', cursor: 'pointer',
              padding: '2px 10px',
              lineHeight: 1, borderRadius: '4px',
              fontWeight: 700,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              const el = e.target as HTMLElement;
              el.style.background = GOLD_BORDER;
              el.style.color = LEATHER_DARK;
            }}
            onMouseLeave={(e) => {
              const el = e.target as HTMLElement;
              el.style.background = PARCHMENT;
              el.style.color = GOLD_DIM;
            }}
          >
            {'\u00D7'}
          </button>
        </div>
      </div>

      {/* ═══ Tab bar ═══ */}
      <div style={{
        display: 'flex', padding: '0 24px',
        borderBottom: `1px solid ${GOLD_BORDER}44`,
        background: `rgba(0,0,0,0.15)`,
      }}>
        {(['buy', 'sell'] as Tab[]).map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: active
                  ? `linear-gradient(180deg, ${GOLD_BORDER} 0%, ${GOLD_DIM} 100%)`
                  : 'transparent',
                color: active ? LEATHER_DARK : GOLD_DIM,
                border: active ? `1px solid ${GOLD}66` : `1px solid transparent`,
                borderBottom: active ? `1px solid ${GOLD_BORDER}` : '1px solid transparent',
                borderRadius: '4px 4px 0 0',
                padding: '9px 30px',
                marginBottom: '-1px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                fontFamily: 'inherit',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!active) (e.target as HTMLElement).style.color = GOLD;
              }}
              onMouseLeave={(e) => {
                if (!active) (e.target as HTMLElement).style.color = GOLD_DIM;
              }}
            >
              {tab === 'buy' ? 'Buy' : 'Sell'}
            </button>
          );
        })}
      </div>

      {/* ═══ Content area ═══ */}
      <div style={{
        display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden',
      }}>

        {/* ── Item grid (left) ── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px 20px',
          borderRight: `1px solid ${GOLD_BORDER}33`,
        }}>
          {displayItems.length === 0 && (
            <div style={{
              color: DUST, fontSize: '14px', textAlign: 'center',
              padding: '60px 20px', fontStyle: 'italic',
            }}>
              {activeTab === 'buy' ? 'Nothing for sale.' : 'Your pack is empty.'}
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
          }}>
            {displayItems.map((item) => {
              const rBorder = RARITY_BORDER[item.rarity] || RARITY_BORDER.common;
              const rGlow = RARITY_GLOW[item.rarity] || RARITY_GLOW.common;
              const isSelected = selectedItem === item.key;
              const isHovered = hoveredCard === item.key;

              return (
                <div
                  key={item.key}
                  onClick={() => setSelectedItem(isSelected ? null : item.key)}
                  onMouseEnter={() => setHoveredCard(item.key)}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '115px',
                    background: `rgba(0,0,0,0.35)`,
                    borderRadius: '6px',
                    border: isSelected
                      ? `2px solid ${rBorder}`
                      : `1px solid ${isHovered ? rBorder + '88' : GOLD_BORDER + '44'}`,
                    borderLeft: `3px solid ${isSelected || isHovered ? rBorder : rBorder + '44'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '8px 6px',
                    transition: 'all 0.12s',
                    transform: isHovered ? 'scale(1.03)' : 'scale(1)',
                    boxShadow: isSelected
                      ? `0 0 14px ${rGlow}, inset 0 0 12px ${rGlow}`
                      : isHovered
                        ? `0 0 8px ${rGlow}`
                        : 'none',
                    opacity: item.affordable ? 1 : 0.45,
                    overflow: 'hidden',
                  }}
                >
                  {/* Slot type label at top */}
                  <div style={{
                    position: 'absolute', top: '4px', left: '6px',
                    fontSize: '8px', fontWeight: 700,
                    color: DUST,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    opacity: 0.6,
                  }}>
                    {getSlotLabel(item.def)}
                  </div>

                  {/* Qty badge */}
                  {item.qty > 1 && (
                    <div style={{
                      position: 'absolute', top: '3px', right: '5px',
                      fontSize: '10px', fontWeight: 700,
                      color: CREAM,
                      background: 'rgba(0,0,0,0.6)',
                      borderRadius: '3px',
                      padding: '1px 5px',
                      border: `1px solid ${GOLD_BORDER}44`,
                    }}>
                      x{item.qty}
                    </div>
                  )}

                  {/* Icon */}
                  <div style={{
                    fontSize: '26px',
                    marginTop: '6px',
                    filter: isSelected || isHovered ? 'brightness(1.2)' : 'none',
                    transition: 'filter 0.12s',
                  }}>
                    {getItemIcon(item.def)}
                  </div>

                  {/* Name */}
                  <div style={{
                    color: isSelected || isHovered
                      ? (RARITY_COLORS[item.rarity] || CREAM)
                      : CREAM,
                    fontSize: '11px',
                    fontWeight: 600,
                    textAlign: 'center',
                    lineHeight: '1.2',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    padding: '0 2px',
                    transition: 'color 0.1s',
                  }}>
                    {item.def.name}
                  </div>

                  {/* Price */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '3px',
                    marginTop: '1px',
                  }}>
                    <div style={{
                      width: '9px', height: '9px', borderRadius: '50%',
                      background: item.affordable
                        ? 'radial-gradient(circle at 35% 35%, #f0d060, #b89830)'
                        : 'radial-gradient(circle at 35% 35%, #555, #333)',
                      border: `1px solid ${item.affordable ? '#d4a844' : '#444'}`,
                    }} />
                    <span style={{
                      color: item.affordable ? COIN_GOLD : '#555',
                      fontSize: '12px', fontWeight: 700,
                    }}>
                      {item.price}g
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Detail / tooltip panel (right) ── */}
        <div style={{
          width: '240px', flexShrink: 0,
          background: `linear-gradient(180deg, ${PARCHMENT} 0%, ${LEATHER_BG} 100%)`,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          borderLeft: `1px solid ${GOLD_BORDER}33`,
        }}>
          {!detailDef && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: '8px', padding: '20px',
            }}>
              <div style={{ fontSize: '28px', opacity: 0.15 }}>{'\u2726'}</div>
              <div style={{
                color: DUST, fontSize: '12px', textAlign: 'center',
                lineHeight: '1.5', fontStyle: 'italic',
              }}>
                Select an item to inspect
              </div>
            </div>
          )}

          {detailDef && (
            <div style={{
              display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden',
            }}>
              {/* Item header */}
              <div style={{
                padding: '18px 18px 14px',
                background: `linear-gradient(180deg, ${rarityBorder}12 0%, transparent 100%)`,
                borderBottom: `1px solid ${GOLD_BORDER}33`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '8px', flexShrink: 0,
                    background: `rgba(0,0,0,0.35)`,
                    border: `2px solid ${rarityBorder}66`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '24px',
                    boxShadow: `0 0 12px ${RARITY_GLOW[detailRarity]}`,
                  }}>
                    {getItemIcon(detailDef)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: rc, fontSize: '15px', fontWeight: 700,
                      lineHeight: 1.3, marginBottom: '5px',
                      textShadow: `0 0 6px ${RARITY_GLOW[detailRarity]}`,
                    }}>
                      {detailDef.name}
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      <span style={{
                        fontSize: '9px', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '1px',
                        color: rc, opacity: 0.9,
                        background: `${rarityBorder}22`,
                        padding: '2px 7px', borderRadius: '3px',
                        border: `1px solid ${rarityBorder}33`,
                      }}>
                        {detailRarity}
                      </span>
                      <span style={{
                        color: DUST, fontSize: '10px', textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        {getSlotLabel(detailDef)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div style={{
                padding: '12px 18px', flex: 1,
                display: 'flex', flexDirection: 'column', gap: '5px',
              }}>
                {detailDef.baseDamage && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 10px', borderRadius: '4px',
                    background: 'rgba(192,112,64,0.08)',
                    border: '1px solid rgba(192,112,64,0.15)',
                  }}>
                    <span style={{ color: DUST, fontSize: '11px' }}>Damage</span>
                    <span style={{ color: '#d48040', fontSize: '14px', fontWeight: 700 }}>
                      {detailDef.baseDamage}
                    </span>
                  </div>
                )}
                {detailDef.baseArmor && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 10px', borderRadius: '4px',
                    background: 'rgba(80,136,176,0.08)',
                    border: '1px solid rgba(80,136,176,0.15)',
                  }}>
                    <span style={{ color: DUST, fontSize: '11px' }}>Armor</span>
                    <span style={{ color: '#5a98c0', fontSize: '14px', fontWeight: 700 }}>
                      {detailDef.baseArmor}
                    </span>
                  </div>
                )}

                {/* Bonus stats (sell tab) */}
                {activeTab === 'sell' && detailKey && (() => {
                  const inst = items.find((i) => i.instanceId === detailKey);
                  if (!inst || inst.bonusStats.length === 0) return null;
                  return inst.bonusStats.map((bs, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '4px 10px', borderRadius: '4px',
                      background: 'rgba(60,200,60,0.05)',
                    }}>
                      <span style={{ color: DUST, fontSize: '11px', textTransform: 'capitalize' }}>
                        {bs.stat}
                      </span>
                      <span style={{ color: '#50c050', fontSize: '12px', fontWeight: 700 }}>
                        +{bs.value}
                      </span>
                    </div>
                  ));
                })()}

                {/* Description */}
                <div style={{
                  marginTop: '6px', padding: '0 2px',
                  color: DUST, fontSize: '11px', lineHeight: '1.7',
                  borderTop: `1px solid ${GOLD_BORDER}33`,
                  paddingTop: '10px',
                  fontStyle: 'italic',
                }}>
                  {detailDef.description}
                </div>

                <div style={{ flex: 1 }} />
              </div>

              {/* Action footer */}
              <div style={{
                padding: '14px 18px 16px',
                borderTop: `1px solid ${GOLD_BORDER}33`,
                background: `linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.25) 100%)`,
              }}>
                {/* Price row */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '10px',
                }}>
                  <span style={{
                    color: DUST, fontSize: '11px',
                    textTransform: 'uppercase', letterSpacing: '1px',
                  }}>
                    {activeTab === 'buy' ? 'Cost' : 'Value'}
                  </span>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                  }}>
                    <div style={{
                      width: '13px', height: '13px', borderRadius: '50%',
                      background: 'radial-gradient(circle at 35% 35%, #f0d060, #b89830)',
                      border: '1.5px solid #d4a844',
                    }} />
                    <span style={{ color: COIN_GOLD, fontSize: '16px', fontWeight: 700 }}>
                      {detailPrice}g
                    </span>
                  </div>
                </div>

                {activeTab === 'buy' && !canAfford && (
                  <div style={{
                    color: '#aa5555', fontSize: '10px', textAlign: 'center',
                    marginBottom: '8px', letterSpacing: '0.5px',
                    fontStyle: 'italic',
                  }}>
                    Not enough gold
                  </div>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activeTab === 'buy' && canAfford && detailKey) {
                      shopBuy(detailKey);
                    } else if (activeTab === 'sell' && detailInstanceId) {
                      shopSell(detailInstanceId);
                      setSelectedItem(null);
                    }
                  }}
                  disabled={activeTab === 'buy' && !canAfford}
                  onMouseEnter={(e) => {
                    const el = e.target as HTMLElement;
                    if (activeTab === 'buy' && !canAfford) return;
                    el.style.opacity = '1';
                    el.style.transform = 'translateY(-1px)';
                    el.style.boxShadow = activeTab === 'buy'
                      ? '0 4px 14px rgba(50,130,40,0.35)'
                      : '0 4px 14px rgba(180,50,30,0.35)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.target as HTMLElement;
                    el.style.opacity = '0.9';
                    el.style.transform = 'translateY(0)';
                    el.style.boxShadow = activeTab === 'buy'
                      ? '0 2px 8px rgba(50,120,40,0.2)'
                      : '0 2px 8px rgba(180,50,30,0.2)';
                  }}
                  style={{
                    width: '100%',
                    background: activeTab === 'buy'
                      ? (canAfford
                        ? 'linear-gradient(180deg, #3a7a30 0%, #265520 100%)'
                        : 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)')
                      : 'linear-gradient(180deg, #8a3020 0%, #5a1a10 100%)',
                    color: (activeTab === 'buy' && !canAfford) ? '#555' : '#eee',
                    border: `1px solid ${activeTab === 'buy'
                      ? (canAfford ? 'rgba(60,130,50,0.5)' : '#333')
                      : 'rgba(180,50,30,0.4)'}`,
                    borderRadius: '4px',
                    padding: '10px 0',
                    cursor: (activeTab === 'buy' && !canAfford) ? 'default' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    textTransform: 'uppercase',
                    letterSpacing: '1.5px',
                    transition: 'all 0.12s',
                    opacity: 0.9,
                    boxShadow: (activeTab === 'buy' && !canAfford)
                      ? 'none'
                      : activeTab === 'buy'
                        ? '0 2px 8px rgba(50,120,40,0.2)'
                        : '0 2px 8px rgba(180,50,30,0.2)',
                  }}
                >
                  {activeTab === 'buy' ? 'Buy' : 'Sell'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Bottom ornamental gold line ═══ */}
      <div style={{
        height: '2px',
        background: `linear-gradient(90deg, transparent 2%, ${GOLD_BORDER}66 15%, ${GOLD}88 50%, ${GOLD_BORDER}66 85%, transparent 98%)`,
      }} />
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

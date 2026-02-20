import { render, h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { CLASS_DEFS, VALID_CLASS_IDS, type CharacterClassId } from '@saab/shared';

const CLASS_ICONS: Record<CharacterClassId, string> = {
  warrior: '\u2694\uFE0F',
  mage: '\uD83D\uDD2E',
  ranger: '\uD83C\uDFF9',
  rogue: '\uD83D\uDDE1\uFE0F',
};

const STAT_LABELS = ['STR', 'INT', 'DEX', 'VIT'] as const;
const STAT_KEYS = ['strength', 'intelligence', 'dexterity', 'vitality'] as const;
const STAT_MAX = 20;

const STAT_COLORS: Record<string, string> = {
  STR: '#ff6655',
  INT: '#55aaff',
  DEX: '#55dd77',
  VIT: '#ffcc44',
};

// --- Canvas background types & generation ---

interface Star { x: number; y: number; size: number; phase: number; speed: number }
interface Cloud { x: number; y: number; w: number; h: number; speed: number; alpha: number }

function generateTerrain(w: number, groundY: number): number[] {
  const heights: number[] = [];
  let h = groundY;
  for (let x = 0; x <= w; x += 4) {
    h += (Math.random() - 0.5) * 6;
    h = Math.max(groundY - 40, Math.min(groundY + 20, h));
    heights.push(h);
  }
  return heights;
}

interface TreeDef { x: number; baseY: number; h: number; w: number }

function generateTrees(terrain: number[], count: number, step: number): TreeDef[] {
  const trees: TreeDef[] = [];
  const spacing = Math.floor(terrain.length / (count + 1));
  for (let i = 1; i <= count; i++) {
    const idx = Math.min(spacing * i + Math.floor((Math.random() - 0.5) * spacing * 0.5), terrain.length - 1);
    const baseY = terrain[idx];
    trees.push({
      x: idx * step,
      baseY,
      h: 50 + Math.random() * 40,
      w: 28 + Math.random() * 16,
    });
  }
  return trees;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  stars: Star[],
  clouds: Cloud[],
  terrain: number[],
  trees: TreeDef[],
  dt: number,
) {
  // 1. Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.75);
  sky.addColorStop(0, '#0a0e2a');
  sky.addColorStop(0.45, '#14103a');
  sky.addColorStop(0.7, '#2a1a3a');
  sky.addColorStop(1, '#2a1a0a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 2. Stars (upper 60%)
  for (const s of stars) {
    const twinkle = 0.3 + 0.7 * ((Math.sin(time * s.speed + s.phase) + 1) * 0.5);
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = s.size > 1.5 ? '#ffd700' : '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h * 0.6, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 3. Clouds
  for (const c of clouds) {
    c.x += c.speed * dt;
    if (c.x - c.w > w) c.x = -c.w * 2;
    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = '#c8c0d8';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.w, c.h, 0, 0, Math.PI * 2);
    ctx.fill();
    // second smaller lobe
    ctx.beginPath();
    ctx.ellipse(c.x + c.w * 0.5, c.y - c.h * 0.3, c.w * 0.6, c.h * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const step = 4;
  const groundY = h * 0.78;

  // 5. Trees (behind terrain for silhouette effect)
  for (const t of trees) {
    ctx.fillStyle = '#1a3a1a';
    // trunk
    ctx.fillRect(t.x - 3, t.baseY - t.h * 0.3, 6, t.h * 0.3);
    // canopy (triangle)
    ctx.beginPath();
    ctx.moveTo(t.x, t.baseY - t.h);
    ctx.lineTo(t.x - t.w / 2, t.baseY - t.h * 0.25);
    ctx.lineTo(t.x + t.w / 2, t.baseY - t.h * 0.25);
    ctx.closePath();
    ctx.fillStyle = '#0d2a0d';
    ctx.fill();
    // second canopy layer
    ctx.beginPath();
    ctx.moveTo(t.x, t.baseY - t.h * 0.85);
    ctx.lineTo(t.x - t.w * 0.65 / 2, t.baseY - t.h * 0.1);
    ctx.lineTo(t.x + t.w * 0.65 / 2, t.baseY - t.h * 0.1);
    ctx.closePath();
    ctx.fillStyle = '#163a16';
    ctx.fill();
  }

  // 4. Terrain silhouette
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < terrain.length; i++) {
    ctx.lineTo(i * step, terrain[i]);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  const terrainGrad = ctx.createLinearGradient(0, groundY - 30, 0, groundY + 20);
  terrainGrad.addColorStop(0, '#2a5a1a');
  terrainGrad.addColorStop(0.3, '#1a4a10');
  terrainGrad.addColorStop(1, '#3a2a1a');
  ctx.fillStyle = terrainGrad;
  ctx.fill();

  // Grass line on top of terrain
  ctx.strokeStyle = '#3a7a2a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < terrain.length; i++) {
    if (i === 0) ctx.moveTo(i * step, terrain[i]);
    else ctx.lineTo(i * step, terrain[i]);
  }
  ctx.stroke();

  // 6. Underground (below terrain avg)
  const ugTop = Math.max(...terrain) + 2;
  if (ugTop < h) {
    ctx.fillStyle = '#2a1a0e';
    ctx.fillRect(0, ugTop, w, h - ugTop);
    // scattered stone dots
    ctx.fillStyle = '#4a3a2a';
    const seed = 42;
    for (let i = 0; i < 60; i++) {
      const sx = ((seed * (i + 1) * 7) % 1000) / 1000 * w;
      const sy = ugTop + ((seed * (i + 1) * 13) % 1000) / 1000 * (h - ugTop);
      ctx.fillRect(sx, sy, 3, 3);
    }
  }
}

// --- Component ---

interface MainMenuProps {
  onPlay: (name: string, classId: CharacterClassId) => void;
}

function MainMenuComponent({ onPlay }: MainMenuProps) {
  const [selectedClass, setSelectedClass] = useState<CharacterClassId>('warrior');
  const [name, setName] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState<CharacterClassId | null>(null);
  const [playHover, setPlayHover] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const classDef = CLASS_DEFS[selectedClass];

  useEffect(() => { setMounted(true); }, []);

  // Animated canvas background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let lastTime = performance.now();

    // Generate stars
    const stars: Star[] = [];
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() * 2 + 0.5,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
      });
    }

    // Generate clouds
    const clouds: Cloud[] = [];
    const initClouds = (w: number, h: number) => {
      clouds.length = 0;
      for (let i = 0; i < 7; i++) {
        clouds.push({
          x: Math.random() * w * 1.5 - w * 0.25,
          y: h * 0.08 + Math.random() * h * 0.25,
          w: 60 + Math.random() * 100,
          h: 18 + Math.random() * 18,
          speed: 8 + Math.random() * 16,
          alpha: 0.04 + Math.random() * 0.06,
        });
      }
    };

    let terrain: number[] = [];
    let trees: TreeDef[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const groundY = canvas.height * 0.78;
      terrain = generateTerrain(canvas.width, groundY);
      trees = generateTrees(terrain, 4, 4);
      initClouds(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const time = now / 1000;

      drawBackground(ctx, canvas.width, canvas.height, time, stars, clouds, terrain, trees, dt);
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const handlePlay = useCallback(async () => {
    const playerName = name.trim() || 'Adventurer';
    setConnecting(true);
    setError('');
    try {
      await onPlay(playerName, selectedClass);
    } catch (err: any) {
      setError(err?.message || 'Connection failed');
      setConnecting(false);
    }
  }, [name, selectedClass, onPlay]);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      fontFamily: "'Segoe UI', Arial, sans-serif",
      color: '#fff',
      zIndex: 1000,
      overflow: 'hidden',
      opacity: mounted ? 1 : 0,
      transition: 'opacity 0.8s ease-in',
    }}>
      {/* Canvas background */}
      <canvas ref={canvasRef} style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Content overlay */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {/* Title area */}
        <div style={{
          textAlign: 'center',
          marginTop: 'clamp(20px, 4vh, 50px)',
          transform: mounted ? 'translateY(0)' : 'translateY(-30px)',
          transition: 'transform 0.8s ease-out',
        }}>
          <h1 style={{
            fontSize: 'clamp(36px, 5vw, 64px)',
            color: '#ffd700',
            margin: 0,
            textShadow: '0 0 40px rgba(255,215,0,0.5), 0 0 80px rgba(255,215,0,0.2), 0 4px 8px rgba(0,0,0,0.9)',
            letterSpacing: '16px',
            fontWeight: 900,
          }}>VAULTBORN</h1>
          <div style={{
            width: '300px', height: '2px', margin: '8px auto 0',
            background: 'linear-gradient(90deg, transparent, #ffd700, transparent)',
          }} />
          <p style={{
            color: '#776b55', margin: '6px 0 0', fontSize: '12px',
            letterSpacing: '3px', textTransform: 'uppercase',
          }}>Choose your destiny</p>
        </div>

        {/* Main content: left panel + right panel */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'clamp(20px, 3vw, 50px)',
          padding: '0 20px',
          maxWidth: '900px',
          width: '100%',
          transform: mounted ? 'translateY(0)' : 'translateY(30px)',
          transition: 'transform 0.8s ease-out 0.2s',
          opacity: mounted ? 1 : 0,
          transitionProperty: 'transform, opacity',
        }}>
          {/* LEFT PANEL — Wooden sign menu */}
          <div style={{
            background: 'linear-gradient(180deg, #1a120a 0%, #0d0805 100%)',
            border: '3px solid #3a2a18',
            borderRadius: '4px',
            padding: '20px 18px',
            width: '280px',
            minWidth: '250px',
            boxShadow: '0 0 30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(90,74,48,0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            {/* Name input */}
            <input
              type="text"
              placeholder="Enter your name..."
              maxLength={20}
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !connecting) handlePlay(); }}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '14px',
                background: 'rgba(10,8,5,0.9)',
                border: '2px solid #2a1e10',
                borderRadius: '3px',
                color: '#ddd',
                outline: 'none',
                textAlign: 'center',
                letterSpacing: '1px',
                boxSizing: 'border-box',
                marginBottom: '6px',
              }}
              onFocus={(e) => (e.target as HTMLInputElement).style.borderColor = '#6a5a3a'}
              onBlur={(e) => (e.target as HTMLInputElement).style.borderColor = '#2a1e10'}
            />

            {/* Divider */}
            <div style={{
              height: '1px', background: 'linear-gradient(90deg, transparent, #3a2a18, transparent)',
              margin: '2px 0',
            }} />

            {/* Class buttons */}
            {VALID_CLASS_IDS.map((cid) => {
              const def = CLASS_DEFS[cid];
              const selected = cid === selectedClass;
              const isHovered = cid === hovered;
              return (
                <div
                  key={cid}
                  onClick={() => setSelectedClass(cid)}
                  onMouseEnter={() => setHovered(cid)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 16px',
                    background: selected
                      ? 'rgba(50,38,22,0.95)'
                      : isHovered ? 'rgba(40,30,18,0.9)' : 'rgba(30,22,12,0.9)',
                    border: `2px solid ${selected ? '#6a5a3a' : isHovered ? '#4a3a2a' : '#3a2a1a'}`,
                    borderLeft: selected ? '3px solid #ffd700' : `2px solid ${isHovered ? '#4a3a2a' : '#3a2a1a'}`,
                    borderRadius: '3px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    transform: isHovered && !selected ? 'translateX(4px)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '18px', width: '26px', textAlign: 'center' }}>
                    {CLASS_ICONS[cid]}
                  </span>
                  <span style={{
                    flex: 1,
                    fontSize: '15px',
                    fontWeight: selected ? 700 : 500,
                    color: selected ? '#ffd700' : isHovered ? '#ccc' : '#999',
                    letterSpacing: '1px',
                    transition: 'color 0.15s',
                  }}>
                    {def.name}
                  </span>
                  {selected && (
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: '#ffd700',
                      boxShadow: '0 0 6px rgba(255,215,0,0.5)',
                    }} />
                  )}
                </div>
              );
            })}

            {/* Divider */}
            <div style={{
              height: '1px', background: 'linear-gradient(90deg, transparent, #3a2a18, transparent)',
              margin: '4px 0',
            }} />

            {/* Play button */}
            <button
              onClick={handlePlay}
              disabled={connecting}
              onMouseEnter={() => setPlayHover(true)}
              onMouseLeave={() => setPlayHover(false)}
              style={{
                width: '100%',
                padding: '13px',
                fontSize: '16px',
                fontWeight: 800,
                background: connecting
                  ? '#555'
                  : 'linear-gradient(180deg, #ffd700, #b8960f)',
                color: connecting ? '#999' : '#1a1000',
                border: connecting ? '2px solid #555' : '2px solid #ffd700',
                borderRadius: '3px',
                cursor: connecting ? 'default' : 'pointer',
                letterSpacing: '4px',
                textTransform: 'uppercase',
                boxShadow: connecting
                  ? 'none'
                  : '0 4px 15px rgba(255,215,0,0.25), inset 0 1px 0 rgba(255,255,255,0.3)',
                transition: 'all 0.15s',
                transform: playHover && !connecting ? 'scale(1.03)' : 'none',
                filter: playHover && !connecting ? 'brightness(1.1)' : 'none',
              }}
            >
              {connecting ? 'Connecting...' : '\u25B6 Enter the Vault'}
            </button>

            {/* Error */}
            {error && (
              <p style={{
                color: '#ff4444', fontSize: '12px', margin: '4px 0 0',
                padding: '6px 12px', borderRadius: '3px',
                background: 'rgba(255,0,0,0.1)', border: '1px solid #441111',
                textAlign: 'center',
              }}>{error}</p>
            )}
          </div>

          {/* RIGHT PANEL — Class info */}
          <div style={{
            background: 'linear-gradient(180deg, #1a120a 0%, #0d0805 100%)',
            border: '3px solid #3a2a18',
            borderRadius: '4px',
            padding: '20px 22px',
            width: '300px',
            minWidth: '260px',
            boxShadow: '0 0 30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(90,74,48,0.3)',
            opacity: mounted ? 1 : 0,
            transition: 'opacity 0.4s ease-out',
          }}>
            {/* Class name + icon */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              marginBottom: '12px',
            }}>
              <span style={{ fontSize: '28px' }}>{CLASS_ICONS[selectedClass]}</span>
              <div>
                <div style={{
                  fontSize: '22px', fontWeight: 800,
                  color: classDef.color,
                  letterSpacing: '2px',
                  textShadow: `0 0 15px ${classDef.color}40`,
                }}>{classDef.name}</div>
              </div>
            </div>

            {/* Description */}
            <p style={{
              color: '#9a9080', fontSize: '13px', lineHeight: '1.6',
              margin: '0 0 14px 0',
              borderBottom: '1px solid #2a1e10',
              paddingBottom: '12px',
            }}>
              {classDef.description}
            </p>

            {/* Stat bars */}
            <div style={{ marginBottom: '14px' }}>
              {STAT_LABELS.map((label, i) => {
                const val = classDef.startingStats[STAT_KEYS[i]];
                const pct = (val / STAT_MAX) * 100;
                return (
                  <div key={label} style={{ marginBottom: '8px' }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      marginBottom: '3px',
                    }}>
                      <span style={{
                        color: STAT_COLORS[label],
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '1px',
                      }}>{label}</span>
                      <span style={{
                        color: val >= 14 ? STAT_COLORS[label] : '#888',
                        fontSize: '11px',
                        fontWeight: val >= 14 ? 700 : 400,
                      }}>{val}</span>
                    </div>
                    <div style={{
                      width: '100%', height: '6px', borderRadius: '2px',
                      background: '#1a1208',
                      border: '1px solid #2a1e10',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${pct}%`, height: '100%', borderRadius: '2px',
                        background: `linear-gradient(90deg, ${STAT_COLORS[label]}88, ${STAT_COLORS[label]})`,
                        transition: 'width 0.4s ease-out',
                        boxShadow: `0 0 4px ${STAT_COLORS[label]}40`,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* HP / Mana */}
            <div style={{
              display: 'flex', gap: '16px', justifyContent: 'center',
              padding: '10px 0 4px',
              borderTop: '1px solid #2a1e10',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#5a3333', fontSize: '10px', letterSpacing: '1px', marginBottom: '2px' }}>HP</div>
                <div style={{ color: '#cc4444', fontSize: '18px', fontWeight: 700 }}>{classDef.maxHpBase}</div>
              </div>
              <div style={{
                width: '1px', background: '#2a1e10',
              }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#335588', fontSize: '10px', letterSpacing: '1px', marginBottom: '2px' }}>MANA</div>
                <div style={{ color: '#4488cc', fontSize: '18px', fontWeight: 700 }}>{classDef.maxManaBase}</div>
              </div>
            </div>

            {/* Weapon tag */}
            <div style={{
              textAlign: 'center', marginTop: '10px',
            }}>
              <span style={{
                fontSize: '11px', color: '#5a4a30',
                padding: '4px 10px', borderRadius: '3px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid #2a1e10',
              }}>
                {classDef.startingWeapon.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* Controls legend — bottom center */}
        <div style={{
          color: '#3a3a4a', fontSize: '11px',
          lineHeight: '1.8', textAlign: 'center',
          padding: '10px 0 clamp(12px, 2vh, 24px)',
          letterSpacing: '0.5px',
        }}>
          <span style={{ color: '#555' }}>WASD</span> Move
          &nbsp;&nbsp;<span style={{ color: '#333' }}>/</span>&nbsp;&nbsp;
          <span style={{ color: '#555' }}>Mouse</span> Look
          &nbsp;&nbsp;<span style={{ color: '#333' }}>/</span>&nbsp;&nbsp;
          <span style={{ color: '#555' }}>Space</span> Jump
          &nbsp;&nbsp;<span style={{ color: '#333' }}>/</span>&nbsp;&nbsp;
          <span style={{ color: '#555' }}>Click</span> Attack
          <br />
          <span style={{ color: '#555' }}>E</span> Interact
          &nbsp;&nbsp;<span style={{ color: '#333' }}>/</span>&nbsp;&nbsp;
          <span style={{ color: '#555' }}>F</span> Pickup
          &nbsp;&nbsp;<span style={{ color: '#333' }}>/</span>&nbsp;&nbsp;
          <span style={{ color: '#555' }}>Q</span> Leave Dungeon
        </div>
      </div>
    </div>
  );
}

let menuRoot: HTMLDivElement | null = null;

export function mountMainMenu(
  container: HTMLElement,
  onPlay: (name: string, classId: CharacterClassId) => Promise<void>,
) {
  menuRoot = document.createElement('div');
  menuRoot.id = 'main-menu-root';
  container.appendChild(menuRoot);
  render(h(MainMenuComponent, { onPlay }), menuRoot);
}

export function unmountMainMenu() {
  if (menuRoot) {
    render(null, menuRoot);
    menuRoot.remove();
    menuRoot = null;
  }
}

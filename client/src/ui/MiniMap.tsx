import { render, h } from 'preact';
import { useRef, useEffect } from 'preact/hooks';

export interface MinimapData {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  remotePlayers: { x: number; z: number }[];
  npcs: { x: number; z: number; name: string }[];
  portals: { x: number; z: number; color: string }[];
  monsters: { x: number; z: number }[];
  roomType: string;
}

const SIZE = 150;
const CENTER = SIZE / 2;

interface MiniMapProps {
  getData: () => MinimapData | null;
}

// ---- NPC icon draw helpers ----

/** Blacksmith Toivo — anvil + hammer */
function drawBlacksmith(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  // Anvil body (dark gray trapezoid)
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy + 3);
  ctx.lineTo(cx + 5, cy + 3);
  ctx.lineTo(cx + 4, cy);
  ctx.lineTo(cx - 4, cy);
  ctx.closePath();
  ctx.fill();

  // Anvil horn (right)
  ctx.fillStyle = '#666';
  ctx.beginPath();
  ctx.moveTo(cx + 4, cy + 1);
  ctx.lineTo(cx + 7, cy + 1);
  ctx.lineTo(cx + 6, cy + 3);
  ctx.lineTo(cx + 4, cy + 3);
  ctx.closePath();
  ctx.fill();

  // Anvil top (lighter)
  ctx.fillStyle = '#888';
  ctx.fillRect(cx - 4, cy - 1, 8, 2);

  // Hammer handle (brown diagonal)
  ctx.strokeStyle = '#8B5E3C';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 2, cy - 2);
  ctx.lineTo(cx + 3, cy - 7);
  ctx.stroke();

  // Hammer head (orange-hot metal)
  ctx.fillStyle = '#D4740E';
  ctx.fillRect(cx + 1, cy - 9, 5, 3);

  // Spark dots
  ctx.fillStyle = '#FFAA33';
  ctx.fillRect(cx - 3, cy - 4, 1, 1);
  ctx.fillStyle = '#FF6600';
  ctx.fillRect(cx + 1, cy - 3, 1, 1);
}

/** Elder Mika — robed figure with staff + crystal */
function drawElder(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  // Robe body (purple triangle)
  ctx.fillStyle = '#6644AA';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx - 4, cy + 4);
  ctx.lineTo(cx + 4, cy + 4);
  ctx.closePath();
  ctx.fill();

  // Robe trim
  ctx.strokeStyle = '#9966DD';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - 3.5, cy + 3.5);
  ctx.lineTo(cx + 3.5, cy + 3.5);
  ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.arc(cx, cy - 5, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#FFCC99';
  ctx.fill();

  // Beard (white)
  ctx.fillStyle = '#DDD';
  ctx.beginPath();
  ctx.moveTo(cx - 1.5, cy - 3.5);
  ctx.lineTo(cx, cy - 1);
  ctx.lineTo(cx + 1.5, cy - 3.5);
  ctx.closePath();
  ctx.fill();

  // Staff (tall line to the right)
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx + 5, cy + 4);
  ctx.lineTo(cx + 5, cy - 7);
  ctx.stroke();

  // Crystal on staff top (glowing blue)
  ctx.fillStyle = '#44DDFF';
  ctx.beginPath();
  ctx.moveTo(cx + 5, cy - 10);
  ctx.lineTo(cx + 3.5, cy - 8);
  ctx.lineTo(cx + 5, cy - 6.5);
  ctx.lineTo(cx + 6.5, cy - 8);
  ctx.closePath();
  ctx.fill();

  // Crystal glow
  ctx.beginPath();
  ctx.arc(cx + 5, cy - 8, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(68, 221, 255, 0.2)';
  ctx.fill();
}

/** Scout Aino — hooded figure with bow */
function drawScout(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  // Cloak body (green)
  ctx.fillStyle = '#22774C';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 3);
  ctx.lineTo(cx - 4, cy + 4);
  ctx.lineTo(cx + 4, cy + 4);
  ctx.closePath();
  ctx.fill();

  // Hood (darker green arc over head)
  ctx.fillStyle = '#1A5C3A';
  ctx.beginPath();
  ctx.arc(cx, cy - 4, 3, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  // Face (peeking from hood)
  ctx.beginPath();
  ctx.arc(cx, cy - 3.5, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = '#FFCC99';
  ctx.fill();

  // Bow (curved arc on the left)
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx - 5, cy, 6, -0.7, 0.7);
  ctx.stroke();

  // Bowstring
  ctx.strokeStyle = '#CCC';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  const bowTopX = cx - 5 + 6 * Math.cos(-0.7);
  const bowTopY = cy + 6 * Math.sin(-0.7);
  const bowBotX = cx - 5 + 6 * Math.cos(0.7);
  const bowBotY = cy + 6 * Math.sin(0.7);
  ctx.moveTo(bowTopX, bowTopY);
  ctx.lineTo(bowBotX, bowBotY);
  ctx.stroke();

  // Arrow (on the bow)
  ctx.strokeStyle = '#AA8855';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy);
  ctx.lineTo(cx + 2, cy);
  ctx.stroke();

  // Arrowhead
  ctx.fillStyle = '#AAA';
  ctx.beginPath();
  ctx.moveTo(cx + 3, cy);
  ctx.lineTo(cx + 1, cy - 1.2);
  ctx.lineTo(cx + 1, cy + 1.2);
  ctx.closePath();
  ctx.fill();
}

/** Dispatch NPC drawing by name */
function drawNPCIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, name: string) {
  if (name.toLowerCase().includes('blacksmith') || name.toLowerCase().includes('toivo')) {
    drawBlacksmith(ctx, cx, cy);
  } else if (name.toLowerCase().includes('elder') || name.toLowerCase().includes('mika')) {
    drawElder(ctx, cx, cy);
  } else if (name.toLowerCase().includes('scout') || name.toLowerCase().includes('aino')) {
    drawScout(ctx, cx, cy);
  } else {
    // Fallback: green dot with "?" marker
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#22cc44';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy);
  }
}

// ---- Main component ----

function MiniMapComponent({ getData }: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId = 0;

    const draw = () => {
      animId = requestAnimationFrame(draw);
      const data = getData();
      if (!data) return;

      const { playerX, playerZ, playerYaw } = data;
      const cosY = Math.cos(playerYaw);
      const sinY = Math.sin(playerYaw);

      // Clear
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();

      // Round clip
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, CENTER, 0, Math.PI * 2);
      ctx.clip();

      // Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, SIZE, SIZE);

      // World-to-canvas: rotate so player's forward is always "up"
      const toCanvas = (wx: number, wz: number): [number, number] => {
        const dx = wx - playerX;
        const dz = wz - playerZ;
        const mx = dx * cosY - dz * sinY;
        const my = dx * sinY + dz * cosY;
        return [CENTER + mx, CENTER + my];
      };

      const inBounds = (cx: number, cy: number) =>
        Math.sqrt((cx - CENTER) ** 2 + (cy - CENTER) ** 2) <= CENTER - 2;

      const drawDot = (wx: number, wz: number, color: string, radius: number) => {
        const [cx, cy] = toCanvas(wx, wz);
        if (!inBounds(cx, cy)) return;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      };

      // Portals / landmarks
      for (const p of data.portals) {
        drawDot(p.x, p.z, p.color, 4);
      }

      // NPCs — unique icons per character
      for (const npc of data.npcs) {
        const [nx, ny] = toCanvas(npc.x, npc.z);
        if (!inBounds(nx, ny)) continue;
        drawNPCIcon(ctx, nx, ny, npc.name);
      }

      // Monsters (dungeon)
      for (const m of data.monsters) {
        drawDot(m.x, m.z, '#aa44ff', 3);
      }

      // Remote players
      for (const rp of data.remotePlayers) {
        drawDot(rp.x, rp.z, '#4488ff', 3);
      }

      // Local player (always center)
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Facing direction triangle
      ctx.beginPath();
      ctx.moveTo(CENTER, CENTER - 7);
      ctx.lineTo(CENTER - 3, CENTER - 1);
      ctx.lineTo(CENTER + 3, CENTER - 1);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fill();

      ctx.restore();

      // Border ring
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, CENTER - 1, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        borderRadius: '50%',
        pointerEvents: 'none',
      }}
    />
  );
}

export function mountMiniMap(container: HTMLElement, getData: () => MinimapData | null) {
  const wrapper = document.createElement('div');
  wrapper.id = 'minimap-root';
  container.appendChild(wrapper);
  render(<MiniMapComponent getData={getData} />, wrapper);
}

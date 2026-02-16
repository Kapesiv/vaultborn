import type { PlayerInput } from '../types/player.js';
import { PLAYER_SPEED } from '../constants/game.js';

export function validatePlayerInput(input: PlayerInput): boolean {
  if (typeof input.seq !== 'number' || input.seq < 0) return false;
  if (typeof input.dt !== 'number' || input.dt <= 0 || input.dt > 0.2) return false;
  if (typeof input.rotation !== 'number') return false;
  return true;
}

export function computeMovement(input: PlayerInput): { dx: number; dz: number } {
  // Camera yaw = input.rotation
  // Camera sits at (+sin(yaw), y, +cos(yaw)) relative to player
  // So player's forward direction is (-sin(yaw), -cos(yaw))
  // And player's right direction is (-cos(yaw), +sin(yaw))
  const sinY = Math.sin(input.rotation);
  const cosY = Math.cos(input.rotation);

  // Forward/back vector: toward where camera looks
  const fwdX = -sinY;
  const fwdZ = -cosY;

  // Right vector: perpendicular to forward (screen-right from camera POV)
  const rightX = cosY;
  const rightZ = -sinY;

  let dx = 0;
  let dz = 0;

  if (input.forward)  { dx += fwdX;   dz += fwdZ; }
  if (input.backward) { dx -= fwdX;   dz -= fwdZ; }
  if (input.left)     { dx -= rightX; dz -= rightZ; }
  if (input.right)    { dx += rightX; dz += rightZ; }

  // Normalize diagonal movement
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len > 0) {
    dx /= len;
    dz /= len;
  }

  return {
    dx: dx * PLAYER_SPEED * input.dt,
    dz: dz * PLAYER_SPEED * input.dt,
  };
}

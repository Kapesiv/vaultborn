import * as THREE from 'three';
import { computeMovement, type PlayerInput } from '@saab/shared';
import { buildCaveCharacter, type Gender } from './CharacterBuilder.js';

export type { Gender };

/**
 * Caveman/Cavewoman starter character
 * - Ragged fur/cloth clothing
 * - Appearance changes ONLY when armor is equipped (future)
 * - Male = broader, Female = slimmer
 */
export class LocalPlayer {
  public mesh: THREE.Group;
  public position = new THREE.Vector3(0, 0.91, 16);
  public rotation = 0;
  public gender: Gender;

  private pendingInputs: PlayerInput[] = [];
  private attackAnimation = 0;
  private velocityY = 0;
  private isGrounded = true;
  private spawnGlow: THREE.Mesh | null = null;
  private spawnTimer = 2.0; // spawn effect duration

  // Cloth simulation geometry refs
  private tunicGeo: THREE.BufferGeometry | null = null;
  private tunicOrigPos: Float32Array | null = null;
  private cloakGeo: THREE.BufferGeometry | null = null;
  private cloakOrigPos: Float32Array | null = null;
  private hoodGeo: THREE.BufferGeometry | null = null;
  private hoodOrigPos: Float32Array | null = null;

  constructor(scene: THREE.Scene, gender: Gender) {
    this.gender = gender;
    const result = buildCaveCharacter(gender);
    this.mesh = result.group;
    this.tunicGeo = result.clothRefs.tunicGeo;
    this.tunicOrigPos = result.clothRefs.tunicOrigPos;
    this.cloakGeo = result.clothRefs.cloakGeo;
    this.cloakOrigPos = result.clothRefs.cloakOrigPos;
    this.hoodGeo = result.clothRefs.hoodGeo;
    this.hoodOrigPos = result.clothRefs.hoodOrigPos;
    scene.add(this.mesh);

    // Spawn glow effect - ring of light around player
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x55ccff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    this.spawnGlow = new THREE.Mesh(new THREE.RingGeometry(0.3, 1.8, 32), glowMat);
    this.spawnGlow.rotation.x = -Math.PI / 2;
    this.spawnGlow.position.y = 0.05;
    this.mesh.add(this.spawnGlow);
  }

  applyInput(input: PlayerInput) {
    const move = computeMovement(input);
    this.position.x += move.dx;
    this.position.z += move.dz;

    // Face movement direction
    if (Math.abs(move.dx) > 0.001 || Math.abs(move.dz) > 0.001) {
      this.rotation = Math.atan2(-move.dx, -move.dz);
    }

    // Jump
    if (input.jump && this.isGrounded) {
      this.velocityY = 8;
      this.isGrounded = false;
    }

    // Gravity only when airborne
    if (!this.isGrounded) {
      this.velocityY -= 20 * input.dt;
    }
    this.position.y += this.velocityY * input.dt;

    // Floor + wall collision
    this.isGrounded = false;
    const floorY = this.getFloorHeight();

    if (this.position.y <= floorY) {
      this.position.y = floorY;
      this.velocityY = 0;
      this.isGrounded = true;
    }

    this.altarWall();
    this.shopWall();
    this.fountainWall();

    this.pendingInputs.push(input);

    if (input.attack) {
      this.attackAnimation = 0.4;
    }
  }

  // Altar collision - 3 visual tiers, all scaled 0.65x, centred at (0, 15)
  private static readonly AX = 0;
  private static readonly AZ = 15;
  // Tier radii  (top-radius of each CylinderGeometry x 0.65)
  private static readonly T_TOP_R = 1.3;    // top tier
  private static readonly T_MID_R = 2.08;   // middle tier
  private static readonly T_BOT_R = 2.925;  // bottom tier
  // Tier surface heights  ((centerY + halfHeight) x 0.65)
  private static readonly T_TOP_H = 0.91;
  private static readonly T_MID_H = 0.65;
  private static readonly T_BOT_H = 0.325;
  // Ramps from bottom tier edge to ground
  private static readonly RAMP = 2.0;
  private static readonly RHW = 1.0;

  // Fountain - circular at origin, radius matches HubWorld.FOUNTAIN_RADIUS
  private static readonly FNT_R = 3.6;

  // Shop building AABB (pos -12,0,-5  size 8x5x6  + 0.3 buffer)
  private static readonly SHOP_X1 = -16.3;
  private static readonly SHOP_X2 = -7.7;
  private static readonly SHOP_Z1 = -8.3;
  private static readonly SHOP_Z2 = -1.7;

  private getFloorHeight(): number {
    const { AX, AZ, T_TOP_R, T_MID_R, T_BOT_R, T_TOP_H, T_MID_H, T_BOT_H, RAMP, RHW } = LocalPlayer;
    const dx = this.position.x - AX;
    const dz = this.position.z - AZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Stepped tiers - inside-out
    if (dist <= T_TOP_R) return T_TOP_H;
    if (dist <= T_MID_R) return T_MID_H;
    if (dist <= T_BOT_R) return T_BOT_H;

    // 4 ramps from bottom tier edge down to ground
    let best = 0;
    const botEdge = T_BOT_R;

    // North ramp (-Z)
    const nE = AZ - botEdge;
    if (Math.abs(dx) < RHW && this.position.z <= nE && this.position.z >= nE - RAMP) {
      best = Math.max(best, ((this.position.z - (nE - RAMP)) / RAMP) * T_BOT_H);
    }
    // South ramp (+Z)
    const sE = AZ + botEdge;
    if (Math.abs(dx) < RHW && this.position.z >= sE && this.position.z <= sE + RAMP) {
      best = Math.max(best, ((sE + RAMP - this.position.z) / RAMP) * T_BOT_H);
    }
    // East ramp (+X)
    const eE = AX + botEdge;
    if (Math.abs(dz) < RHW && this.position.x >= eE && this.position.x <= eE + RAMP) {
      best = Math.max(best, ((eE + RAMP - this.position.x) / RAMP) * T_BOT_H);
    }
    // West ramp (-X)
    const wE = AX - botEdge;
    if (Math.abs(dz) < RHW && this.position.x <= wE && this.position.x >= wE - RAMP) {
      best = Math.max(best, ((this.position.x - (wE - RAMP)) / RAMP) * T_BOT_H);
    }

    return best;
  }

  // Wall: push player out if they approach a tier from below its surface
  private altarWall() {
    const { AX, AZ, T_BOT_R, T_BOT_H } = LocalPlayer;
    const dx = this.position.x - AX;
    const dz = this.position.z - AZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < T_BOT_R && this.position.y < T_BOT_H - 0.1 && dist > 0.001) {
      this.position.x = AX + (dx / dist) * (T_BOT_R + 0.05);
      this.position.z = AZ + (dz / dist) * (T_BOT_R + 0.05);
    }
  }

  // Fountain: circular push-out at world origin
  private fountainWall() {
    const r = LocalPlayer.FNT_R;
    const dx = this.position.x;
    const dz = this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < r && dist > 0.001) {
      this.position.x = (dx / dist) * (r + 0.05);
      this.position.z = (dz / dist) * (r + 0.05);
    }
  }

  // Shop building: push player to nearest edge if inside
  private shopWall() {
    const { SHOP_X1, SHOP_X2, SHOP_Z1, SHOP_Z2 } = LocalPlayer;
    const px = this.position.x;
    const pz = this.position.z;

    if (px > SHOP_X1 && px < SHOP_X2 && pz > SHOP_Z1 && pz < SHOP_Z2) {
      const dL = px - SHOP_X1;
      const dR = SHOP_X2 - px;
      const dB = pz - SHOP_Z1;
      const dF = SHOP_Z2 - pz;
      const min = Math.min(dL, dR, dB, dF);

      if (min === dL) this.position.x = SHOP_X1;
      else if (min === dR) this.position.x = SHOP_X2;
      else if (min === dB) this.position.z = SHOP_Z1;
      else this.position.z = SHOP_Z2;
    }
  }

  reconcile(serverX: number, serverZ: number, lastProcessedInput: number) {
    this.pendingInputs = this.pendingInputs.filter(i => i.seq > lastProcessedInput);
    this.position.x = serverX;
    this.position.z = serverZ;
    for (const input of this.pendingInputs) {
      const move = computeMovement(input);
      this.position.x += move.dx;
      this.position.z += move.dz;
    }
  }

  update(dt: number, time: number, isMoving: boolean) {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotation;

    const leftLeg = this.mesh.getObjectByName('leftLeg');
    const rightLeg = this.mesh.getObjectByName('rightLeg');
    const leftArm = this.mesh.getObjectByName('leftArm');
    const rightArm = this.mesh.getObjectByName('rightArm');

    if (isMoving) {
      const swing = Math.sin(time * 10) * 0.5;
      if (leftLeg) leftLeg.rotation.x = swing;
      if (rightLeg) rightLeg.rotation.x = -swing;
      if (leftArm) leftArm.rotation.x = -swing * 0.5;
      if (rightArm) rightArm.rotation.x = swing * 0.5;
    } else {
      // Idle breathing
      const breathe = Math.sin(time * 2) * 0.02;
      if (leftLeg) leftLeg.rotation.x = 0;
      if (rightLeg) rightLeg.rotation.x = 0;
      if (leftArm) leftArm.rotation.x = breathe;
      if (rightArm) rightArm.rotation.x = -breathe;
    }

    // ---- Cloth simulation ----
    const windStr = isMoving ? 0.18 : 0.025;

    // Tunic skirt flutter (bottom hem sways)
    if (this.tunicGeo && this.tunicOrigPos) {
      const pos = this.tunicGeo.attributes.position;
      const orig = this.tunicOrigPos;
      const halfH = 0.3; // skirtH / 2
      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3], oy = orig[i * 3 + 1], oz = orig[i * 3 + 2];
        const t = Math.max(0, (halfH - oy) / (halfH * 2)); // 0=top, 1=hem
        const w = t * t;
        const dist = Math.sqrt(ox * ox + oz * oz);
        if (dist > 0.01) {
          const radial = Math.sin(time * 7 + oy * 5 + Math.atan2(oz, ox) * 3) * w * windStr;
          pos.setX(i, ox + (ox / dist) * radial);
          pos.setZ(i, oz + (oz / dist) * radial);
        }
      }
      pos.needsUpdate = true;
      this.tunicGeo.computeVertexNormals();
    }

    // Cloak billow (more dramatic, trails behind when moving)
    if (this.cloakGeo && this.cloakOrigPos) {
      const pos = this.cloakGeo.attributes.position;
      const orig = this.cloakOrigPos;
      const halfH = 0.8; // cloakH / 2
      const cloakWind = isMoving ? 0.28 : 0.035;
      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3], oy = orig[i * 3 + 1], oz = orig[i * 3 + 2];
        const t = Math.max(0, (halfH - oy) / (halfH * 2)); // 0=shoulder, 1=hem
        const w = t * t;
        const wave1 = Math.sin(time * 6 + oy * 4.5 + ox * 2.5) * w * cloakWind;
        const wave2 = Math.sin(time * 8.5 + oy * 6 + ox * 1.5) * w * cloakWind * 0.4;
        const lateralWave = Math.sin(time * 4.5 + oy * 3 + ox * 5) * w * cloakWind * 0.3;
        const pushBack = isMoving ? w * 0.12 : 0; // wind pushes cloak back
        pos.setX(i, ox + lateralWave);
        pos.setZ(i, oz + wave1 + wave2 + pushBack);
      }
      pos.needsUpdate = true;
      this.cloakGeo.computeVertexNormals();
    }

    // Hood rim flutter (subtle, only the lower rim edge)
    if (this.hoodGeo && this.hoodOrigPos) {
      const pos = this.hoodGeo.attributes.position;
      const orig = this.hoodOrigPos;
      const hoodWind = windStr * 0.6;
      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3], oy = orig[i * 3 + 1], oz = orig[i * 3 + 2];
        // Only animate rim (lower Y values)
        const rimWeight = Math.max(0, (0.05 - oy) / 0.25);
        if (rimWeight > 0) {
          const w = rimWeight * rimWeight;
          pos.setX(i, ox + Math.sin(time * 5.5 + ox * 5 + oz * 3) * w * hoodWind);
          pos.setZ(i, oz + Math.sin(time * 6.5 + oz * 4) * w * hoodWind);
        }
      }
      pos.needsUpdate = true;
      this.hoodGeo.computeVertexNormals();
    }

    // Spawn glow fade out
    if (this.spawnGlow && this.spawnTimer > 0) {
      this.spawnTimer -= dt;
      const t = Math.max(0, this.spawnTimer / 2.0);
      (this.spawnGlow.material as THREE.MeshBasicMaterial).opacity = t * 0.7;
      this.spawnGlow.scale.set(1 + (1 - t) * 0.5, 1 + (1 - t) * 0.5, 1);
      this.spawnGlow.rotation.z = time * 2;
      if (this.spawnTimer <= 0) {
        this.mesh.remove(this.spawnGlow);
        this.spawnGlow = null;
      }
    }

    // Attack swing - arm drives it, weapon follows as child
    if (this.attackAnimation > 0) {
      this.attackAnimation -= dt;
      const t = 1 - (this.attackAnimation / 0.4);
      const swingAngle = Math.sin(t * Math.PI) * 1.8;
      if (rightArm) rightArm.rotation.x = swingAngle;
    }
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}

import * as THREE from 'three';
import { computeMovement, type PlayerInput } from '@saab/shared';
import { CharacterController } from './CharacterController.js';
import { characterLoader } from './CharacterLoader.js';
import type { WorldCollider } from '../world/HubWorld.js';
import { downscaleTextures } from '../utils/downscaleTextures.js';

export type Gender = 'male' | 'female';

export class LocalPlayer {
  public mesh: THREE.Group;
  public position = new THREE.Vector3(0, 0, 26);
  public rotation = 0;
  public gender: Gender;

  // Visual smoothing — mesh lerps toward logic position
  private visualPos = new THREE.Vector3(0, 0, 26);
  private visualRot = 0;
  private targetRotation = 0;

  private pendingInputs: PlayerInput[] = [];
  private attackAnimation = 0;
  private velocityY = 0;
  private isGrounded = true;
  private spawnGlow: THREE.Mesh | null = null;
  private spawnTimer = 2.0;

  // Equipment state
  private weaponType = 'bone-club';
  private armorTier = 0;
  private helmetType = 'hood';
  private weaponRarity = 'common';
  private killStreakTimer = 0;
  private killStreakCount = 0;
  public nameSprite: THREE.Sprite | null = null;

  // World colliders (set from HubWorld)
  private worldColliders: WorldCollider[] = [];

  // GLB character controller
  private controller: CharacterController;

  constructor(scene: THREE.Scene, gender: Gender) {
    this.gender = gender;
    this.controller = new CharacterController();
    this.mesh = this.controller.group;
    scene.add(this.mesh);

    // Load character model directly
    this.loadModel();

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

    // Nameplate with level
    this.nameSprite = this.createNameplate('Adventurer', 1);
    this.mesh.add(this.nameSprite);
  }

  private async loadModel() {
    try {
      console.log('[LocalPlayer] Loading player.glb...');
      const { scene: model, animations } = await characterLoader.getClone('/models/player.glb');
      console.log(`[LocalPlayer] Loaded OK, ${animations.length} anims`);

      // Load walk animation from separate FBX file
      try {
        const walkClips = await characterLoader.loadAnimationClips('/models/walking.fbx');
        for (const clip of walkClips) {
          clip.name = 'walk';
          this.stripRootDrift(clip);
          animations.push(clip);
        }
        console.log(`[LocalPlayer] Walk animation loaded (${walkClips.length} clips, root drift stripped)`);
      } catch { /* walk anim optional */ }

      // Load run animation from separate FBX file
      try {
        const runClips = await characterLoader.loadAnimationClips('/models/run.fbx');
        for (const clip of runClips) {
          clip.name = 'run';
          animations.push(clip);
        }
        console.log(`[LocalPlayer] Run animation loaded (${runClips.length} clips)`);
      } catch { /* run anim optional */ }

      // Load attack animation from separate FBX file
      try {
        const attackClips = await characterLoader.loadAnimationClips('/models/attack.fbx');
        for (const clip of attackClips) {
          clip.name = 'attack';
          animations.push(clip);
        }
        console.log(`[LocalPlayer] Attack animation loaded (${attackClips.length} clips)`);
      } catch { /* attack anim optional */ }

      // Load crouch animation from separate FBX file
      try {
        const crouchClips = await characterLoader.loadAnimationClips('/models/crouch.fbx');
        for (const clip of crouchClips) {
          clip.name = 'crouch';
          animations.push(clip);
        }
        console.log(`[LocalPlayer] Crouch animation loaded (${crouchClips.length} clips)`);
      } catch { /* crouch anim optional */ }

      this.controller.attachModel(model, animations);
      this.equipWeapon(this.weaponType);
      if (this.weaponRarity !== 'common') this.setWeaponRarity(this.weaponRarity);
      if (this.helmetType !== 'hood' && this.helmetType !== 'none') this.equipHelmet(this.helmetType);
    } catch (err) {
      console.error('[LocalPlayer] Failed to load model:', err);
    }
  }

  /**
   * Lock the root bone's X/Z position to the first frame (zero horizontal
   * drift) while keeping only the Y-axis bounce for a natural walk feel.
   */
  private stripRootDrift(clip: THREE.AnimationClip): void {
    console.log(`[stripRootDrift] Clip "${clip.name}" tracks:`,
      clip.tracks.map(t => t.name));
    let matched = false;
    for (const track of clip.tracks) {
      const isRootPos = /hips?\.position/i.test(track.name)
        || /root\.position/i.test(track.name);
      if (!isRootPos) continue;
      matched = true;
      console.log(`[stripRootDrift] Stripping track: ${track.name}`);

      const values = track.values;
      const stride = 3; // x, y, z interleaved
      const n = values.length / stride;
      if (n < 2) continue;

      for (let axis = 0; axis < stride; axis++) {
        if (axis === 1) {
          // Y axis: keep bounce, just remove any drift
          const first = values[axis];
          const last = values[(n - 1) * stride + axis];
          const drift = last - first;
          for (let i = 0; i < n; i++) {
            values[i * stride + axis] -= drift * (i / (n - 1));
          }
        } else {
          // X and Z: lock to first frame value (no horizontal motion)
          const first = values[axis];
          for (let i = 1; i < n; i++) {
            values[i * stride + axis] = first;
          }
        }
      }
    }
    if (!matched) {
      console.warn('[stripRootDrift] No root position track found! Track names did not match regex.');
    }
  }

  // ════════════════════════════════════════════════════════════════
  // NAMEPLATE — name, level, title above head
  // ════════════════════════════════════════════════════════════════
  private createNameplate(name: string, level: number, title?: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;

    const cx = 256;

    // ── Background banner ──
    const bannerY = 8;
    const bannerH = title ? 100 : 70;
    const bannerW = 360;
    const bannerX = cx - bannerW / 2;

    // Dark gradient backdrop
    const grad = ctx.createLinearGradient(bannerX, bannerY, bannerX, bannerY + bannerH);
    grad.addColorStop(0, 'rgba(10,10,20,0.75)');
    grad.addColorStop(1, 'rgba(10,10,20,0.45)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 12);
    ctx.fill();

    // Gold border
    ctx.strokeStyle = 'rgba(255,200,60,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 12);
    ctx.stroke();

    // ── Level badge (left) ──
    const badgeX = bannerX + 38;
    const badgeY = bannerY + 30;
    const badgeR = 18;

    // Badge circle
    const badgeGrad = ctx.createRadialGradient(badgeX, badgeY, 0, badgeX, badgeY, badgeR);
    badgeGrad.addColorStop(0, '#ffd700');
    badgeGrad.addColorStop(1, '#b8860b');
    ctx.fillStyle = badgeGrad;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffe680';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Level number
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1a1000';
    ctx.fillText(`${level}`, badgeX, badgeY + 1);

    // ── Name ──
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    const nameX = cx + 12;

    // Glow
    ctx.shadowColor = 'rgba(255,200,60,0.5)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, nameX, bannerY + 36);
    ctx.shadowBlur = 0;

    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(name, nameX, bannerY + 36);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, nameX, bannerY + 36);

    // ── Title (if any) ──
    if (title) {
      ctx.font = 'italic 20px Arial';
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = 'rgba(255,200,60,0.3)';
      ctx.shadowBlur = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeText(title, nameX, bannerY + 62);
      ctx.fillText(title, nameX, bannerY + 62);
      ctx.shadowBlur = 0;
    }

    // ── Decorative line under name ──
    const lineY = title ? bannerY + 74 : bannerY + 50;
    const lineGrad = ctx.createLinearGradient(bannerX + 40, lineY, bannerX + bannerW - 40, lineY);
    lineGrad.addColorStop(0, 'rgba(255,200,60,0)');
    lineGrad.addColorStop(0.3, 'rgba(255,200,60,0.5)');
    lineGrad.addColorStop(0.7, 'rgba(255,200,60,0.5)');
    lineGrad.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bannerX + 40, lineY);
    ctx.lineTo(bannerX + bannerW - 40, lineY);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.y = 3.8;
    sprite.scale.set(3.5, 1.1, 1);
    sprite.name = 'nameplate';
    return sprite;
  }

  public setNameplate(name: string, level: number, title?: string) {
    if (this.nameSprite) {
      this.mesh.remove(this.nameSprite);
    }
    this.nameSprite = this.createNameplate(name, level, title);
    this.mesh.add(this.nameSprite);
  }

  // ════════════════════════════════════════════════════════════════
  // WEAPONS — swappable weapon meshes
  // ════════════════════════════════════════════════════════════════
  private createWeaponByType(_type: string): THREE.Group {
    // Placeholder group — GLB will be loaded async
    const g = new THREE.Group();
    this.loadWeaponGLB(g);
    return g;
  }

  private async loadWeaponGLB(weaponGroup: THREE.Group) {
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      loader.load('/models/viking_axe.glb', (gltf) => {
        const model = gltf.scene;
        downscaleTextures(model);
        // Scale to 1.3 max dimension in bone-local space (same size as before)
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.3 / Math.max(maxDim, 0.01);
        model.scale.setScalar(scale);
        // Position grip (bottom of handle) at bone origin instead of centering
        // This way the hand wraps around the grip naturally
        const center = box.getCenter(new THREE.Vector3());
        model.position.set(
          -center.x * scale,       // center X (side-to-side)
          -box.min.y * scale,      // grip (bottom of handle) at Y=0
          -center.z * scale,       // center Z (front-to-back)
        );
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
          }
        });
        weaponGroup.add(model);
        console.log(`[LocalPlayer] Viking axe loaded, scale: ${scale.toFixed(3)}, size:`, size.toArray().map(v => v.toFixed(2)));
      });
    } catch (err) {
      console.error('[LocalPlayer] Failed to load weapon GLB:', err);
    }
  }

  private createBoneClubMesh(): THREE.Group {
    const g = new THREE.Group();
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.6 });
    const rawMeat = new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.85 });
    const fatMat = new THREE.MeshStandardMaterial({ color: 0xe8b89a, roughness: 0.7 });
    const darkMeat = new THREE.MeshStandardMaterial({ color: 0x6b1010, roughness: 0.9 });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.35, 6), boneMat);
    shaft.position.y = 0.17;
    g.add(shaft);

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), rawMeat);
    core.scale.set(0.85, 1.0, 1.0);
    core.position.y = 0.52;
    g.add(core);

    const blob1 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 5, 4), darkMeat);
    blob1.position.set(0.08, 0.62, 0.06);
    g.add(blob1);

    const blob2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), rawMeat);
    blob2.position.set(-0.06, 0.45, -0.05);
    g.add(blob2);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), fatMat);
    cap.scale.set(1.1, 0.4, 1.0);
    cap.position.y = 0.68;
    g.add(cap);

    const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.15, 5), fatMat);
    streak.rotation.z = Math.PI / 2;
    streak.position.set(0.16, 0.52, 0.0);
    g.add(streak);

    return g;
  }

  private createSwordMesh(): THREE.Group {
    const g = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xccccdd, metalness: 0.7, roughness: 0.25 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x3a2210, roughness: 0.85 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xcc9933, metalness: 0.6, roughness: 0.3 });

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.28, 6), gripMat);
    grip.position.y = 0.14;
    g.add(grip);

    for (let i = 0; i < 4; i++) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 4, 6), goldMat);
      wrap.position.y = 0.04 + i * 0.07;
      wrap.rotation.x = Math.PI / 2;
      g.add(wrap);
    }

    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), goldMat);
    pommel.position.y = -0.01;
    pommel.scale.set(1, 0.6, 1);
    g.add(pommel);

    const crossGuard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.06), goldMat);
    crossGuard.position.y = 0.3;
    g.add(crossGuard);

    for (const side of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 5), goldMat);
      tip.position.set(side * 0.14, 0.3, 0);
      g.add(tip);
    }

    const bladeGeo = new THREE.BoxGeometry(0.07, 0.55, 0.02, 2, 6, 1);
    const bp = bladeGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i);
      const taper = 1 - (y / 0.55) * 0.4;
      bp.setX(i, bp.getX(i) * taper);
    }
    bp.needsUpdate = true;
    bladeGeo.computeVertexNormals();

    const blade = new THREE.Mesh(bladeGeo, steelMat);
    blade.position.y = 0.58;
    blade.castShadow = true;
    g.add(blade);

    const fuller = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.4, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x999aaa, metalness: 0.8, roughness: 0.2 }),
    );
    fuller.position.y = 0.52;
    g.add(fuller);

    const tipGeo = new THREE.ConeGeometry(0.035, 0.1, 4);
    const tip = new THREE.Mesh(tipGeo, steelMat);
    tip.position.y = 0.9;
    g.add(tip);

    return g;
  }

  private createAxeMesh(): THREE.Group {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.85 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.6, roughness: 0.35 });
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x3a2210, roughness: 0.8 });

    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.6, 6), woodMat);
    haft.position.y = 0.3;
    g.add(haft);

    const gripWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.2, 6), leatherMat);
    gripWrap.position.y = 0.12;
    g.add(gripWrap);

    const headGeo = new THREE.BoxGeometry(0.3, 0.22, 0.05, 4, 3, 1);
    const hp = headGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i);
      const y = hp.getY(i);
      if (x > 0) {
        hp.setX(i, x + Math.abs(y) * 0.3);
      }
      if (x < -0.1) {
        hp.setZ(i, hp.getZ(i) * 0.5);
      }
    }
    hp.needsUpdate = true;
    headGeo.computeVertexNormals();

    const axeHead = new THREE.Mesh(headGeo, ironMat);
    axeHead.position.set(0.08, 0.62, 0);
    axeHead.castShadow = true;
    g.add(axeHead);

    const binding = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 6), ironMat);
    binding.position.y = 0.62;
    g.add(binding);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 5), ironMat);
    cap.position.y = 0.0;
    cap.scale.set(1, 0.5, 1);
    g.add(cap);

    return g;
  }

  private createStaffMesh(): THREE.Group {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.8 });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x44aaff,
      emissive: 0x2266cc,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.85,
      metalness: 0.3,
      roughness: 0.1,
    });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.85, 6), woodMat);
    shaft.position.y = 0.42;
    g.add(shaft);

    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.02, 0.15, 4),
        woodMat,
      );
      branch.position.set(
        Math.cos(angle) * 0.04,
        0.82,
        Math.sin(angle) * 0.04,
      );
      branch.rotation.z = -Math.cos(angle) * 0.5;
      branch.rotation.x = Math.sin(angle) * 0.5;
      g.add(branch);
    }

    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 1), crystalMat);
    crystal.position.y = 0.92;
    crystal.name = 'staff-crystal';
    g.add(crystal);

    const innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.6,
      }),
    );
    innerGlow.position.y = 0.92;
    innerGlow.name = 'staff-inner-glow';
    g.add(innerGlow);

    const crystalLight = new THREE.PointLight(0x4488ff, 1.5, 4);
    crystalLight.position.y = 0.95;
    crystalLight.name = 'staff-light';
    g.add(crystalLight);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.03, 0.08, 5),
      new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.5, roughness: 0.3 }),
    );
    tip.position.y = -0.02;
    tip.rotation.x = Math.PI;
    g.add(tip);

    return g;
  }

  public equipWeapon(type: string) {
    this.weaponType = type;

    // Remove old weapon from weapon socket
    const socket = this.controller.getWeaponSocket();
    const oldWeapon = socket.getObjectByName('weapon');
    if (oldWeapon) socket.remove(oldWeapon);

    const newWeapon = this.createWeaponByType(type);
    newWeapon.name = 'weapon';

    if (this.controller.isModelLoaded) {
      newWeapon.scale.setScalar(1.0);
      newWeapon.position.set(0, -0.1, 0);
      newWeapon.rotation.set(-Math.PI / 2, Math.PI / 3, Math.PI / 6);
      this.controller.attachWeapon(newWeapon);
    } else {
      newWeapon.position.set(-0.5, 0.5, 0);
      this.mesh.add(newWeapon);
    }

    if (this.weaponRarity !== 'common') {
      this.setWeaponRarity(this.weaponRarity);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // ARMOR — visual overlays on torso (attached to group root)
  // ════════════════════════════════════════════════════════════════
  public equipArmor(tier: number) {
    this.armorTier = tier;

    const oldArmor = this.mesh.getObjectByName('armor-overlay');
    if (oldArmor) this.mesh.remove(oldArmor);

    if (tier <= 0) return;

    const isMale = this.gender === 'male';
    const torsoW = isMale ? 0.8 : 0.6;
    const torsoH = isMale ? 0.85 : 0.75;
    const torsoY = isMale ? 1.35 : 1.35;
    const shoulderX = torsoW / 2 + 0.08;
    const shoulderY = torsoY + torsoH / 2 - 0.1;
    const armorGroup = new THREE.Group();
    armorGroup.name = 'armor-overlay';

    if (tier === 1) {
      const vestMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.75 });
      const vest = new THREE.Mesh(
        new THREE.BoxGeometry(torsoW + 0.18, torsoH * 0.7, 0.48, 3, 4, 3),
        vestMat,
      );
      vest.position.y = torsoY + 0.06;
      vest.castShadow = true;
      armorGroup.add(vest);

      for (const side of [-1, 1]) {
        const strap = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, torsoH * 0.6, 0.08),
          new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.8 }),
        );
        strap.position.set(side * (torsoW / 2 - 0.05), torsoY + 0.06, -0.2);
        armorGroup.add(strap);
      }

      const rivetMat = new THREE.MeshStandardMaterial({ color: 0xaa8844, metalness: 0.5, roughness: 0.3 });
      for (let i = 0; i < 6; i++) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 4), rivetMat);
        rivet.position.set(
          (i % 2 === 0 ? -1 : 1) * (torsoW / 2 - 0.08),
          torsoY + torsoH * 0.3 - i * 0.12,
          -0.25,
        );
        armorGroup.add(rivet);
      }

    } else if (tier === 2) {
      const chainMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.5, roughness: 0.55 });
      const chainGeo = new THREE.BoxGeometry(torsoW + 0.2, torsoH * 0.78, 0.5, 4, 8, 3);
      const cp = chainGeo.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const y = cp.getY(i), x = cp.getX(i);
        const ripple = Math.sin(y * 30 + x * 20) * 0.005;
        cp.setZ(i, cp.getZ(i) + ripple);
      }
      cp.needsUpdate = true;
      chainGeo.computeVertexNormals();

      const chain = new THREE.Mesh(chainGeo, chainMat);
      chain.position.y = torsoY + 0.06;
      chain.castShadow = true;
      armorGroup.add(chain);

      for (const side of [-1, 1]) {
        const guardMat = new THREE.MeshStandardMaterial({ color: 0x667788, metalness: 0.5, roughness: 0.4 });
        const guard = new THREE.Mesh(
          new THREE.SphereGeometry(isMale ? 0.22 : 0.18, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
          guardMat,
        );
        guard.position.set(side * shoulderX, shoulderY + 0.08, 0);
        guard.castShadow = true;
        armorGroup.add(guard);

        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(isMale ? 0.2 : 0.16, 0.015, 4, 10),
          guardMat,
        );
        rim.position.set(side * shoulderX, shoulderY + 0.02, 0);
        rim.rotation.x = Math.PI / 2;
        armorGroup.add(rim);
      }

    } else if (tier >= 3) {
      const plateMat = new THREE.MeshStandardMaterial({ color: 0xaab0bb, metalness: 0.7, roughness: 0.2 });
      const trimMat = new THREE.MeshStandardMaterial({ color: 0xcc9933, metalness: 0.6, roughness: 0.25 });

      const plateGeo = new THREE.BoxGeometry(torsoW + 0.24, torsoH * 0.8, 0.52, 4, 6, 3);
      const pp = plateGeo.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const z = pp.getZ(i);
        if (z < -0.2) {
          const y = pp.getY(i);
          pp.setZ(i, z - Math.abs(y) * 0.06);
        }
      }
      pp.needsUpdate = true;
      plateGeo.computeVertexNormals();

      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.y = torsoY + 0.06;
      plate.castShadow = true;
      armorGroup.add(plate);

      for (const dy of [-0.15, 0, 0.15]) {
        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(torsoW + 0.25, 0.025, 0.53),
          trimMat,
        );
        trim.position.y = torsoY + dy;
        armorGroup.add(trim);
      }

      const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), trimMat);
      emblem.position.set(0, torsoY + 0.05, -0.28);
      armorGroup.add(emblem);

      for (const side of [-1, 1]) {
        const pauldron = new THREE.Mesh(
          new THREE.SphereGeometry(isMale ? 0.26 : 0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
          plateMat,
        );
        pauldron.position.set(side * (shoulderX + 0.03), shoulderY + 0.12, 0);
        pauldron.castShadow = true;
        armorGroup.add(pauldron);

        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.04, 0.15, 5),
          plateMat,
        );
        spike.position.set(side * (shoulderX + 0.03), shoulderY + 0.3, 0);
        armorGroup.add(spike);

        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(isMale ? 0.24 : 0.20, 0.018, 4, 10),
          trimMat,
        );
        rim.position.set(side * (shoulderX + 0.03), shoulderY + 0.06, 0);
        rim.rotation.x = Math.PI / 2;
        armorGroup.add(rim);
      }

      const gorget = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, 0.12, 8),
        plateMat,
      );
      gorget.position.y = shoulderY + 0.15;
      armorGroup.add(gorget);
    }

    this.mesh.add(armorGroup);
  }

  // ════════════════════════════════════════════════════════════════
  // HELMETS
  // ════════════════════════════════════════════════════════════════
  public equipHelmet(type: string) {
    this.helmetType = type;
    const isMale = this.gender === 'male';
    const headSize = isMale ? 0.3 : 0.27;
    const torsoH = isMale ? 0.85 : 0.75;
    const torsoY = isMale ? 1.35 : 1.35;
    const headY = torsoY + torsoH / 2 + headSize + 0.1;

    const oldHelmet = this.mesh.getObjectByName('helmet-overlay');
    if (oldHelmet) this.mesh.remove(oldHelmet);

    if (type === 'hood' || type === 'none') return;

    const helmetGroup = new THREE.Group();
    helmetGroup.name = 'helmet-overlay';

    if (type === 'leather-cap') {
      const capMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.75 });
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(headSize * 1.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
        capMat,
      );
      cap.position.y = headY + headSize * 0.15;
      cap.castShadow = true;
      helmetGroup.add(cap);

      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(headSize * 1.3, headSize * 1.35, 0.04, 12),
        capMat,
      );
      brim.position.y = headY - headSize * 0.15;
      helmetGroup.add(brim);

      for (const side of [-1, 1]) {
        const strap = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.25, 0.02),
          new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.8 }),
        );
        strap.position.set(side * headSize * 0.9, headY - headSize * 0.3, -headSize * 0.3);
        helmetGroup.add(strap);
      }

    } else if (type === 'iron-helm') {
      const ironMat = new THREE.MeshStandardMaterial({ color: 0x777788, metalness: 0.6, roughness: 0.35 });

      const domeGeo = new THREE.ConeGeometry(headSize * 1.2, headSize * 1.8, 10, 4);
      const dome = new THREE.Mesh(domeGeo, ironMat);
      dome.position.y = headY + headSize * 0.5;
      dome.castShadow = true;
      helmetGroup.add(dome);

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(headSize * 1.15, 0.025, 4, 12),
        ironMat,
      );
      rim.position.y = headY - headSize * 0.15;
      rim.rotation.x = Math.PI / 2;
      helmetGroup.add(rim);

      const nasal = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, headSize * 1.0, 0.03),
        ironMat,
      );
      nasal.position.set(0, headY + headSize * 0.1, -headSize * 1.1);
      helmetGroup.add(nasal);

      for (const side of [-1, 1]) {
        const cheek = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, headSize * 0.7, headSize * 0.5),
          ironMat,
        );
        cheek.position.set(side * headSize * 1.0, headY - headSize * 0.2, -headSize * 0.3);
        helmetGroup.add(cheek);
      }

    } else if (type === 'plate-helm') {
      const plateMat = new THREE.MeshStandardMaterial({ color: 0xaab0bb, metalness: 0.7, roughness: 0.2 });
      const trimMat = new THREE.MeshStandardMaterial({ color: 0xcc9933, metalness: 0.6, roughness: 0.25 });

      const shellGeo = new THREE.SphereGeometry(headSize * 1.35, 12, 10);
      const sp = shellGeo.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const y = sp.getY(i);
        if (y < -headSize * 0.5) {
          sp.setY(i, -headSize * 0.5);
        }
        const z = sp.getZ(i);
        if (z < -headSize * 0.8) {
          sp.setZ(i, z - 0.05);
        }
      }
      sp.needsUpdate = true;
      shellGeo.computeVertexNormals();

      const shell = new THREE.Mesh(shellGeo, plateMat);
      shell.position.y = headY + headSize * 0.15;
      shell.castShadow = true;
      helmetGroup.add(shell);

      const visorSlit = new THREE.Mesh(
        new THREE.BoxGeometry(headSize * 1.6, 0.04, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x111111 }),
      );
      visorSlit.position.set(0, headY + headSize * 0.15, -headSize * 1.37);
      helmetGroup.add(visorSlit);

      for (let i = 0; i < 5; i++) {
        const hole = new THREE.Mesh(
          new THREE.CircleGeometry(0.012, 5),
          new THREE.MeshBasicMaterial({ color: 0x111111 }),
        );
        hole.position.set((i - 2) * 0.04, headY - headSize * 0.05, -headSize * 1.36);
        helmetGroup.add(hole);
      }

      const crest = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, headSize * 0.4, headSize * 1.5),
        trimMat,
      );
      crest.position.y = headY + headSize * 0.8;
      helmetGroup.add(crest);

      const bottomRim = new THREE.Mesh(
        new THREE.TorusGeometry(headSize * 1.3, 0.02, 4, 12),
        trimMat,
      );
      bottomRim.position.y = headY - headSize * 0.35;
      bottomRim.rotation.x = Math.PI / 2;
      helmetGroup.add(bottomRim);
    }

    if (this.controller.isModelLoaded) {
      this.controller.attachToHead(helmetGroup);
    } else {
      this.mesh.add(helmetGroup);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // WEAPON GLOW — rarity-based glow effect
  // ════════════════════════════════════════════════════════════════
  public setWeaponRarity(rarity: string) {
    this.weaponRarity = rarity;

    const socket = this.controller.getWeaponSocket();
    const oldGlow = socket.getObjectByName('weapon-glow');
    if (oldGlow) socket.remove(oldGlow);
    const oldLight = socket.getObjectByName('weapon-glow-light');
    if (oldLight) socket.remove(oldLight);

    const rarityColors: Record<string, number> = {
      'uncommon': 0x44cc44,
      'rare': 0x4488ff,
      'epic': 0xaa44ff,
      'legendary': 0xff8822,
    };
    const color = rarityColors[rarity];
    if (!color) return;

    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: rarity === 'legendary' ? 0.4 : 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowSize = rarity === 'legendary' ? 0.5 : 0.35;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(glowSize, 8, 8), glowMat);
    glow.position.set(0, 0.3, 0);
    glow.name = 'weapon-glow';

    const intensity = rarity === 'legendary' ? 2.5 : (rarity === 'epic' ? 1.8 : 1.2);
    const glowLight = new THREE.PointLight(color, intensity, 3);
    glowLight.position.set(0, 0.3, 0);
    glowLight.name = 'weapon-glow-light';

    const weapon = socket.getObjectByName('weapon');
    if (weapon) {
      weapon.add(glow);
      weapon.add(glowLight);
    } else {
      socket.add(glow);
      socket.add(glowLight);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // KILL STREAK — brief body glow + particles
  // ════════════════════════════════════════════════════════════════
  public triggerKillStreak(count: number) {
    this.killStreakCount = count;
    this.killStreakTimer = 2.0;

    const old = this.mesh.getObjectByName('killstreak-glow');
    if (old) this.mesh.remove(old);

    let color = 0xffcc44;
    if (count >= 10) color = 0xff2222;
    else if (count >= 5) color = 0xff6622;

    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.15, 6, 16),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.rotation.x = Math.PI / 2;
    glow.position.y = 1.0;
    glow.name = 'killstreak-glow';
    this.mesh.add(glow);

    for (let i = 0; i < 8; i++) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 4),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      particle.name = `killstreak-particle-${i}`;
      particle.userData = {
        phase: (i / 8) * Math.PI * 2,
        speed: 1 + Math.random() * 1.5,
        radius: 0.4 + Math.random() * 0.4,
      };
      particle.position.y = 0.5;
      this.mesh.add(particle);
    }
  }

  /** Called every render frame for smooth local movement. */
  applyFrameMovement(
    yaw: number, dt: number,
    forward: boolean, backward: boolean, left: boolean, right: boolean,
    jump: boolean,
  ) {
    const move = computeMovement({
      seq: -1, forward, backward, left, right, jump: false,
      rotation: yaw, dt,
    });
    this.position.x += move.dx;
    this.position.z += move.dz;

    if (Math.abs(move.dx) > 0.001 || Math.abs(move.dz) > 0.001) {
      this.targetRotation = Math.atan2(-move.dx, -move.dz);
    }

    if (jump && this.isGrounded) {
      this.velocityY = 8;
      this.isGrounded = false;
    }

    if (!this.isGrounded) {
      this.velocityY -= 20 * dt;
    }
    this.position.y += this.velocityY * dt;

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
    this.worldColliderWalls();
  }

  /** Called at 20Hz - tracks input for server reconciliation + handles attack. */
  trackNetworkInput(input: PlayerInput) {
    this.pendingInputs.push(input);

    if (input.attack) {
      const clipDur = this.controller.getClipDuration('attack');
      this.attackAnimation = clipDur > 0 ? clipDur : 0.8;
      this.controller.transitionTo('attack');
      this.controller.onAnimationFinished(() => {
        this.attackAnimation = 0;
        this.controller.transitionTo('idle');
      });
    }
  }

  // Altar collision - 3 visual tiers, all scaled 0.65x, centred at (0, 15)
  private static readonly AX = 0;
  private static readonly AZ = 15;
  private static readonly T_TOP_R = 1.3;
  private static readonly T_MID_R = 2.08;
  private static readonly T_BOT_R = 2.925;
  private static readonly T_TOP_H = 0.91;
  private static readonly T_MID_H = 0.65;
  private static readonly T_BOT_H = 0.325;
  private static readonly RAMP = 2.0;
  private static readonly RHW = 1.0;

  private static readonly FNT_R = 3.6;

  private static readonly SHOP_X1 = -31.3;
  private static readonly SHOP_X2 = -22.7;
  private static readonly SHOP_Z1 = -16.3;
  private static readonly SHOP_Z2 = -7.7;

  private getFloorHeight(): number {
    return 0;
  }

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

  // Push player out of all world colliders (rocks, lanterns, pillars, NPCs)
  private worldColliderWalls() {
    const playerR = 0.3; // player body radius
    for (const c of this.worldColliders) {
      const dx = this.position.x - c.x;
      const dz = this.position.z - c.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = c.r + playerR;
      if (dist < minDist && dist > 0.001) {
        this.position.x = c.x + (dx / dist) * minDist;
        this.position.z = c.z + (dz / dist) * minDist;
      }
    }
  }

  setWorldColliders(colliders: WorldCollider[]) {
    this.worldColliders = colliders;
  }

  reconcile(serverX: number, serverZ: number, lastProcessedInput: number) {
    this.pendingInputs = this.pendingInputs.filter(i => i.seq > lastProcessedInput);

    // Compute where reconciled position should be
    let reconX = serverX;
    let reconZ = serverZ;
    for (const input of this.pendingInputs) {
      const move = computeMovement(input);
      reconX += move.dx;
      reconZ += move.dz;
    }

    // Blend correction to avoid snapping (server and client usually agree closely)
    const dx = reconX - this.position.x;
    const dz = reconZ - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 3.0) {
      // Large desync (teleport/respawn): snap immediately
      this.position.x = reconX;
      this.position.z = reconZ;
    } else {
      // Small correction: blend smoothly
      this.position.x += dx * 0.3;
      this.position.z += dz * 0.3;
    }
  }

  update(dt: number, time: number, isMoving: boolean, cameraYaw?: number, isSprinting = false, isCrouching = false) {
    // ── Smooth visual interpolation ────────────────────────────────
    const posLerp = Math.min(1, dt * 20);
    this.visualPos.x += (this.position.x - this.visualPos.x) * posLerp;
    this.visualPos.y += (this.position.y - this.visualPos.y) * posLerp;
    this.visualPos.z += (this.position.z - this.visualPos.z) * posLerp;
    this.mesh.position.copy(this.visualPos);

    // Face camera direction so weapon points where you're looking
    const aimTarget = cameraYaw != null ? cameraYaw : this.targetRotation;
    let angleDiff = aimTarget - this.visualRot;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.visualRot += angleDiff * Math.min(1, dt * 14);
    this.rotation = this.visualRot;
    this.mesh.rotation.y = this.visualRot;

    // ── Animation state transitions via CharacterController ──────
    if (this.attackAnimation > 0) {
      this.attackAnimation -= dt;
    } else if (isCrouching) {
      this.controller.transitionTo('crouch');
    } else if (isMoving && isSprinting) {
      this.controller.transitionTo('run');
    } else if (isMoving) {
      this.controller.transitionTo('walk');
    } else {
      this.controller.transitionTo('idle');
    }
    this.controller.update(dt);

    // ── Weapon glow pulse ────────────────────────────────────────
    const weaponGlow = this.mesh.getObjectByName('weapon-glow');
    if (weaponGlow) {
      const glowPulse = 0.8 + Math.sin(time * 3) * 0.2;
      const basePulseOpacity = this.weaponRarity === 'legendary' ? 0.4 : 0.25;
      (weaponGlow as THREE.Mesh).scale.setScalar(glowPulse);
      const mat = (weaponGlow as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = basePulseOpacity * glowPulse;
    }

    // Staff crystal spin
    const staffCrystal = this.mesh.getObjectByName('staff-crystal');
    if (staffCrystal) {
      staffCrystal.rotation.y = time * 2;
      staffCrystal.rotation.x = Math.sin(time * 1.5) * 0.3;
    }
    const staffGlow = this.mesh.getObjectByName('staff-inner-glow');
    if (staffGlow) {
      const pulse = 0.4 + Math.sin(time * 4) * 0.3;
      (staffGlow as THREE.Mesh).scale.setScalar(0.8 + pulse * 0.4);
      ((staffGlow as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = pulse;
    }

    // ── Kill streak effect ───────────────────────────────────────
    if (this.killStreakTimer > 0) {
      this.killStreakTimer -= dt;
      const ksGlow = this.mesh.getObjectByName('killstreak-glow');
      if (ksGlow) {
        const t = this.killStreakTimer / 2.0;
        const mat = (ksGlow as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = t * 0.6;
        ksGlow.scale.setScalar(1 + (1 - t) * 0.5);
        ksGlow.rotation.z = time * 3;
        ksGlow.position.y = 1.0 + Math.sin(time * 4) * 0.2;
      }

      for (let i = 0; i < 8; i++) {
        const p = this.mesh.getObjectByName(`killstreak-particle-${i}`);
        if (p) {
          const d = p.userData;
          const t = this.killStreakTimer / 2.0;
          const angle = d.phase + time * d.speed * 2;
          p.position.x = Math.cos(angle) * d.radius;
          p.position.z = Math.sin(angle) * d.radius;
          p.position.y = 0.5 + (1 - t) * 3;
          const mat = (p as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.opacity = t * 0.7;
        }
      }

      if (this.killStreakTimer <= 0) {
        const g = this.mesh.getObjectByName('killstreak-glow');
        if (g) this.mesh.remove(g);
        for (let i = 0; i < 8; i++) {
          const p = this.mesh.getObjectByName(`killstreak-particle-${i}`);
          if (p) this.mesh.remove(p);
        }
      }
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
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}

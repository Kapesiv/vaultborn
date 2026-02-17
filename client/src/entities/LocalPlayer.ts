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

  // Visual smoothing — mesh lerps toward logic position
  private visualPos = new THREE.Vector3(0, 0.91, 16);
  private visualRot = 0;
  private targetRotation = 0;
  private walkCycle = 0; // accumulated walk phase for smooth animation

  private pendingInputs: PlayerInput[] = [];
  private attackAnimation = 0;
  private velocityY = 0;
  private isGrounded = true;
  private spawnGlow: THREE.Mesh | null = null;
  private spawnTimer = 2.0; // spawn effect duration

  // Equipment state
  private weaponType = 'bone-club';
  private armorTier = 0;
  private helmetType = 'hood';
  private weaponRarity = 'common';
  private killStreakTimer = 0;
  private killStreakCount = 0;
  private weaponGlowMesh: THREE.Mesh | null = null;
  public nameSprite: THREE.Sprite | null = null;

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

    // Nameplate with level
    this.nameSprite = this.createNameplate('Adventurer', 1);
    this.mesh.add(this.nameSprite);
  }

  // ════════════════════════════════════════════════════════════════
  // NAMEPLATE — name, level, title above head
  // ════════════════════════════════════════════════════════════════
  private createNameplate(name: string, level: number, title?: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Level + Name
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    const mainText = `Lv.${level}  ${name}`;
    ctx.strokeText(mainText, 256, 45);
    ctx.fillText(mainText, 256, 45);

    // Title (smaller, gold color)
    if (title) {
      ctx.font = 'italic 22px Arial';
      ctx.fillStyle = '#ffd700';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(title, 256, 80);
      ctx.fillText(title, 256, 80);
    }

    // Health bar background
    ctx.fillStyle = '#333333';
    ctx.fillRect(156, 92, 200, 12);
    // Health bar fill
    ctx.fillStyle = '#44cc44';
    ctx.fillRect(156, 92, 200, 12);
    // Health bar border
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.strokeRect(156, 92, 200, 12);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.y = 3.2;
    sprite.scale.set(3, 0.75, 1);
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
  private createWeaponByType(type: string): THREE.Group {
    switch (type) {
      case 'iron-sword': return this.createSwordMesh();
      case 'battle-axe': return this.createAxeMesh();
      case 'magic-staff': return this.createStaffMesh();
      default: return this.createBoneClubMesh();
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

    // Grip (handle)
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.28, 6), gripMat);
    grip.position.y = 0.14;
    g.add(grip);

    // Grip wrapping detail
    for (let i = 0; i < 4; i++) {
      const wrap = new THREE.Mesh(
        new THREE.TorusGeometry(0.04, 0.006, 4, 6),
        goldMat,
      );
      wrap.position.y = 0.04 + i * 0.07;
      wrap.rotation.x = Math.PI / 2;
      g.add(wrap);
    }

    // Pommel
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), goldMat);
    pommel.position.y = -0.01;
    pommel.scale.set(1, 0.6, 1);
    g.add(pommel);

    // Crossguard
    const crossGuard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.06), goldMat);
    crossGuard.position.y = 0.3;
    g.add(crossGuard);

    // Crossguard tips (small spheres)
    for (const side of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 5), goldMat);
      tip.position.set(side * 0.14, 0.3, 0);
      g.add(tip);
    }

    // Blade — tapered flat box with edge
    const bladeGeo = new THREE.BoxGeometry(0.07, 0.55, 0.02, 2, 6, 1);
    const bp = bladeGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i);
      const taper = 1 - (y / 0.55) * 0.4; // narrower at tip
      bp.setX(i, bp.getX(i) * taper);
    }
    bp.needsUpdate = true;
    bladeGeo.computeVertexNormals();

    const blade = new THREE.Mesh(bladeGeo, steelMat);
    blade.position.y = 0.58;
    blade.castShadow = true;
    g.add(blade);

    // Central fuller (groove)
    const fuller = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.4, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x999aaa, metalness: 0.8, roughness: 0.2 }),
    );
    fuller.position.y = 0.52;
    g.add(fuller);

    // Blade tip
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

    // Wooden haft
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.6, 6), woodMat);
    haft.position.y = 0.3;
    g.add(haft);

    // Leather grip wrapping
    const gripWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.2, 6), leatherMat);
    gripWrap.position.y = 0.12;
    g.add(gripWrap);

    // Axe head — curved wedge shape
    const headGeo = new THREE.BoxGeometry(0.3, 0.22, 0.05, 4, 3, 1);
    const hp = headGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i);
      const y = hp.getY(i);
      // Curve the cutting edge
      if (x > 0) {
        hp.setX(i, x + Math.abs(y) * 0.3);
      }
      // Taper back edge
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

    // Axe head binding (where head meets haft)
    const binding = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 6), ironMat);
    binding.position.y = 0.62;
    g.add(binding);

    // Bottom cap
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

    // Wooden shaft (longer than other weapons)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.85, 6), woodMat);
    shaft.position.y = 0.42;
    g.add(shaft);

    // Gnarled top with branches holding crystal
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

    // Crystal orb
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 1), crystalMat);
    crystal.position.y = 0.92;
    crystal.name = 'staff-crystal';
    g.add(crystal);

    // Crystal inner glow
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

    // Crystal light
    const crystalLight = new THREE.PointLight(0x4488ff, 1.5, 4);
    crystalLight.position.y = 0.95;
    crystalLight.name = 'staff-light';
    g.add(crystalLight);

    // Bottom metal tip
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
    const rightArm = this.mesh.getObjectByName('rightArm');
    if (!rightArm) return;

    // Remove old weapon
    const oldWeapon = rightArm.getObjectByName('weapon');
    if (oldWeapon) rightArm.remove(oldWeapon);

    // Create and attach new weapon
    const isMale = this.gender === 'male';
    const torsoH = isMale ? 0.85 : 0.75;
    const newWeapon = this.createWeaponByType(type);
    newWeapon.position.set(0.05, -(0.45 + torsoH / 2), -0.15);
    newWeapon.rotation.x = -Math.PI / 2;
    newWeapon.name = 'weapon';
    rightArm.add(newWeapon);

    // Re-apply weapon glow
    if (this.weaponRarity !== 'common') {
      this.setWeaponRarity(this.weaponRarity);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // ARMOR — visual overlays on torso
  // ════════════════════════════════════════════════════════════════
  public equipArmor(tier: number) {
    this.armorTier = tier;

    // Remove old armor
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
      // Leather armor — brown vest
      const vestMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.75 });
      const vest = new THREE.Mesh(
        new THREE.BoxGeometry(torsoW + 0.18, torsoH * 0.7, 0.48, 3, 4, 3),
        vestMat,
      );
      vest.position.y = torsoY + 0.06;
      vest.castShadow = true;
      armorGroup.add(vest);

      // Leather straps
      for (const side of [-1, 1]) {
        const strap = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, torsoH * 0.6, 0.08),
          new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.8 }),
        );
        strap.position.set(side * (torsoW / 2 - 0.05), torsoY + 0.06, -0.2);
        armorGroup.add(strap);
      }

      // Small rivets
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
      // Chain mail — silver/grey layered look
      const chainMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.5, roughness: 0.55 });
      const chainGeo = new THREE.BoxGeometry(torsoW + 0.2, torsoH * 0.78, 0.5, 4, 8, 3);
      // Ripple to simulate chainmail links
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

      // Shoulder guards
      for (const side of [-1, 1]) {
        const guardMat = new THREE.MeshStandardMaterial({ color: 0x667788, metalness: 0.5, roughness: 0.4 });
        const guard = new THREE.Mesh(
          new THREE.SphereGeometry(isMale ? 0.22 : 0.18, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
          guardMat,
        );
        guard.position.set(side * shoulderX, shoulderY + 0.08, 0);
        guard.castShadow = true;
        armorGroup.add(guard);

        // Edge rim
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(isMale ? 0.2 : 0.16, 0.015, 4, 10),
          guardMat,
        );
        rim.position.set(side * shoulderX, shoulderY + 0.02, 0);
        rim.rotation.x = Math.PI / 2;
        armorGroup.add(rim);
      }

    } else if (tier >= 3) {
      // Plate armor — full metal chest plate
      const plateMat = new THREE.MeshStandardMaterial({ color: 0xaab0bb, metalness: 0.7, roughness: 0.2 });
      const trimMat = new THREE.MeshStandardMaterial({ color: 0xcc9933, metalness: 0.6, roughness: 0.25 });

      // Chest plate
      const plateGeo = new THREE.BoxGeometry(torsoW + 0.24, torsoH * 0.8, 0.52, 4, 6, 3);
      const pp = plateGeo.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const z = pp.getZ(i);
        if (z < -0.2) {
          // Rounded front
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

      // Gold trim lines
      for (const dy of [-0.15, 0, 0.15]) {
        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(torsoW + 0.25, 0.025, 0.53),
          trimMat,
        );
        trim.position.y = torsoY + dy;
        armorGroup.add(trim);
      }

      // Center emblem
      const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), trimMat);
      emblem.position.set(0, torsoY + 0.05, -0.28);
      armorGroup.add(emblem);

      // Big pauldrons
      for (const side of [-1, 1]) {
        const pauldron = new THREE.Mesh(
          new THREE.SphereGeometry(isMale ? 0.26 : 0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
          plateMat,
        );
        pauldron.position.set(side * (shoulderX + 0.03), shoulderY + 0.12, 0);
        pauldron.castShadow = true;
        armorGroup.add(pauldron);

        // Pauldron spike
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.04, 0.15, 5),
          plateMat,
        );
        spike.position.set(side * (shoulderX + 0.03), shoulderY + 0.3, 0);
        armorGroup.add(spike);

        // Gold rim
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(isMale ? 0.24 : 0.20, 0.018, 4, 10),
          trimMat,
        );
        rim.position.set(side * (shoulderX + 0.03), shoulderY + 0.06, 0);
        rim.rotation.x = Math.PI / 2;
        armorGroup.add(rim);
      }

      // Gorget (neck guard)
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
  // HELMETS — replaces hood
  // ════════════════════════════════════════════════════════════════
  public equipHelmet(type: string) {
    this.helmetType = type;
    const isMale = this.gender === 'male';
    const headSize = isMale ? 0.3 : 0.27;
    const torsoH = isMale ? 0.85 : 0.75;
    const torsoY = isMale ? 1.35 : 1.35;
    const headY = torsoY + torsoH / 2 + headSize + 0.1;

    // Remove old helmet/hood
    const oldHelmet = this.mesh.getObjectByName('helmet-overlay');
    if (oldHelmet) this.mesh.remove(oldHelmet);

    // Show/hide hood
    const hood = this.mesh.getObjectByName('hood');
    if (hood) hood.visible = (type === 'hood' || type === 'none');

    if (type === 'hood' || type === 'none') return;

    const helmetGroup = new THREE.Group();
    helmetGroup.name = 'helmet-overlay';

    if (type === 'leather-cap') {
      // Simple rounded leather helmet
      const capMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.75 });
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(headSize * 1.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
        capMat,
      );
      cap.position.y = headY + headSize * 0.15;
      cap.castShadow = true;
      helmetGroup.add(cap);

      // Brim
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(headSize * 1.3, headSize * 1.35, 0.04, 12),
        capMat,
      );
      brim.position.y = headY - headSize * 0.15;
      helmetGroup.add(brim);

      // Chin strap
      for (const side of [-1, 1]) {
        const strap = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.25, 0.02),
          new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.8 }),
        );
        strap.position.set(side * headSize * 0.9, headY - headSize * 0.3, -headSize * 0.3);
        helmetGroup.add(strap);
      }

    } else if (type === 'iron-helm') {
      // Conical iron nasal helmet (viking/norman style)
      const ironMat = new THREE.MeshStandardMaterial({ color: 0x777788, metalness: 0.6, roughness: 0.35 });

      // Main dome — conical
      const domeGeo = new THREE.ConeGeometry(headSize * 1.2, headSize * 1.8, 10, 4);
      const dome = new THREE.Mesh(domeGeo, ironMat);
      dome.position.y = headY + headSize * 0.5;
      dome.castShadow = true;
      helmetGroup.add(dome);

      // Bottom rim
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(headSize * 1.15, 0.025, 4, 12),
        ironMat,
      );
      rim.position.y = headY - headSize * 0.15;
      rim.rotation.x = Math.PI / 2;
      helmetGroup.add(rim);

      // Nasal guard (nose protector)
      const nasal = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, headSize * 1.0, 0.03),
        ironMat,
      );
      nasal.position.set(0, headY + headSize * 0.1, -headSize * 1.1);
      helmetGroup.add(nasal);

      // Cheek guards
      for (const side of [-1, 1]) {
        const cheek = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, headSize * 0.7, headSize * 0.5),
          ironMat,
        );
        cheek.position.set(side * headSize * 1.0, headY - headSize * 0.2, -headSize * 0.3);
        helmetGroup.add(cheek);
      }

    } else if (type === 'plate-helm') {
      // Full enclosed knight helmet with visor
      const plateMat = new THREE.MeshStandardMaterial({ color: 0xaab0bb, metalness: 0.7, roughness: 0.2 });
      const trimMat = new THREE.MeshStandardMaterial({ color: 0xcc9933, metalness: 0.6, roughness: 0.25 });

      // Main helmet shell
      const shellGeo = new THREE.SphereGeometry(headSize * 1.35, 12, 10);
      const sp = shellGeo.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const y = sp.getY(i);
        // Flatten bottom, extend slightly at back
        if (y < -headSize * 0.5) {
          sp.setY(i, -headSize * 0.5);
        }
        // Slight forward extension for visor area
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

      // Visor slit
      const visorSlit = new THREE.Mesh(
        new THREE.BoxGeometry(headSize * 1.6, 0.04, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x111111 }),
      );
      visorSlit.position.set(0, headY + headSize * 0.15, -headSize * 1.37);
      helmetGroup.add(visorSlit);

      // Breather holes (dots below visor)
      for (let i = 0; i < 5; i++) {
        const hole = new THREE.Mesh(
          new THREE.CircleGeometry(0.012, 5),
          new THREE.MeshBasicMaterial({ color: 0x111111 }),
        );
        hole.position.set((i - 2) * 0.04, headY - headSize * 0.05, -headSize * 1.36);
        helmetGroup.add(hole);
      }

      // Top crest ridge
      const crest = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, headSize * 0.4, headSize * 1.5),
        trimMat,
      );
      crest.position.y = headY + headSize * 0.8;
      helmetGroup.add(crest);

      // Gold trim around bottom
      const bottomRim = new THREE.Mesh(
        new THREE.TorusGeometry(headSize * 1.3, 0.02, 4, 12),
        trimMat,
      );
      bottomRim.position.y = headY - headSize * 0.35;
      bottomRim.rotation.x = Math.PI / 2;
      helmetGroup.add(bottomRim);
    }

    this.mesh.add(helmetGroup);
  }

  // ════════════════════════════════════════════════════════════════
  // WEAPON GLOW — rarity-based glow effect
  // ════════════════════════════════════════════════════════════════
  public setWeaponRarity(rarity: string) {
    this.weaponRarity = rarity;

    // Remove old glow
    const rightArm = this.mesh.getObjectByName('rightArm');
    if (!rightArm) return;
    const oldGlow = rightArm.getObjectByName('weapon-glow');
    if (oldGlow) rightArm.remove(oldGlow);
    const oldLight = rightArm.getObjectByName('weapon-glow-light');
    if (oldLight) rightArm.remove(oldLight);

    const rarityColors: Record<string, number> = {
      'uncommon': 0x44cc44,
      'rare': 0x4488ff,
      'epic': 0xaa44ff,
      'legendary': 0xff8822,
    };
    const color = rarityColors[rarity];
    if (!color) return;

    const isMale = this.gender === 'male';
    const torsoH = isMale ? 0.85 : 0.75;
    const weaponY = -(0.45 + torsoH / 2);

    // Glow mesh around weapon
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: rarity === 'legendary' ? 0.4 : 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowSize = rarity === 'legendary' ? 0.5 : 0.35;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(glowSize, 8, 8), glowMat);
    glow.position.set(0.05, weaponY - 0.5, -0.15);
    glow.name = 'weapon-glow';
    rightArm.add(glow);

    // Point light
    const intensity = rarity === 'legendary' ? 2.5 : (rarity === 'epic' ? 1.8 : 1.2);
    const glowLight = new THREE.PointLight(color, intensity, 3);
    glowLight.position.set(0.05, weaponY - 0.5, -0.15);
    glowLight.name = 'weapon-glow-light';
    rightArm.add(glowLight);
  }

  // ════════════════════════════════════════════════════════════════
  // KILL STREAK — brief body glow + particles
  // ════════════════════════════════════════════════════════════════
  public triggerKillStreak(count: number) {
    this.killStreakCount = count;
    this.killStreakTimer = 2.0; // 2 seconds of effect

    // Remove old streak glow
    const old = this.mesh.getObjectByName('killstreak-glow');
    if (old) this.mesh.remove(old);

    // Color intensifies with streak count
    let color = 0xffcc44;
    if (count >= 10) color = 0xff2222;
    else if (count >= 5) color = 0xff6622;

    // Body glow ring
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

    // Rising particles
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

  applyInput(input: PlayerInput) {
    const move = computeMovement(input);
    this.position.x += move.dx;
    this.position.z += move.dz;

    // Face movement direction (set target, smoothed in update)
    if (Math.abs(move.dx) > 0.001 || Math.abs(move.dz) > 0.001) {
      this.targetRotation = Math.atan2(-move.dx, -move.dz);
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
    // ── Smooth visual interpolation ────────────────────────────────
    // Lerp visual position toward logic position (removes 20Hz stutter)
    const posLerp = Math.min(1, dt * 18); // fast but smooth
    this.visualPos.x += (this.position.x - this.visualPos.x) * posLerp;
    this.visualPos.y += (this.position.y - this.visualPos.y) * posLerp;
    this.visualPos.z += (this.position.z - this.visualPos.z) * posLerp;
    this.mesh.position.copy(this.visualPos);

    // Smooth rotation with shortest-path angle wrapping
    let angleDiff = this.targetRotation - this.visualRot;
    // Wrap to [-PI, PI] for shortest turn
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.visualRot += angleDiff * Math.min(1, dt * 14);
    this.rotation = this.visualRot;
    this.mesh.rotation.y = this.visualRot;

    const leftLeg = this.mesh.getObjectByName('leftLeg');
    const rightLeg = this.mesh.getObjectByName('rightLeg');
    const leftArm = this.mesh.getObjectByName('leftArm');
    const rightArm = this.mesh.getObjectByName('rightArm');

    if (isMoving) {
      // Accumulate walk cycle for smooth animation (speed-based)
      this.walkCycle += dt * 10;
      const swing = Math.sin(this.walkCycle) * 0.5;
      if (leftLeg) leftLeg.rotation.x = swing;
      if (rightLeg) rightLeg.rotation.x = -swing;
      if (leftArm) leftArm.rotation.x = -swing * 0.5;
      if (rightArm) rightArm.rotation.x = swing * 0.5;
    } else {
      // Smoothly return limbs to idle (not instant snap)
      const returnSpeed = Math.min(1, dt * 8);
      const breathe = Math.sin(time * 2) * 0.02;
      if (leftLeg) leftLeg.rotation.x += (0 - leftLeg.rotation.x) * returnSpeed;
      if (rightLeg) rightLeg.rotation.x += (0 - rightLeg.rotation.x) * returnSpeed;
      if (leftArm) leftArm.rotation.x += (breathe - leftArm.rotation.x) * returnSpeed;
      if (rightArm) rightArm.rotation.x += (-breathe - rightArm.rotation.x) * returnSpeed;
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

    // ---- Weapon glow pulse ----
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

    // ---- Kill streak effect ----
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

      // Animate rising particles
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

      // Cleanup when done
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

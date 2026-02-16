import * as THREE from 'three';
import { computeMovement, type PlayerInput } from '@saab/shared';

export type Gender = 'male' | 'female';

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
    this.mesh = this.buildCaveCharacter(gender);
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

  private buildCaveCharacter(gender: Gender): THREE.Group {
    const g = new THREE.Group();
    const isMale = gender === 'male';

    // ======== Materials ========
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc8956c, roughness: 0.65, metalness: 0.02 });
    const fabricDark = new THREE.MeshStandardMaterial({ color: 0x33261a, roughness: 0.92, side: THREE.DoubleSide });
    const fabricLight = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.9, side: THREE.DoubleSide });
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.85 });
    const furMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 1.0 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x997733, metalness: 0.6, roughness: 0.3 });

    // ======== Dimensions ========
    const legW = isMale ? 0.16 : 0.13;
    const legH = isMale ? 0.7 : 0.75;
    const legSpread = isMale ? 0.22 : 0.18;
    const torsoW = isMale ? 0.8 : 0.6;
    const torsoH = isMale ? 0.85 : 0.75;
    const torsoY = isMale ? 1.35 : 1.35;
    const headSize = isMale ? 0.3 : 0.27;
    const shoulderX = torsoW / 2 + 0.08;
    const shoulderY = torsoY + torsoH / 2 - 0.1;
    const headY = torsoY + torsoH / 2 + headSize + 0.1;
    const armW = isMale ? 0.12 : 0.09;
    const armH = isMale ? 0.55 : 0.5;
    const armX = shoulderX + 0.05;
    const waistY = torsoY - torsoH / 2 + 0.1;

    // ======== Legs (mostly hidden by tunic) ========
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(legW, legH, 6, 10), skinMat);
      leg.position.set(side * legSpread, legH / 2 + 0.1, 0);
      leg.castShadow = true;
      leg.name = side === -1 ? 'leftLeg' : 'rightLeg';
      g.add(leg);
    }

    // ======== Boots ========
    for (const side of [-legSpread, legSpread]) {
      // Boot shaft
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(legW + 0.04, legW + 0.06, 0.4, 8),
        leatherMat,
      );
      shaft.position.set(side, 0.3, 0);
      shaft.castShadow = true;
      g.add(shaft);

      // Boot foot
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.32), leatherMat);
      foot.position.set(side, 0.06, -0.03);
      g.add(foot);

      // Boot strap
      const strap = new THREE.Mesh(
        new THREE.TorusGeometry(legW + 0.055, 0.012, 4, 8),
        metalMat,
      );
      strap.position.set(side, 0.4, 0);
      strap.rotation.x = Math.PI / 2;
      g.add(strap);
    }

    // ======== Torso (hidden by tunic) ========
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(torsoW - 0.05, torsoH, 0.35),
      skinMat,
    );
    torso.position.y = torsoY;
    g.add(torso);

    // ======== Upper tunic (rigid) ========
    // Shoulder pauldrons
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(
        new THREE.SphereGeometry(isMale ? 0.2 : 0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
        fabricDark,
      );
      pad.position.set(side * shoulderX, shoulderY + 0.05, 0);
      pad.castShadow = true;
      g.add(pad);
    }

    // Tunic chest piece with wrinkle detail
    const upperGeo = new THREE.BoxGeometry(torsoW + 0.12, torsoH * 0.75, 0.44, 4, 6, 4);
    const utp = upperGeo.attributes.position;
    for (let i = 0; i < utp.count; i++) {
      const ux = utp.getX(i), uy = utp.getY(i), uz = utp.getZ(i);
      const wrinkle = Math.sin(uy * 14 + ux * 9) * 0.007 + Math.sin(uy * 22 + uz * 11) * 0.004;
      utp.setX(i, ux + wrinkle);
      utp.setZ(i, uz + wrinkle * 0.6);
    }
    utp.needsUpdate = true;
    upperGeo.computeVertexNormals();

    const upperTunic = new THREE.Mesh(upperGeo, fabricDark);
    upperTunic.position.y = torsoY + 0.06;
    upperTunic.castShadow = true;
    g.add(upperTunic);

    // Cross-chest leather strap
    const chestStrap = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, torsoH + 0.1, 0.06),
      leatherMat,
    );
    chestStrap.position.set(isMale ? -0.12 : -0.08, torsoY, -0.24);
    chestStrap.rotation.z = 0.35;
    g.add(chestStrap);

    // ======== Tunic skirt (animated cloth) ========
    const skirtTopR = isMale ? 0.43 : 0.35;
    const skirtBotR = isMale ? 0.52 : 0.44;
    const skirtH = 0.6;
    const skirtGeo = new THREE.CylinderGeometry(skirtTopR, skirtBotR, skirtH, 16, 10, true);

    // Wrinkle folds in the skirt
    const sp = skirtGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const sx = sp.getX(i), sy = sp.getY(i), sz = sp.getZ(i);
      const dist = Math.sqrt(sx * sx + sz * sz);
      if (dist > 0.01) {
        const fold = Math.sin(sy * 16 + Math.atan2(sz, sx) * 6) * 0.012;
        sp.setX(i, sx + (sx / dist) * fold);
        sp.setZ(i, sz + (sz / dist) * fold);
      }
    }
    sp.needsUpdate = true;
    skirtGeo.computeVertexNormals();

    this.tunicGeo = skirtGeo;
    this.tunicOrigPos = new Float32Array(skirtGeo.attributes.position.array);

    // Vertex colors for worn/weathered fabric
    const skirtCount = skirtGeo.attributes.position.count;
    const skirtColors = new Float32Array(skirtCount * 3);
    for (let i = 0; i < skirtCount; i++) {
      const sy = skirtGeo.attributes.position.getY(i);
      const n = Math.sin(sy * 12 + i * 0.17) * 0.5 + 0.5;
      const hem = Math.max(0, (-sy - skirtH * 0.3) / (skirtH * 0.2)); // lighter at hem edge
      skirtColors[i * 3] = 0.20 + n * 0.04 + hem * 0.06;
      skirtColors[i * 3 + 1] = 0.15 + n * 0.03 + hem * 0.04;
      skirtColors[i * 3 + 2] = 0.10 + n * 0.02 + hem * 0.02;
    }
    skirtGeo.setAttribute('color', new THREE.BufferAttribute(skirtColors, 3));

    const skirtMesh = new THREE.Mesh(skirtGeo, new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      side: THREE.DoubleSide,
    }));
    skirtMesh.position.y = waistY - skirtH / 2;
    skirtMesh.castShadow = true;
    skirtMesh.name = 'tunicSkirt';
    g.add(skirtMesh);

    // ======== Belt ========
    const belt = new THREE.Mesh(
      new THREE.TorusGeometry(skirtTopR + 0.02, 0.035, 6, 16),
      leatherMat,
    );
    belt.position.y = waistY;
    belt.rotation.x = Math.PI / 2;
    g.add(belt);

    // Belt buckle
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.04), metalMat);
    buckle.position.set(0, waistY, -(skirtTopR + 0.04));
    g.add(buckle);

    // Small pouch on belt
    const pouch = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.1, 0.08),
      leatherMat,
    );
    pouch.position.set(isMale ? 0.35 : 0.28, waistY - 0.06, -0.1);
    g.add(pouch);

    // ======== Arms with sleeves ========
    // Left arm
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-armX, shoulderY, 0);
    leftArmGroup.name = 'leftArm';
    g.add(leftArmGroup);

    // Sleeve (fabric, upper arm)
    const leftSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(armW + 0.02, armW + 0.05, armH * 0.5, 8),
      fabricDark,
    );
    leftSleeve.position.y = -(armH * 0.25 + armW);
    leftSleeve.castShadow = true;
    leftArmGroup.add(leftSleeve);

    // Forearm skin
    const leftForearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(armW * 0.9, armH * 0.4, 6, 8),
      skinMat,
    );
    leftForearm.position.y = -(armH * 0.6 + armW);
    leftForearm.castShadow = true;
    leftArmGroup.add(leftForearm);

    // Bracer with wrapping detail
    const leftBracer = new THREE.Mesh(
      new THREE.CylinderGeometry(armW + 0.03, armW + 0.05, 0.18, 6),
      furMat,
    );
    leftBracer.position.y = -(armH * 0.58 + armW);
    leftArmGroup.add(leftBracer);

    // Bracer straps
    for (let s = 0; s < 2; s++) {
      const bStrap = new THREE.Mesh(
        new THREE.TorusGeometry(armW + 0.04, 0.008, 4, 8),
        leatherMat,
      );
      bStrap.position.y = -(armH * 0.52 + armW) - s * 0.1;
      bStrap.rotation.x = Math.PI / 2;
      leftArmGroup.add(bStrap);
    }

    // Hand
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(armW * 0.8, 6, 6), skinMat);
    leftHand.position.y = -(armH + armW * 0.3);
    leftArmGroup.add(leftHand);

    // Right arm
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(armX, shoulderY, 0);
    rightArmGroup.name = 'rightArm';
    g.add(rightArmGroup);

    const rightSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(armW + 0.02, armW + 0.05, armH * 0.5, 8),
      fabricDark,
    );
    rightSleeve.position.y = -(armH * 0.25 + armW);
    rightSleeve.castShadow = true;
    rightArmGroup.add(rightSleeve);

    const rightForearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(armW * 0.9, armH * 0.4, 6, 8),
      skinMat,
    );
    rightForearm.position.y = -(armH * 0.6 + armW);
    rightForearm.castShadow = true;
    rightArmGroup.add(rightForearm);

    const rightBracer = new THREE.Mesh(
      new THREE.CylinderGeometry(armW + 0.03, armW + 0.05, 0.18, 6),
      furMat,
    );
    rightBracer.position.y = -(armH * 0.58 + armW);
    rightArmGroup.add(rightBracer);

    for (let s = 0; s < 2; s++) {
      const bStrap = new THREE.Mesh(
        new THREE.TorusGeometry(armW + 0.04, 0.008, 4, 8),
        leatherMat,
      );
      bStrap.position.y = -(armH * 0.52 + armW) - s * 0.1;
      bStrap.rotation.x = Math.PI / 2;
      rightArmGroup.add(bStrap);
    }

    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(armW * 0.8, 6, 6), skinMat);
    rightHand.position.y = -(armH + armW * 0.3);
    rightArmGroup.add(rightHand);

    // ======== Weapon (meat-on-bone club) ========
    const weaponGroup = new THREE.Group();
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.6 });
    const rawMeat = new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.85 });
    const fatMat = new THREE.MeshStandardMaterial({ color: 0xe8b89a, roughness: 0.7 });
    const darkMeat = new THREE.MeshStandardMaterial({ color: 0x6b1010, roughness: 0.9 });

    const boneShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.35, 6), boneMat);
    boneShaft.position.y = 0.17;
    weaponGroup.add(boneShaft);

    const meatCore = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), rawMeat);
    meatCore.scale.set(0.85, 1.0, 1.0);
    meatCore.position.y = 0.52;
    weaponGroup.add(meatCore);

    const meatBlob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 5, 4), darkMeat);
    meatBlob.position.set(0.08, 0.62, 0.06);
    weaponGroup.add(meatBlob);

    const meatBlob2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), rawMeat);
    meatBlob2.position.set(-0.06, 0.45, -0.05);
    weaponGroup.add(meatBlob2);

    const fatCap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), fatMat);
    fatCap.scale.set(1.1, 0.4, 1.0);
    fatCap.position.set(0.0, 0.68, 0.0);
    weaponGroup.add(fatCap);

    const fatStreak = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.15, 5), fatMat);
    fatStreak.rotation.z = Math.PI / 2;
    fatStreak.position.set(0.16, 0.52, 0.0);
    weaponGroup.add(fatStreak);

    weaponGroup.position.set(0.05, -(0.45 + torsoH / 2), -0.15);
    weaponGroup.rotation.x = -Math.PI / 2;
    weaponGroup.name = 'weapon';
    rightArmGroup.add(weaponGroup);

    // ======== Head (detailed) ========
    const head = new THREE.Mesh(new THREE.SphereGeometry(headSize, 16, 14), skinMat);
    head.position.y = headY;
    head.castShadow = true;
    g.add(head);

    // Eyes - iris + pupil + whites
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0 });
    const irisMat = new THREE.MeshStandardMaterial({ color: 0x4a6a3a });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const browMat = new THREE.MeshStandardMaterial({ color: isMale ? 0x2b1d0e : 0x3d2211 });

    for (const side of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeWhiteMat);
      white.position.set(side * 0.1, headY + 0.03, -headSize + 0.06);
      white.scale.set(1, 0.7, 0.5);
      g.add(white);

      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), irisMat);
      iris.position.set(side * 0.1, headY + 0.03, -headSize + 0.035);
      g.add(iris);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), pupilMat);
      pupil.position.set(side * 0.1, headY + 0.03, -headSize + 0.02);
      g.add(pupil);

      // Eyebrow
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.04), browMat);
      brow.position.set(side * 0.1, headY + 0.09, -headSize + 0.08);
      brow.rotation.z = side * -0.15;
      g.add(brow);
    }

    // Nose
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.035, 0.06, 5), skinMat);
    nose.position.set(0, headY - 0.02, -headSize + 0.04);
    nose.rotation.x = -0.4;
    g.add(nose);

    // Mouth
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.01, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x8b4a3a }),
    );
    mouth.position.set(0, headY - 0.1, -headSize + 0.06);
    g.add(mouth);

    // Ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), skinMat);
      ear.position.set(side * (headSize - 0.02), headY, 0);
      ear.scale.set(0.4, 0.8, 0.6);
      g.add(ear);
    }

    // Hair wisps peeking from under hood
    const hairMat = new THREE.MeshStandardMaterial({
      color: isMale ? 0x2b1d0e : 0x3d2211,
      roughness: 1.0,
    });
    for (let i = 0; i < 5; i++) {
      const wisp = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.12 + i * 0.02, 3, 4), hairMat);
      wisp.position.set(
        (i - 2) * 0.06,
        headY + headSize * 0.2,
        -headSize + 0.02,
      );
      wisp.rotation.x = -0.3 - i * 0.05;
      g.add(wisp);
    }

    // ======== Hood ========
    const hoodR = headSize * 1.45;
    const hoodGeo = new THREE.SphereGeometry(hoodR, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);

    // Drape: back/sides hang lower, front opens for face
    const hp = hoodGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const hx = hp.getX(i), hy = hp.getY(i), hz = hp.getZ(i);
      // z < 0 = front (face), z > 0 = back
      const backness = Math.max(0, hz / hoodR);
      const sideness = Math.abs(hx) / hoodR;

      // Back drapes lower, sides drape moderately
      let newY = hy - backness * headSize * 0.9 - sideness * headSize * 0.35;
      // Front opens upward for face
      if (hz < -hoodR * 0.3) {
        newY += Math.abs(hz / hoodR) * headSize * 0.4;
      }
      hp.setY(i, newY);

      // Fabric wrinkle texture
      const wrinkle = Math.sin(hy * 14 + hx * 9 + hz * 7) * 0.006;
      hp.setX(i, hx + wrinkle);
      hp.setZ(i, hz + wrinkle * 0.8);
    }
    hp.needsUpdate = true;
    hoodGeo.computeVertexNormals();

    this.hoodGeo = hoodGeo;
    this.hoodOrigPos = new Float32Array(hoodGeo.attributes.position.array);

    const hoodMesh = new THREE.Mesh(hoodGeo, new THREE.MeshStandardMaterial({
      color: 0x33261a,
      roughness: 0.92,
      side: THREE.DoubleSide,
    }));
    hoodMesh.position.y = headY + headSize * 0.1;
    hoodMesh.castShadow = true;
    hoodMesh.name = 'hood';
    g.add(hoodMesh);

    // ======== Cloak (animated cloth hanging from shoulders) ========
    const cloakW = isMale ? 1.0 : 0.85;
    const cloakH = 1.6;
    const cloakGeo = new THREE.PlaneGeometry(cloakW, cloakH, 10, 16);

    // Pre-shape: curve around body back + wrinkle folds
    const cp = cloakGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const cx = cp.getX(i), cy = cp.getY(i);
      cp.setZ(i, cx * cx * 0.25);
      const fold = Math.sin(cy * 9 + cx * 6) * 0.008 + Math.sin(cy * 18) * 0.005;
      cp.setX(i, cx + fold);
    }
    cp.needsUpdate = true;
    cloakGeo.computeVertexNormals();

    this.cloakGeo = cloakGeo;
    this.cloakOrigPos = new Float32Array(cloakGeo.attributes.position.array);

    // Vertex colors for weathered/worn look
    const cloakVCount = cloakGeo.attributes.position.count;
    const cloakColors = new Float32Array(cloakVCount * 3);
    for (let i = 0; i < cloakVCount; i++) {
      const cy = cloakGeo.attributes.position.getY(i);
      const n = Math.sin(cy * 7 + i * 0.13) * 0.5 + 0.5;
      const edge = Math.max(0, (-cy - cloakH * 0.3) / (cloakH * 0.2)); // lighter near bottom edge
      cloakColors[i * 3] = 0.27 + n * 0.05 + edge * 0.05;
      cloakColors[i * 3 + 1] = 0.20 + n * 0.04 + edge * 0.03;
      cloakColors[i * 3 + 2] = 0.14 + n * 0.02 + edge * 0.02;
    }
    cloakGeo.setAttribute('color', new THREE.BufferAttribute(cloakColors, 3));

    const cloakMesh = new THREE.Mesh(cloakGeo, new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      side: THREE.DoubleSide,
    }));
    cloakMesh.position.set(0, shoulderY - cloakH / 2 + 0.1, 0.22);
    cloakMesh.castShadow = true;
    cloakMesh.name = 'cloak';
    g.add(cloakMesh);

    // Cloak clasp at collar
    const clasp = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.06),
      metalMat,
    );
    clasp.position.set(0, shoulderY + 0.05, 0.04);
    g.add(clasp);

    return g;
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

  // Altar collision — 3 visual tiers, all scaled 0.65x, centred at (0, 15)
  private static readonly AX = 0;
  private static readonly AZ = 15;
  // Tier radii  (top-radius of each CylinderGeometry × 0.65)
  private static readonly T_TOP_R = 1.3;    // top tier
  private static readonly T_MID_R = 2.08;   // middle tier
  private static readonly T_BOT_R = 2.925;  // bottom tier
  // Tier surface heights  ((centerY + halfHeight) × 0.65)
  private static readonly T_TOP_H = 0.91;
  private static readonly T_MID_H = 0.65;
  private static readonly T_BOT_H = 0.325;
  // Ramps from bottom tier edge to ground
  private static readonly RAMP = 2.0;
  private static readonly RHW = 1.0;

  // Fountain — circular at origin, radius matches HubWorld.FOUNTAIN_RADIUS
  private static readonly FNT_R = 3.6;

  // Shop building AABB (pos -12,0,-5  size 8×5×6  + 0.3 buffer)
  private static readonly SHOP_X1 = -16.3;
  private static readonly SHOP_X2 = -7.7;
  private static readonly SHOP_Z1 = -8.3;
  private static readonly SHOP_Z2 = -1.7;

  private getFloorHeight(): number {
    const { AX, AZ, T_TOP_R, T_MID_R, T_BOT_R, T_TOP_H, T_MID_H, T_BOT_H, RAMP, RHW } = LocalPlayer;
    const dx = this.position.x - AX;
    const dz = this.position.z - AZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Stepped tiers — inside-out
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

    // Attack swing — arm drives it, weapon follows as child
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

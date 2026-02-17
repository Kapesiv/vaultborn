import * as THREE from 'three';

export type Gender = 'male' | 'female';

export interface ClothRefs {
  tunicGeo: THREE.BufferGeometry;
  tunicOrigPos: Float32Array;
  cloakGeo: THREE.BufferGeometry;
  cloakOrigPos: Float32Array;
  hoodGeo: THREE.BufferGeometry;
  hoodOrigPos: Float32Array;
}

export interface CharacterBuildResult {
  group: THREE.Group;
  clothRefs: ClothRefs;
}

export function buildCaveCharacter(gender: Gender): CharacterBuildResult {
  const g = new THREE.Group();
  const isMale = gender === 'male';

  // ======== Materials ========
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc8956c, roughness: 0.65, metalness: 0.02 });
  const fabricDark = new THREE.MeshStandardMaterial({ color: 0x33261a, roughness: 0.92, side: THREE.DoubleSide });
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

  // ======== Legs ========
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(legW, legH, 6, 10), skinMat);
    leg.position.set(side * legSpread, legH / 2 + 0.1, 0);
    leg.castShadow = true;
    leg.name = side === -1 ? 'leftLeg' : 'rightLeg';
    g.add(leg);
  }

  // ======== Boots ========
  for (const side of [-legSpread, legSpread]) {
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(legW + 0.04, legW + 0.06, 0.4, 8),
      leatherMat,
    );
    shaft.position.set(side, 0.3, 0);
    shaft.castShadow = true;
    g.add(shaft);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.32), leatherMat);
    foot.position.set(side, 0.06, -0.03);
    g.add(foot);

    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(legW + 0.055, 0.012, 4, 8),
      metalMat,
    );
    strap.position.set(side, 0.4, 0);
    strap.rotation.x = Math.PI / 2;
    g.add(strap);
  }

  // ======== Torso ========
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(torsoW - 0.2, torsoH - 0.15, 0.28),
    skinMat,
  );
  torso.position.y = torsoY;
  g.add(torso);

  // ======== Upper tunic ========
  for (const side of [-1, 1]) {
    const pad = new THREE.Mesh(
      new THREE.SphereGeometry(isMale ? 0.2 : 0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
      fabricDark,
    );
    pad.position.set(side * shoulderX, shoulderY + 0.05, 0);
    pad.castShadow = true;
    g.add(pad);
  }

  const upperGeo = new THREE.BoxGeometry(torsoW + 0.12, torsoH + 0.05, 0.44, 4, 6, 4);
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
  upperTunic.position.y = torsoY;
  upperTunic.castShadow = true;
  g.add(upperTunic);

  const chestStrap = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, torsoH + 0.1, 0.06),
    leatherMat,
  );
  chestStrap.position.set(isMale ? -0.12 : -0.08, torsoY, -(torsoW / 2 + 0.12));
  chestStrap.rotation.z = 0.35;
  g.add(chestStrap);

  // ======== Tunic skirt ========
  const skirtTopR = isMale ? 0.43 : 0.35;
  const skirtBotR = isMale ? 0.52 : 0.44;
  const skirtH = 0.6;
  const skirtGeo = new THREE.CylinderGeometry(skirtTopR, skirtBotR, skirtH, 16, 10, true);

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

  const tunicOrigPos = new Float32Array(skirtGeo.attributes.position.array);

  const skirtCount = skirtGeo.attributes.position.count;
  const skirtColors = new Float32Array(skirtCount * 3);
  for (let i = 0; i < skirtCount; i++) {
    const sy = skirtGeo.attributes.position.getY(i);
    const n = Math.sin(sy * 12 + i * 0.17) * 0.5 + 0.5;
    const hem = Math.max(0, (-sy - skirtH * 0.3) / (skirtH * 0.2));
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

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.04), metalMat);
  buckle.position.set(0, waistY, -(skirtTopR + 0.04));
  g.add(buckle);

  const pouch = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.1, 0.08),
    leatherMat,
  );
  pouch.position.set(isMale ? 0.35 : 0.28, waistY - 0.06, -0.1);
  g.add(pouch);

  // ======== Arms ========
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-armX, shoulderY, 0);
  leftArmGroup.name = 'leftArm';
  g.add(leftArmGroup);

  const leftSleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(armW + 0.02, armW + 0.05, armH * 0.5, 8),
    fabricDark,
  );
  leftSleeve.position.y = -(armH * 0.25 + armW);
  leftSleeve.castShadow = true;
  leftArmGroup.add(leftSleeve);

  const leftForearm = new THREE.Mesh(
    new THREE.CapsuleGeometry(armW * 0.9, armH * 0.4, 6, 8),
    skinMat,
  );
  leftForearm.position.y = -(armH * 0.6 + armW);
  leftForearm.castShadow = true;
  leftArmGroup.add(leftForearm);

  const leftBracer = new THREE.Mesh(
    new THREE.CylinderGeometry(armW + 0.03, armW + 0.05, 0.18, 6),
    furMat,
  );
  leftBracer.position.y = -(armH * 0.58 + armW);
  leftArmGroup.add(leftBracer);

  for (let s = 0; s < 2; s++) {
    const bStrap = new THREE.Mesh(
      new THREE.TorusGeometry(armW + 0.04, 0.008, 4, 8),
      leatherMat,
    );
    bStrap.position.y = -(armH * 0.52 + armW) - s * 0.1;
    bStrap.rotation.x = Math.PI / 2;
    leftArmGroup.add(bStrap);
  }

  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(armW * 0.8, 6, 6), skinMat);
  leftHand.position.y = -(armH + armW * 0.3);
  leftArmGroup.add(leftHand);

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

  // ======== Head ========
  const head = new THREE.Mesh(new THREE.SphereGeometry(headSize, 16, 14), skinMat);
  head.position.y = headY;
  head.castShadow = true;
  g.add(head);

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

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.04), browMat);
    brow.position.set(side * 0.1, headY + 0.09, -headSize + 0.08);
    brow.rotation.z = side * -0.15;
    g.add(brow);
  }

  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.035, 0.06, 5), skinMat);
  nose.position.set(0, headY - 0.02, -headSize + 0.04);
  nose.rotation.x = -0.4;
  g.add(nose);

  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.01, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x8b4a3a }),
  );
  mouth.position.set(0, headY - 0.1, -headSize + 0.06);
  g.add(mouth);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), skinMat);
    ear.position.set(side * (headSize - 0.02), headY, 0);
    ear.scale.set(0.4, 0.8, 0.6);
    g.add(ear);
  }

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

  const hp = hoodGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const hx = hp.getX(i), hy = hp.getY(i), hz = hp.getZ(i);
    const backness = Math.max(0, hz / hoodR);
    const sideness = Math.abs(hx) / hoodR;

    let newY = hy - backness * headSize * 0.9 - sideness * headSize * 0.35;
    if (hz < -hoodR * 0.3) {
      newY += Math.abs(hz / hoodR) * headSize * 0.4;
    }
    hp.setY(i, newY);

    const wrinkle = Math.sin(hy * 14 + hx * 9 + hz * 7) * 0.006;
    hp.setX(i, hx + wrinkle);
    hp.setZ(i, hz + wrinkle * 0.8);
  }
  hp.needsUpdate = true;
  hoodGeo.computeVertexNormals();

  const hoodOrigPos = new Float32Array(hoodGeo.attributes.position.array);

  const hoodMesh = new THREE.Mesh(hoodGeo, new THREE.MeshStandardMaterial({
    color: 0x33261a,
    roughness: 0.92,
    side: THREE.DoubleSide,
  }));
  hoodMesh.position.y = headY + headSize * 0.1;
  hoodMesh.castShadow = true;
  hoodMesh.name = 'hood';
  g.add(hoodMesh);

  // ======== Cloak ========
  const cloakW = isMale ? 1.0 : 0.85;
  const cloakH = 1.6;
  const cloakGeo = new THREE.PlaneGeometry(cloakW, cloakH, 10, 16);

  const cp = cloakGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const cx = cp.getX(i), cy = cp.getY(i);
    cp.setZ(i, cx * cx * 0.25);
    const fold = Math.sin(cy * 9 + cx * 6) * 0.008 + Math.sin(cy * 18) * 0.005;
    cp.setX(i, cx + fold);
  }
  cp.needsUpdate = true;
  cloakGeo.computeVertexNormals();

  const cloakOrigPos = new Float32Array(cloakGeo.attributes.position.array);

  const cloakVCount = cloakGeo.attributes.position.count;
  const cloakColors = new Float32Array(cloakVCount * 3);
  for (let i = 0; i < cloakVCount; i++) {
    const cy = cloakGeo.attributes.position.getY(i);
    const n = Math.sin(cy * 7 + i * 0.13) * 0.5 + 0.5;
    const edge = Math.max(0, (-cy - cloakH * 0.3) / (cloakH * 0.2));
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

  const clasp = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.06),
    metalMat,
  );
  clasp.position.set(0, shoulderY + 0.05, 0.04);
  g.add(clasp);

  return {
    group: g,
    clothRefs: {
      tunicGeo: skirtGeo,
      tunicOrigPos,
      cloakGeo,
      cloakOrigPos,
      hoodGeo,
      hoodOrigPos,
    },
  };
}

import * as THREE from 'three';

/**
 * Skylanders-inspired colorful Hub Town
 * - Central fountain plaza
 * - Shop building
 * - Dungeon portals (Forest, more later)
 * - PvP Arena entrance
 * - NPCs scattered around
 * - Decorative elements: trees, flowers, lanterns, banners
 */
interface EntranceData {
  name: string;
  voidMesh: THREE.Mesh;
  glowLight: THREE.PointLight;
  embers?: THREE.Mesh[];
}

export class HubWorld {
  public group: THREE.Group;

  // Interactive locations (for proximity checks)
  public shopPosition = new THREE.Vector3(-12, 0, -5);
  public pvpArenaPosition = new THREE.Vector3(15, 0, -8);
  public forestPortalPosition = new THREE.Vector3(0, 0, -25);
  public npcPositions: { name: string; position: THREE.Vector3; dialog: string[] }[] = [];

  private entranceData: EntranceData[] = [];

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'hub-world';

    this.buildGround();
    this.buildFountainPlaza();
    this.buildShop();
    this.buildPvPArena();
    this.buildDungeonEntrances();
    this.buildNPCs();
    this.buildSpawnAltar();
    this.buildDecorations();
    this.buildLighting();

    scene.add(this.group);
  }

  private buildGround() {
    // Realistic grass ground with procedural detail
    const groundGeo = new THREE.CircleGeometry(65, 80);

    // Vertex color variation for natural grass look
    const count = groundGeo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = groundGeo.attributes.position.getX(i);
      const z = groundGeo.attributes.position.getY(i); // circle is XY before rotation
      const noise = Math.sin(x * 0.8) * Math.cos(z * 0.6) * 0.5 + 0.5;
      const noise2 = Math.sin(x * 2.1 + z * 1.7) * 0.5 + 0.5;
      // Mix between dark grass, medium grass, and light grass
      const r = 0.18 + noise * 0.08 + noise2 * 0.04;
      const g = 0.35 + noise * 0.15 + noise2 * 0.08;
      const b = 0.10 + noise * 0.05;
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Soft ground edge fade - darker ring around border
    const edgeGeo = new THREE.RingGeometry(55, 65, 64);
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x2a4a1a,
      roughness: 0.95,
      transparent: true,
      opacity: 0.6,
    });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.01;
    this.group.add(edge);

    // Cobblestone path - radial paths from center
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.95 });
    const paths = [
      { from: [0, 0], to: [0, -30], width: 3 },   // North to portal
      { from: [0, 0], to: [-15, -5], width: 2.5 }, // West to shop
      { from: [0, 0], to: [18, -8], width: 2.5 },  // East to PvP
      { from: [0, 0], to: [0, 15], width: 2.5 },   // South spawn
    ];
    for (const p of paths) {
      const dx = p.to[0] - p.from[0];
      const dz = p.to[1] - p.from[1];
      const len = Math.sqrt(dx * dx + dz * dz);
      const pathGeo = new THREE.PlaneGeometry(p.width, len);
      const pathMesh = new THREE.Mesh(pathGeo, pathMat);
      pathMesh.rotation.x = -Math.PI / 2;
      pathMesh.position.set(
        (p.from[0] + p.to[0]) / 2,
        0.02,
        (p.from[1] + p.to[1]) / 2,
      );
      pathMesh.rotation.z = -Math.atan2(dx, dz);
      pathMesh.receiveShadow = true;
      this.group.add(pathMesh);
    }

    // Central plaza circle
    const plazaGeo = new THREE.CircleGeometry(8, 32);
    const plazaMat = new THREE.MeshStandardMaterial({ color: 0x9E8B6E, roughness: 0.85 });
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.03;
    plaza.receiveShadow = true;
    this.group.add(plaza);
  }

  // Collision radius for the fountain base (used by LocalPlayer)
  public static readonly FOUNTAIN_RADIUS = 3.6;

  private buildFountainPlaza() {
    const fountain = new THREE.Group();
    fountain.name = 'fountain';

    // --- Materials ---
    const stoneBase = new THREE.MeshStandardMaterial({ color: 0x8a8a94, roughness: 0.82, metalness: 0.05 });
    const stoneLight = new THREE.MeshStandardMaterial({ color: 0x9e9ea8, roughness: 0.75, metalness: 0.08 });
    const stoneDark = new THREE.MeshStandardMaterial({ color: 0x6a6a74, roughness: 0.88, metalness: 0.03 });
    const stoneRim = new THREE.MeshStandardMaterial({ color: 0xa5a0ab, roughness: 0.6, metalness: 0.12 });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x3a6a3a, roughness: 0.95 });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x3388bb,
      transparent: true,
      opacity: 0.65,
      roughness: 0.05,
      metalness: 0.4,
    });

    // ============================
    // TIER 1 — Bottom pool (wide)
    // ============================

    // Outer wall — thick octagonal basin
    const outerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 3.7, 1.0, 12),
      stoneBase,
    );
    outerWall.position.y = 0.5;
    outerWall.castShadow = true;
    outerWall.receiveShadow = true;
    fountain.add(outerWall);

    // Inner cavity cut-out (slightly smaller, darker stone floor)
    const innerFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(3.0, 3.0, 0.15, 12),
      stoneDark,
    );
    innerFloor.position.y = 0.2;
    innerFloor.receiveShadow = true;
    fountain.add(innerFloor);

    // Rim lip — polished edge on top of outer wall
    const rim1 = new THREE.Mesh(
      new THREE.TorusGeometry(3.5, 0.15, 8, 24),
      stoneRim,
    );
    rim1.rotation.x = -Math.PI / 2;
    rim1.position.y = 1.02;
    rim1.castShadow = true;
    fountain.add(rim1);

    // Inner rim
    const rim1inner = new THREE.Mesh(
      new THREE.TorusGeometry(3.0, 0.1, 6, 24),
      stoneLight,
    );
    rim1inner.rotation.x = -Math.PI / 2;
    rim1inner.position.y = 1.0;
    fountain.add(rim1inner);

    // Bottom pool water
    const water1 = new THREE.Mesh(
      new THREE.CylinderGeometry(2.95, 2.95, 0.08, 24),
      waterMat,
    );
    water1.position.y = 0.85;
    water1.name = 'fountain-water-1';
    fountain.add(water1);

    // Decorative base moulding
    const baseMould = new THREE.Mesh(
      new THREE.CylinderGeometry(3.7, 3.9, 0.25, 12),
      stoneDark,
    );
    baseMould.position.y = 0.12;
    baseMould.receiveShadow = true;
    fountain.add(baseMould);

    // ============================
    // TIER 2 — Middle basin
    // ============================

    // Pedestal column from bottom pool to mid basin
    const pedestal1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.9, 1.6, 10),
      stoneLight,
    );
    pedestal1.position.y = 1.8;
    pedestal1.castShadow = true;
    fountain.add(pedestal1);

    // Decorative rings on pedestal
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.75 + i * 0.05, 0.06, 6, 16),
        stoneRim,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 1.2 + i * 0.55;
      fountain.add(ring);
    }

    // Flared collar at base of mid basin
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 0.8, 0.3, 10),
      stoneBase,
    );
    collar.position.y = 2.75;
    collar.castShadow = true;
    fountain.add(collar);

    // Mid basin bowl
    const midBasin = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.6, 0.5, 10),
      stoneBase,
    );
    midBasin.position.y = 3.15;
    midBasin.castShadow = true;
    midBasin.receiveShadow = true;
    fountain.add(midBasin);

    // Mid basin rim
    const rim2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.1, 6, 20),
      stoneRim,
    );
    rim2.rotation.x = -Math.PI / 2;
    rim2.position.y = 3.42;
    fountain.add(rim2);

    // Mid basin floor (dark inside)
    const midFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.08, 10),
      stoneDark,
    );
    midFloor.position.y = 2.95;
    fountain.add(midFloor);

    // Middle pool water
    const water2 = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.06, 16),
      waterMat,
    );
    water2.position.y = 3.3;
    water2.name = 'fountain-water-2';
    fountain.add(water2);

    // ============================
    // 4 spout figures around mid basin — water pours into bottom pool
    // ============================
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const sx = Math.cos(angle) * 1.7;
      const sz = Math.sin(angle) * 1.7;

      // Fish/gargoyle body
      const spoutBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 0.5, 6),
        stoneLight,
      );
      spoutBody.position.set(sx, 3.1, sz);
      spoutBody.rotation.z = Math.cos(angle) * 0.6;
      spoutBody.rotation.x = -Math.sin(angle) * 0.6;
      fountain.add(spoutBody);

      // Spout mouth (cone pointing outward/down)
      const spoutMouth = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.3, 5),
        stoneDark,
      );
      const outX = Math.cos(angle) * 2.1;
      const outZ = Math.sin(angle) * 2.1;
      spoutMouth.position.set(outX, 2.85, outZ);
      spoutMouth.rotation.z = -Math.cos(angle) * 1.0;
      spoutMouth.rotation.x = Math.sin(angle) * 1.0;
      fountain.add(spoutMouth);

      // Water stream (thin cylinder angled down from spout to pool)
      const streamLen = 0.9;
      const stream = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.06, streamLen, 6),
        waterMat,
      );
      stream.position.set(
        Math.cos(angle) * 2.3,
        2.3,
        Math.sin(angle) * 2.3,
      );
      // Tilt outward and down
      stream.rotation.z = -Math.cos(angle) * 0.5;
      stream.rotation.x = Math.sin(angle) * 0.5;
      stream.name = `fountain-stream-${i}`;
      fountain.add(stream);
    }

    // ============================
    // TIER 3 — Top finial
    // ============================

    // Top pedestal column
    const pedestal2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.45, 1.2, 8),
      stoneLight,
    );
    pedestal2.position.y = 4.0;
    pedestal2.castShadow = true;
    fountain.add(pedestal2);

    // Ornate cap
    const topCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.35, 0.25, 8),
      stoneRim,
    );
    topCap.position.y = 4.72;
    fountain.add(topCap);

    // Top small basin
    const topBasin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.5, 0.3, 8),
      stoneBase,
    );
    topBasin.position.y = 5.0;
    topBasin.castShadow = true;
    fountain.add(topBasin);

    // Top water
    const water3 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.04, 12),
      waterMat,
    );
    water3.position.y = 5.12;
    water3.name = 'fountain-water-3';
    fountain.add(water3);

    // Crown finial — small orb on top
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x44ddff,
      emissive: 0x2299cc,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.5,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), orbMat);
    orb.position.y = 5.45;
    orb.name = 'fountain-orb';
    fountain.add(orb);

    // ============================
    // Moss patches (weathering detail)
    // ============================
    const mossPositions = [
      { x: 2.8, y: 0.6, z: 1.2 }, { x: -3.1, y: 0.4, z: -0.5 },
      { x: 0.5, y: 0.3, z: 3.2 }, { x: -1.0, y: 0.5, z: -2.9 },
      { x: 1.8, y: 2.9, z: 0.3 }, { x: -0.3, y: 3.0, z: -1.5 },
    ];
    for (const mp of mossPositions) {
      const moss = new THREE.Mesh(
        new THREE.SphereGeometry(0.12 + Math.random() * 0.1, 5, 4),
        mossMat,
      );
      moss.position.set(mp.x, mp.y, mp.z);
      moss.scale.y = 0.3;
      fountain.add(moss);
    }

    // ============================
    // Water splash particles (rising droplets from the top)
    // ============================
    const splashMat = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.6,
    });
    const splashGeo = new THREE.SphereGeometry(0.04, 4, 4);
    const splashCount = 16;
    for (let i = 0; i < splashCount; i++) {
      const splash = new THREE.Mesh(splashGeo, splashMat.clone());
      const angle = (i / splashCount) * Math.PI * 2;
      splash.position.set(
        Math.cos(angle) * 0.3,
        5.3,
        Math.sin(angle) * 0.3,
      );
      splash.name = `fountain-splash-${i}`;
      fountain.add(splash);
    }

    // Splash ring at bottom pool (impact ripples)
    const splashRingMat = new THREE.MeshBasicMaterial({
      color: 0x66bbdd,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.3, 12),
        splashRingMat.clone(),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(
        Math.cos(angle) * 2.5,
        0.86,
        Math.sin(angle) * 2.5,
      );
      ring.name = `fountain-ripple-${i}`;
      fountain.add(ring);
    }

    // ============================
    // Lighting
    // ============================
    const fountainLight = new THREE.PointLight(0x44ddff, 1.5, 12);
    fountainLight.position.y = 5.6;
    fountain.add(fountainLight);

    // Subtle uplight from the water
    const waterGlow = new THREE.PointLight(0x3388bb, 0.6, 6);
    waterGlow.position.y = 1.0;
    fountain.add(waterGlow);

    // Warm rim lights on the basin edges
    const rimLight1 = new THREE.PointLight(0x66aacc, 0.4, 5);
    rimLight1.position.set(3.5, 1.2, 0);
    fountain.add(rimLight1);
    const rimLight2 = new THREE.PointLight(0x66aacc, 0.4, 5);
    rimLight2.position.set(-3.5, 1.2, 0);
    fountain.add(rimLight2);

    this.group.add(fountain);
  }

  private buildShop() {
    const pos = this.shopPosition;

    // Building base
    const buildGeo = new THREE.BoxGeometry(8, 5, 6);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xD4A574, roughness: 0.8 });
    const building = new THREE.Mesh(buildGeo, wallMat);
    building.position.set(pos.x, 2.5, pos.z);
    building.castShadow = true;
    building.receiveShadow = true;
    this.group.add(building);

    // Roof
    const roofGeo = new THREE.ConeGeometry(6, 3, 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xCC3333, roughness: 0.7 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(pos.x, 6.5, pos.z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.group.add(roof);

    // Door
    const doorGeo = new THREE.BoxGeometry(1.5, 2.5, 0.2);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x6B3300 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(pos.x, 1.25, pos.z + 3.1);
    this.group.add(door);

    // Sign "SHOP"
    const signGroup = this.createTextSign('SHOP', 0xFFD700);
    signGroup.position.set(pos.x, 4.5, pos.z + 3.2);
    this.group.add(signGroup);

    // Warm light inside
    const shopLight = new THREE.PointLight(0xffaa44, 1.5, 10);
    shopLight.position.set(pos.x, 3, pos.z + 2);
    this.group.add(shopLight);
  }

  private buildPvPArena() {
    const pos = this.pvpArenaPosition;

    // Arena walls (colosseum-style arc)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x887766, roughness: 0.75 });

    // Back curved wall
    for (let i = -3; i <= 3; i++) {
      const angle = (i / 3) * 0.8;
      const pillarGeo = new THREE.CylinderGeometry(0.5, 0.6, 6, 8);
      const pillar = new THREE.Mesh(pillarGeo, wallMat);
      pillar.position.set(
        pos.x + Math.sin(angle) * 6,
        3,
        pos.z - Math.cos(angle) * 6,
      );
      pillar.castShadow = true;
      this.group.add(pillar);
    }

    // Arena floor
    const floorGeo = new THREE.CircleGeometry(5, 24);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xAA8844, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(pos.x, 0.04, pos.z);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Gate entrance
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6 });
    const gateLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), gateMat);
    gateLeft.position.set(pos.x - 1.5, 2, pos.z + 5);
    gateLeft.castShadow = true;
    this.group.add(gateLeft);

    const gateRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), gateMat);
    gateRight.position.set(pos.x + 1.5, 2, pos.z + 5);
    gateRight.castShadow = true;
    this.group.add(gateRight);

    const gateTop = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 0.6), gateMat);
    gateTop.position.set(pos.x, 4.3, pos.z + 5);
    this.group.add(gateTop);

    // Sign
    const sign = this.createTextSign('PVP ARENA', 0xFF4444);
    sign.position.set(pos.x, 5.5, pos.z + 5);
    this.group.add(sign);

    // Red glow
    const pvpLight = new THREE.PointLight(0xff4444, 1.5, 12);
    pvpLight.position.set(pos.x, 4, pos.z);
    this.group.add(pvpLight);
  }

  private buildDungeonPortals() {
    // Forest Dungeon Portal
    this.createPortal(
      this.forestPortalPosition,
      'DARK FOREST',
      0x22aa44,
      0x115522,
    );

    // Future portals (locked/greyed out placeholders)
    const futurePortals = [
      { pos: new THREE.Vector3(-10, 0, -25), name: 'ICE CAVES', color: 0x44aaff },
      { pos: new THREE.Vector3(10, 0, -25), name: 'VOLCANO', color: 0xff4400 },
    ];
    for (const fp of futurePortals) {
      this.createPortal(fp.pos, fp.name + ' [LOCKED]', 0x555555, 0x333333);
    }
  }

  private createPortal(pos: THREE.Vector3, label: string, color: number, emissive: number) {
    // Per-portal emissive material for pillars/arch (energy pulse)
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a30,
      roughness: 0.92,
      metalness: 0.05,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.0,
    });
    const crackedStone = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.95 });
    const pillarMaterials: THREE.MeshStandardMaterial[] = [pillarMat];

    // --- Imposing weathered pillars ---
    for (const side of [-1, 1]) {
      const px = pos.x + side * 2.5;

      const pillarGeo = new THREE.CylinderGeometry(0.45, 0.65, 7, 6, 8);
      const pp = pillarGeo.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        const vx = pp.getX(i), vy = pp.getY(i), vz = pp.getZ(i);
        const wobble = 1 + Math.sin(vy * 3.2 + vx * 5.7) * 0.08 + Math.sin(vy * 7.1) * 0.04;
        pp.setX(i, vx * wobble);
        pp.setZ(i, vz * wobble);
      }
      pp.needsUpdate = true;
      pillarGeo.computeVertexNormals();

      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(px, 3.5, pos.z);
      pillar.castShadow = true;
      this.group.add(pillar);

      // Wide pillar base
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.6, 6), crackedStone);
      base.position.set(px, 0.3, pos.z);
      base.castShadow = true;
      this.group.add(base);

      // Skull decoration
      this.createSkull(px, 5.8, pos.z - 0.35, emissive);

      // Bone fragments
      for (let b = 0; b < 3; b++) {
        const boneMat = new THREE.MeshStandardMaterial({ color: 0xc8b888, roughness: 0.7 });
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3 + Math.random() * 0.3, 4), boneMat);
        bone.position.set(
          px + (Math.random() - 0.5) * 1.2,
          0.08,
          pos.z + (Math.random() - 0.5) * 1.0,
        );
        bone.rotation.z = Math.random() * Math.PI;
        bone.rotation.x = Math.random() * 0.5;
        this.group.add(bone);
      }
    }

    // --- Heavy arch with spikes ---
    const arch = new THREE.Mesh(new THREE.BoxGeometry(6, 1.0, 1.0), pillarMat);
    arch.position.set(pos.x, 7.2, pos.z);
    arch.castShadow = true;
    this.group.add(arch);

    for (let i = -2; i <= 2; i++) {
      const h = 0.6 + (i === 0 ? 0.4 : 0);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, h, 4), crackedStone);
      spike.position.set(pos.x + i * 1.2, 7.9 + h / 2, pos.z);
      this.group.add(spike);
    }

    // Large skull on arch
    this.createSkull(pos.x, 7.8, pos.z - 0.5, emissive, 1.5);

    // ── 1. Shader vortex ────────────────────────────────────────────
    const c1 = new THREE.Color(color);
    const c2 = new THREE.Color(emissive);
    const shaderMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uProximity: { value: 0 },
        uColor1: { value: new THREE.Vector3(c1.r, c1.g, c1.b) },
        uColor2: { value: new THREE.Vector3(c2.r, c2.g, c2.b) },
      },
      vertexShader: VORTEX_VERT,
      fragmentShader: VORTEX_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const vortexMesh = new THREE.Mesh(new THREE.CircleGeometry(2.8, 48), shaderMat);
    vortexMesh.position.set(pos.x, 3.5, pos.z);
    this.group.add(vortexMesh);
    this.portalShaders.push(shaderMat);

    // ── 2. Rune ring ────────────────────────────────────────────────
    const runeRing = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color });

    // Torus base ring
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.06, 8, 48),
      ringMat,
    );
    runeRing.add(torus);

    // 12 symbol runes around the ring
    const geoPool = [
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.TetrahedronGeometry(0.14, 0),
      new THREE.BoxGeometry(0.15, 0.15, 0.15),
    ];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const geo = geoPool[i % 3];
      const rune = new THREE.Mesh(geo, ringMat);
      rune.position.set(Math.cos(a) * 3.2, Math.sin(a) * 3.2, 0);
      rune.rotation.set(a, a * 0.5, 0);
      runeRing.add(rune);
    }

    runeRing.position.set(pos.x, 3.5, pos.z);
    // Orient ring to face forward (same plane as vortex)
    runeRing.rotation.y = 0;
    this.group.add(runeRing);

    // ── 3. Spiral particles (inward-spiraling) ──────────────────────
    const spiralParticles: THREE.Mesh[] = [];
    for (let i = 0; i < 20; i++) {
      const pMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? color : emissive,
        transparent: true,
        opacity: 0.6,
      });
      const size = 0.04 + Math.random() * 0.04;
      const particle = new THREE.Mesh(new THREE.SphereGeometry(size, 4, 4), pMat);
      particle.userData = {
        orbitRadius: 1.5 + Math.random() * 1.5,  // start radius
        speed: 0.4 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
        yOffset: (Math.random() - 0.5) * 4,      // vertical spread around portal center
      };
      particle.position.set(pos.x, 3.5, pos.z);
      this.group.add(particle);
      spiralParticles.push(particle);
    }

    // ── Ground corruption (kept) ────────────────────────────────────
    const corruptMat = new THREE.MeshStandardMaterial({
      color: 0x0a050a,
      emissive,
      emissiveIntensity: 0.15,
      roughness: 0.95,
      transparent: true,
      opacity: 0.6,
    });
    const corrupt = new THREE.Mesh(new THREE.CircleGeometry(4.5, 16), corruptMat);
    corrupt.rotation.x = -Math.PI / 2;
    corrupt.position.set(pos.x, 0.04, pos.z);
    this.group.add(corrupt);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const len = 1.2 + Math.sin(i * 2.7) * 0.6;
      const tendril = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, len), corruptMat);
      tendril.position.set(
        pos.x + Math.cos(angle) * (4 + len / 2),
        0.03,
        pos.z + Math.sin(angle) * (4 + len / 2),
      );
      tendril.rotation.y = -angle;
      this.group.add(tendril);
    }

    // ── Lighting (kept, but mainGlow tracked for proximity) ─────────
    const mainGlow = new THREE.PointLight(color, 3, 15);
    mainGlow.position.set(pos.x, 3.5, pos.z + 1.5);
    this.group.add(mainGlow);

    const bottomGlow = new THREE.PointLight(emissive, 1.5, 8);
    bottomGlow.position.set(pos.x, 0.5, pos.z + 1);
    this.group.add(bottomGlow);

    // Label
    const sign = this.createTextSign(label, color);
    sign.position.set(pos.x, 8.8, pos.z);
    this.group.add(sign);

    // ── Store portal data for update() ──────────────────────────────
    this.portalData.push({
      pos: pos.clone(),
      runeRing,
      spiralParticles,
      pillarMaterials,
      mainLight: mainGlow,
      shaderMat,
    });
  }

  private createSkull(x: number, y: number, z: number, eyeColor: number, scale = 1.0) {
    const skullGroup = new THREE.Group();
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xc8b888, roughness: 0.7 });

    // Cranium
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 8, 6), boneMat);
    cranium.scale.set(1, 0.85, 0.9);
    skullGroup.add(cranium);

    // Glowing eye sockets
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05 * scale, 6, 6), eyeMat);
      eye.position.set(side * 0.08 * scale, 0.03 * scale, -0.19 * scale);
      skullGroup.add(eye);
    }

    // Jaw
    const jaw = new THREE.Mesh(
      new THREE.BoxGeometry(0.18 * scale, 0.06 * scale, 0.1 * scale),
      boneMat,
    );
    jaw.position.set(0, -0.14 * scale, -0.12 * scale);
    skullGroup.add(jaw);

    // Teeth
    for (let t = -2; t <= 2; t++) {
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.02 * scale, 0.04 * scale, 0.02 * scale),
        boneMat,
      );
      tooth.position.set(t * 0.035 * scale, -0.09 * scale, -0.18 * scale);
      skullGroup.add(tooth);
    }

    skullGroup.position.set(x, y, z);
    skullGroup.rotation.x = -0.15;
    this.group.add(skullGroup);
  }


  private buildNPCs() {
    const npcs = [
      {
        name: 'Elder Mika',
        position: new THREE.Vector3(5, 0, 3),
        color: 0x6644aa,
        dialog: [
          'Welcome, adventurer! This is the Hub Town.',
          'The Dark Forest portal leads to dangerous creatures...',
          'I heard that enough wood scraps can be fashioned into something useful...',
        ],
      },
      {
        name: 'Blacksmith Toivo',
        position: new THREE.Vector3(-8, 0, 2),
        color: 0xaa4422,
        dialog: [
          'Bring me materials and I can craft something special!',
          'Wolf pelts make excellent armor, if you gather enough...',
          'The ancient forest wood combined with sturdy pelts makes a fine bow...',
        ],
      },
      {
        name: 'Scout Aino',
        position: new THREE.Vector3(3, 0, -18),
        color: 0x22aa66,
        dialog: [
          'The Dark Forest is just the beginning...',
          'They say an Ancient Treant guards the deepest grove.',
          'Be careful of the Giant Spiders - they are fast!',
        ],
      },
    ];

    for (const npc of npcs) {
      this.createNPCMesh(npc.name, npc.position, npc.color);
      this.npcPositions.push({
        name: npc.name,
        position: npc.position,
        dialog: npc.dialog,
      });
    }
  }

  private createNPCMesh(name: string, pos: THREE.Vector3, color: number) {
    const npcGroup = new THREE.Group();

    // Body
    const bodyGeo = new THREE.CapsuleGeometry(0.45, 1.1, 4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.05;
    body.castShadow = true;
    npcGroup.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.7 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.15;
    head.castShadow = true;
    npcGroup.add(head);

    // Floating name + "!" indicator
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    // "!" quest marker
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('!', 128, 35);

    // Name
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(name, 128, 75);
    ctx.fillText(name, 128, 75);

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 3.2;
    sprite.scale.set(2.5, 0.9, 1);
    npcGroup.add(sprite);

    npcGroup.position.copy(pos);
    npcGroup.name = `npc-${name}`;
    this.group.add(npcGroup);
  }

  private buildSpawnAltar() {
    const altarGroup = new THREE.Group();
    const cx = 0, cz = 0; // local coords inside group

    // --- Raised stone platform (3 tiers) ---
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6b78, roughness: 0.75, metalness: 0.1 });
    const stoneLight = new THREE.MeshStandardMaterial({ color: 0x8a8a96, roughness: 0.7, metalness: 0.15 });
    const stoneDark = new THREE.MeshStandardMaterial({ color: 0x50505c, roughness: 0.8 });

    // Bottom tier - wide octagonal base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 0.5, 8), stoneDark);
    base.position.set(cx, 0.25, cz);
    base.receiveShadow = true;
    base.castShadow = true;
    altarGroup.add(base);

    // Middle tier
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 0.5, 8), stoneMat);
    mid.position.set(cx, 0.75, cz);
    mid.receiveShadow = true;
    mid.castShadow = true;
    altarGroup.add(mid);

    // Top tier - the altar surface
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.6, 0.4, 8), stoneLight);
    top.position.set(cx, 1.2, cz);
    top.receiveShadow = true;
    top.castShadow = true;
    altarGroup.add(top);

    // --- Carved rune grooves on top surface ---
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x33aaff,
      emissive: 0x1166aa,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });

    // Inner rune circle
    const runeRing = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.04, 8, 32), runeMat);
    runeRing.rotation.x = -Math.PI / 2;
    runeRing.position.set(cx, 1.42, cz);
    altarGroup.add(runeRing);

    // Rune lines radiating from center (8 directions)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 1.0), runeMat);
      line.position.set(
        cx + Math.cos(angle) * 0.7,
        1.42,
        cz + Math.sin(angle) * 0.7,
      );
      line.rotation.y = -angle + Math.PI / 2;
      altarGroup.add(line);
    }

    // Small rune symbols at each line end
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const symbol = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), runeMat);
      symbol.position.set(
        cx + Math.cos(angle) * 1.4,
        1.44,
        cz + Math.sin(angle) * 1.4,
      );
      altarGroup.add(symbol);
    }

    // --- Four corner pillars with ancient carvings ---
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5c5c68, roughness: 0.7, metalness: 0.2 });
    const pillarPositions = [
      [cx - 3.5, cz - 3.5],
      [cx + 3.5, cz - 3.5],
      [cx - 3.5, cz + 3.5],
      [cx + 3.5, cz + 3.5],
    ];

    for (const [px, pz] of pillarPositions) {
      // Pillar base
      const pBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), stoneDark);
      pBase.position.set(px, 0.15, pz);
      pBase.castShadow = true;
      altarGroup.add(pBase);

      // Pillar shaft (tapered)
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 3.0, 6), pillarMat);
      shaft.position.set(px, 1.8, pz);
      shaft.castShadow = true;
      altarGroup.add(shaft);

      // Carved rings on pillar
      for (let r = 0; r < 3; r++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 12), stoneMat);
        ring.position.set(px, 0.8 + r * 0.9, pz);
        ring.rotation.x = Math.PI / 2;
        altarGroup.add(ring);
      }

      // Pillar cap
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.3, 6), stoneMat);
      cap.position.set(px, 3.45, pz);
      altarGroup.add(cap);

      // Glowing crystal on top
      const crystalMat = new THREE.MeshStandardMaterial({
        color: 0x44ccff,
        emissive: 0x2288cc,
        emissiveIntensity: 1.0,
        roughness: 0.1,
        metalness: 0.4,
      });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), crystalMat);
      crystal.position.set(px, 3.85, pz);
      crystal.rotation.y = Math.PI / 4;
      crystal.name = 'altar-crystal';
      altarGroup.add(crystal);

      // Crystal glow light
      const cLight = new THREE.PointLight(0x44ccff, 0.8, 6);
      cLight.position.set(px, 3.85, pz);
      altarGroup.add(cLight);
    }

    // --- Central altar stone (the main altar piece) ---
    const altarMat = new THREE.MeshStandardMaterial({
      color: 0x7a7a88,
      roughness: 0.5,
      metalness: 0.25,
    });
    const altarBlock = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.6), altarMat);
    altarBlock.position.set(cx, 1.75, cz);
    altarBlock.castShadow = true;
    altarGroup.add(altarBlock);

    // Altar top slab (polished)
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x9090a0,
      roughness: 0.3,
      metalness: 0.35,
    });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.8), slabMat);
    slab.position.set(cx, 2.14, cz);
    altarGroup.add(slab);

    // Floating rune orb above altar (spawn indicator)
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x66ddff,
      emissive: 0x3399cc,
      emissiveIntensity: 1.2,
      roughness: 0.05,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), orbMat);
    orb.position.set(cx, 3.0, cz);
    orb.name = 'spawn-orb';
    altarGroup.add(orb);

    // Orb inner glow
    const orbInner = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xaaeeff, transparent: true, opacity: 0.6 }),
    );
    orbInner.position.set(cx, 3.0, cz);
    orbInner.name = 'spawn-orb-inner';
    altarGroup.add(orbInner);

    // Central light
    const altarLight = new THREE.PointLight(0x55ccff, 2.5, 12);
    altarLight.position.set(cx, 3.2, cz);
    altarGroup.add(altarLight);

    // --- Steps on all 4 sides, attached to altar base edge ---
    const stepDist = [4.2, 5.2, 6.2, 7.2];
    const stepY    = [0.28, 0.14, 0.0, -0.1];
    const stepW    = [2.8, 2.4, 2.0, 1.6];

    // North (-Z) and South (+Z)
    for (const dir of [-1, 1]) {
      for (let s = 0; s < 4; s++) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(stepW[s], 0.2, 0.85),
          s % 2 === 0 ? stoneMat : stoneLight,
        );
        step.position.set(cx, stepY[s], cz + dir * stepDist[s]);
        step.receiveShadow = true;
        step.castShadow = true;
        altarGroup.add(step);
      }
    }
    // East (+X) and West (-X)
    for (const dir of [-1, 1]) {
      for (let s = 0; s < 4; s++) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 0.2, stepW[s]),
          s % 2 === 0 ? stoneMat : stoneLight,
        );
        step.position.set(cx + dir * stepDist[s], stepY[s], cz);
        step.receiveShadow = true;
        step.castShadow = true;
        altarGroup.add(step);
      }
    }

    // "SPAWN" label
    const label = this.createTextSign('ALTAR OF REBIRTH', 0x55ccff);
    label.position.set(cx, 4.8, cz);
    altarGroup.add(label);

    // Place at end of south path
    altarGroup.scale.set(0.65, 0.65, 0.65);
    altarGroup.position.set(0, 0, 15);
    this.group.add(altarGroup);
  }

  private buildDecorations() {
    // Lanterns — strategically placed around the hub
    const lanternPositions = [
      // Fountain plaza corners (4 symmetrical)
      [5.5, 5.5], [-5.5, 5.5], [5.5, -5.5], [-5.5, -5.5],
      // Path to forest portal
      [1.5, -14], [-1.5, -14], [1.5, -21], [-1.5, -21],
      // Near shop entrance
      [-10, -2], [-14, -2],
      // Near PvP arena entrance
      [12, -6], [12, -10],
      // Near NPCs — Elder Mika, Scout Aino
      [7, 3], [5, -16],
    ];
    for (const [x, z] of lanternPositions) {
      this.createLantern(x, z);
    }

    // Banners on poles near plaza
    this.createBanner(-5, -5, 0xff3333);
    this.createBanner(5, -5, 0x3333ff);
    this.createBanner(-5, 5, 0x33ff33);
    this.createBanner(5, 5, 0xffcc00);
  }

  private createFlowerBush(x: number, z: number, color: number) {
    const bushGeo = new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 6, 5);
    const bushMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const bush = new THREE.Mesh(bushGeo, bushMat);
    bush.position.set(x, 0.2, z);
    bush.scale.y = 0.6;
    this.group.add(bush);
  }

  private createLantern(x: number, z: number) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 3, 4),
      new THREE.MeshStandardMaterial({ color: 0x333333 }),
    );
    pole.position.set(x, 1.5, z);
    this.group.add(pole);

    const lampGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffdd88,
      emissive: 0xffaa44,
      emissiveIntensity: 0.8,
    });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(x, 3.1, z);
    this.group.add(lamp);

    const light = new THREE.PointLight(0xffaa44, 0.5, 6);
    light.position.set(x, 3.1, z);
    this.group.add(light);
  }

  private createBanner(x: number, z: number, color: number) {
    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 5, 4),
      new THREE.MeshStandardMaterial({ color: 0x666666 }),
    );
    pole.position.set(x, 2.5, z);
    this.group.add(pole);

    // Banner cloth
    const bannerGeo = new THREE.PlaneGeometry(0.8, 1.5);
    const bannerMat = new THREE.MeshStandardMaterial({
      color,
      side: THREE.DoubleSide,
      roughness: 0.9,
    });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(x + 0.5, 4, z);
    this.group.add(banner);
  }

  private buildLighting() {
    // Soft ambient base
    const ambient = new THREE.AmbientLight(0x3a4a5a, 0.3);
    this.group.add(ambient);

    // Main sun - warm golden hour light
    const sun = new THREE.DirectionalLight(0xffecd2, 1.5);
    sun.position.set(25, 40, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 4096;
    sun.shadow.mapSize.height = 4096;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 2; // softer shadow edges with PCFSoft
    this.group.add(sun);
    this.group.add(sun.target); // ensure target is in scene

    // Fill light - cool blue from opposite side (simulates sky bounce)
    const fill = new THREE.DirectionalLight(0x8ab4f8, 0.35);
    fill.position.set(-20, 25, -15);
    this.group.add(fill);

    // Hemisphere for natural sky/ground color bleed
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3a5a2a, 0.5);
    this.group.add(hemi);
  }

  private createTextSign(text: string, color: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    const hex = '#' + color.toString(16).padStart(6, '0');
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.strokeText(text, 256, 80);
    ctx.fillStyle = hex;
    ctx.fillText(text, 256, 80);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 1, 1);
    return sprite;
  }

  // Called each frame for animations
  update(time: number, playerPos?: THREE.Vector3) {
    // ── Portal animations ───────────────────────────────────────────
    for (const pd of this.portalData) {
      // 5. Proximity reaction
      let proximity = 0;
      if (playerPos) {
        const dist = playerPos.distanceTo(pd.pos);
        if (dist < 8) {
          const t = 1 - dist / 8;
          proximity = t * t; // quadratic easing
        }
      }

      // 1. Shader vortex – update uniforms
      pd.shaderMat.uniforms.uTime.value = time;
      pd.shaderMat.uniforms.uProximity.value = proximity;

      // 2. Rune ring – slow rotation, faster when close
      const ringSpeed = 0.15 + proximity * 0.4;
      pd.runeRing.rotation.z = time * ringSpeed;

      // 3. Spiral particles – inward orbit
      const particleSpeed = 1.0 + proximity * 1.5;
      for (const p of pd.spiralParticles) {
        const d = p.userData;
        // t cycles 0→1 over the orbit period, then resets
        const cycle = ((time * d.speed * particleSpeed + d.phase) % (Math.PI * 2)) / (Math.PI * 2);
        const currentRadius = d.orbitRadius * (1 - cycle * 0.85); // shrinks toward center
        const angle = time * d.speed * particleSpeed + d.phase;

        p.position.x = pd.pos.x + Math.cos(angle) * currentRadius;
        p.position.y = pd.pos.y + 3.5 + d.yOffset * (1 - cycle * 0.5);
        p.position.z = pd.pos.z + Math.sin(angle) * currentRadius * 0.3; // flattened Z

        // Brighten as approaching center
        const mat = p.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.2 + cycle * 0.8;
      }

      // 4. Pillar energy pulse
      const basePulse = 0.08 + Math.sin(time * 2.5) * 0.06 + Math.sin(time * 4.1) * 0.03;
      const pulse = basePulse + proximity * 0.35;
      for (const mat of pd.pillarMaterials) {
        mat.emissiveIntensity = pulse;
      }

      // 5. Light intensity scales with proximity
      pd.mainLight.intensity = 3.0 + proximity * 4.0;
    }

    // ── Fountain animations ──────────────────────────────────────────
    const orb = this.group.getObjectByName('fountain-orb');
    if (orb) {
      orb.position.y = 5.45 + Math.sin(time * 2) * 0.12;
      orb.rotation.y = time * 0.5;
      // Pulsing glow
      const orbMat = (orb as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (orbMat.emissiveIntensity !== undefined) {
        orbMat.emissiveIntensity = 0.6 + Math.sin(time * 3) * 0.3;
      }
    }

    // Water surface oscillation
    const w1 = this.group.getObjectByName('fountain-water-1');
    const w2 = this.group.getObjectByName('fountain-water-2');
    const w3 = this.group.getObjectByName('fountain-water-3');
    if (w1) {
      w1.position.y = 0.85 + Math.sin(time * 1.5) * 0.02;
      w1.rotation.y = time * 0.1; // slow swirl
    }
    if (w2) {
      w2.position.y = 3.30 + Math.sin(time * 2.0 + 1) * 0.015;
      w2.rotation.y = -time * 0.15;
    }
    if (w3) {
      w3.position.y = 5.12 + Math.sin(time * 2.5 + 2) * 0.01;
      w3.rotation.y = time * 0.2;
    }

    // Water streams — wobble and pulse
    for (let i = 0; i < 4; i++) {
      const stream = this.group.getObjectByName(`fountain-stream-${i}`);
      if (stream) {
        stream.position.y = 2.3 + Math.sin(time * 3 + i * 1.5) * 0.06;
        stream.scale.x = 1 + Math.sin(time * 5 + i * 2) * 0.2;
        stream.scale.z = 1 + Math.cos(time * 4.5 + i * 1.8) * 0.15;
      }
    }

    // Splash particles — fountain-like rising/falling droplets from top
    for (let i = 0; i < 16; i++) {
      const splash = this.group.getObjectByName(`fountain-splash-${i}`);
      if (splash) {
        const phase = (time * 2.5 + i * 0.39) % 2.0; // cycle 0..2
        const angle = (i / 16) * Math.PI * 2 + time * 0.3;
        const spread = 0.2 + phase * 0.25;
        splash.position.x = Math.cos(angle) * spread;
        splash.position.z = Math.sin(angle) * spread;
        // Parabolic arc: rise then fall
        splash.position.y = 5.3 + phase * 0.8 - phase * phase * 0.35;
        const mat = (splash as THREE.Mesh).material as THREE.MeshBasicMaterial;
        // Fade out near end of cycle
        mat.opacity = phase < 1.5 ? 0.6 : 0.6 * (2.0 - phase) * 2;
      }
    }

    // Ripple rings at spout impact points — expand and fade
    for (let i = 0; i < 4; i++) {
      const ripple = this.group.getObjectByName(`fountain-ripple-${i}`);
      if (ripple) {
        const cycle = (time * 1.2 + i * 0.8) % 2.0;
        const s = 1 + cycle * 1.5;
        ripple.scale.set(s, s, s);
        const mat = (ripple as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.35 * Math.max(0, 1 - cycle / 2.0);
      }
    }

    // Altar crystals
    this.group.traverse(child => {
      if (child.name === 'altar-crystal') {
        child.rotation.y += 0.02;
        child.rotation.x = Math.sin(time * 1.5) * 0.2;
        const s = 1 + Math.sin(time * 3) * 0.15;
        child.scale.set(s, s, s);
      }
    });

    // Spawn orb
    const spawnOrb = this.group.getObjectByName('spawn-orb');
    const spawnOrbInner = this.group.getObjectByName('spawn-orb-inner');
    if (spawnOrb) {
      spawnOrb.position.y = 3.0 + Math.sin(time * 1.2) * 0.3;
      spawnOrb.rotation.y = time * 0.8;
      spawnOrb.rotation.x = Math.sin(time * 0.5) * 0.3;
    }
    if (spawnOrbInner) {
      spawnOrbInner.position.y = 3.0 + Math.sin(time * 1.2) * 0.3;
      spawnOrbInner.rotation.y = -time * 1.2;
      const pulse = 0.8 + Math.sin(time * 4) * 0.2;
      spawnOrbInner.scale.set(pulse, pulse, pulse);
    }
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
  }
}

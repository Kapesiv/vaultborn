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
// JS smoothstep helper (mirrors GLSL smoothstep)
function smoothstepJS(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Seeded PRNG for deterministic bone displacement */
function boneRand(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** Displace bone geometry vertices along normals for organic surface texture */
function displaceBone(geo: THREE.BufferGeometry, strength: number, seed: number): void {
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  if (!nor) return;
  const rand = boneRand(seed);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    const n1 = Math.sin(x * 4.1 + seed) * Math.cos(z * 3.7 + seed * 0.5);
    const n2 = Math.sin(y * 6.3 + seed * 1.3) * Math.cos(x * 5.1 + seed * 0.7);
    const disp = (n1 + n2) * 0.5 * strength + (rand() - 0.5) * strength * 0.3;
    pos.setX(i, x + nx * disp);
    pos.setY(i, y + ny * disp);
    pos.setZ(i, z + nz * disp);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/** Apply vertex-color weathering: cracks, moss, bleaching, age darkening */
function applyBoneWeathering(geo: THREE.BufferGeometry, params: {
  baseColor?: [number, number, number];
  crackDarkness?: number;
  mossAmount?: number;
  bleachAmount?: number;
  seed?: number;
}): void {
  const {
    baseColor = [0.83, 0.78, 0.63],
    crackDarkness = 0.15,
    mossAmount = 0.1,
    bleachAmount = 0.08,
    seed = 42,
  } = params;
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const rand = boneRand(seed);
  for (let i = 0; i < count; i++) {
    let r = baseColor[0], g = baseColor[1], b = baseColor[2];
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ny = nor ? nor.getY(i) : 0;
    const crack = Math.abs(Math.sin(x * 12.7 + z * 9.3 + seed * 2.1));
    if (crack > 0.92) {
      const d = crackDarkness * ((crack - 0.92) / 0.08);
      r -= d; g -= d; b -= d;
    }
    if (ny > 0.3) {
      const m = mossAmount * (ny - 0.3) * (0.5 + rand() * 0.5);
      r -= m * 0.3; g += m * 0.15; b -= m * 0.2;
    }
    if (ny > 0.5) {
      r += bleachAmount * ny; g += bleachAmount * ny * 0.9; b += bleachAmount * ny * 0.7;
    }
    const low = Math.max(0, -ny) * 0.1;
    r -= low; g -= low; b -= low;
    const v = (rand() - 0.5) * 0.04;
    r += v; g += v; b += v;
    colors[i * 3] = Math.max(0, Math.min(1, r));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, b));
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export interface WorldCollider {
  x: number;
  z: number;
  r: number;
}

export class HubWorld {
  public group: THREE.Group;

  // Interactive locations (for proximity checks)
  public shopPosition = new THREE.Vector3(-12, 0, -5);
  public pvpArenaPosition = new THREE.Vector3(15, 0, -8);
  public cavePosition = new THREE.Vector3(0, 0, -25);
  public npcPositions: { name: string; position: THREE.Vector3; dialog: string[] }[] = [];

  // Circle colliders for world objects (rocks, lanterns, pillars, NPCs)
  public colliders: WorldCollider[] = [];

  // Cave entrance data (animations handled by named objects)

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'hub-world';

    this.buildGround();
    this.buildFountainPlaza();
    this.buildShop();
    this.buildPvPArena();
    this.buildCaveEntrance();
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

    // ── Cobblestone paths — continuous vertex-displaced surface ────────
    // Hash function for deterministic per-stone variation
    const hashStone = (a: number, b: number) => {
      const n = a * 137 + b * 251;
      return ((n * 9301 + 49297) % 233280) / 233280.0;
    };

    const paths = [
      { from: [0, 0], to: [0, -30], width: 3 },    // North to portal

      { from: [0, 0], to: [18, -8], width: 2.5 },   // East to PvP
      { from: [0, 0], to: [0, 15], width: 2.5 },    // South spawn
    ];

    for (const p of paths) {
      const dx = p.to[0] - p.from[0];
      const dz = p.to[1] - p.from[1];
      const len = Math.sqrt(dx * dx + dz * dz);
      const pathAngle = Math.atan2(dx, dz);

      // High-subdivision plane — each vertex can be colored & displaced
      const segsW = Math.max(12, Math.floor(p.width * 8));
      const segsL = Math.max(30, Math.floor(len * 4));
      const pathGeo = new THREE.PlaneGeometry(p.width, len, segsW, segsL);

      const pos = pathGeo.attributes.position;
      const vtxCount = pos.count;
      const colors = new Float32Array(vtxCount * 3);

      for (let i = 0; i < vtxCount; i++) {
        const lx = pos.getX(i); // local across path
        const ly = pos.getY(i); // local along path

        // ── Cobblestone grid ──
        const stoneScale = 3.2;
        const gx = lx * stoneScale;
        const gy = ly * stoneScale;
        const row = Math.floor(gy);
        const adjX = gx + (row % 2) * 0.5; // offset every other row
        const cellX = adjX - Math.floor(adjX) - 0.5;
        const cellY = gy - Math.floor(gy) - 0.5;
        const distToCenter = Math.sqrt(cellX * cellX + cellY * cellY);

        // Stone is raised, gap between stones is low
        const stoneShape = smoothstepJS(0.48, 0.32, distToCenter);
        const h = stoneShape * 0.06;

        // Per-stone random height offset
        const stoneID_x = Math.floor(adjX);
        const stoneID_y = Math.floor(gy);
        const stoneRand = hashStone(stoneID_x, stoneID_y);
        const heightVariation = stoneRand * 0.025;

        pos.setZ(i, h + heightVariation);

        // ── Color ──
        // Per-stone color from hash
        const colorVar = hashStone(stoneID_x + 50, stoneID_y + 80);
        const colorVar2 = hashStone(stoneID_x + 120, stoneID_y + 30);

        // Base stone RGB
        let r = 0.40 + colorVar * 0.18;
        let g2 = 0.33 + colorVar * 0.14;
        let b = 0.22 + colorVar2 * 0.10;

        // Darken grout lines
        const groutDarken = stoneShape * 0.4 + 0.6;
        r *= groutDarken;
        g2 *= groutDarken;
        b *= groutDarken;

        // Slight moss in some grout
        if (stoneShape < 0.3 && colorVar2 > 0.6) {
          g2 += 0.06;
          r -= 0.03;
        }

        // Edge fade — blend to grass at path borders
        const edgeDist = Math.abs(lx) / (p.width / 2);
        if (edgeDist > 0.75) {
          const fade = (edgeDist - 0.75) / 0.25;
          const f = fade * fade; // smooth
          r = r * (1 - f) + 0.22 * f;
          g2 = g2 * (1 - f) + 0.40 * f;
          b = b * (1 - f) + 0.12 * f;
          pos.setZ(i, h * (1 - f)); // flatten at edges
        }

        colors[i * 3] = r;
        colors[i * 3 + 1] = g2;
        colors[i * 3 + 2] = b;
      }

      pos.needsUpdate = true;
      pathGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      pathGeo.computeVertexNormals();

      const pathMesh = new THREE.Mesh(pathGeo, new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.02,
      }));
      pathMesh.rotation.x = -Math.PI / 2;
      pathMesh.position.set(
        (p.from[0] + p.to[0]) / 2, 0.03,
        (p.from[1] + p.to[1]) / 2,
      );
      pathMesh.rotation.z = -pathAngle;
      pathMesh.receiveShadow = true;
      pathMesh.castShadow = true;
      this.group.add(pathMesh);
    }

    // ── Curved cobblestone path to shop ──────────────────────────────────
    {
      const shopPathWidth = 2.5;
      const shopCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),          // fountain center
        new THREE.Vector3(-6, 0, -0.5),      // head west
        new THREE.Vector3(-12, 0, -2),       // between the two lanterns
        new THREE.Vector3(-12, 0, -5),       // arrive at shop heading south
      ], false, 'catmullrom', 0.5);

      const segsAlong = 50;
      const segsAcross = Math.max(12, Math.floor(shopPathWidth * 8));
      const totalLen = shopCurve.getLength();
      const vtxCount = (segsAlong + 1) * (segsAcross + 1);
      const posArr = new Float32Array(vtxCount * 3);
      const colArr = new Float32Array(vtxCount * 3);

      for (let j = 0; j <= segsAlong; j++) {
        const t = j / segsAlong;
        const center = shopCurve.getPoint(t);
        const tangent = shopCurve.getTangent(t);
        // Perpendicular direction in XZ plane
        const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const ly = (t - 0.5) * totalLen; // local along-path coordinate

        for (let k = 0; k <= segsAcross; k++) {
          const crossT = k / segsAcross - 0.5; // -0.5 to 0.5
          const lx = crossT * shopPathWidth;
          const idx = j * (segsAcross + 1) + k;

          const wx = center.x + perp.x * lx;
          const wz = center.z + perp.z * lx;

          // ── Cobblestone grid (same logic as straight paths) ──
          const stoneScale = 3.2;
          const gx = lx * stoneScale;
          const gy = ly * stoneScale;
          const row = Math.floor(gy);
          const adjX = gx + (row % 2) * 0.5;
          const cellX = adjX - Math.floor(adjX) - 0.5;
          const cellY = gy - Math.floor(gy) - 0.5;
          const distToCenter = Math.sqrt(cellX * cellX + cellY * cellY);

          const stoneShape = smoothstepJS(0.48, 0.32, distToCenter);
          const h = stoneShape * 0.06;

          const stoneID_x = Math.floor(adjX);
          const stoneID_y = Math.floor(gy);
          const stoneRand = hashStone(stoneID_x, stoneID_y);
          const heightVariation = stoneRand * 0.025;

          posArr[idx * 3]     = wx;
          posArr[idx * 3 + 1] = 0.03 + h + heightVariation;
          posArr[idx * 3 + 2] = wz;

          // ── Color ──
          const colorVar = hashStone(stoneID_x + 50, stoneID_y + 80);
          const colorVar2 = hashStone(stoneID_x + 120, stoneID_y + 30);
          let r = 0.40 + colorVar * 0.18;
          let g2 = 0.33 + colorVar * 0.14;
          let b = 0.22 + colorVar2 * 0.10;

          const groutDarken = stoneShape * 0.4 + 0.6;
          r *= groutDarken;
          g2 *= groutDarken;
          b *= groutDarken;

          if (stoneShape < 0.3 && colorVar2 > 0.6) {
            g2 += 0.06;
            r -= 0.03;
          }

          // Edge fade
          const edgeDist = Math.abs(lx) / (shopPathWidth / 2);
          if (edgeDist > 0.75) {
            const fade = (edgeDist - 0.75) / 0.25;
            const f = fade * fade;
            r = r * (1 - f) + 0.22 * f;
            g2 = g2 * (1 - f) + 0.40 * f;
            b = b * (1 - f) + 0.12 * f;
            posArr[idx * 3 + 1] = 0.03 + (h + heightVariation) * (1 - f);
          }

          colArr[idx * 3]     = r;
          colArr[idx * 3 + 1] = g2;
          colArr[idx * 3 + 2] = b;
        }
      }

      // Build index buffer
      const idxArr: number[] = [];
      for (let j = 0; j < segsAlong; j++) {
        for (let k = 0; k < segsAcross; k++) {
          const a = j * (segsAcross + 1) + k;
          const bb = a + 1;
          const c = (j + 1) * (segsAcross + 1) + k;
          const d = c + 1;
          idxArr.push(a, bb, c);
          idxArr.push(bb, d, c);
        }
      }

      const curveGeo = new THREE.BufferGeometry();
      curveGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      curveGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      curveGeo.setIndex(idxArr);
      curveGeo.computeVertexNormals();

      const curveMesh = new THREE.Mesh(curveGeo, new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.02,
      }));
      curveMesh.receiveShadow = true;
      curveMesh.castShadow = true;
      this.group.add(curveMesh);
    }

    // ── Central plaza — circular cobblestone surface ────────────────────
    const plazaGeo = new THREE.CircleGeometry(8, 64, 0, Math.PI * 2);
    // Increase subdivisions by using a custom plane approach
    const plazaDetailGeo = new THREE.PlaneGeometry(17, 17, 60, 60);
    const pPos = plazaDetailGeo.attributes.position;
    const pCount = pPos.count;
    const pColors = new Float32Array(pCount * 3);

    for (let i = 0; i < pCount; i++) {
      const px = pPos.getX(i);
      const py = pPos.getY(i);
      const dist = Math.sqrt(px * px + py * py);

      // Circular mask — outside radius 8 flatten to nothing
      const circleMask = smoothstepJS(8.2, 7.5, dist);

      if (circleMask < 0.01) {
        // Outside plaza — transparent/invisible, push down
        pPos.setZ(i, -0.05);
        pColors[i * 3] = 0.22;
        pColors[i * 3 + 1] = 0.40;
        pColors[i * 3 + 2] = 0.12;
        continue;
      }

      // Concentric ring cobblestone pattern
      const ringScale = 2.8;
      const angle = Math.atan2(py, px);
      const ringCoord = dist * ringScale;
      const angularCoord = angle * dist * 0.8;

      const ringRow = Math.floor(ringCoord);
      const adjAng = angularCoord + (ringRow % 2) * 0.5;
      const cellR = ringCoord - ringRow - 0.5;
      const cellA = adjAng - Math.floor(adjAng) - 0.5;
      const cellDist = Math.sqrt(cellR * cellR + cellA * cellA);

      const stoneShape = smoothstepJS(0.48, 0.3, cellDist);
      const stoneID = Math.floor(adjAng) * 137 + ringRow * 251;
      const stoneRand = hashStone(Math.floor(adjAng), ringRow);

      const h = (stoneShape * 0.05 + stoneRand * 0.02) * circleMask;
      pPos.setZ(i, h);

      const cVar = hashStone(Math.floor(adjAng) + 50, ringRow + 80);
      const cVar2 = hashStone(Math.floor(adjAng) + 120, ringRow + 30);

      let r = 0.42 + cVar * 0.16;
      let g2 = 0.35 + cVar * 0.12;
      let b = 0.24 + cVar2 * 0.08;

      const grout = stoneShape * 0.35 + 0.65;
      r *= grout;
      g2 *= grout;
      b *= grout;

      // Center area slightly lighter (worn)
      if (dist < 4) {
        const centerBoost = (1 - dist / 4) * 0.08;
        r += centerBoost;
        g2 += centerBoost;
        b += centerBoost;
      }

      // Edge blend to grass
      const edgeFade = smoothstepJS(7.5, 8.0, dist);
      r = r * (1 - edgeFade) + 0.22 * edgeFade;
      g2 = g2 * (1 - edgeFade) + 0.40 * edgeFade;
      b = b * (1 - edgeFade) + 0.12 * edgeFade;

      pColors[i * 3] = r * circleMask + 0.22 * (1 - circleMask);
      pColors[i * 3 + 1] = g2 * circleMask + 0.40 * (1 - circleMask);
      pColors[i * 3 + 2] = b * circleMask + 0.12 * (1 - circleMask);
    }

    pPos.needsUpdate = true;
    plazaDetailGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
    plazaDetailGeo.computeVertexNormals();

    const plazaMesh = new THREE.Mesh(plazaDetailGeo, new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.02,
    }));
    plazaMesh.rotation.x = -Math.PI / 2;
    plazaMesh.position.y = 0.035;
    plazaMesh.receiveShadow = true;
    this.group.add(plazaMesh);

    // Stone border ring around plaza
    const borderRing = new THREE.Mesh(
      new THREE.TorusGeometry(7.8, 0.18, 8, 48),
      new THREE.MeshStandardMaterial({ color: 0x6a5a42, roughness: 0.85 }),
    );
    borderRing.rotation.x = -Math.PI / 2;
    borderRing.position.y = 0.06;
    this.group.add(borderRing);

    // Inner ring around the tree
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.8, 0.12, 6, 32),
      new THREE.MeshStandardMaterial({ color: 0x7a6a52, roughness: 0.8 }),
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.07;
    this.group.add(innerRing);
  }

  // Collision radius for the fountain base (used by LocalPlayer)
  public static readonly FOUNTAIN_RADIUS = 3.6;

  private buildFountainPlaza() {
    const tree = new THREE.Group();
    tree.name = 'tree-of-life';

    // --- Materials ---
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.95 });
    const barkDark = new THREE.MeshStandardMaterial({ color: 0x2e1f14, roughness: 0.98 });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6b2d, roughness: 0.8, side: THREE.DoubleSide });
    const leafLight = new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 0.75, side: THREE.DoubleSide });
    const leafGlow = new THREE.MeshStandardMaterial({
      color: 0x3a7a3a, emissive: 0x115511, emissiveIntensity: 0.3,
      roughness: 0.7, side: THREE.DoubleSide,
    });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x22aacc, transparent: true, opacity: 0.55,
      roughness: 0.05, metalness: 0.3,
      emissive: 0x115566, emissiveIntensity: 0.3,
    });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x44ddaa, emissive: 0x22aa77, emissiveIntensity: 0.8,
      roughness: 0.2,
    });
    const mushroomMat = new THREE.MeshStandardMaterial({
      color: 0x88ddaa, emissive: 0x33aa66, emissiveIntensity: 0.5,
      roughness: 0.6,
    });

    // ============================
    // TRUNK - gnarled ancient tree
    // ============================
    const trunkGeo = new THREE.CylinderGeometry(0.7, 2.0, 9, 12, 20);
    const tp = trunkGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i);
      const twist = Math.sin(y * 0.6) * 0.25;
      const bulge = 1 + Math.sin(y * 2.5 + x * 3) * 0.12 + Math.sin(y * 4.1 + z * 2.7) * 0.08;
      tp.setX(i, x * bulge + twist * z);
      tp.setZ(i, z * bulge - twist * x);
    }
    tp.needsUpdate = true;
    trunkGeo.computeVertexNormals();

    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.position.y = 4.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);

    // Trunk hollow - where water emerges
    const hollow = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x0a0805, roughness: 1.0 }),
    );
    hollow.position.set(0, 3.2, 1.4);
    hollow.scale.set(1, 0.7, 0.5);
    tree.add(hollow);

    // ============================
    // ROOTS - spreading across ground
    // ============================
    const rootData = [
      { angle: 0.0, length: 4.5, thick: 0.28, yOff: 0.3 },
      { angle: 0.8, length: 3.8, thick: 0.22, yOff: 0.2 },
      { angle: 1.5, length: 5.0, thick: 0.32, yOff: 0.35 },
      { angle: 2.2, length: 3.5, thick: 0.20, yOff: 0.25 },
      { angle: 3.1, length: 4.8, thick: 0.30, yOff: 0.3 },
      { angle: 3.9, length: 3.3, thick: 0.19, yOff: 0.2 },
      { angle: 4.7, length: 4.2, thick: 0.26, yOff: 0.28 },
      { angle: 5.5, length: 3.6, thick: 0.21, yOff: 0.22 },
    ];

    for (let i = 0; i < rootData.length; i++) {
      const r = rootData[i];
      const rootGeo = new THREE.CylinderGeometry(r.thick * 0.3, r.thick, r.length, 6, 4);
      const rp = rootGeo.attributes.position;
      for (let v = 0; v < rp.count; v++) {
        const vx = rp.getX(v), vy = rp.getY(v), vz = rp.getZ(v);
        rp.setX(v, vx * (1 + Math.sin(vy * 4) * 0.15));
        rp.setZ(v, vz * (1 + Math.cos(vy * 3.5) * 0.12));
      }
      rp.needsUpdate = true;
      rootGeo.computeVertexNormals();

      const root = new THREE.Mesh(rootGeo, barkDark);
      root.position.set(
        Math.cos(r.angle) * (r.length * 0.4),
        r.yOff,
        Math.sin(r.angle) * (r.length * 0.4),
      );
      root.rotation.z = -Math.cos(r.angle) * 1.3;
      root.rotation.x = Math.sin(r.angle) * 1.3;
      root.castShadow = true;
      tree.add(root);

      // Glowing root tips (every other root)
      if (i % 2 === 0) {
        const tipGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 6, 6), runeMat.clone(),
        );
        const tipDist = r.length * 0.75;
        tipGlow.position.set(
          Math.cos(r.angle) * tipDist, 0.08, Math.sin(r.angle) * tipDist,
        );
        tipGlow.name = `tree-root-glow-${i}`;
        tree.add(tipGlow);
      }
    }

    // ============================
    // BRANCHES - spreading from upper trunk
    // ============================
    const branchData = [
      { angle: 0.3, tilt: 0.7, length: 4.0, thick: 0.3 },
      { angle: 1.5, tilt: 0.6, length: 3.5, thick: 0.25 },
      { angle: 2.8, tilt: 0.75, length: 4.5, thick: 0.35 },
      { angle: 4.2, tilt: 0.55, length: 3.8, thick: 0.28 },
      { angle: 5.5, tilt: 0.65, length: 3.2, thick: 0.22 },
    ];

    for (const b of branchData) {
      const branchGeo = new THREE.CylinderGeometry(b.thick * 0.35, b.thick, b.length, 6, 4);
      const bp = branchGeo.attributes.position;
      for (let v = 0; v < bp.count; v++) {
        const vx = bp.getX(v), vy = bp.getY(v);
        bp.setX(v, vx * (1 + Math.sin(vy * 3) * 0.2));
      }
      bp.needsUpdate = true;
      branchGeo.computeVertexNormals();

      const branch = new THREE.Mesh(branchGeo, barkMat);
      branch.position.set(Math.cos(b.angle) * 0.8, 7.0, Math.sin(b.angle) * 0.8);
      branch.rotation.z = Math.cos(b.angle) * b.tilt;
      branch.rotation.x = -Math.sin(b.angle) * b.tilt;
      branch.castShadow = true;
      tree.add(branch);
    }

    // ============================
    // CANOPY - leaf clusters
    // ============================
    const leafPositions = [
      { x: 0, y: 10.5, z: 0, size: 2.8 },
      { x: 2.0, y: 10, z: 1.2, size: 2.2 },
      { x: -2.2, y: 9.8, z: 0.8, size: 2.4 },
      { x: 0.8, y: 9.5, z: -2.0, size: 2.0 },
      { x: -1.2, y: 10.2, z: -1.2, size: 1.8 },
      { x: 3.5, y: 8.8, z: 1.8, size: 1.8 },
      { x: -3.0, y: 8.5, z: 2.2, size: 1.6 },
      { x: 2.5, y: 8.6, z: -2.5, size: 1.7 },
      { x: -3.2, y: 8.0, z: -1.5, size: 1.5 },
      { x: 0, y: 11.0, z: 0.5, size: 1.8 },
      { x: 3.0, y: 7.8, z: 0, size: 1.3 },
      { x: -2.5, y: 7.5, z: -2.5, size: 1.4 },
    ];
    const leafMats = [leafMat, leafLight, leafGlow];
    for (let i = 0; i < leafPositions.length; i++) {
      const lp = leafPositions[i];
      const leafCluster = new THREE.Mesh(
        new THREE.SphereGeometry(lp.size, 8, 6), leafMats[i % 3],
      );
      leafCluster.position.set(lp.x, lp.y, lp.z);
      leafCluster.scale.set(1, 0.55, 1);
      leafCluster.name = `tree-leaf-${i}`;
      leafCluster.castShadow = true;
      tree.add(leafCluster);
    }

    // ============================
    // WATER - magical flow from trunk hollow
    // ============================
    const streamGeo = new THREE.CylinderGeometry(0.06, 0.18, 2.8, 8);
    const stream = new THREE.Mesh(streamGeo, waterMat);
    stream.position.set(0, 1.8, 1.8);
    stream.rotation.x = 0.25;
    stream.name = 'tree-waterfall';
    tree.add(stream);

    // Smaller trickle streams from roots
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + 0.5;
      const miniStream = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.06, 1.2, 6), waterMat,
      );
      miniStream.position.set(
        Math.cos(angle) * 1.6, 0.6, Math.sin(angle) * 1.6,
      );
      miniStream.rotation.z = Math.cos(angle) * 0.5;
      miniStream.rotation.x = -Math.sin(angle) * 0.5;
      miniStream.name = `tree-stream-${i}`;
      tree.add(miniStream);
    }

    // Water pool at base
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.5, 0.12, 32), waterMat,
    );
    pool.position.y = 0.18;
    pool.name = 'tree-water-pool';
    tree.add(pool);

    // Pool stone edge
    const poolEdge = new THREE.Mesh(
      new THREE.TorusGeometry(3.35, 0.2, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.85 }),
    );
    poolEdge.rotation.x = -Math.PI / 2;
    poolEdge.position.y = 0.25;
    tree.add(poolEdge);

    // Splash ripples at waterfall landing
    for (let i = 0; i < 3; i++) {
      const ripple = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.35, 12),
        new THREE.MeshBasicMaterial({
          color: 0x44ccdd, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
        }),
      );
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.set(0, 0.2, 2.2);
      ripple.name = `tree-ripple-${i}`;
      tree.add(ripple);
    }

    // ============================
    // RUNES - carved into bark
    // ============================
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const ry = 2.0 + i * 0.7;
      const dist = 1.1 + Math.sin(ry * 0.5) * 0.2;
      const rune = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.25, 0.02), runeMat.clone(),
      );
      rune.position.set(Math.cos(angle) * dist, ry, Math.sin(angle) * dist);
      rune.lookAt(new THREE.Vector3(Math.cos(angle) * 5, ry, Math.sin(angle) * 5));
      rune.name = `tree-rune-${i}`;
      tree.add(rune);
    }

    // ============================
    // MOSS patches
    // ============================
    const mossPositions = [
      { x: 1.0, y: 2.0, z: 0.6 }, { x: -1.1, y: 3.2, z: 0.4 },
      { x: 0.4, y: 5.0, z: -1.0 }, { x: -0.6, y: 1.5, z: 1.1 },
      { x: 0.8, y: 6.0, z: -0.5 }, { x: -0.9, y: 4.2, z: -0.7 },
    ];
    for (const mp of mossPositions) {
      const moss = new THREE.Mesh(
        new THREE.SphereGeometry(0.18 + Math.random() * 0.12, 5, 4), mossMat,
      );
      moss.position.set(mp.x, mp.y, mp.z);
      moss.scale.y = 0.3;
      tree.add(moss);
    }

    // ============================
    // BIOLUMINESCENT MUSHROOMS
    // ============================
    const mushroomPos: number[][] = [
      [2.2, 0.15, 1.8], [-1.8, 0.12, 2.5], [2.8, 0.1, -1.2],
      [-2.3, 0.14, -2.0], [0.6, 0.18, 3.0], [-0.5, 2.0, 1.3],
      [0.8, 3.5, -0.7],
    ];
    for (const [mx, my, mz] of mushroomPos) {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.12 + Math.random() * 0.08, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55),
        mushroomMat,
      );
      cap.position.set(mx, my + 0.18, mz);
      tree.add(cap);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.04, 0.18, 4),
        new THREE.MeshStandardMaterial({ color: 0xccccbb }),
      );
      stem.position.set(mx, my + 0.09, mz);
      tree.add(stem);
    }

    // ============================
    // FIREFLIES - floating magical particles
    // ============================
    const fireflyBaseMat = new THREE.MeshBasicMaterial({
      color: 0xaaffaa, transparent: true, opacity: 0.7,
    });
    for (let i = 0; i < 20; i++) {
      const firefly = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 4), fireflyBaseMat.clone(),
      );
      const bx = (Math.random() - 0.5) * 10;
      const by = 1.5 + Math.random() * 9;
      const bz = (Math.random() - 0.5) * 10;
      firefly.position.set(bx, by, bz);
      firefly.userData.baseX = bx;
      firefly.userData.baseY = by;
      firefly.userData.baseZ = bz;
      firefly.name = `tree-firefly-${i}`;
      tree.add(firefly);
    }

    // ============================
    // LIGHTING
    // ============================
    const canopyLight = new THREE.PointLight(0x44cc88, 2.0, 20);
    canopyLight.position.set(0, 10, 0);
    tree.add(canopyLight);

    const waterLight = new THREE.PointLight(0x22aacc, 1.5, 10);
    waterLight.position.set(0, 0.5, 0.5);
    tree.add(waterLight);

    const runeLight = new THREE.PointLight(0x44ddaa, 1.0, 8);
    runeLight.position.set(0, 3.5, 0);
    tree.add(runeLight);

    const upLight = new THREE.PointLight(0x88cc44, 0.6, 12);
    upLight.position.set(0, 6, 0);
    tree.add(upLight);

    this.group.add(tree);
  }

  private buildShop() {
    const pos = this.shopPosition;
    const stall = new THREE.Group();
    stall.name = 'shop-stall';

    // --- Materials ---
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x3e2410, roughness: 0.92, metalness: 0 });
    const plank = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.9, metalness: 0 });
    const plankLight = new THREE.MeshStandardMaterial({ color: 0x8b6842, roughness: 0.88, metalness: 0 });
    const canvasMat = new THREE.MeshStandardMaterial({ color: 0xc2a672, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    const canvasStripe = new THREE.MeshStandardMaterial({ color: 0x8b3a3a, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.4 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.92, metalness: 0.05 });

    const W = 5, D = 2.5;
    const counterH = 1.05;
    const postH = 2.8;

    // ============================
    // STONE BASE — cobblestone pad
    // ============================
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.4, 0.12, 8), stoneMat,
    );
    base.position.set(0, 0.06, 0);
    base.receiveShadow = true;
    stall.add(base);

    // ============================
    // COUNTER — wooden table
    // ============================
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.1, D), plankLight,
    );
    top.position.set(0, counterH, 0);
    top.castShadow = true;
    top.receiveShadow = true;
    stall.add(top);

    // Front board
    const frontBoard = new THREE.Mesh(
      new THREE.BoxGeometry(W, counterH * 0.6, 0.07), plank,
    );
    frontBoard.position.set(0, counterH * 0.45, D / 2 - 0.02);
    frontBoard.castShadow = true;
    stall.add(frontBoard);

    // Side boards
    for (const side of [-1, 1]) {
      const sideBoard = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, counterH * 0.6, D - 0.1), plank,
      );
      sideBoard.position.set(side * (W / 2 - 0.02), counterH * 0.45, 0);
      sideBoard.castShadow = true;
      stall.add(sideBoard);
    }

    // Four corner legs
    for (const lx of [-W / 2 + 0.1, W / 2 - 0.1]) {
      for (const lz of [-D / 2 + 0.1, D / 2 - 0.1]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, counterH, 0.12), darkWood,
        );
        leg.position.set(lx, counterH / 2, lz);
        leg.castShadow = true;
        stall.add(leg);
      }
    }

    // ============================
    // CANOPY — canvas awning on 4 posts
    // ============================
    for (const px of [-W / 2 + 0.1, W / 2 - 0.1]) {
      for (const pz of [-D / 2 + 0.1, D / 2 - 0.1]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.07, postH, 6), darkWood,
        );
        post.position.set(px, postH / 2, pz);
        post.castShadow = true;
        stall.add(post);
      }
    }

    // Cross beams at top
    for (const px of [-W / 2 + 0.1, W / 2 - 0.1]) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, D + 0.4), darkWood,
      );
      beam.position.set(px, postH - 0.04, 0);
      beam.castShadow = true;
      stall.add(beam);
    }
    for (const pz of [-D / 2 + 0.1, D / 2 + 0.1]) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(W + 0.4, 0.08, 0.08), darkWood,
      );
      beam.position.set(0, postH - 0.04, pz);
      beam.castShadow = true;
      stall.add(beam);
    }

    // Canvas sheet with slight sag
    const canopyY = postH + 0.02;
    const canopyOverhang = 0.5;
    const canopyGeo = new THREE.PlaneGeometry(W + canopyOverhang * 2, D + canopyOverhang * 2, 4, 4);
    const posAttr = canopyGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const dist = Math.sqrt(x * x + y * y);
      posAttr.setZ(i, -dist * 0.04);
    }
    canopyGeo.computeVertexNormals();
    const canopyMesh = new THREE.Mesh(canopyGeo, canvasMat);
    canopyMesh.rotation.x = -Math.PI / 2;
    canopyMesh.position.set(0, canopyY, 0);
    canopyMesh.castShadow = true;
    canopyMesh.receiveShadow = true;
    stall.add(canopyMesh);

    // Decorative stripes on canvas
    for (const sz of [-0.7, 0.7]) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(W + canopyOverhang * 2, 0.5), canvasStripe,
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, canopyY + 0.01, sz);
      stall.add(stripe);
    }

    // Front valance (hanging trim)
    const valance = new THREE.Mesh(
      new THREE.PlaneGeometry(W + canopyOverhang * 2, 0.3), canvasStripe,
    );
    valance.position.set(0, canopyY - 0.15, D / 2 + canopyOverhang);
    stall.add(valance);

    // Scalloped trim pieces
    for (let i = 0; i < 8; i++) {
      const tri = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.2, 3), canvasMat,
      );
      tri.rotation.z = Math.PI;
      tri.position.set(-W / 2 - canopyOverhang + 0.45 + i * 0.8, canopyY - 0.4, D / 2 + canopyOverhang);
      stall.add(tri);
    }

    // ============================
    // MERCHANDISE on counter
    // ============================
    const potionColors = [0xff3333, 0x3366ff, 0x33dd33];
    for (let i = 0; i < 3; i++) {
      const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, 0.2, 8),
        new THREE.MeshPhysicalMaterial({
          color: potionColors[i], transmission: 0.6, roughness: 0.05,
          thickness: 0.5, transparent: true, opacity: 0.75,
        }),
      );
      bottle.position.set(-1.5 + i * 0.5, counterH + 0.15, -0.4);
      stall.add(bottle);

      const cork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.03, 0.04, 4),
        new THREE.MeshStandardMaterial({ color: 0xaa8855, roughness: 0.85 }),
      );
      cork.position.set(-1.5 + i * 0.5, counterH + 0.28, -0.4);
      stall.add(cork);
    }

    // Sword display (leaning)
    const swordBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.9, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.2 }),
    );
    swordBlade.position.set(1.5, counterH + 0.5, 0);
    swordBlade.rotation.z = 0.15;
    stall.add(swordBlade);

    const swordHilt = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.04, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.8 }),
    );
    swordHilt.position.set(1.45, counterH + 0.08, 0);
    stall.add(swordHilt);

    // Leather armor on display
    const armorDummy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.9 }),
    );
    armorDummy.position.set(0.3, counterH + 0.3, 0.2);
    stall.add(armorDummy);

    // Small crate on counter
    const smallCrate = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.3, 0.35), plank,
    );
    smallCrate.position.set(-0.7, counterH + 0.2, 0.3);
    smallCrate.rotation.y = 0.2;
    stall.add(smallCrate);

    // ============================
    // BARRELS beside stall
    // ============================
    for (const [bx, bz] of [[-2.8, 0.3], [2.8, -0.2]] as number[][]) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.36, 0.85, 10), plank,
      );
      barrel.position.set(bx, 0.42, bz);
      barrel.castShadow = true;
      stall.add(barrel);

      for (const ry of [0.12, 0.42, 0.72]) {
        const hoop = new THREE.Mesh(
          new THREE.TorusGeometry(0.39, 0.012, 6, 12), metalMat,
        );
        hoop.position.set(bx, ry, bz);
        hoop.rotation.x = Math.PI / 2;
        stall.add(hoop);
      }
    }

    // ============================
    // HANGING SIGN — "TOIVO'S FORGE"
    // ============================
    const signArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1.2, 5), metalMat,
    );
    signArm.rotation.z = Math.PI / 2;
    signArm.position.set(0.6, postH - 0.5, D / 2 + canopyOverhang + 0.1);
    stall.add(signArm);

    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.55, 0.05), plank,
    );
    signBoard.position.set(0.6, postH - 0.95, D / 2 + canopyOverhang + 0.1);
    stall.add(signBoard);

    const signText = this.createTextSign("TOIVO'S FORGE", 0xFFD700);
    signText.position.set(0.6, postH - 0.95, D / 2 + canopyOverhang + 0.16);
    stall.add(signText);

    for (const sx of [-0.3, 0.3]) {
      const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.32, 4), metalMat,
      );
      chain.position.set(0.6 + sx, postH - 0.68, D / 2 + canopyOverhang + 0.1);
      stall.add(chain);
    }

    // ============================
    // LANTERN hanging from canopy
    // ============================
    const lanternHook = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.4, 4), metalMat,
    );
    lanternHook.position.set(0, canopyY - 0.2, 0);
    stall.add(lanternHook);

    const lanternFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.25, 0.2), metalMat,
    );
    lanternFrame.position.set(0, canopyY - 0.5, 0);
    stall.add(lanternFrame);

    const lanternLight = new THREE.PointLight(0xffaa44, 0.8, 7);
    lanternLight.position.set(0, canopyY - 0.5, 0);
    stall.add(lanternLight);

    stall.position.copy(pos);
    this.group.add(stall);
  }

  private buildPvPArena() {
    const pos = this.pvpArenaPosition;

    // Arena walls (colosseum-style arc)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x887766, roughness: 0.75 });

    // Back curved wall
    for (let i = -3; i <= 3; i++) {
      const angle = (i / 3) * 0.8;
      const px = pos.x + Math.sin(angle) * 6;
      const pz = pos.z - Math.cos(angle) * 6;
      const pillarGeo = new THREE.CylinderGeometry(0.5, 0.6, 6, 8);
      const pillar = new THREE.Mesh(pillarGeo, wallMat);
      pillar.position.set(px, 3, pz);
      pillar.castShadow = true;
      this.group.add(pillar);
      this.colliders.push({ x: px, z: pz, r: 0.6 });
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
    this.colliders.push({ x: pos.x - 1.5, z: pos.z + 5, r: 0.4 });

    const gateRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), gateMat);
    gateRight.position.set(pos.x + 1.5, 2, pos.z + 5);
    gateRight.castShadow = true;
    this.group.add(gateRight);
    this.colliders.push({ x: pos.x + 1.5, z: pos.z + 5, r: 0.4 });

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

  private buildCaveEntrance() {
    const cp = this.cavePosition.clone();

    // ── a) Dragon skull — resting ON the ground, open mouth = portal ───
    // Skull is lying flat: lower jaw at y≈0, cranium rises to y≈3-4
    // Mouth faces +Z (toward player), player walks INTO the open mouth

    const boneMat = new THREE.MeshStandardMaterial({
      color: 0xd4c9a8,
      roughness: 0.85,
      metalness: 0.05,
    });

    const recessMat = new THREE.MeshStandardMaterial({
      color: 0x1a1210,
      roughness: 0.95,
      metalness: 0,
    });

    // Cranium — large angular skull, lifted higher for gaping mouth underneath
    const craniGeo = new THREE.BoxGeometry(6.0, 3.5, 8.0, 8, 6, 8);
    const craniPos = craniGeo.attributes.position;
    for (let i = 0; i < craniPos.count; i++) {
      let x = craniPos.getX(i), y = craniPos.getY(i), z = craniPos.getZ(i);
      // V-shaped snout taper toward front (+Z)
      if (z > 0) {
        const taper = 1 - (z / 4.0) * 0.45;
        x *= taper;
        y *= (taper * 0.8 + 0.2);
      }
      // Angular brow ridge — more pronounced
      if (y > 0.3 && z > -1) y += 0.7 * Math.max(0, 1 - Math.abs(x) / 2.8);
      // Occipital bulge at back
      if (z < -2) y += Math.max(0, (-z - 2) / 1.5) * 0.4;
      // Flatten bottom — this is the roof of the mouth
      if (y < -0.8) y = -0.8;
      // Cheek flare
      if (y < 0 && Math.abs(x) > 1.5) x *= 1.2;
      craniPos.setX(i, x);
      craniPos.setY(i, y);
    }
    craniPos.needsUpdate = true;
    craniGeo.computeVertexNormals();
    displaceBone(craniGeo, 0.06, 101);
    applyBoneWeathering(craniGeo, { seed: 101, mossAmount: 0.15, crackDarkness: 0.22 });
    const cranium = new THREE.Mesh(craniGeo, boneMat);
    cranium.position.set(cp.x, 3.5, cp.z);
    cranium.castShadow = true;
    this.group.add(cranium);

    // Sagittal crest — sharp ridge along skull top
    const crestGeo = new THREE.BoxGeometry(0.3, 1.0, 6.0, 3, 3, 8);
    const crestP = crestGeo.attributes.position;
    for (let v = 0; v < crestP.count; v++) {
      const y = crestP.getY(v), z = crestP.getZ(v);
      if (z > 0) crestP.setY(v, y * (1 - z / 6.0 * 0.5));
    }
    crestP.needsUpdate = true;
    crestGeo.computeVertexNormals();
    displaceBone(crestGeo, 0.06, 102);
    applyBoneWeathering(crestGeo, { seed: 102, bleachAmount: 0.14 });
    const crest = new THREE.Mesh(crestGeo, boneMat);
    crest.position.set(cp.x, 5.5, cp.z - 1.0);
    crest.castShadow = true;
    this.group.add(crest);

    // Skull spikes — horn-like protrusions along skull edges
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) {
        const spkH = 0.6 - i * 0.08;
        const spkGeo = new THREE.ConeGeometry(0.1, spkH, 4);
        displaceBone(spkGeo, 0.015, 180 + i * 2 + (side > 0 ? 1 : 0));
        applyBoneWeathering(spkGeo, { seed: 180 + i * 2 + (side > 0 ? 1 : 0) });
        const spk = new THREE.Mesh(spkGeo, boneMat);
        spk.position.set(
          cp.x + side * (2.5 - i * 0.15),
          4.8 - i * 0.2,
          cp.z + 1.0 - i * 1.2,
        );
        spk.rotation.z = side * 0.5;
        spk.rotation.x = -0.15;
        spk.castShadow = true;
        this.group.add(spk);
      }
    }

    // Upper jaw — forms roof of the open mouth portal (wide gaping opening)
    const jawUpperGeo = new THREE.BoxGeometry(5.5, 1.0, 6.0, 7, 3, 7);
    const jawUPos = jawUpperGeo.attributes.position;
    for (let i = 0; i < jawUPos.count; i++) {
      const z = jawUPos.getZ(i);
      if (z > 0) jawUPos.setX(i, jawUPos.getX(i) * (1 - (z / 3.0) * 0.45));
    }
    jawUPos.needsUpdate = true;
    jawUpperGeo.computeVertexNormals();
    displaceBone(jawUpperGeo, 0.04, 103);
    applyBoneWeathering(jawUpperGeo, { seed: 103, crackDarkness: 0.18 });
    const jawUpper = new THREE.Mesh(jawUpperGeo, boneMat);
    jawUpper.position.set(cp.x, 2.8, cp.z + 2.5);
    jawUpper.castShadow = true;
    this.group.add(jawUpper);

    // Lower jaw — two massive mandible halves flat on ground, spread wide open
    for (const side of [-1, 1]) {
      const mandGeo = new THREE.BoxGeometry(2.5, 0.5, 6.0, 5, 2, 6);
      const mandPos = mandGeo.attributes.position;
      for (let i = 0; i < mandPos.count; i++) {
        const z = mandPos.getZ(i);
        if (z > 0) mandPos.setX(i, mandPos.getX(i) * (1 - (z / 3.0) * 0.45));
      }
      mandPos.needsUpdate = true;
      mandGeo.computeVertexNormals();
      displaceBone(mandGeo, 0.03, 104 + side);
      applyBoneWeathering(mandGeo, { seed: 104 + side, crackDarkness: 0.22 });
      const mandible = new THREE.Mesh(mandGeo, boneMat);
      mandible.position.set(cp.x + side * 1.6, 0.2, cp.z + 2.5);
      mandible.rotation.z = side * 0.08;
      mandible.rotation.y = side * 0.12;
      mandible.castShadow = true;
      this.group.add(mandible);
    }

    // Nasal openings — dark cavities on top of snout
    for (const side of [-1, 1]) {
      const nasalShape = new THREE.Shape();
      nasalShape.moveTo(0, 0);
      nasalShape.bezierCurveTo(0.3, 0.4 * side, 0.6, 0.35, 0.5, 0);
      nasalShape.bezierCurveTo(0.4, -0.25, 0.1, -0.25, 0, 0);
      const nasalGeo = new THREE.ShapeGeometry(nasalShape);
      const nasal = new THREE.Mesh(nasalGeo, recessMat);
      nasal.position.set(cp.x + side * 0.5, 4.2, cp.z + 4.0);
      nasal.scale.set(0.8, 0.7, 1);
      this.group.add(nasal);
    }

    // Orbital ridges — brow bones above eye sockets
    for (const side of [-1, 1]) {
      const browCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.5, 0, 0),
        new THREE.Vector3(side * 1.0, 0.3, 0.2),
        new THREE.Vector3(side * 1.5, 0.15, 0),
        new THREE.Vector3(side * 1.8, -0.1, -0.2),
      ]);
      const browGeo = new THREE.TubeGeometry(browCurve, 8, 0.2, 6, false);
      displaceBone(browGeo, 0.03, 110 + side);
      applyBoneWeathering(browGeo, { seed: 110 + side, bleachAmount: 0.1 });
      const browBone = new THREE.Mesh(browGeo, boneMat);
      browBone.position.set(cp.x, 4.5, cp.z + 1.5);
      browBone.castShadow = true;
      this.group.add(browBone);
    }

    // Cheekbones — zygomatic arches
    for (const side of [-1, 1]) {
      const zygCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * 0.8, -0.3, 0.5),
        new THREE.Vector3(side * 1.2, -0.8, 0.3),
      ]);
      const zygGeo = new THREE.TubeGeometry(zygCurve, 6, 0.14, 5, false);
      displaceBone(zygGeo, 0.025, 115 + side);
      applyBoneWeathering(zygGeo, { seed: 115 + side });
      const zygomatic = new THREE.Mesh(zygGeo, boneMat);
      zygomatic.position.set(cp.x + side * 0.8, 3.6, cp.z + 1.0);
      zygomatic.castShadow = true;
      this.group.add(zygomatic);
    }

    // Teeth — upper jaw: 20 teeth hanging DOWN from raised jaw, big fangs at front
    for (let i = 0; i < 20; i++) {
      const side = (i % 2 === 0) ? -1 : 1;
      const idx = Math.floor(i / 2);
      const isFang = idx < 3;
      const isBroken = idx === 5 || idx === 8;
      const baseH = isFang ? (1.5 - idx * 0.15) : (0.5 + Math.sin(i * 2.3) * 0.15);
      const h = isBroken ? baseH * 0.4 : baseH;
      const r = isFang ? 0.14 : Math.max(0.04, 0.09 - idx * 0.005);
      const toothGeo = new THREE.ConeGeometry(r, h, 5);
      const tPos = toothGeo.attributes.position;
      for (let v = 0; v < tPos.count; v++) {
        const y = tPos.getY(v);
        // Slight backward curve to teeth
        if (y < 0) tPos.setZ(v, tPos.getZ(v) + y * 0.15);
      }
      tPos.needsUpdate = true;
      toothGeo.computeVertexNormals();
      displaceBone(toothGeo, 0.012, 120 + i);
      applyBoneWeathering(toothGeo, { seed: 120 + i, baseColor: [0.88, 0.84, 0.68] });
      const tooth = new THREE.Mesh(toothGeo, boneMat);
      // Teeth hang from upper jaw (y≈2.3) along the jaw edge, wider spread
      tooth.position.set(
        cp.x + side * (1.8 + idx * 0.2),
        2.3 - h / 2 + idx * 0.02,
        cp.z + 4.0 - idx * 0.45,
      );
      tooth.rotation.z = Math.PI; // Point downward
      tooth.rotation.x = Math.sin(i * 3.7) * 0.12;
      tooth.rotation.y = Math.sin(i * 2.1) * 0.1;
      tooth.castShadow = true;
      this.group.add(tooth);
    }

    // Teeth — lower jaw: 14 teeth poking UP from mandibles on ground
    for (let i = 0; i < 14; i++) {
      const side = (i % 2 === 0) ? -1 : 1;
      const idx = Math.floor(i / 2);
      const isFang = idx < 2;
      const isBroken = idx === 3;
      const baseH = isFang ? (1.2 - idx * 0.2) : (0.4 + Math.sin(i * 1.8) * 0.12);
      const h = isBroken ? baseH * 0.35 : baseH;
      const r = isFang ? 0.11 : Math.max(0.04, 0.07 - idx * 0.004);
      const toothGeo = new THREE.ConeGeometry(r, h, 5);
      const tPos = toothGeo.attributes.position;
      for (let v = 0; v < tPos.count; v++) {
        const y = tPos.getY(v);
        if (y > 0) tPos.setZ(v, tPos.getZ(v) - y * 0.1);
      }
      tPos.needsUpdate = true;
      toothGeo.computeVertexNormals();
      displaceBone(toothGeo, 0.01, 140 + i);
      applyBoneWeathering(toothGeo, { seed: 140 + i, baseColor: [0.85, 0.80, 0.62] });
      const tooth = new THREE.Mesh(toothGeo, boneMat);
      // Teeth point UP from lower jaw, wider spread matching mandibles
      tooth.position.set(
        cp.x + side * (1.4 + idx * 0.22),
        0.4 + h / 2,
        cp.z + 4.0 - idx * 0.5,
      );
      tooth.rotation.x = Math.sin(i * 2.5) * 0.08;
      tooth.rotation.y = side * Math.sin(i * 1.7) * 0.06;
      tooth.castShadow = true;
      this.group.add(tooth);
    }

    // Eye sockets + glow (naming preserved for animations)
    for (const side of [-1, 1]) {
      const socketGeo = new THREE.SphereGeometry(0.55, 10, 10);
      displaceBone(socketGeo, 0.03, 150 + side);
      const socket = new THREE.Mesh(socketGeo, recessMat);
      socket.position.set(cp.x + side * 1.5, 4.0, cp.z + 1.6);
      socket.scale.set(1.2, 0.9, 0.7);
      this.group.add(socket);

      const eyeGlow = new THREE.PointLight(0x22ff44, 1.5, 6);
      eyeGlow.position.set(cp.x + side * 1.5, 4.0, cp.z + 1.8);
      eyeGlow.name = `dragon-eye-${side === -1 ? 'L' : 'R'}`;
      this.group.add(eyeGlow);

      const eyeOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x22ff44, transparent: true, opacity: 0.7 }),
      );
      eyeOrb.position.set(cp.x + side * 1.5, 4.0, cp.z + 1.65);
      eyeOrb.name = `dragon-eye-orb-${side === -1 ? 'L' : 'R'}`;
      this.group.add(eyeOrb);
    }

    // Horns — sweep backward from skull, close to ground
    for (const side of [-1, 1]) {
      const hornCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(cp.x + side * 2.2, 4.5, cp.z + 0.5),
        new THREE.Vector3(cp.x + side * 3.2, 5.2, cp.z - 0.5),
        new THREE.Vector3(cp.x + side * 4.0, 4.8, cp.z - 2.0),
        new THREE.Vector3(cp.x + side * 4.2, 3.5, cp.z - 3.5),
      ]);
      const hornGeo = new THREE.TubeGeometry(hornCurve, 12, 0.22, 7, false);
      const hPos = hornGeo.attributes.position;
      for (let v = 0; v < hPos.count; v++) {
        const p = new THREE.Vector3(hPos.getX(v), hPos.getY(v), hPos.getZ(v));
        const startD = p.distanceTo(hornCurve.getPoint(0));
        const endD = p.distanceTo(hornCurve.getPoint(1));
        const t = startD / (startD + endD + 0.001);
        const taper = 1 - t * 0.7;
        const center = hornCurve.getPoint(t);
        hPos.setX(v, center.x + (hPos.getX(v) - center.x) * taper);
        hPos.setY(v, center.y + (hPos.getY(v) - center.y) * taper);
        hPos.setZ(v, center.z + (hPos.getZ(v) - center.z) * taper);
      }
      hPos.needsUpdate = true;
      hornGeo.computeVertexNormals();
      displaceBone(hornGeo, 0.04, 160 + side);
      applyBoneWeathering(hornGeo, { seed: 160 + side, baseColor: [0.75, 0.70, 0.55] });
      const horn = new THREE.Mesh(hornGeo, boneMat);
      horn.castShadow = true;
      this.group.add(horn);
    }

    // Dark interior (the maw) — large dark void visible through the gaping open mouth
    // This is the portal the player walks into
    const interiorGeo = new THREE.PlaneGeometry(5.0, 3.5);
    const interior = new THREE.Mesh(interiorGeo, new THREE.MeshBasicMaterial({
      color: 0x010203, side: THREE.DoubleSide,
    }));
    interior.position.set(cp.x, 1.5, cp.z - 0.5);
    this.group.add(interior);

    // Additional dark planes for depth/tunnel effect inside mouth
    const innerMawGeo = new THREE.PlaneGeometry(4.5, 3.2);
    const innerMaw = new THREE.Mesh(innerMawGeo, new THREE.MeshBasicMaterial({
      color: 0x010102, side: THREE.DoubleSide,
    }));
    innerMaw.position.set(cp.x, 1.4, cp.z - 2.5);
    this.group.add(innerMaw);

    // Side walls of the maw — dark planes to create enclosed tunnel feel
    for (const side of [-1, 1]) {
      const wallGeo = new THREE.PlaneGeometry(3.0, 3.5);
      const wall = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({
        color: 0x020203, side: THREE.DoubleSide,
      }));
      wall.position.set(cp.x + side * 2.2, 1.5, cp.z + 0.5);
      wall.rotation.y = side * Math.PI / 2;
      this.group.add(wall);
    }

    // Ceiling of the maw
    const ceilGeo = new THREE.PlaneGeometry(4.5, 4.0);
    const ceil = new THREE.Mesh(ceilGeo, new THREE.MeshBasicMaterial({
      color: 0x010102, side: THREE.DoubleSide,
    }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cp.x, 2.8, cp.z + 0.5);
    this.group.add(ceil);

    // ── b) Spine — ground-level vertebrae from skull base toward tail ───
    // Spine runs close to ground: y≈1.5 near skull, tapering to y≈0.5 at end
    const spineCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cp.x, 1.5, cp.z - 3),
      new THREE.Vector3(cp.x + 0.15, 1.4, cp.z - 7),
      new THREE.Vector3(cp.x - 0.1, 1.2, cp.z - 11),
      new THREE.Vector3(cp.x + 0.2, 0.9, cp.z - 15),
      new THREE.Vector3(cp.x, 0.6, cp.z - 19),
    ]);
    const spineCount = 14;
    for (let i = 0; i < spineCount; i++) {
      const t = i / (spineCount - 1);
      const vSize = 0.55 - t * 0.25;
      const vertGeo = new THREE.DodecahedronGeometry(vSize, 1);
      const vPos = vertGeo.attributes.position;
      for (let v = 0; v < vPos.count; v++) {
        const y = vPos.getY(v), x = vPos.getX(v);
        // Dorsal process bump up
        if (y > vSize * 0.3) vPos.setY(v, y + (y - vSize * 0.3) * 0.8);
        // Transverse process flare
        if (Math.abs(x) > vSize * 0.4 && Math.abs(y) < vSize * 0.3) vPos.setX(v, x * 1.4);
      }
      vPos.needsUpdate = true;
      vertGeo.computeVertexNormals();
      displaceBone(vertGeo, 0.03, 200 + i);
      applyBoneWeathering(vertGeo, { seed: 200 + i, crackDarkness: 0.18 });
      const vert = new THREE.Mesh(vertGeo, boneMat);
      const pos = spineCurve.getPoint(t);
      vert.position.copy(pos);
      const tangent = spineCurve.getTangent(t);
      vert.lookAt(pos.clone().add(tangent));
      vert.castShadow = true;
      this.group.add(vert);
    }

    // Dorsal spines — MASSIVE tall spike-like bone protrusions along spine
    // THE key silhouette feature. Tallest at shoulders (y≈5-6), taper at head/tail
    const dorsalCount = 18;
    for (let i = 0; i < dorsalCount; i++) {
      const t = i / (dorsalCount - 1);
      const curveT = t * 0.92 + 0.04;
      const spt = spineCurve.getPoint(curveT);
      // Height peaks at shoulders (t≈0.15-0.3), tapers both ways
      const peakT = 0.22;
      const sizeFactor = Math.max(0.1, 1 - Math.pow(Math.abs(t - peakT) * 1.6, 0.75));
      const spikeHeight = 0.6 + sizeFactor * 4.5;
      const spikeRadius = 0.08 + sizeFactor * 0.3;
      const spikeGeo = new THREE.ConeGeometry(spikeRadius, spikeHeight, 5);
      // Slight backward curve
      const spPos = spikeGeo.attributes.position;
      for (let v = 0; v < spPos.count; v++) {
        const y = spPos.getY(v);
        if (y > 0) spPos.setZ(v, spPos.getZ(v) - y * 0.12);
      }
      spPos.needsUpdate = true;
      spikeGeo.computeVertexNormals();
      displaceBone(spikeGeo, 0.02, 250 + i);
      applyBoneWeathering(spikeGeo, { seed: 250 + i, bleachAmount: 0.12 });
      const spike = new THREE.Mesh(spikeGeo, boneMat);
      spike.position.set(spt.x, spt.y + spikeHeight * 0.5, spt.z);
      spike.rotation.x = Math.sin(i * 1.7) * 0.1 - 0.06;
      spike.rotation.z = Math.sin(i * 2.3) * 0.06;
      spike.castShadow = true;
      this.group.add(spike);
    }

    // ── c) Ribcage — arching UP from ground-level spine ─────────────────
    // Spine is at y≈1.2-1.5 in rib region, ribs arch up to y≈3-4
    const ribCount = 7;
    for (let i = 0; i < ribCount; i++) {
      const rt = i / (ribCount - 1);
      const spineT = 0.05 + rt * 0.45;
      const attachPt = spineCurve.getPoint(spineT);
      const ribScale = 1 - i * 0.06;
      const isBrokenRib = i === 4;

      for (const side of [-1, 1]) {
        const arcAngle = Math.PI * (0.7 - i * 0.02);
        const sideScale = side === -1 ? ribScale : ribScale * 0.88;
        const ribGeo = new THREE.TorusGeometry(
          2.0 * sideScale,
          0.10 - rt * 0.02,
          6, 12,
          isBrokenRib && side === 1 ? arcAngle * 0.45 : arcAngle,
        );
        displaceBone(ribGeo, 0.02, 300 + i * 2 + (side > 0 ? 1 : 0));
        applyBoneWeathering(ribGeo, {
          seed: 300 + i * 2 + (side > 0 ? 1 : 0),
          mossAmount: side === -1 ? 0.18 : 0.06,
        });
        const rib = new THREE.Mesh(ribGeo, boneMat);
        rib.position.copy(attachPt);
        // Ribs arch upward and outward from ground-level spine
        rib.rotation.y = side * Math.PI / 2;
        rib.rotation.x = -0.6 - i * 0.03;
        rib.rotation.z = side * (0.2 + i * 0.02);
        rib.castShadow = true;
        this.group.add(rib);
      }
    }

    // Sternum/keel bone — lying flat beneath ribcage near ground
    const keelGeo = new THREE.BoxGeometry(0.6, 0.4, 5, 3, 3, 6);
    const keelPos = keelGeo.attributes.position;
    for (let v = 0; v < keelPos.count; v++) {
      const y = keelPos.getY(v);
      if (y < 0) keelPos.setX(v, keelPos.getX(v) * (1 + y * 0.3));
    }
    keelPos.needsUpdate = true;
    keelGeo.computeVertexNormals();
    displaceBone(keelGeo, 0.04, 320);
    applyBoneWeathering(keelGeo, { seed: 320 });
    const keel = new THREE.Mesh(keelGeo, boneMat);
    const ribMidPt = spineCurve.getPoint(0.2);
    keel.position.set(ribMidPt.x, 0.2, ribMidPt.z);
    keel.castShadow = true;
    this.group.add(keel);

    // ── d) Wings — COLLAPSED, drooping down like a dead dragon ──────────
    // Shoulder at spine level, humerus angles slightly up then everything droops.
    // Elbow is the highest point (~3.5), forearm slopes down, wrist near ground,
    // finger bones splay out flat on the ground — the dragon has collapsed here.
    for (const side of [-1, 1]) {
      const wingBase = new THREE.Vector3(cp.x + side * 3.0, 1.6, cp.z - 5);

      // Shoulder joint — attached to body near spine height
      const shoulderGeo = new THREE.SphereGeometry(0.55, 8, 8);
      displaceBone(shoulderGeo, 0.06, 400 + side);
      applyBoneWeathering(shoulderGeo, { seed: 400 + side });
      const shoulder = new THREE.Mesh(shoulderGeo, boneMat);
      shoulder.position.copy(wingBase);
      shoulder.castShadow = true;
      this.group.add(shoulder);

      // Humerus — angles outward and only slightly upward, collapsed posture
      const humLen = 6.0;
      const humGeo = new THREE.CylinderGeometry(0.18, 0.32, humLen, 8);
      const humPos = humGeo.attributes.position;
      for (let v = 0; v < humPos.count; v++) {
        const y = humPos.getY(v);
        const endFactor = Math.max(0, (Math.abs(y) - 2.2) / 0.8);
        if (endFactor > 0) {
          humPos.setX(v, humPos.getX(v) * (1 + endFactor * 0.35));
          humPos.setZ(v, humPos.getZ(v) * (1 + endFactor * 0.35));
        }
      }
      humPos.needsUpdate = true;
      humGeo.computeVertexNormals();
      displaceBone(humGeo, 0.03, 405 + side);
      applyBoneWeathering(humGeo, { seed: 405 + side });
      const humerus = new THREE.Mesh(humGeo, boneMat);
      humerus.position.set(wingBase.x + side * 2.5, 2.2, wingBase.z + 0.3);
      humerus.rotation.z = side * 1.1; // Nearly horizontal, sweeping outward
      humerus.rotation.x = 0.1;
      humerus.castShadow = true;
      this.group.add(humerus);

      // Elbow joint — highest point of the collapsed wing, only ~3.5 high
      const elbowPt = new THREE.Vector3(wingBase.x + side * 5.5, 3.5, wingBase.z + 0.5);
      const elbowGeo = new THREE.SphereGeometry(0.38, 7, 7);
      displaceBone(elbowGeo, 0.05, 410 + side);
      applyBoneWeathering(elbowGeo, { seed: 410 + side });
      const elbow = new THREE.Mesh(elbowGeo, boneMat);
      elbow.position.copy(elbowPt);
      elbow.castShadow = true;
      this.group.add(elbow);

      // Forearm — droops DOWN from elbow toward the ground
      const foreLen = 7.0;
      const forearmGeo = new THREE.CylinderGeometry(0.12, 0.22, foreLen, 7);
      displaceBone(forearmGeo, 0.025, 415 + side);
      applyBoneWeathering(forearmGeo, { seed: 415 + side });
      const forearm = new THREE.Mesh(forearmGeo, boneMat);
      forearm.position.set(elbowPt.x + side * 3.5, 1.8, elbowPt.z - 0.5);
      forearm.rotation.z = side * 1.3; // Steep downward slope
      forearm.rotation.x = -0.1;
      forearm.castShadow = true;
      this.group.add(forearm);

      // Wrist joint — near ground, far out to the side
      const wristPt = new THREE.Vector3(wingBase.x + side * 10.0, 0.4, wingBase.z - 0.5);
      const wristGeo = new THREE.SphereGeometry(0.3, 6, 6);
      displaceBone(wristGeo, 0.04, 420 + side);
      applyBoneWeathering(wristGeo, { seed: 420 + side });
      const wrist = new THREE.Mesh(wristGeo, boneMat);
      wrist.position.copy(wristPt);
      wrist.castShadow = true;
      this.group.add(wrist);

      // Wing finger bones — 4 long fingers splayed FLAT on ground, fanning out
      const fingerData = [
        { len: 8.0, r: 0.10, dx: 3.0, dz: 2.5,  rz: 1.35, rx: 0.05 },
        { len: 9.5, r: 0.09, dx: 3.5, dz: 0.5,  rz: 1.4,  rx: 0.0 },
        { len: 8.5, r: 0.07, dx: 3.0, dz: -1.5, rz: 1.45, rx: -0.05 },
        { len: 6.0, r: 0.05, dx: 2.0, dz: -3.5, rz: 1.5,  rx: -0.1 },
      ];
      const fingerTips: THREE.Vector3[] = [];
      for (let f = 0; f < fingerData.length; f++) {
        const fd = fingerData[f];
        const fingerGeo = new THREE.CylinderGeometry(fd.r * 0.4, fd.r, fd.len, 6);
        // Slight natural curvature
        const fPos = fingerGeo.attributes.position;
        for (let v = 0; v < fPos.count; v++) {
          const y = fPos.getY(v);
          fPos.setZ(v, fPos.getZ(v) + y * y * 0.006);
        }
        fPos.needsUpdate = true;
        fingerGeo.computeVertexNormals();
        displaceBone(fingerGeo, 0.015, 430 + side * 10 + f);
        applyBoneWeathering(fingerGeo, { seed: 430 + side * 10 + f });
        const finger = new THREE.Mesh(fingerGeo, boneMat);
        const fx = wristPt.x + side * fd.dx;
        const fy = 0.12; // Flat on ground
        const fz = wristPt.z + fd.dz;
        finger.position.set(fx, fy, fz);
        finger.rotation.z = side * fd.rz; // Nearly horizontal
        finger.rotation.x = fd.rx;
        finger.castShadow = true;
        this.group.add(finger);

        // Calculate fingertip for membrane
        const tipX = fx + side * fd.len * 0.45;
        const tipZ = fz + fd.len * 0.15 * Math.sin(fd.rx);
        fingerTips.push(new THREE.Vector3(tipX, 0.08, tipZ));
      }

      // Wing membrane remnants — torn, draped on ground between finger bones
      const membraneMat = new THREE.MeshBasicMaterial({
        color: 0x2a1c0e, transparent: true, opacity: 0.14,
        side: THREE.DoubleSide, depthWrite: false,
      });
      for (let f = 0; f < fingerTips.length - 1; f++) {
        const memShape = new THREE.Shape();
        memShape.moveTo(0, 0);
        const tip1 = fingerTips[f].clone().sub(wristPt);
        const tip2 = fingerTips[f + 1].clone().sub(wristPt);
        memShape.lineTo(tip1.x, tip1.z);
        memShape.lineTo(tip2.x, tip2.z);
        memShape.lineTo(0, 0);

        // Torn holes in the membrane
        const holeSize = 0.5 + f * 0.3;
        const hx = (tip1.x + tip2.x) * 0.33;
        const hz = (tip1.z + tip2.z) * 0.33;
        const hole = new THREE.Path();
        hole.moveTo(hx - holeSize, hz - holeSize * 0.5);
        hole.bezierCurveTo(hx - holeSize * 0.2, hz + holeSize * 0.7, hx + holeSize * 0.4, hz + holeSize * 0.5, hx + holeSize, hz - holeSize * 0.2);
        hole.bezierCurveTo(hx + holeSize * 0.3, hz - holeSize * 0.8, hx - holeSize * 0.4, hz - holeSize * 0.7, hx - holeSize, hz - holeSize * 0.5);
        memShape.holes.push(hole);

        const memGeo = new THREE.ShapeGeometry(memShape, 3);
        const membrane = new THREE.Mesh(memGeo, membraneMat);
        // Lay membrane flat on ground (rotate to XZ plane)
        membrane.rotation.x = -Math.PI / 2;
        membrane.position.set(wristPt.x, 0.06, wristPt.z);
        this.group.add(membrane);
      }

      // Sinew strips — hanging limply from elbow/forearm area, touching ground
      const stripMat = new THREE.MeshBasicMaterial({
        color: 0x3a2a18, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false,
      });
      for (let s = 0; s < 5; s++) {
        const stripLen = 2.0 + Math.sin(s * 2.1 + side) * 0.8;
        const stripW = 0.12 + s * 0.02;
        const stripGeo = new THREE.PlaneGeometry(stripW, stripLen, 1, 6);
        const stP = stripGeo.attributes.position;
        for (let v = 0; v < stP.count; v++) {
          const y = stP.getY(v);
          stP.setX(v, stP.getX(v) + Math.sin(y * 3.0 + s) * 0.08);
        }
        stP.needsUpdate = true;
        const strip = new THREE.Mesh(stripGeo, stripMat);
        // Strips drape from elbow-to-forearm area down toward ground
        const t = s / 4;
        const hangX = elbowPt.x + side * (t * 3.5);
        const hangY = elbowPt.y * (1 - t) * 0.5 + 0.3;
        const hangZ = elbowPt.z - 0.5 + s * 0.4;
        strip.position.set(hangX, hangY, hangZ);
        strip.rotation.z = Math.sin(s * 1.4) * 0.2;
        strip.name = `dragon-strip-${side > 0 ? 'R' : 'L'}-${s}`;
        this.group.add(strip);
      }
    }

    // ── e) Legs — front extended forward flat, rear simplified ──────────
    // Front legs lying flat on ground, extended forward toward player
    for (const side of [-1, 1]) {
      const legBase = new THREE.Vector3(cp.x + side * 2.5, 0, cp.z - 1);

      // Scapula/shoulder — flat on ground connecting to body
      const scapGeo = new THREE.BoxGeometry(1.2, 0.3, 2.0, 4, 2, 4);
      displaceBone(scapGeo, 0.03, 500 + side);
      applyBoneWeathering(scapGeo, { seed: 500 + side });
      const scap = new THREE.Mesh(scapGeo, boneMat);
      scap.position.set(legBase.x + side * 0.5, 0.2, legBase.z - 1);
      scap.rotation.y = side * 0.2;
      scap.castShadow = true;
      this.group.add(scap);

      // Upper leg bone — lying flat, extending forward
      const femurGeo = new THREE.CylinderGeometry(0.18, 0.28, 3.0, 7);
      const fmPos = femurGeo.attributes.position;
      for (let v = 0; v < fmPos.count; v++) {
        const y = fmPos.getY(v);
        const endF = Math.max(0, (Math.abs(y) - 1.2) / 0.3);
        if (endF > 0) {
          fmPos.setX(v, fmPos.getX(v) * (1 + endF * 0.25));
          fmPos.setZ(v, fmPos.getZ(v) * (1 + endF * 0.25));
        }
      }
      fmPos.needsUpdate = true;
      femurGeo.computeVertexNormals();
      displaceBone(femurGeo, 0.03, 505 + side);
      applyBoneWeathering(femurGeo, { seed: 505 + side });
      const femur = new THREE.Mesh(femurGeo, boneMat);
      femur.position.set(legBase.x + side * 1.0, 0.2, legBase.z + 1.5);
      femur.rotation.z = Math.PI / 2;
      femur.rotation.y = side * 0.25;
      femur.castShadow = true;
      this.group.add(femur);

      // Lower leg bone — continuing forward on ground
      const tibGeo = new THREE.CylinderGeometry(0.12, 0.18, 2.5, 6);
      displaceBone(tibGeo, 0.025, 510 + side);
      applyBoneWeathering(tibGeo, { seed: 510 + side });
      const tibia = new THREE.Mesh(tibGeo, boneMat);
      tibia.position.set(legBase.x + side * 1.5, 0.15, legBase.z + 3.5);
      tibia.rotation.z = Math.PI / 2;
      tibia.rotation.y = side * 0.3;
      tibia.castShadow = true;
      this.group.add(tibia);

      // Claws — spread out on ground, extended forward
      for (let c = 0; c < 3; c++) {
        const clawGeo = new THREE.ConeGeometry(0.07, 0.55, 4);
        displaceBone(clawGeo, 0.01, 520 + side * 10 + c);
        applyBoneWeathering(clawGeo, { seed: 520 + side * 10 + c, baseColor: [0.75, 0.70, 0.55] });
        const claw = new THREE.Mesh(clawGeo, boneMat);
        claw.position.set(
          legBase.x + side * (1.8 + c * 0.25),
          0.08,
          legBase.z + 5.0 + (c - 1) * 0.3,
        );
        claw.rotation.x = -Math.PI / 2 + 0.2;
        claw.rotation.y = side * (0.1 + (c - 1) * 0.15);
        claw.castShadow = true;
        this.group.add(claw);
      }
    }

    // Rear legs (partially buried, splayed to sides)
    for (const side of [-1, 1]) {
      const rearBase = new THREE.Vector3(cp.x + side * 3.5, 0, cp.z - 13);
      const rFemurGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.5, 6);
      displaceBone(rFemurGeo, 0.03, 550 + side);
      applyBoneWeathering(rFemurGeo, { seed: 550 + side });
      const rFemur = new THREE.Mesh(rFemurGeo, boneMat);
      rFemur.position.set(rearBase.x, 0.2, rearBase.z);
      rFemur.rotation.z = Math.PI / 2;
      rFemur.rotation.y = side * 0.4;
      rFemur.castShadow = true;
      this.group.add(rFemur);

      const rTibGeo = new THREE.CylinderGeometry(0.10, 0.16, 2.0, 6);
      displaceBone(rTibGeo, 0.025, 555 + side);
      applyBoneWeathering(rTibGeo, { seed: 555 + side });
      const rTibia = new THREE.Mesh(rTibGeo, boneMat);
      rTibia.position.set(rearBase.x + side * 1.5, 0.15, rearBase.z + 0.5);
      rTibia.rotation.z = Math.PI / 2;
      rTibia.rotation.y = side * 0.3;
      rTibia.castShadow = true;
      this.group.add(rTibia);
    }

    // ── f) Tail — close to ground, curving to one side ──────────────────
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cp.x, 0.5, cp.z - 20),
      new THREE.Vector3(cp.x + 2.0, 0.4, cp.z - 23),
      new THREE.Vector3(cp.x + 3.5, 0.3, cp.z - 25),
      new THREE.Vector3(cp.x + 3.0, 0.2, cp.z - 27),
      new THREE.Vector3(cp.x + 1.5, 0.15, cp.z - 29),
    ]);
    const tailCount = 12;
    for (let i = 0; i < tailCount; i++) {
      const t = i / (tailCount - 1);
      const size = Math.max(0.06, 0.35 - t * 0.22);
      const tailGeo = new THREE.DodecahedronGeometry(size, 0);
      const tPos = tailGeo.attributes.position;
      for (let v = 0; v < tPos.count; v++) {
        const y = tPos.getY(v);
        if (y < -size * 0.3) tPos.setY(v, y * 1.3);
        else if (y > size * 0.4) tPos.setY(v, y * 0.7);
      }
      tPos.needsUpdate = true;
      tailGeo.computeVertexNormals();
      displaceBone(tailGeo, 0.02, 600 + i);
      applyBoneWeathering(tailGeo, { seed: 600 + i, mossAmount: 0.15 });
      const tailVert = new THREE.Mesh(tailGeo, boneMat);
      const tailPos = tailCurve.getPoint(t);
      tailVert.position.copy(tailPos);
      const tangent = tailCurve.getTangent(t);
      tailVert.lookAt(tailPos.clone().add(tangent));
      tailVert.castShadow = true;
      this.group.add(tailVert);
    }

    // Tail tip — spade/club shape lying flat
    const tipPt = tailCurve.getPoint(1);
    const spadeGeo = new THREE.DodecahedronGeometry(0.3, 1);
    const spadePos = spadeGeo.attributes.position;
    for (let v = 0; v < spadePos.count; v++) {
      spadePos.setZ(v, spadePos.getZ(v) * 0.3);
      spadePos.setX(v, spadePos.getX(v) * (1 + Math.abs(spadePos.getY(v)) * 0.5));
    }
    spadePos.needsUpdate = true;
    spadeGeo.computeVertexNormals();
    displaceBone(spadeGeo, 0.03, 650);
    applyBoneWeathering(spadeGeo, { seed: 650, baseColor: [0.78, 0.73, 0.58] });
    const spade = new THREE.Mesh(spadeGeo, boneMat);
    spade.position.copy(tipPt);
    const tipTangent = tailCurve.getTangent(1);
    spade.lookAt(tipPt.clone().add(tipTangent));
    spade.castShadow = true;
    this.group.add(spade);

    // ── g) Atmosphere — shadow, mist, dust, fog ─────────────────────────
    // Ground shadow ellipse under entire skeleton
    const shadowGeo = new THREE.PlaneGeometry(16, 35);
    const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false,
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(cp.x + 1, 0.02, cp.z - 12);
    this.group.add(shadow);

    // Bone fragments scattered around the skeleton
    const fragRand = boneRand(700);
    for (let i = 0; i < 10; i++) {
      const angle = fragRand() * Math.PI * 2;
      const dist = 2 + fragRand() * 7;
      const fragGeo = new THREE.IcosahedronGeometry(0.08 + fragRand() * 0.15, 0);
      displaceBone(fragGeo, 0.04, 700 + i);
      applyBoneWeathering(fragGeo, { seed: 700 + i });
      const frag = new THREE.Mesh(fragGeo, boneMat);
      frag.position.set(
        cp.x + Math.cos(angle) * dist,
        0.04,
        cp.z + Math.sin(angle) * dist * 0.6 - 8,
      );
      frag.rotation.set(fragRand() * Math.PI, fragRand() * Math.PI, 0);
      this.group.add(frag);
    }

    // Mist planes — eerie green mist billowing out from the gaping mouth
    for (let i = 0; i < 5; i++) {
      const mistGeo = new THREE.PlaneGeometry(3.5 + Math.sin(i * 1.5) * 1.5, 1.5 + Math.cos(i * 0.8) * 0.6);
      const mist = new THREE.Mesh(mistGeo, new THREE.MeshBasicMaterial({
        color: 0x44aa66, transparent: true, opacity: 0.10 + i * 0.015,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      mist.name = `dragon-mist-${i}`;
      mist.position.set(
        cp.x + Math.sin(i * 1.3) * 2.0,
        0.6 + i * 0.35,
        cp.z + 3.0 + Math.cos(i * 0.7) * 2.0,
      );
      mist.rotation.y = i * 0.6;
      this.group.add(mist);
    }

    // Bone dust particles (animated upward drift)
    for (let i = 0; i < 12; i++) {
      const dustGeo = new THREE.PlaneGeometry(0.06, 0.06);
      const dust = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({
        color: 0xd4c8a0, transparent: true, opacity: 0.3,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      dust.name = `dragon-dust-${i}`;
      const dx = cp.x + (Math.sin(i * 2.1) - 0.5) * 10;
      const dy = 0.3 + Math.cos(i * 1.3) * 1.5;
      const dz = cp.z - 5 + Math.sin(i * 0.9) * 10;
      dust.position.set(dx, dy, dz);
      dust.userData.baseY = dy;
      dust.rotation.set(Math.sin(i) * Math.PI, Math.cos(i) * Math.PI, 0);
      this.group.add(dust);
    }

    // Inner cave fog planes — inside the skull maw
    for (let i = 0; i < 3; i++) {
      const fogGeo = new THREE.PlaneGeometry(4, 2.5);
      const fog = new THREE.Mesh(fogGeo, new THREE.MeshBasicMaterial({
        color: 0x112211, transparent: true, opacity: 0.15 - i * 0.03,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      fog.name = `dragon-cave-fog-${i}`;
      fog.position.set(cp.x, 1.0, cp.z - 2 - i * 1.5);
      fog.rotation.y = i * 0.2;
      this.group.add(fog);
    }

    // ── h) Inner glow — eerie light from within the skull maw ───────────
    const innerGlow = new THREE.PointLight(0x22ff44, 3, 14);
    innerGlow.position.set(cp.x, 1.5, cp.z + 0.5);
    innerGlow.name = 'dragon-inner-glow';
    this.group.add(innerGlow);

    const dungeonGlow = new THREE.PointLight(0x33cc55, 2.0, 10);
    dungeonGlow.position.set(cp.x, 1.0, cp.z + 2.0);
    dungeonGlow.name = 'dragon-dungeon-glow';
    this.group.add(dungeonGlow);

    // ── i) Sign — 'THE DEPTHS' above the skull ─────────────────────────
    const sign = this.createTextSign('THE DEPTHS', 0x88ffaa);
    sign.position.set(cp.x, 7.0, cp.z + 1.0);
    this.group.add(sign);
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
        name: 'Gernal',
        position: new THREE.Vector3(-12, 0, -5),
        color: 0xaa4422,
        isShopkeeper: true,
        dialog: [
          'Welcome to me shop, traveller! Finest goods in all the land!',
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
      if ((npc as any).isShopkeeper) {
        this.createGernalMesh(npc.position);
      } else {
        this.createNPCMesh(npc.name, npc.position, npc.color);
      }
      this.npcPositions.push({
        name: npc.name,
        position: npc.position,
        dialog: npc.dialog,
      });
      this.colliders.push({ x: npc.position.x, z: npc.position.z, r: 0.5 });
    }
  }

  private createGernalMesh(pos: THREE.Vector3) {
    const g = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.75 });
    const skinDark = new THREE.MeshStandardMaterial({ color: 0xc49464, roughness: 0.8 });
    const beardMat = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.92 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.9 });
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x5a3322, roughness: 0.85 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x886644, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x44332a, roughness: 0.85 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf0f0e8, roughness: 0.3 });
    const eyeIrisMat = new THREE.MeshStandardMaterial({ color: 0x4a6a44, roughness: 0.3 });
    const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    // ============================
    // LEGS & BOOTS
    // ============================
    for (const side of [-1, 1]) {
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.2, 0.7, 8), pantsMat,
      );
      thigh.position.set(side * 0.2, 0.75, 0);
      thigh.castShadow = true;
      g.add(thigh);

      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.15, 0.6, 8), pantsMat,
      );
      shin.position.set(side * 0.2, 0.3, 0);
      shin.castShadow = true;
      g.add(shin);

      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.18, 0.35), bootMat,
      );
      boot.position.set(side * 0.2, 0.09, 0.05);
      boot.castShadow = true;
      g.add(boot);

      // Boot buckle
      const buckle = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.06, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x999933, metalness: 0.7, roughness: 0.3 }),
      );
      buckle.position.set(side * 0.2, 0.12, 0.23);
      g.add(buckle);
    }

    // ============================
    // BODY — BIG BELLY
    // ============================
    const lowerTorso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.35, 0.5, 10), shirtMat,
    );
    lowerTorso.position.y = 1.25;
    lowerTorso.castShadow = true;
    g.add(lowerTorso);

    // The glorious big belly
    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.58, 14, 12), shirtMat,
    );
    belly.position.set(0, 1.5, 0.18);
    belly.scale.set(1, 0.85, 1.15);
    belly.castShadow = true;
    g.add(belly);

    // Upper chest
    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.5, 0.45, 10), shirtMat,
    );
    chest.position.y = 1.88;
    chest.castShadow = true;
    g.add(chest);

    // Shirt collar
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.04, 6, 12), shirtMat,
    );
    collar.position.y = 2.08;
    collar.rotation.x = Math.PI / 2;
    g.add(collar);

    // Leather apron over belly
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.95, 0.04), apronMat,
    );
    apron.position.set(0, 1.35, 0.5);
    g.add(apron);

    // Apron pocket
    const pocket = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.2, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x4a2818, roughness: 0.88 }),
    );
    pocket.position.set(0.12, 1.2, 0.52);
    g.add(pocket);

    // Apron strings around waist
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.55, 4), apronMat,
      );
      strap.position.set(side * 0.36, 1.7, 0.3);
      strap.rotation.z = side * 0.3;
      strap.rotation.x = -0.25;
      g.add(strap);
    }

    // Belt
    const belt = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.035, 6, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x3a2211, roughness: 0.8 }),
    );
    belt.position.set(0, 1.15, 0.1);
    belt.rotation.x = Math.PI / 2;
    g.add(belt);

    // Belt buckle
    const beltBuckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xbbaa44, metalness: 0.7, roughness: 0.3 }),
    );
    beltBuckle.position.set(0, 1.15, 0.47);
    g.add(beltBuckle);

    // ============================
    // ARMS — muscular, rolled sleeves
    // ============================
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 8, 6), shirtMat,
      );
      shoulder.position.set(side * 0.52, 1.95, 0);
      g.add(shoulder);

      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.15, 0.5, 6), shirtMat,
      );
      upperArm.position.set(side * 0.58, 1.65, 0.1);
      upperArm.rotation.z = side * 0.25;
      upperArm.rotation.x = -0.2;
      g.add(upperArm);

      // Rolled-up sleeve edge
      const sleeveRoll = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.025, 6, 8), shirtMat,
      );
      sleeveRoll.position.set(side * 0.6, 1.45, 0.15);
      sleeveRoll.rotation.x = Math.PI / 2;
      g.add(sleeveRoll);

      // Forearm (bare skin, hairy)
      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.13, 0.45, 6), skinMat,
      );
      forearm.position.set(side * 0.62, 1.3, 0.28);
      forearm.rotation.x = -0.5;
      g.add(forearm);

      // Hand
      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 6), skinMat,
      );
      hand.position.set(side * 0.62, 1.1, 0.42);
      hand.scale.set(1, 0.7, 1.2);
      g.add(hand);

      // Thick sausage fingers
      for (let f = 0; f < 4; f++) {
        const finger = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.028, 0.1, 5), skinMat,
        );
        finger.position.set(
          side * 0.62 + (f - 1.5) * 0.03,
          1.03, 0.44 + f * 0.015,
        );
        finger.rotation.x = -0.3;
        g.add(finger);
      }
      // Thumb
      const thumb = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.026, 0.08, 4), skinMat,
      );
      thumb.position.set(side * (0.62 + side * 0.06), 1.08, 0.38);
      thumb.rotation.z = side * 0.6;
      g.add(thumb);
    }

    // ============================
    // NECK — thick, stocky
    // ============================
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.18, 8), skinMat,
    );
    neck.position.y = 2.15;
    g.add(neck);

    // ============================
    // HEAD — round, weathered face
    // ============================
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.33, 14, 12), skinMat,
    );
    head.position.y = 2.46;
    head.scale.set(1, 1.05, 0.95);
    head.castShadow = true;
    g.add(head);

    // Forehead wrinkles
    for (let w = 0; w < 3; w++) {
      const wrinkle = new THREE.Mesh(
        new THREE.BoxGeometry(0.22 - w * 0.04, 0.008, 0.01),
        new THREE.MeshStandardMaterial({ color: 0xb89060, roughness: 0.9 }),
      );
      wrinkle.position.set(0, 2.58 + w * 0.035, 0.28);
      g.add(wrinkle);
    }

    // Rosy cheeks
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xd49080, roughness: 0.8 }),
      );
      cheek.position.set(side * 0.2, 2.38, 0.22);
      cheek.scale.set(1, 0.65, 0.7);
      g.add(cheek);
    }

    // Big bulbous nose
    const noseBridge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.05, 0.12, 6), skinDark,
    );
    noseBridge.position.set(0, 2.48, 0.3);
    noseBridge.rotation.x = -0.2;
    g.add(noseBridge);

    const noseBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 8, 6), skinDark,
    );
    noseBulb.position.set(0, 2.42, 0.32);
    g.add(noseBulb);

    // Nostrils
    for (const side of [-1, 1]) {
      const nostril = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 4, 4),
        new THREE.MeshStandardMaterial({ color: 0x8a6a5a }),
      );
      nostril.position.set(side * 0.035, 2.39, 0.36);
      g.add(nostril);
    }

    // ============================
    // EYES — small, friendly
    // ============================
    for (const side of [-1, 1]) {
      const socket = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 6, 6), skinDark,
      );
      socket.position.set(side * 0.12, 2.49, 0.26);
      g.add(socket);

      const eyeball = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8), eyeWhiteMat,
      );
      eyeball.position.set(side * 0.12, 2.49, 0.28);
      g.add(eyeball);

      const iris = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 8, 8), eyeIrisMat,
      );
      iris.position.set(side * 0.12, 2.49, 0.318);
      g.add(iris);

      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 4, 4), eyePupilMat,
      );
      pupil.position.set(side * 0.12, 2.49, 0.335);
      g.add(pupil);

      // Crow's feet (wrinkles by eyes)
      for (let c = 0; c < 3; c++) {
        const crow = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.006, 0.005),
          new THREE.MeshStandardMaterial({ color: 0xb89060 }),
        );
        crow.position.set(side * 0.22, 2.49 + (c - 1) * 0.025, 0.24);
        crow.rotation.z = side * (0.15 + c * 0.12);
        g.add(crow);
      }

      // Big bushy eyebrow
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.045, 0.06), hairMat,
      );
      brow.position.set(side * 0.12, 2.56, 0.27);
      brow.rotation.z = side * -0.12;
      g.add(brow);

      // Bushy tufts sticking out
      for (let t = 0; t < 2; t++) {
        const tuft = new THREE.Mesh(
          new THREE.ConeGeometry(0.02, 0.06, 4), hairMat,
        );
        tuft.position.set(side * (0.16 + t * 0.05), 2.575, 0.27);
        tuft.rotation.z = side * (-0.4 - t * 0.3);
        g.add(tuft);
      }
    }

    // Mouth
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.012, 0.015),
      new THREE.MeshStandardMaterial({ color: 0x994444 }),
    );
    mouth.position.set(0, 2.34, 0.31);
    g.add(mouth);

    // Ears — large, sticking out
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 6, 6), skinMat,
      );
      ear.position.set(side * 0.33, 2.45, 0.02);
      ear.scale.set(0.45, 1.1, 0.8);
      g.add(ear);

      // Ear lobe
      const lobe = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 4, 4), skinDark,
      );
      lobe.position.set(side * 0.34, 2.38, 0.04);
      g.add(lobe);
    }

    // ============================
    // LONG MAGNIFICENT BEARD
    // ============================
    // Jaw beard base
    const beardJaw = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8), beardMat,
    );
    beardJaw.position.set(0, 2.28, 0.18);
    beardJaw.scale.set(1.2, 0.55, 1);
    g.add(beardJaw);

    // Cheek beard sides
    for (const side of [-1, 1]) {
      const cheekBeard = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 6), beardMat,
      );
      cheekBeard.position.set(side * 0.22, 2.32, 0.15);
      cheekBeard.scale.set(0.8, 0.9, 0.7);
      g.add(cheekBeard);
    }

    // Mid beard — flowing down chest
    const beardMid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.24, 0.55, 8), beardMat,
    );
    beardMid.position.set(0, 2.0, 0.25);
    beardMid.castShadow = true;
    g.add(beardMid);

    // Lower beard — long section
    const beardLower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.2, 0.55, 8), beardMat,
    );
    beardLower.position.set(0, 1.55, 0.3);
    beardLower.castShadow = true;
    g.add(beardLower);

    // Beard tip — reaching belly!
    const beardTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.45, 6), beardMat,
    );
    beardTip.position.set(0, 1.1, 0.35);
    beardTip.name = 'gernal-beard-tip';
    g.add(beardTip);

    // Beard wave details (layered strips for texture)
    for (let w = 0; w < 4; w++) {
      const wave = new THREE.Mesh(
        new THREE.TorusGeometry(0.14 + w * 0.02, 0.02, 4, 12, Math.PI),
        beardMat,
      );
      wave.position.set(0, 1.9 - w * 0.2, 0.32 + w * 0.015);
      wave.rotation.y = Math.PI;
      g.add(wave);
    }

    // Side wisps
    for (const side of [-1, 1]) {
      const wisp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.07, 0.45, 5), beardMat,
      );
      wisp.position.set(side * 0.2, 2.05, 0.18);
      wisp.rotation.z = side * 0.2;
      g.add(wisp);
    }

    // Magnificent handlebar mustache
    for (const side of [-1, 1]) {
      const stache = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.045, 0.22, 5), beardMat,
      );
      stache.position.set(side * 0.1, 2.36, 0.33);
      stache.rotation.z = side * 1.1;
      g.add(stache);

      // Curl at end
      const curl = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 6, 6), beardMat,
      );
      curl.position.set(side * 0.22, 2.34, 0.3);
      g.add(curl);
    }

    // ============================
    // HAIR — balding on top, thick on sides
    // ============================
    for (const side of [-1, 1]) {
      const sideHair = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 6), hairMat,
      );
      sideHair.position.set(side * 0.29, 2.5, -0.06);
      sideHair.scale.set(0.55, 1, 0.8);
      g.add(sideHair);
    }

    const backHair = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6), hairMat,
    );
    backHair.position.set(0, 2.42, -0.22);
    backHair.scale.set(1.2, 1, 0.6);
    g.add(backHair);

    // Shiny bald top
    const baldTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xdaad7a, roughness: 0.5, metalness: 0.05 }),
    );
    baldTop.position.set(0, 2.62, 0.03);
    baldTop.scale.set(1, 0.4, 1);
    g.add(baldTop);

    // ============================
    // NAME LABEL
    // ============================
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('!', 128, 35);
    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText('Gernal', 128, 75);
    ctx.fillText('Gernal', 128, 75);

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 3.3;
    sprite.scale.set(2.5, 0.9, 1);
    g.add(sprite);

    g.position.copy(pos);
    g.name = 'npc-Gernal';
    this.group.add(g);
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
      this.colliders.push({ x, z, r: 0.3 });
    }

  }

  private createFlowerBush(x: number, z: number, color: number) {
    const bushGeo = new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 6, 5);
    const bushMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const bush = new THREE.Mesh(bushGeo, bushMat);
    bush.position.set(x, 0.2, z);
    bush.scale.y = 0.6;
    this.group.add(bush);
  }

  private brazierIndex = 0;

  private createLantern(x: number, z: number) {
    const idx = this.brazierIndex++;

    // Stone pillar base — tapered, rough stone look
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x555550, roughness: 0.95, metalness: 0.05 });

    // Square plinth
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.2, 0.6),
      baseMat,
    );
    plinth.position.set(x, 0.1, z);
    this.group.add(plinth);

    // Tapered pillar
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6),
      baseMat,
    );
    pillar.position.set(x, 0.8, z);
    this.group.add(pillar);

    // Bowl (open-top brazier)
    const bowlOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.18, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0x443322, roughness: 0.8, metalness: 0.3 }),
    );
    bowlOuter.position.set(x, 1.55, z);
    this.group.add(bowlOuter);

    // Inner dark cavity
    const bowlInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.14, 0.18, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
    );
    bowlInner.position.set(x, 1.58, z);
    this.group.add(bowlInner);

    // Ember bed (glowing coals at bottom)
    const embers = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.12, 0.08, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff4400,
        emissive: 0xff2200,
        emissiveIntensity: 1.5,
      }),
    );
    embers.position.set(x, 1.58, z);
    embers.name = `brazier-embers-${idx}`;
    this.group.add(embers);

    // Flame particles (3 teardrop shapes at different phases)
    for (let f = 0; f < 3; f++) {
      const flameGeo = new THREE.ConeGeometry(0.08 + f * 0.03, 0.35 + f * 0.1, 5);
      const flameMat = new THREE.MeshBasicMaterial({
        color: f === 0 ? 0xffdd44 : f === 1 ? 0xff8811 : 0xff4400,
        transparent: true,
        opacity: 0.8 - f * 0.15,
      });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(x, 1.85 + f * 0.08, z);
      flame.name = `brazier-flame-${idx}-${f}`;
      flame.userData.baseX = x;
      flame.userData.baseZ = z;
      flame.userData.baseY = 1.85 + f * 0.08;
      this.group.add(flame);
    }

    // Warm point light
    const light = new THREE.PointLight(0xff8833, 0.6, 8);
    light.position.set(x, 2.2, z);
    light.name = `brazier-light-${idx}`;
    this.group.add(light);
  }

  private buildRocks() {
    // Seeded random for deterministic placement
    let seed = 42;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; };

    // Areas to avoid: fountain (0,0 r4), paths (width ~3), shop (-12,-5), pvp (15,-8), portal (0,-25), spawn altar (0,12)
    const isOnPath = (x: number, z: number): boolean => {
      // North path to portal
      if (Math.abs(x) < 2.5 && z < 0 && z > -30) return true;
      // West to shop (curved path — sample 10 points along curve)
      const shopPts = [
        [0, 0], [-2, -0.1], [-4, -0.3], [-6, -0.5],
        [-8, -0.9], [-10, -1.4], [-11.2, -2],
        [-12, -2.8], [-12, -3.8], [-12, -5],
      ];
      for (const sp of shopPts) {
        if (Math.sqrt((x - sp[0]) ** 2 + (z - sp[1]) ** 2) < 2.5) return true;
      }
      // East to pvp
      const t2 = Math.max(0, Math.min(1, (x * 18 + z * -8) / (324 + 64)));
      const px2 = 18 * t2, pz2 = -8 * t2;
      if (Math.sqrt((x - px2) ** 2 + (z - pz2) ** 2) < 2.5) return true;
      // South spawn path
      if (Math.abs(x) < 2.5 && z > 0 && z < 16) return true;
      return false;
    };

    const isBlocked = (x: number, z: number): boolean => {
      const d = Math.sqrt(x * x + z * z);
      if (d < 6) return true; // fountain/plaza
      if (d > 50) return true; // too far out
      if (isOnPath(x, z)) return true;
      // Shop area
      if (x > -16 && x < -8 && z > -9 && z < -1) return true;
      // PvP arena
      if (x > 11 && x < 20 && z > -13 && z < -3) return true;
      // Portal area
      if (Math.abs(x) < 5 && z < -20 && z > -30) return true;
      // Spawn altar
      if (Math.abs(x) < 4 && z > 10 && z < 18) return true;
      // NPCs
      if (Math.sqrt((x - 8) ** 2 + (z - 5) ** 2) < 3) return true;
      if (Math.sqrt((x - 6) ** 2 + (z + 18) ** 2) < 3) return true;
      if (Math.sqrt((x + 4) ** 2 + (z + 4) ** 2) < 3) return true;
      return false;
    };

    // Create displaced rock geometry for realistic shape
    const makeRockGeo = (baseSize: number): THREE.BufferGeometry => {
      // Start with dodecahedron for organic shape
      const detail = baseSize > 0.5 ? 2 : 1;
      const geo = new THREE.DodecahedronGeometry(baseSize, detail);
      const pos = geo.attributes.position;

      for (let i = 0; i < pos.count; i++) {
        const ox = pos.getX(i), oy = pos.getY(i), oz = pos.getZ(i);
        const dist = Math.sqrt(ox * ox + oy * oy + oz * oz);
        // Noise displacement based on position
        const n1 = Math.sin(ox * 5.3 + oy * 3.7) * Math.cos(oz * 4.1 + ox * 2.3);
        const n2 = Math.sin(oy * 7.1 + oz * 5.9) * 0.5;
        const displacement = 1.0 + (n1 * 0.25 + n2 * 0.15);
        const scale = displacement * (0.85 + Math.abs(Math.sin(ox * 3 + oz * 2)) * 0.3);
        pos.setXYZ(i, ox * scale, oy * scale * 0.65, oz * scale); // flatten Y for natural look
      }

      geo.computeVertexNormals();

      // Vertex colors for subtle surface variation
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const n = Math.sin(pos.getX(i) * 8 + pos.getZ(i) * 6) * 0.5 + 0.5;
        // Mix grey tones with slight warmth
        const base = 0.32 + n * 0.12;
        const mossy = Math.max(0, y / baseSize) * 0.03; // slight green on top
        colors[i * 3] = base + 0.02;
        colors[i * 3 + 1] = base + mossy + 0.01;
        colors[i * 3 + 2] = base - 0.02;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      return geo;
    };

    const rockMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.02,
    });

    // Place individual rocks — scattered naturally
    const rockConfigs: { x: number; z: number; size: number; rotY: number; scaleXZ: number }[] = [];

    // Generate ~25 scattered rocks
    let attempts = 0;
    while (rockConfigs.length < 25 && attempts < 200) {
      attempts++;
      const angle = rand() * Math.PI * 2;
      const dist = 8 + rand() * 38;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      if (isBlocked(x, z)) continue;

      // Check spacing from other rocks
      let tooClose = false;
      for (const r of rockConfigs) {
        if (Math.sqrt((x - r.x) ** 2 + (z - r.z) ** 2) < 2.5) { tooClose = true; break; }
      }
      if (tooClose) continue;

      const size = 0.2 + rand() * 0.6;
      rockConfigs.push({
        x, z, size,
        rotY: rand() * Math.PI * 2,
        scaleXZ: 0.8 + rand() * 0.4,
      });
    }

    // Also add a few small clusters (2-3 rocks close together)
    for (let c = 0; c < 5; c++) {
      const angle = rand() * Math.PI * 2;
      const dist = 12 + rand() * 30;
      const cx = Math.cos(angle) * dist;
      const cz = Math.sin(angle) * dist;

      if (isBlocked(cx, cz)) continue;

      for (let j = 0; j < 2 + Math.floor(rand() * 2); j++) {
        const ox = cx + (rand() - 0.5) * 1.5;
        const oz = cz + (rand() - 0.5) * 1.5;
        if (isBlocked(ox, oz)) continue;

        rockConfigs.push({
          x: ox, z: oz,
          size: 0.15 + rand() * 0.3,
          rotY: rand() * Math.PI * 2,
          scaleXZ: 0.8 + rand() * 0.4,
        });
      }
    }

    // Build meshes and register colliders
    for (const cfg of rockConfigs) {
      const geo = makeRockGeo(cfg.size);
      const rock = new THREE.Mesh(geo, rockMat);
      // Sink partially into ground
      const sinkDepth = cfg.size * 0.3;
      rock.position.set(cfg.x, cfg.size * 0.65 - sinkDepth, cfg.z);
      rock.rotation.y = cfg.rotY;
      rock.rotation.x = (rand() - 0.5) * 0.2; // slight tilt
      rock.rotation.z = (rand() - 0.5) * 0.15;
      rock.scale.set(cfg.scaleXZ, 1, cfg.scaleXZ);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.group.add(rock);

      // Register collision - use size * scaleXZ as radius
      this.colliders.push({ x: cfg.x, z: cfg.z, r: cfg.size * cfg.scaleXZ });
    }
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
    // ── Fire brazier animations ────────────────────────────────────
    for (let i = 0; i < this.brazierIndex; i++) {
      // Flame dance — each of the 3 flame cones sways independently
      for (let f = 0; f < 3; f++) {
        const flame = this.group.getObjectByName(`brazier-flame-${i}-${f}`);
        if (flame) {
          const phase = i * 2.7 + f * 1.3;
          // Sway side to side
          flame.position.x = flame.userData.baseX + Math.sin(time * 4.5 + phase) * 0.04;
          flame.position.z = flame.userData.baseZ + Math.cos(time * 3.8 + phase * 0.7) * 0.03;
          // Flicker height
          flame.position.y = flame.userData.baseY + Math.sin(time * 7 + phase) * 0.04;
          // Scale flicker
          const flicker = 0.85 + Math.sin(time * 9 + phase) * 0.15;
          flame.scale.set(flicker, 0.7 + Math.sin(time * 6 + phase) * 0.3, flicker);
          // Opacity flicker
          const mat = (flame as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.opacity = (0.65 - f * 0.1) + Math.sin(time * 8 + phase) * 0.2;
        }
      }
      // Light intensity flicker
      const light = this.group.getObjectByName(`brazier-light-${i}`);
      if (light) {
        const phase = i * 1.9;
        (light as THREE.PointLight).intensity = 0.5 + Math.sin(time * 5 + phase) * 0.15 + Math.sin(time * 8.3 + phase) * 0.08;
      }
      // Ember glow pulse
      const embers = this.group.getObjectByName(`brazier-embers-${i}`);
      if (embers) {
        const mat = (embers as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1.2 + Math.sin(time * 3 + i * 0.8) * 0.5;
      }
    }

        // ── Dragon skeleton entrance animations ─────────────────────────
    // Eye glow pulse
    for (const side of ['L', 'R']) {
      const eyeLight = this.group.getObjectByName(`dragon-eye-${side}`);
      if (eyeLight) {
        (eyeLight as THREE.PointLight).intensity = 0.8 + Math.sin(time * 1.5 + (side === 'L' ? 0 : 1)) * 0.4;
      }
      const eyeOrb = this.group.getObjectByName(`dragon-eye-orb-${side}`);
      if (eyeOrb) {
        const eMat = (eyeOrb as THREE.Mesh).material as THREE.MeshBasicMaterial;
        eMat.opacity = 0.5 + Math.sin(time * 1.5 + (side === 'L' ? 0 : 1)) * 0.3;
      }
    }

    // Mist drifting from the maw
    for (let i = 0; i < 5; i++) {
      const mist = this.group.getObjectByName(`dragon-mist-${i}`);
      if (mist) {
        mist.position.x += Math.sin(time * 0.3 + i * 1.5) * 0.002;
        mist.position.y += Math.cos(time * 0.2 + i * 0.8) * 0.001;
        const mMat = (mist as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mMat.opacity = 0.06 + Math.sin(time * 0.5 + i * 1.2) * 0.04;
      }
    }

    // Inner skull glow pulse
    const innerGlow = this.group.getObjectByName('dragon-inner-glow');
    if (innerGlow) {
      (innerGlow as THREE.PointLight).intensity = 1.5 + Math.sin(time * 0.8) * 0.6;
    }
    const dungeonGlow = this.group.getObjectByName('dragon-dungeon-glow');
    if (dungeonGlow) {
      (dungeonGlow as THREE.PointLight).intensity = 1.2 + Math.sin(time * 1.5) * 0.4;
    }

    // Bone dust particle drift
    for (let i = 0; i < 12; i++) {
      const dust = this.group.getObjectByName(`dragon-dust-${i}`);
      if (dust) {
        dust.position.y += 0.003;
        if (dust.position.y > dust.userData.baseY + 4) {
          dust.position.y = dust.userData.baseY;
        }
        const dMat = (dust as THREE.Mesh).material as THREE.MeshBasicMaterial;
        const h = dust.position.y - dust.userData.baseY;
        dMat.opacity = 0.3 * (1 - h / 4);
      }
    }

    // Cave fog breathing
    for (let i = 0; i < 3; i++) {
      const fog = this.group.getObjectByName(`dragon-cave-fog-${i}`);
      if (fog) {
        const fMat = (fog as THREE.Mesh).material as THREE.MeshBasicMaterial;
        fMat.opacity = (0.12 - i * 0.03) + Math.sin(time * 0.3 + i * 1.5) * 0.04;
      }
    }

    // Hanging sinew strips gentle sway
    for (const wSide of ['L', 'R']) {
      for (let s = 0; s < 5; s++) {
        const strip = this.group.getObjectByName(`dragon-strip-${wSide}-${s}`);
        if (strip) {
          strip.rotation.z = Math.sin(time * 0.4 + s * 1.2 + (wSide === 'L' ? 0 : 2)) * 0.08;
          strip.rotation.x = Math.sin(time * 0.3 + s * 0.9) * 0.05;
        }
      }
    }

    // ── Tree of Life animations ──────────────────────────────────────
    // Fireflies - gentle floating movement
    for (let i = 0; i < 20; i++) {
      const firefly = this.group.getObjectByName(`tree-firefly-${i}`);
      if (firefly) {
        const phase = i * 1.37;
        firefly.position.x = firefly.userData.baseX + Math.sin(time * 0.7 + phase) * 1.5;
        firefly.position.y = firefly.userData.baseY + Math.cos(time * 0.5 + phase) * 0.8;
        firefly.position.z = firefly.userData.baseZ + Math.sin(time * 0.6 + phase * 0.7) * 1.5;
        const mat = (firefly as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.3 + Math.sin(time * 2.5 + phase) * 0.4;
      }
    }

    // Water pool surface
    const treePool = this.group.getObjectByName('tree-water-pool');
    if (treePool) {
      treePool.position.y = 0.18 + Math.sin(time * 1.5) * 0.015;
      treePool.rotation.y = time * 0.05;
    }

    // Waterfall wobble
    const waterfall = this.group.getObjectByName('tree-waterfall');
    if (waterfall) {
      waterfall.scale.x = 1 + Math.sin(time * 4) * 0.15;
      waterfall.scale.z = 1 + Math.cos(time * 3.5) * 0.1;
    }

    // Mini streams
    for (let i = 0; i < 3; i++) {
      const treeStream = this.group.getObjectByName(`tree-stream-${i}`);
      if (treeStream) {
        treeStream.scale.x = 1 + Math.sin(time * 3 + i * 2) * 0.2;
      }
    }

    // Ripples at waterfall base - expand and fade
    for (let i = 0; i < 3; i++) {
      const ripple = this.group.getObjectByName(`tree-ripple-${i}`);
      if (ripple) {
        const cycle = (time * 1.0 + i * 0.7) % 2.0;
        const s = 1 + cycle * 2.0;
        ripple.scale.set(s, s, s);
        const mat = (ripple as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.3 * Math.max(0, 1 - cycle / 2.0);
      }
    }

    // Rune glow pulse
    for (let i = 0; i < 8; i++) {
      const rune = this.group.getObjectByName(`tree-rune-${i}`);
      if (rune) {
        const mat = (rune as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.4 + Math.sin(time * 2 + i * 0.8) * 0.4;
      }
    }

    // Root tip glow pulse
    for (let i = 0; i < 8; i += 2) {
      const tip = this.group.getObjectByName(`tree-root-glow-${i}`);
      if (tip) {
        const mat = (tip as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.5 + Math.sin(time * 1.8 + i * 0.8) * 0.3;
        const s = 1 + Math.sin(time * 2 + i) * 0.2;
        tip.scale.set(s, s, s);
      }
    }

    // Leaf clusters gentle sway
    for (let i = 0; i < 12; i++) {
      const leaf = this.group.getObjectByName(`tree-leaf-${i}`);
      if (leaf) {
        leaf.rotation.z = Math.sin(time * 0.4 + i * 0.5) * 0.03;
        leaf.rotation.x = Math.cos(time * 0.35 + i * 0.7) * 0.02;
      }
    }

    // Gernal's beard sway
    const beardTip = this.group.getObjectByName('gernal-beard-tip');
    if (beardTip) {
      beardTip.rotation.z = Math.sin(time * 1.2) * 0.08;
      beardTip.rotation.x = Math.cos(time * 0.9) * 0.05;
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

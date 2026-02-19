import * as THREE from 'three';
import { downscaleTextures } from '../utils/downscaleTextures';

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
  public shopPosition = new THREE.Vector3(-27, 0, -12);
  public pvpArenaPosition = new THREE.Vector3(20, 0, -12);
  public cavePosition = new THREE.Vector3(0, 0, -35);
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
    // this.buildSpawnAltar();
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
      { from: [0, 0], to: [0, -38], width: 3 },       // North to portal
      { from: [0, 0], to: [0, 26], width: 2.5 },      // South spawn
    ];

    // Curved paths — single continuous mesh per curve
    const curvedPaths = [
      // East to PvP
      { waypoints: [[0, 0], [5, -1], [10, -3], [15, -6], [20, -9], [24, -12]], width: 2.5 },
      // West to shop
      { waypoints: [[0, 0], [-5, -1], [-10, -3], [-16, -6], [-22, -9], [-27, -12]], width: 2.5 },
    ];

    for (const cp of curvedPaths) {
      this.buildCurvedPath(cp.waypoints, cp.width, hashStone, smoothstepJS);
    }

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
        (p.from[0] + p.to[0]) / 2, 0.28,
        (p.from[1] + p.to[1]) / 2,
      );
      pathMesh.rotation.z = -pathAngle;
      pathMesh.receiveShadow = true;
      pathMesh.castShadow = true;
      this.group.add(pathMesh);
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
    plazaMesh.position.y = 0.28;
    plazaMesh.receiveShadow = true;
    this.group.add(plazaMesh);

    // Stone border ring around plaza
    const borderRing = new THREE.Mesh(
      new THREE.TorusGeometry(7.8, 0.18, 8, 48),
      new THREE.MeshStandardMaterial({ color: 0x6a5a42, roughness: 0.85 }),
    );
    borderRing.rotation.x = -Math.PI / 2;
    borderRing.position.y = 0.30;
    this.group.add(borderRing);

    // Inner ring around the tree
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.8, 0.12, 6, 32),
      new THREE.MeshStandardMaterial({ color: 0x7a6a52, roughness: 0.8 }),
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.31;
    this.group.add(innerRing);
  }

  /**
   * Build a curved cobblestone path from a set of 2D waypoints.
   * Uses CatmullRomCurve3 and the same cobblestone vertex-color logic as straight paths.
   */
  private buildCurvedPath(
    waypoints: number[][],
    pathWidth: number,
    hashStone: (a: number, b: number) => number,
    smoothstep: (edge0: number, edge1: number, x: number) => number,
  ) {
    const curve = new THREE.CatmullRomCurve3(
      waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false, 'catmullrom', 0.5,
    );

    const segsAlong = 50;
    const segsAcross = Math.max(12, Math.floor(pathWidth * 8));
    const totalLen = curve.getLength();
    const vtxCount = (segsAlong + 1) * (segsAcross + 1);
    const posArr = new Float32Array(vtxCount * 3);
    const colArr = new Float32Array(vtxCount * 3);

    for (let j = 0; j <= segsAlong; j++) {
      const t = j / segsAlong;
      const center = curve.getPoint(t);
      const tangent = curve.getTangent(t);
      const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const ly = (t - 0.5) * totalLen;

      for (let k = 0; k <= segsAcross; k++) {
        const crossT = k / segsAcross - 0.5;
        const lx = crossT * pathWidth;
        const idx = j * (segsAcross + 1) + k;

        const wx = center.x + perp.x * lx;
        const wz = center.z + perp.z * lx;

        // Cobblestone grid
        const stoneScale = 3.2;
        const gx = lx * stoneScale;
        const gy = ly * stoneScale;
        const row = Math.floor(gy);
        const adjX = gx + (row % 2) * 0.5;
        const cellX = adjX - Math.floor(adjX) - 0.5;
        const cellY = gy - Math.floor(gy) - 0.5;
        const distToCenter = Math.sqrt(cellX * cellX + cellY * cellY);

        const stoneShape = smoothstep(0.48, 0.32, distToCenter);
        const h = stoneShape * 0.06;

        const stoneID_x = Math.floor(adjX);
        const stoneID_y = Math.floor(gy);
        const stoneRand = hashStone(stoneID_x, stoneID_y);
        const heightVariation = stoneRand * 0.025;

        posArr[idx * 3] = wx;
        posArr[idx * 3 + 1] = 0.28 + h + heightVariation;
        posArr[idx * 3 + 2] = wz;

        // Color
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
        const edgeDist = Math.abs(lx) / (pathWidth / 2);
        if (edgeDist > 0.75) {
          const fade = (edgeDist - 0.75) / 0.25;
          const f = fade * fade;
          r = r * (1 - f) + 0.22 * f;
          g2 = g2 * (1 - f) + 0.40 * f;
          b = b * (1 - f) + 0.12 * f;
          posArr[idx * 3 + 1] = 0.28 + (h + heightVariation) * (1 - f);
        }

        colArr[idx * 3] = r;
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

  // Collision radius for the fountain base (used by LocalPlayer)
  public static readonly FOUNTAIN_RADIUS = 3.6;

  private buildFountainPlaza() {
    // Load tree-house GLB as center tree
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load('/models/center_tree.glb', (gltf) => {
        const model = gltf.scene;
        model.name = 'tree-of-life';

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        downscaleTextures(model);

        // Scale to a large center tree (~20m)
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = 20 / Math.max(size.y, 0.01);
        model.scale.setScalar(scale);

        // Ground the model and sink it so the round pedestal is hidden below ground
        model.updateMatrixWorld(true);
        const groundBox = new THREE.Box3().setFromObject(model);
        const totalHeight = groundBox.max.y - groundBox.min.y;
        model.position.y -= groundBox.min.y;
        // Sink to bury the base pedestal flush with ground
        model.position.y -= totalHeight * 0.10;

        // Single tree glow light (merged two into one for perf)
        const treeLight = new THREE.PointLight(0x66cc66, 2.5, 30);
        treeLight.position.set(0, 12, 0);
        model.add(treeLight);

        this.group.add(model);
        console.log(`[HubWorld] Center tree GLB loaded, scale: ${scale.toFixed(2)}, size:`, size.toArray().map(v => v.toFixed(1)));
      }, undefined, (err) => {
        console.error('[HubWorld] Failed to load center tree GLB:', err);
      });
    });
  }

  private buildShop() {
    const pos = this.shopPosition;

    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load('/models/shop.glb', (gltf) => {
        const model = gltf.scene;
        model.name = 'shop-stall';

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        downscaleTextures(model);

        // Scale to fit: target ~6m wide footprint
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const targetWidth = 6;
        const scale = targetWidth / Math.max(size.x, size.z, 0.01);
        model.scale.setScalar(scale);

        // Rotate so the front faces towards the tree/fountain (towards +X)
        model.rotation.y = Math.PI / 2;

        // Ground the model
        model.updateMatrixWorld(true);
        const groundBox = new THREE.Box3().setFromObject(model);
        model.position.copy(pos);
        model.position.y -= groundBox.min.y;

        // Warm interior light
        const shopLight = new THREE.PointLight(0xffaa44, 1, 8);
        shopLight.position.set(pos.x, 2.2, pos.z);
        this.group.add(shopLight);

        this.group.add(model);
        console.log(`[HubWorld] Shop GLB loaded, scale: ${scale.toFixed(2)}, size:`, size.toArray().map(v => v.toFixed(1)));
      }, undefined, (err) => {
        console.error('[HubWorld] Failed to load shop GLB:', err);
      });
    });
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

    // ── Load dragon skull GLB model ───────────────────────────────────
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load('/models/dragon_skull.glb', (gltf) => {
        const model = gltf.scene;
        model.position.copy(cp);
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        downscaleTextures(model);
        // Auto-scale: measure and fit to roughly same footprint as old skeleton
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const targetHeight = 12; // ~12m tall skull entrance
        const scale = targetHeight / Math.max(size.y, 0.01);
        model.scale.setScalar(scale);
        // Face the mouth toward -Z (toward players approaching from spawn)
        model.rotation.y = 0;
        // Ground the model
        model.updateMatrixWorld(true);
        const groundBox = new THREE.Box3().setFromObject(model);
        model.position.y -= groundBox.min.y;
        this.group.add(model);
        console.log(`[HubWorld] Dragon skull loaded, scale: ${scale.toFixed(2)}, size:`, size.toArray().map(v => v.toFixed(1)));
      }, undefined, (err) => {
        console.error('[HubWorld] Failed to load dragon skull GLB:', err);
      });
    });

    // ── Atmosphere effects (kept from original) ───────────────────────

    // Dragon eyeball GLB models in skull eye sockets
    for (const side of [-1, 1]) {
      const eyeX = cp.x + side * 1.3;
      const eyeY = 4.5;
      const eyeZ = cp.z + 1.2;

      // Point light for glow
      const eyeGlow = new THREE.PointLight(0xff2200, 3.0, 10);
      eyeGlow.position.set(eyeX, eyeY, eyeZ);
      eyeGlow.name = `dragon-eye-${side === -1 ? 'L' : 'R'}`;
      this.group.add(eyeGlow);

      // Load eyeball GLB
      import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
        const loader = new GLTFLoader();
        loader.load('/models/dragon_eye.glb', (gltf) => {
          const eye = gltf.scene;
          downscaleTextures(eye);
          eye.position.set(eyeX, eyeY, eyeZ);

          // Auto-scale to fit eye socket (~0.9m diameter)
          const box = new THREE.Box3().setFromObject(eye);
          const size = box.getSize(new THREE.Vector3());
          const scale = 0.9 / Math.max(size.x, size.y, size.z);
          eye.scale.setScalar(scale);

          // Face forward (+Z toward players)
          eye.rotation.y = Math.PI;

          eye.name = `dragon-eye-orb-${side === -1 ? 'L' : 'R'}`;
          eye.userData.baseY = eyeY;
          eye.userData.side = side;
          this.group.add(eye);
        });
      });
    }

    // Mist planes — eerie green mist
    for (let i = 0; i < 5; i++) {
      const mistGeo = new THREE.PlaneGeometry(3.5 + Math.sin(i * 1.5) * 1.5, 1.5 + Math.cos(i * 0.8) * 0.6);
      const mist = new THREE.Mesh(mistGeo, new THREE.MeshBasicMaterial({
        color: 0xaa4444, transparent: true, opacity: 0.10 + i * 0.015,
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

    // Inner cave fog planes
    for (let i = 0; i < 3; i++) {
      const fogGeo = new THREE.PlaneGeometry(4, 2.5);
      const fog = new THREE.Mesh(fogGeo, new THREE.MeshBasicMaterial({
        color: 0x221111, transparent: true, opacity: 0.15 - i * 0.03,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      fog.name = `dragon-cave-fog-${i}`;
      fog.position.set(cp.x, 1.0, cp.z - 2 - i * 1.5);
      fog.rotation.y = i * 0.2;
      this.group.add(fog);
    }

    // Cave glow — single merged light for performance
    const innerGlow = new THREE.PointLight(0xff2200, 3, 14);
    innerGlow.position.set(cp.x, 1.5, cp.z + 1.0);
    innerGlow.name = 'dragon-inner-glow';
    this.group.add(innerGlow);

    // ── Dark Forest portal inside the mouth ──────────────────────────
    const portalY = 2.2;
    const portalZ = cp.z + 1.5;
    const portalRadius = 1.8;

    // Portal surface — swirling disc
    const portalGeo = new THREE.CircleGeometry(portalRadius - 0.15, 32);
    const portalMat = new THREE.MeshBasicMaterial({
      color: 0x551111,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const portalDisc = new THREE.Mesh(portalGeo, portalMat);
    portalDisc.position.set(cp.x, portalY, portalZ);
    portalDisc.rotation.x = -Math.PI * 0.1;
    portalDisc.name = 'dragon-portal-disc';
    this.group.add(portalDisc);

    // Inner swirl layer (brighter, slightly smaller, rotates opposite)
    const swirlGeo = new THREE.CircleGeometry(portalRadius * 0.6, 24);
    const swirlMat = new THREE.MeshBasicMaterial({
      color: 0xff4422,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const swirl = new THREE.Mesh(swirlGeo, swirlMat);
    swirl.position.set(cp.x, portalY, portalZ + 0.05);
    swirl.rotation.x = -Math.PI * 0.1;
    swirl.name = 'dragon-portal-swirl';
    this.group.add(swirl);

    // Portal glow light
    const portalLight = new THREE.PointLight(0xff2200, 4, 8);
    portalLight.position.set(cp.x, portalY, portalZ + 0.5);
    portalLight.name = 'dragon-portal-light';
    this.group.add(portalLight);

    // Sign — 'DARK FOREST' above the skull
    const sign = this.createTextSign('DARK FOREST', 0xff8866);
    sign.position.set(cp.x, 10.0, cp.z + 2.0);
    this.group.add(sign);
  }




  private buildNPCs() {
    const npcs = [
      {
        name: 'Elder Mika',
        position: new THREE.Vector3(12, 0, 7),
        color: 0x6644aa,
        isElder: true,
        dialog: [
          'Welcome, adventurer! This is the Hub Town.',
          'The Dark Forest portal leads to dangerous creatures...',
          'I heard that enough wood scraps can be fashioned into something useful...',
        ],
      },
      {
        name: 'Gernal',
        position: new THREE.Vector3(-23, 0, -12),
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
        position: new THREE.Vector3(3, 0, -25),
        color: 0x22aa66,
        isScout: true,
        dialog: [
          'The Dark Forest is just the beginning...',
          'They say an Ancient Treant guards the deepest grove.',
          'Be careful of the Giant Spiders - they are fast!',
        ],
      },
      {
        name: 'Battlemaster Toivo',
        position: new THREE.Vector3(18, 0, -6),
        color: 0xcc2222,
        isBattlemaster: true,
        dialog: [
          'The Arena awaits, warrior! Prove your strength against other adventurers.',
          'Step through the gate if you dare... only the strongest survive.',
          'Victory in the arena brings glory and rare rewards!',
        ],
      },
    ];

    for (const npc of npcs) {
      if ((npc as any).isShopkeeper) {
        this.createGernalMesh(npc.position);
      } else if ((npc as any).isScout) {
        this.createScoutMesh(npc.name, npc.position);
      } else if ((npc as any).isBattlemaster) {
        this.createBattlemasterMesh(npc.name, npc.position);
      } else if ((npc as any).isElder) {
        this.createElderMesh(npc.name, npc.position);
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
    g.position.copy(pos);
    g.name = 'npc-Gernal';

    // Floating name + "!" indicator
    const canvas2 = document.createElement('canvas');
    canvas2.width = 256;
    canvas2.height = 96;
    const ctx2 = canvas2.getContext('2d')!;
    ctx2.font = 'bold 40px Arial';
    ctx2.textAlign = 'center';
    ctx2.fillStyle = '#FFD700';
    ctx2.fillText('!', 128, 35);
    ctx2.font = 'bold 22px Arial';
    ctx2.fillStyle = '#ffffff';
    ctx2.strokeStyle = '#000000';
    ctx2.lineWidth = 3;
    ctx2.strokeText('Gernal', 128, 75);
    ctx2.fillText('Gernal', 128, 75);
    const tex2 = new THREE.CanvasTexture(canvas2);
    const spriteMat2 = new THREE.SpriteMaterial({ map: tex2, transparent: true });
    const sprite2 = new THREE.Sprite(spriteMat2);
    sprite2.position.y = 3.3;
    sprite2.scale.set(2.5, 0.9, 1);
    g.add(sprite2);
    this.group.add(g);

    // Load GLB model
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load('/models/old_man_character_concept_meshy.glb', (gltf) => {
        const model = gltf.scene;
        // Strip environment spheres (huge meshes baked in by Meshy/Blender)
        this.stripEnvSpheres(model);
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) { child.castShadow = true; child.receiveShadow = true; }
        });
        downscaleTextures(model);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = 2.5 / Math.max(size.y, 0.01);
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);
        const groundBox = new THREE.Box3().setFromObject(model);
        model.position.y -= groundBox.min.y;
        g.add(model);
        console.log(`[HubWorld] Gernal GLB loaded, scale: ${scale.toFixed(2)}`);
      }, undefined, (err) => { console.error('[HubWorld] Failed to load Gernal GLB:', err); });
    });
    return; // Skip old procedural mesh below

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
    // Scale to match player height (3m) — base NPC is ~2.5m
    npcGroup.scale.setScalar(1.2);
    this.group.add(npcGroup);
  }

  private createElderMesh(name: string, pos: THREE.Vector3) {
    const npcGroup = new THREE.Group();
    npcGroup.position.copy(pos);
    npcGroup.name = `npc-${name}`;

    // Face toward spawn altar
    npcGroup.lookAt(0, 0, 15);

    // Floating name + "!" indicator
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
    ctx.strokeText(name, 128, 75);
    ctx.fillText(name, 128, 75);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 3.2;
    sprite.scale.set(2.5, 0.9, 1);
    npcGroup.add(sprite);

    this.group.add(npcGroup);

    // Load GLB model
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load('/models/elder_moonseer.glb', (gltf) => {
        const model = gltf.scene;
        // Strip environment spheres (huge meshes baked in by Meshy/Blender)
        this.stripEnvSpheres(model);
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        downscaleTextures(model);

        // Scale to match player height (3m)
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = 3.0 / Math.max(size.y, 0.01);
        model.scale.setScalar(scale);

        // Ground the model
        model.updateMatrixWorld(true);
        const groundBox = new THREE.Box3().setFromObject(model);
        model.position.y -= groundBox.min.y;

        npcGroup.add(model);
        console.log(`[HubWorld] Elder Mika GLB loaded, scale: ${scale.toFixed(2)}`);
      }, undefined, (err) => {
        console.error('[HubWorld] Failed to load Elder Mika GLB:', err);
      });
    });
  }

  private createScoutMesh(name: string, pos: THREE.Vector3) {
    const npcGroup = new THREE.Group();
    npcGroup.position.copy(pos);
    npcGroup.name = `npc-${name}`;

    // Floating name + "!" indicator
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
    ctx.strokeText(name, 128, 75);
    ctx.fillText(name, 128, 75);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 3.2;
    sprite.scale.set(2.5, 0.9, 1);
    npcGroup.add(sprite);

    this.group.add(npcGroup);

    // Load GLB model
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load('/models/scout_aino.glb', (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        downscaleTextures(model);

        // Scale to match player height (3m)
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = 3.0 / Math.max(size.y, 0.01);
        model.scale.setScalar(scale);

        // Ground the model
        model.updateMatrixWorld(true);
        const groundBox = new THREE.Box3().setFromObject(model);
        model.position.y -= groundBox.min.y;

        // Arm rest pose (same as player character)
        model.traverse((child) => {
          if (!(child as THREE.Bone).isBone) return;
          switch (child.name) {
            case 'mixamorigLeftArm': child.rotation.set(1.0, 0, 0.3); break;
            case 'mixamorigRightArm': child.rotation.set(1.0, 0, -0.3); break;
            case 'mixamorigLeftForeArm': child.rotation.set(0, 0, 0); break;
            case 'mixamorigRightForeArm': child.rotation.set(0, 0, 0); break;
          }
        });

        npcGroup.add(model);
        console.log(`[HubWorld] Scout Aino GLB loaded, scale: ${scale.toFixed(2)}`);
      }, undefined, (err) => {
        console.error('[HubWorld] Failed to load Scout Aino GLB:', err);
      });
    });
  }

  private createBattlemasterMesh(name: string, pos: THREE.Vector3) {
    const npcGroup = new THREE.Group();
    npcGroup.position.copy(pos);
    npcGroup.name = `npc-${name}`;

    // Floating name + "!" indicator
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
    ctx.strokeText(name, 128, 75);
    ctx.fillText(name, 128, 75);
    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 3.5;
    sprite.scale.set(2.5, 0.9, 1);
    npcGroup.add(sprite);

    this.group.add(npcGroup);

    // Load GLB model
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load('/models/knight_artorias.glb', (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        downscaleTextures(model);

        // Scale to NPC height (~3m for a knight + wolf)
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = 3.0 / Math.max(size.y, 0.01);
        model.scale.setScalar(scale);

        // Ground the model
        model.updateMatrixWorld(true);
        const groundBox = new THREE.Box3().setFromObject(model);
        model.position.y -= groundBox.min.y;

        npcGroup.add(model);
        console.log(`[HubWorld] Battlemaster Toivo GLB loaded, scale: ${scale.toFixed(2)}`);
      }, undefined, (err) => {
        console.error('[HubWorld] Failed to load Battlemaster Toivo GLB:', err);
      });
    });
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
      [1.5, -30], [-1.5, -30], [1.5, -45], [-1.5, -45],
      // Near shop entrance
      [-16, 9], [-20, 4],
      // Near PvP arena entrance
      [27, -14], [27, -22],
      // Near NPCs — Elder Mika, Scout Aino
      [14, 7], [7, -38],
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

  private pilarCache: { scene: THREE.Group; yOffset: number } | null = null;
  private pilarPending: ((cache: { scene: THREE.Group; yOffset: number }) => void)[] = [];

  private getPilarModel(cb: (cache: { scene: THREE.Group; yOffset: number }) => void) {
    if (this.pilarCache) { cb(this.pilarCache); return; }
    this.pilarPending.push(cb);
    if (this.pilarPending.length > 1) return; // already loading
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load('/models/pilar.glb', (gltf) => {
        const base = gltf.scene;
        downscaleTextures(base);
        const box = new THREE.Box3().setFromObject(base);
        const size = box.getSize(new THREE.Vector3());
        const pillarScale = 1.4 / Math.max(size.y, 0.01);
        base.scale.setScalar(pillarScale);
        base.updateMatrixWorld(true);
        const gb = new THREE.Box3().setFromObject(base);
        this.pilarCache = { scene: base, yOffset: -gb.min.y };
        for (const fn of this.pilarPending) fn(this.pilarCache);
        this.pilarPending = [];
      });
    });
  }

  private createLantern(x: number, z: number) {
    const idx = this.brazierIndex++;

    // Load pillar GLB once, clone for each lantern
    this.getPilarModel(({ scene, yOffset }) => {
      const model = scene.clone();
      model.position.set(x, yOffset, z);
      this.group.add(model);
    });

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

    // Warm glow — use emissive only, no PointLight for performance
    // (14 braziers × 1 PointLight each was a major perf hit)
  }

  /**
   * Remove oversized meshes from a loaded GLB model.
   * Meshy/Blender exports often include a giant environment sphere.
   */
  private stripEnvSpheres(model: THREE.Group) {
    const toRemove: THREE.Object3D[] = [];
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry.computeBoundingSphere();
        const bs = mesh.geometry.boundingSphere;
        if (bs && bs.radius > 50) {
          console.log(`[HubWorld] Stripped oversized mesh: "${mesh.name}", radius: ${bs.radius.toFixed(0)}`);
          toRemove.push(mesh);
        }
      }
    });
    for (const obj of toRemove) {
      obj.removeFromParent();
    }
  }

  private buildRocks() {
    // Seeded random for deterministic placement
    let seed = 42;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; };

    // Areas to avoid: fountain (0,0 r4), paths, shop (-27,-12), pvp (33,-18), portal (0,-55), spawn (0,16)
    const isOnPath = (x: number, z: number): boolean => {
      // North path to portal
      if (Math.abs(x) < 2.5 && z < 0 && z > -60) return true;
      // West to shop (curved path — sample 10 points along curve)
      const shopPts = [
        [0, 0], [-6, -0.3], [-12, -0.8], [-18, -1.5],
        [-24, -2.5], [-30, -3.5], [-33, -5],
        [-35, -7], [-35, -9.5], [-35, -12],
      ];
      for (const sp of shopPts) {
        if (Math.sqrt((x - sp[0]) ** 2 + (z - sp[1]) ** 2) < 2.5) return true;
      }
      // East to pvp
      const t2 = Math.max(0, Math.min(1, (x * 38 + z * -18) / (1444 + 324)));
      const px2 = 38 * t2, pz2 = -18 * t2;
      if (Math.sqrt((x - px2) ** 2 + (z - pz2) ** 2) < 2.5) return true;
      // South spawn path
      if (Math.abs(x) < 2.5 && z > 0 && z < 24) return true;
      return false;
    };

    const isBlocked = (x: number, z: number): boolean => {
      const d = Math.sqrt(x * x + z * z);
      if (d < 6) return true; // fountain/plaza
      if (d > 75) return true; // too far out
      if (isOnPath(x, z)) return true;
      // Shop area
      if (x > -39 && x < -31 && z > -16 && z < -8) return true;
      // PvP arena
      if (x > 28 && x < 39 && z > -23 && z < -13) return true;
      // Portal area
      if (Math.abs(x) < 5 && z < -48 && z > -62) return true;
      // Spawn area
      if (Math.abs(x) < 4 && z > 14 && z < 24) return true;
      // NPCs
      if (Math.sqrt((x - 12) ** 2 + (z - 7) ** 2) < 3) return true;
      if (Math.sqrt((x - 5) ** 2 + (z + 40) ** 2) < 3) return true;
      if (Math.sqrt((x + 8) ** 2 + (z + 8) ** 2) < 3) return true;
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
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
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
      // Ember glow pulse
      const embers = this.group.getObjectByName(`brazier-embers-${i}`);
      if (embers) {
        const mat = (embers as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1.2 + Math.sin(time * 3 + i * 0.8) * 0.5;
      }
    }

        // ── Dragon skeleton entrance animations ─────────────────────────
    // Eye glow pulse + eyeball subtle movement
    for (const side of ['L', 'R']) {
      const phase = side === 'L' ? 0 : 1;
      const eyeLight = this.group.getObjectByName(`dragon-eye-${side}`);
      if (eyeLight) {
        (eyeLight as THREE.PointLight).intensity = 2.0 + Math.sin(time * 1.5 + phase) * 1.0;
      }
      const eyeOrb = this.group.getObjectByName(`dragon-eye-orb-${side}`);
      if (eyeOrb) {
        const baseY = eyeOrb.userData.baseY ?? 4.5;
        // Subtle look-around: slow random-ish rotation
        eyeOrb.rotation.x = Math.sin(time * 0.4 + phase * 2.0) * 0.12;
        eyeOrb.rotation.y = Math.PI + Math.sin(time * 0.3 + phase) * 0.15;
        // Gentle bob up/down
        eyeOrb.position.y = baseY + Math.sin(time * 0.7 + phase) * 0.06;
      }
    }

    // Portal swirl rotation + pulse
    const portalDisc = this.group.getObjectByName('dragon-portal-disc');
    if (portalDisc) {
      portalDisc.rotation.z = time * 0.3;
      const pMat = (portalDisc as THREE.Mesh).material as THREE.MeshBasicMaterial;
      pMat.opacity = 0.6 + Math.sin(time * 0.8) * 0.2;
    }
    const portalSwirl = this.group.getObjectByName('dragon-portal-swirl');
    if (portalSwirl) {
      portalSwirl.rotation.z = -time * 0.6;
      const sMat = (portalSwirl as THREE.Mesh).material as THREE.MeshBasicMaterial;
      sMat.opacity = 0.2 + Math.sin(time * 1.2 + 1.0) * 0.15;
    }
    const portalLight = this.group.getObjectByName('dragon-portal-light');
    if (portalLight) {
      (portalLight as THREE.PointLight).intensity = 3.0 + Math.sin(time * 1.0) * 1.5;
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

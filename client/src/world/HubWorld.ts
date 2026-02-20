import * as THREE from 'three';
import { downscaleTextures } from '../utils/downscaleTextures';
import { getGLTFLoader } from '../utils/getGLTFLoader';
import { StaticBatcher } from '../utils/StaticBatcher';

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
  public npcPositions: { name: string; npcId: string; position: THREE.Vector3; dialog: string[] }[] = [];

  // Circle colliders for world objects (rocks, lanterns, pillars, NPCs)
  public colliders: WorldCollider[] = [];

  // Shared materials for batching (hoisted out of loops)
  private bowlOuterMat = new THREE.MeshStandardMaterial({ color: 0x443322, roughness: 0.8, metalness: 0.3 });
  private bowlInnerMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

  private riverMesh: THREE.Mesh | null = null;

  // Cached object references for update() — avoids getObjectByName every frame
  private _animCache: Record<string, THREE.Object3D | null> = {};
  private _animCacheBuilt = false;

  private getAnimObj(name: string): THREE.Object3D | null {
    if (!this._animCacheBuilt) {
      this._animCacheBuilt = true;
      // Pre-cache all animated objects
      this.group.traverse((obj) => {
        if (obj.name) this._animCache[obj.name] = obj;
      });
    }
    if (name in this._animCache) return this._animCache[name];
    // Fallback lookup & cache
    const found = this.group.getObjectByName(name) ?? null;
    this._animCache[name] = found;
    return found;
  }

  // Cave entrance data (animations handled by named objects)

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'hub-world';

    const batcher = new StaticBatcher();

    this.buildGround();
    this.buildFountainPlaza();
    this.buildShop();
    this.buildPvPArena(batcher);
    this.buildCaveEntrance();
    this.buildNPCs();
    this.buildDecorations(batcher);
    // this.buildRocks(batcher);
    this.buildRiver();

    this.buildLighting();

    batcher.flush(this.group);

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
   * Build a curved cobblestone path through a set of waypoints.
   * Creates a single mesh with vertex colors matching the straight-path style.
   */
  private buildCurvedPath(
    waypoints: number[][],
    width: number,
    hashStone: (a: number, b: number) => number,
    smoothstepJS: (edge0: number, edge1: number, x: number) => number,
  ) {
    if (waypoints.length < 2) return;

    // Compute cumulative arc length along the polyline
    const arcLengths = [0];
    for (let i = 1; i < waypoints.length; i++) {
      const dx = waypoints[i][0] - waypoints[i - 1][0];
      const dz = waypoints[i][1] - waypoints[i - 1][1];
      arcLengths.push(arcLengths[i - 1] + Math.sqrt(dx * dx + dz * dz));
    }
    const totalLen = arcLengths[arcLengths.length - 1];

    // Interpolate position and tangent at a given distance along the path
    const sampleAt = (dist: number): { x: number; z: number; tx: number; tz: number } => {
      dist = Math.max(0, Math.min(totalLen, dist));
      let seg = 0;
      for (let i = 1; i < arcLengths.length; i++) {
        if (arcLengths[i] >= dist) { seg = i - 1; break; }
      }
      const segLen = arcLengths[seg + 1] - arcLengths[seg];
      const t = segLen > 0 ? (dist - arcLengths[seg]) / segLen : 0;
      const x = waypoints[seg][0] + (waypoints[seg + 1][0] - waypoints[seg][0]) * t;
      const z = waypoints[seg][1] + (waypoints[seg + 1][1] - waypoints[seg][1]) * t;
      const tx = waypoints[seg + 1][0] - waypoints[seg][0];
      const tz = waypoints[seg + 1][1] - waypoints[seg][1];
      const tLen = Math.sqrt(tx * tx + tz * tz) || 1;
      return { x, z, tx: tx / tLen, tz: tz / tLen };
    };

    // Build mesh: rows along the path, columns across the width
    const segsL = Math.max(30, Math.floor(totalLen * 4));
    const segsW = Math.max(12, Math.floor(width * 8));
    const rows = segsL + 1;
    const cols = segsW + 1;
    const vtxCount = rows * cols;

    const positions = new Float32Array(vtxCount * 3);
    const colors = new Float32Array(vtxCount * 3);

    for (let r = 0; r < rows; r++) {
      const dist = (r / segsL) * totalLen;
      const { x: cx, z: cz, tx, tz } = sampleAt(dist);
      // Normal (perpendicular to tangent in XZ plane)
      const nx = -tz;
      const nz = tx;

      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const across = ((c / segsW) - 0.5) * width; // -width/2 to +width/2

        const wx = cx + nx * across;
        const wz = cz + nz * across;

        // Cobblestone pattern (same as straight paths)
        const stoneScale = 3.2;
        const gx = across * stoneScale;
        const gy = dist * stoneScale;
        const row = Math.floor(gy);
        const adjX = gx + (row % 2) * 0.5;
        const cellX = adjX - Math.floor(adjX) - 0.5;
        const cellY = gy - Math.floor(gy) - 0.5;
        const distToCenter = Math.sqrt(cellX * cellX + cellY * cellY);

        const stoneShape = smoothstepJS(0.48, 0.32, distToCenter);
        let h = stoneShape * 0.06;

        const stoneID_x = Math.floor(adjX);
        const stoneID_y = Math.floor(gy);
        const stoneRand = hashStone(stoneID_x, stoneID_y);
        h += stoneRand * 0.025;

        // Color
        const colorVar = hashStone(stoneID_x + 50, stoneID_y + 80);
        const colorVar2 = hashStone(stoneID_x + 120, stoneID_y + 30);
        let cr = 0.40 + colorVar * 0.18;
        let cg = 0.33 + colorVar * 0.14;
        let cb = 0.22 + colorVar2 * 0.10;
        const groutDarken = stoneShape * 0.4 + 0.6;
        cr *= groutDarken;
        cg *= groutDarken;
        cb *= groutDarken;
        if (stoneShape < 0.3 && colorVar2 > 0.6) {
          cg += 0.06;
          cr -= 0.03;
        }

        // Edge fade
        const edgeDist = Math.abs(across) / (width / 2);
        if (edgeDist > 0.75) {
          const fade = (edgeDist - 0.75) / 0.25;
          const f = fade * fade;
          cr = cr * (1 - f) + 0.22 * f;
          cg = cg * (1 - f) + 0.40 * f;
          cb = cb * (1 - f) + 0.12 * f;
          h *= (1 - f);
        }

        positions[idx * 3] = wx;
        positions[idx * 3 + 1] = 0.28 + h;
        positions[idx * 3 + 2] = wz;
        colors[idx * 3] = cr;
        colors[idx * 3 + 1] = cg;
        colors[idx * 3 + 2] = cb;
      }
    }

    // Build index buffer (two triangles per quad)
    const indices: number[] = [];
    for (let r = 0; r < segsL; r++) {
      for (let c = 0; c < segsW; c++) {
        const a = r * cols + c;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        indices.push(a, d, b, b, d, e);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
    }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  // Collision radius for the fountain base (used by LocalPlayer)
  public static readonly FOUNTAIN_RADIUS = 3.6;

  private buildFountainPlaza() {
    // Load tree-house GLB as center tree
    {
      const loader = getGLTFLoader();
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
    }
  }

  private buildShop() {
    const pos = this.shopPosition;

    {
      const loader = getGLTFLoader();
      loader.load('/models/medieval_shop.glb', (gltf) => {
        const model = gltf.scene;
        model.name = 'shop-stall';

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        downscaleTextures(model);

        // Scale to match center tree height (~20m)
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = 20 / Math.max(size.y, 0.01);
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
    }
  }

  private buildPvPArena(batcher: StaticBatcher) {
    const pos = this.pvpArenaPosition;

    // Arena walls (colosseum-style arc)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x887766, roughness: 0.75 });

    // Back curved wall - hoisted geometry, instanced
    const pillarGeo = new THREE.CylinderGeometry(0.5, 0.6, 6, 8);
    for (let i = -3; i <= 3; i++) {
      const angle = (i / 3) * 0.8;
      const px = pos.x + Math.sin(angle) * 6;
      const pz = pos.z - Math.cos(angle) * 6;
      const pillar = new THREE.Mesh(pillarGeo, wallMat);
      pillar.position.set(px, 3, pz);
      pillar.castShadow = true;
      batcher.addInstanceable('pvp-pillar', pillar);
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
    batcher.addMergeable(gateLeft);
    this.colliders.push({ x: pos.x - 1.5, z: pos.z + 5, r: 0.4 });

    const gateRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), gateMat);
    gateRight.position.set(pos.x + 1.5, 2, pos.z + 5);
    gateRight.castShadow = true;
    batcher.addMergeable(gateRight);
    this.colliders.push({ x: pos.x + 1.5, z: pos.z + 5, r: 0.4 });

    const gateTop = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 0.6), gateMat);
    gateTop.position.set(pos.x, 4.3, pos.z + 5);
    batcher.addMergeable(gateTop);

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
    {
      const loader = getGLTFLoader();
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
    }

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
      {
        const loader = getGLTFLoader();
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
      }
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
    const npcs: { name: string; position: THREE.Vector3; color: number; dialog: string[]; isScout?: boolean; isBattlemaster?: boolean; isElder?: boolean }[] = [
    ];

    for (const npc of npcs) {
      if (npc.isScout) {
        this.createScoutMesh(npc.name, npc.position);
      } else if (npc.isBattlemaster) {
        this.createBattlemasterMesh(npc.name, npc.position);
      } else if (npc.isElder) {
        this.createElderMesh(npc.name, npc.position);
      } else {
        this.createNPCMesh(npc.name, npc.position, npc.color);
      }
      const npcId = npc.name.toLowerCase().replace(/\s+/g, '_');
      this.npcPositions.push({
        name: npc.name,
        npcId,
        position: npc.position,
        dialog: npc.dialog,
      });
      this.colliders.push({ x: npc.position.x, z: npc.position.z, r: 0.5 });
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
    {
      const loader = getGLTFLoader();
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
    }
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
    {
      const loader = getGLTFLoader();
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
    }
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
    {
      const loader = getGLTFLoader();
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
    }
  }

  private buildDecorations(batcher: StaticBatcher) {
    // Lanterns — strategically placed around the hub
    const lanternPositions = [
      // Spawn boundary corners (4 symmetrical, at distance ~12)
      [8.5, 8.5], [-8.5, 8.5], [8.5, -8.5], [-8.5, -8.5],
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
      this.createLantern(x, z, batcher);
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
    {
      const loader = getGLTFLoader();
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
    }
  }

  private createLantern(x: number, z: number, batcher: StaticBatcher) {
    const idx = this.brazierIndex++;

    // Load pillar GLB once, clone for each lantern
    this.getPilarModel(({ scene, yOffset }) => {
      const model = scene.clone();
      model.position.set(x, yOffset, z);
      this.group.add(model);
    });

    // Bowl (open-top brazier) - shared material for batching
    const bowlOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.18, 0.3, 8),
      this.bowlOuterMat,
    );
    bowlOuter.position.set(x, 1.55, z);
    batcher.addMergeable(bowlOuter);

    // Inner dark cavity - shared material for batching
    const bowlInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.14, 0.18, 8),
      this.bowlInnerMat,
    );
    bowlInner.position.set(x, 1.58, z);
    batcher.addMergeable(bowlInner);

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

  private buildRocks(batcher: StaticBatcher) {
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
      return false;
    };

    const isBlocked = (x: number, z: number): boolean => {
      const d = Math.sqrt(x * x + z * z);
      if (d < 13) return true; // fountain/plaza + spawn area
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
      batcher.addMergeable(rock);

      // Register collision - use size * scaleXZ as radius
      this.colliders.push({ x: cfg.x, z: cfg.z, r: cfg.size * cfg.scaleXZ });
    }
  }

  private buildRiver() {
    // Curved river along the eastern side of the hub world
    const waypoints = [
      [35, -55], [42, -30], [48, -5], [45, 20], [38, 45], [28, 58],
    ];
    const width = 6;

    // Cumulative arc length
    const arcLengths = [0];
    for (let i = 1; i < waypoints.length; i++) {
      const dx = waypoints[i][0] - waypoints[i - 1][0];
      const dz = waypoints[i][1] - waypoints[i - 1][1];
      arcLengths.push(arcLengths[i - 1] + Math.sqrt(dx * dx + dz * dz));
    }
    const totalLen = arcLengths[arcLengths.length - 1];

    const sampleAt = (dist: number) => {
      dist = Math.max(0, Math.min(totalLen, dist));
      let seg = 0;
      for (let i = 1; i < arcLengths.length; i++) {
        if (arcLengths[i] >= dist) { seg = i - 1; break; }
      }
      const segLen = arcLengths[seg + 1] - arcLengths[seg];
      const t = segLen > 0 ? (dist - arcLengths[seg]) / segLen : 0;
      const x = waypoints[seg][0] + (waypoints[seg + 1][0] - waypoints[seg][0]) * t;
      const z = waypoints[seg][1] + (waypoints[seg + 1][1] - waypoints[seg][1]) * t;
      const tx = waypoints[seg + 1][0] - waypoints[seg][0];
      const tz = waypoints[seg + 1][1] - waypoints[seg][1];
      const tLen = Math.sqrt(tx * tx + tz * tz) || 1;
      return { x, z, tx: tx / tLen, tz: tz / tLen };
    };

    const segsL = Math.max(50, Math.floor(totalLen * 2));
    const segsW = 20;
    const rows = segsL + 1;
    const cols = segsW + 1;
    const vtxCount = rows * cols;

    const positions = new Float32Array(vtxCount * 3);
    const uvs = new Float32Array(vtxCount * 2);

    for (let r = 0; r < rows; r++) {
      const dist = (r / segsL) * totalLen;
      const { x: cx, z: cz, tx, tz } = sampleAt(dist);
      const perpX = -tz;
      const perpZ = tx;
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const across = ((c / segsW) - 0.5) * width;
        const wx = cx + perpX * across;
        const wz = cz + perpZ * across;
        const ripple = Math.sin(wx * 0.5 + wz * 0.4) * 0.04 + Math.cos(wz * 0.6 - wx * 0.3) * 0.03;
        positions[idx * 3] = wx;
        positions[idx * 3 + 1] = ripple;
        positions[idx * 3 + 2] = wz;
        uvs[idx * 2] = c / segsW;
        uvs[idx * 2 + 1] = dist / width;
      }
    }

    const indexCount = segsL * segsW * 6;
    const indexArr = new Uint32Array(indexCount);
    let ii = 0;
    for (let r = 0; r < segsL; r++) {
      for (let c = 0; c < segsW; c++) {
        const tl = r * cols + c;
        const tr = tl + 1;
        const bl = tl + cols;
        const br = bl + 1;
        indexArr[ii++] = tl; indexArr[ii++] = bl; indexArr[ii++] = tr;
        indexArr[ii++] = tr; indexArr[ii++] = bl; indexArr[ii++] = br;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indexArr, 1));
    geo.computeVertexNormals();

    // Procedural canvas texture for flowing water
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1a4878';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 18; i++) {
      const y = (i / 18) * 256;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 256; x += 3) {
        ctx.lineTo(x, y + Math.sin(x * 0.06 + i * 0.9) * 7 + Math.sin(x * 0.14 + i * 1.5) * 3);
      }
      ctx.strokeStyle = `rgba(70, 140, 210, ${0.18 + Math.sin(i * 0.7) * 0.06})`;
      ctx.lineWidth = 1.2 + Math.sin(i * 1.1) * 0.4;
      ctx.stroke();
    }
    for (let i = 0; i < 30; i++) {
      const sx = (Math.sin(i * 3.1) * 0.5 + 0.5) * 256;
      const sy = (Math.cos(i * 2.3) * 0.5 + 0.5) * 256;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12);
      sg.addColorStop(0, 'rgba(180, 230, 255, 0.22)');
      sg.addColorStop(1, 'rgba(180, 230, 255, 0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - 12, sy - 12, 24, 24);
    }
    const waterTex = new THREE.CanvasTexture(canvas);
    waterTex.wrapS = THREE.RepeatWrapping;
    waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.repeat.set(1.5, 4);

    const waterMat = new THREE.MeshStandardMaterial({
      map: waterTex,
      color: 0x2878c0,
      roughness: 0.08,
      metalness: 0.4,
      transparent: true,
      opacity: 0.85,
    });

    this.riverMesh = new THREE.Mesh(geo, waterMat);
    this.riverMesh.name = 'river';
    this.riverMesh.position.y = 0.07;
    this.riverMesh.receiveShadow = true;
    this.group.add(this.riverMesh); // Animated — direct add, not batcher

    // Sandy riverbanks on both sides
    const bankMat = new THREE.MeshStandardMaterial({ color: 0x7a6a48, roughness: 0.95, metalness: 0 });
    for (const side of [-1, 1] as const) {
      const bankW = 2.0;
      const bCols = Math.floor(bankW * 4) + 1;
      const bVtxCount = rows * bCols;
      const bPositions = new Float32Array(bVtxCount * 3);
      for (let r = 0; r < rows; r++) {
        const dist = (r / segsL) * totalLen;
        const { x: cx, z: cz, tx: btx, tz: btz } = sampleAt(dist);
        const bpx = -btz;
        const bpz = btx;
        for (let c = 0; c < bCols; c++) {
          const idx = r * bCols + c;
          const bankAcross = side * (width / 2) + side * (c / (bCols - 1)) * bankW;
          bPositions[idx * 3] = cx + bpx * bankAcross;
          bPositions[idx * 3 + 1] = (c / (bCols - 1)) * 0.3;
          bPositions[idx * 3 + 2] = cz + bpz * bankAcross;
        }
      }
      const bIdxCount = segsL * (bCols - 1) * 6;
      const bIndices = new Uint32Array(bIdxCount);
      let bi = 0;
      for (let r = 0; r < segsL; r++) {
        for (let c = 0; c < bCols - 1; c++) {
          const tl = r * bCols + c;
          const tr = tl + 1;
          const bl = tl + bCols;
          const br = bl + 1;
          bIndices[bi++] = tl; bIndices[bi++] = bl; bIndices[bi++] = tr;
          bIndices[bi++] = tr; bIndices[bi++] = bl; bIndices[bi++] = br;
        }
      }
      const bankGeo = new THREE.BufferGeometry();
      bankGeo.setAttribute('position', new THREE.BufferAttribute(bPositions, 3));
      bankGeo.setIndex(new THREE.BufferAttribute(bIndices, 1));
      bankGeo.computeVertexNormals();
      const bankMesh = new THREE.Mesh(bankGeo, bankMat);
      bankMesh.receiveShadow = true;
      this.group.add(bankMesh);
    }

    // River glow removed for performance (emissive water material is sufficient)
  }

  private buildLighting() {
    // Soft ambient base
    const ambient = new THREE.AmbientLight(0x3a4a5a, 0.3);
    this.group.add(ambient);

    // Main sun - warm golden hour light
    const sun = new THREE.DirectionalLight(0xffecd2, 1.5);
    sun.position.set(25, 40, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
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
    // Skip expensive animations for distant objects
    const px = playerPos?.x ?? 0;
    const pz = playerPos?.z ?? 0;

    // ── Fire brazier animations ────────────────────────────────────
    for (let i = 0; i < this.brazierIndex; i++) {
      // Distance cull: skip flame animation if brazier is far from player
      const firstFlame = this.getAnimObj(`brazier-flame-${i}-0`);
      if (firstFlame) {
        const dx = firstFlame.userData.baseX - px;
        const dz = firstFlame.userData.baseZ - pz;
        if (dx * dx + dz * dz > 900) continue; // >30m away, skip
      }
      // Flame dance — each of the 3 flame cones sways independently
      for (let f = 0; f < 3; f++) {
        const flame = this.getAnimObj(`brazier-flame-${i}-${f}`);
        if (flame) {
          const phase = i * 2.7 + f * 1.3;
          flame.position.x = flame.userData.baseX + Math.sin(time * 4.5 + phase) * 0.04;
          flame.position.z = flame.userData.baseZ + Math.cos(time * 3.8 + phase * 0.7) * 0.03;
          flame.position.y = flame.userData.baseY + Math.sin(time * 7 + phase) * 0.04;
          const flicker = 0.85 + Math.sin(time * 9 + phase) * 0.15;
          flame.scale.set(flicker, 0.7 + Math.sin(time * 6 + phase) * 0.3, flicker);
          const mat = (flame as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.opacity = (0.65 - f * 0.1) + Math.sin(time * 8 + phase) * 0.2;
        }
      }
      // Ember glow pulse
      const embers = this.getAnimObj(`brazier-embers-${i}`);
      if (embers) {
        const mat = (embers as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1.2 + Math.sin(time * 3 + i * 0.8) * 0.5;
      }
    }

        // ── Dragon skeleton entrance animations ─────────────────────────
    // Eye glow pulse + eyeball subtle movement
    for (const side of ['L', 'R']) {
      const phase = side === 'L' ? 0 : 1;
      const eyeLight = this.getAnimObj(`dragon-eye-${side}`);
      if (eyeLight) {
        (eyeLight as THREE.PointLight).intensity = 2.0 + Math.sin(time * 1.5 + phase) * 1.0;
      }
      const eyeOrb = this.getAnimObj(`dragon-eye-orb-${side}`);
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
    const portalDisc = this.getAnimObj('dragon-portal-disc');
    if (portalDisc) {
      portalDisc.rotation.z = time * 0.3;
      const pMat = (portalDisc as THREE.Mesh).material as THREE.MeshBasicMaterial;
      pMat.opacity = 0.6 + Math.sin(time * 0.8) * 0.2;
    }
    const portalSwirl = this.getAnimObj('dragon-portal-swirl');
    if (portalSwirl) {
      portalSwirl.rotation.z = -time * 0.6;
      const sMat = (portalSwirl as THREE.Mesh).material as THREE.MeshBasicMaterial;
      sMat.opacity = 0.2 + Math.sin(time * 1.2 + 1.0) * 0.15;
    }
    const portalLight = this.getAnimObj('dragon-portal-light');
    if (portalLight) {
      (portalLight as THREE.PointLight).intensity = 3.0 + Math.sin(time * 1.0) * 1.5;
    }

    // Mist drifting from the maw
    for (let i = 0; i < 5; i++) {
      const mist = this.getAnimObj(`dragon-mist-${i}`);
      if (mist) {
        mist.position.x += Math.sin(time * 0.3 + i * 1.5) * 0.002;
        mist.position.y += Math.cos(time * 0.2 + i * 0.8) * 0.001;
        const mMat = (mist as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mMat.opacity = 0.06 + Math.sin(time * 0.5 + i * 1.2) * 0.04;
      }
    }

    // Inner skull glow pulse
    const innerGlow = this.getAnimObj('dragon-inner-glow');
    if (innerGlow) {
      (innerGlow as THREE.PointLight).intensity = 1.5 + Math.sin(time * 0.8) * 0.6;
    }

    // Bone dust particle drift
    for (let i = 0; i < 12; i++) {
      const dust = this.getAnimObj(`dragon-dust-${i}`);
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
      const fog = this.getAnimObj(`dragon-cave-fog-${i}`);
      if (fog) {
        const fMat = (fog as THREE.Mesh).material as THREE.MeshBasicMaterial;
        fMat.opacity = (0.12 - i * 0.03) + Math.sin(time * 0.3 + i * 1.5) * 0.04;
      }
    }

    // Hanging sinew strips gentle sway
    for (const wSide of ['L', 'R']) {
      for (let s = 0; s < 5; s++) {
        const strip = this.getAnimObj(`dragon-strip-${wSide}-${s}`);
        if (strip) {
          strip.rotation.z = Math.sin(time * 0.4 + s * 1.2 + (wSide === 'L' ? 0 : 2)) * 0.08;
          strip.rotation.x = Math.sin(time * 0.3 + s * 0.9) * 0.05;
        }
      }
    }

    // ── River flow ────────────────────────────────────────────────
    if (this.riverMesh) {
      const rMat = this.riverMesh.material as THREE.MeshStandardMaterial;
      if (rMat.map) rMat.map.offset.y -= 0.004;
    }

  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
  }
}

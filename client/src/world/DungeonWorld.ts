import * as THREE from 'three';

/**
 * Procedural dark forest dungeon environment.
 * Creates a moody, enclosed arena with trees, rocks, fog, and atmospheric lighting.
 */
export class DungeonWorld {
  public group: THREE.Group;

  private scene: THREE.Scene;
  private wisps: THREE.Mesh[] = [];
  private spores: THREE.Sprite[] = [];
  private ambientLight!: THREE.AmbientLight;
  private moonLight!: THREE.DirectionalLight;
  private wispLights: THREE.PointLight[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'dungeon-world';

    this.buildGround();
    this.buildTrees();
    this.buildRocks();
    this.buildLighting();
    this.buildSpores();

    scene.add(this.group);
  }

  // ─── Ground ───────────────────────────────────────────────────────
  private buildGround() {
    const groundGeo = new THREE.CircleGeometry(40, 64);

    // Vertex-colored dark forest floor: mulch, moss, dirt
    const count = groundGeo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = groundGeo.attributes.position.getX(i);
      const z = groundGeo.attributes.position.getY(i); // circle is XY before rotation
      const noise = Math.sin(x * 0.7 + 1.3) * Math.cos(z * 0.5 + 0.7) * 0.5 + 0.5;
      const noise2 = Math.sin(x * 2.3 + z * 1.9) * 0.5 + 0.5;
      // Dark browns and greens — mossy forest floor
      const r = 0.06 + noise * 0.06 + noise2 * 0.03;
      const g = 0.08 + noise * 0.07 + noise2 * 0.04;
      const b = 0.04 + noise * 0.03;
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const groundMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Soft dark edge ring
    const edgeGeo = new THREE.RingGeometry(34, 40, 48);
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x050a05,
      roughness: 0.98,
      transparent: true,
      opacity: 0.7,
    });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.01;
    this.group.add(edge);
  }

  // ─── Trees (ring around the arena) ────────────────────────────────
  private buildTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1a0e08, roughness: 0.95 });
    const leafMatDark = new THREE.MeshStandardMaterial({ color: 0x0a2a0a, roughness: 0.9 });
    const leafMatMid = new THREE.MeshStandardMaterial({ color: 0x0e3510, roughness: 0.9 });

    const treeCount = 18;
    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const radius = 22 + Math.random() * 10;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const height = 5 + Math.random() * 4;
      const trunkRadius = 0.25 + Math.random() * 0.2;

      // Trunk
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(trunkRadius * 0.6, trunkRadius, height, 6),
        trunkMat,
      );
      trunk.position.set(x, height / 2, z);
      trunk.castShadow = true;
      this.group.add(trunk);

      // Canopy — 2-3 overlapping spheres for organic look
      const leafMat = Math.random() > 0.5 ? leafMatDark : leafMatMid;
      const canopyCount = 2 + Math.floor(Math.random() * 2);
      for (let c = 0; c < canopyCount; c++) {
        const canopyR = 1.8 + Math.random() * 1.5;
        const canopy = new THREE.Mesh(
          new THREE.SphereGeometry(canopyR, 8, 6),
          leafMat,
        );
        canopy.position.set(
          x + (Math.random() - 0.5) * 1.5,
          height + canopyR * 0.4 + c * 0.5,
          z + (Math.random() - 0.5) * 1.5,
        );
        canopy.castShadow = true;
        this.group.add(canopy);
      }

      // Exposed roots at base
      const rootMat = new THREE.MeshStandardMaterial({ color: 0x150c06, roughness: 0.95 });
      for (let r = 0; r < 3; r++) {
        const rootAngle = angle + (r - 1) * 0.6;
        const root = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.12, 1.5, 4),
          rootMat,
        );
        root.position.set(
          x + Math.cos(rootAngle) * 0.6,
          0.3,
          z + Math.sin(rootAngle) * 0.6,
        );
        root.rotation.z = (Math.random() - 0.5) * 0.6;
        this.group.add(root);
      }
    }
  }

  // ─── Rocks / Boulders ─────────────────────────────────────────────
  private buildRocks() {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.92 });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x1a3a1a, roughness: 0.9 });

    // Border rocks (near tree line)
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 18 + Math.random() * 6;
      const size = 0.4 + Math.random() * 0.8;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(size, 0),
        Math.random() > 0.4 ? rockMat : mossMat,
      );
      rock.position.set(
        Math.cos(angle) * radius,
        size * 0.4,
        Math.sin(angle) * radius,
      );
      rock.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
      rock.castShadow = true;
      this.group.add(rock);
    }

    // A few arena rocks (near center area for cover)
    const arenaRockPositions = [
      { x: -5, z: -3, s: 0.7 },
      { x: 6, z: 2, s: 0.5 },
      { x: 2, z: 7, s: 0.6 },
    ];
    for (const rp of arenaRockPositions) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rp.s, 1),
        mossMat,
      );
      rock.position.set(rp.x, rp.s * 0.4, rp.z);
      rock.rotation.set(0.3, Math.random() * Math.PI, 0.2);
      rock.castShadow = true;
      this.group.add(rock);
    }
  }

  // ─── Lighting (dark & mystical) ───────────────────────────────────
  private buildLighting() {
    // Dim ambient — dark blue-green
    this.ambientLight = new THREE.AmbientLight(0x0a1a15, 0.4);
    this.group.add(this.ambientLight);

    // Moonlight — pale blue directional from above
    this.moonLight = new THREE.DirectionalLight(0x4466aa, 0.5);
    this.moonLight.position.set(5, 30, -10);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.width = 1024;
    this.moonLight.shadow.mapSize.height = 1024;
    this.moonLight.shadow.camera.near = 1;
    this.moonLight.shadow.camera.far = 80;
    this.moonLight.shadow.camera.left = -30;
    this.moonLight.shadow.camera.right = 30;
    this.moonLight.shadow.camera.top = 30;
    this.moonLight.shadow.camera.bottom = -30;
    this.moonLight.shadow.bias = -0.001;
    this.group.add(this.moonLight);
    this.group.add(this.moonLight.target);

    // Will-o'-wisps — floating point lights
    const wispColors = [0x22cc88, 0x44aaff, 0x88ff44];
    const wispPositions = [
      new THREE.Vector3(-8, 2.5, -6),
      new THREE.Vector3(7, 3, 4),
      new THREE.Vector3(-3, 2, 8),
    ];
    const wispMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8 });

    for (let i = 0; i < 3; i++) {
      // Glowing orb mesh
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        wispMat.clone(),
      );
      (orb.material as THREE.MeshBasicMaterial).color.setHex(wispColors[i]);
      orb.position.copy(wispPositions[i]);
      orb.userData.basePos = wispPositions[i].clone();
      orb.userData.speed = 0.3 + Math.random() * 0.4;
      orb.userData.phase = Math.random() * Math.PI * 2;
      this.group.add(orb);
      this.wisps.push(orb);

      // Accompanying point light
      const light = new THREE.PointLight(wispColors[i], 1.5, 12);
      light.position.copy(wispPositions[i]);
      this.group.add(light);
      this.wispLights.push(light);
    }
  }

  // ─── Floating spores / particles ──────────────────────────────────
  private buildSpores() {
    const sporeTexture = this.createSporeTexture();

    for (let i = 0; i < 10; i++) {
      const mat = new THREE.SpriteMaterial({
        map: sporeTexture,
        transparent: true,
        opacity: 0.3 + Math.random() * 0.3,
        color: Math.random() > 0.5 ? 0xaaffaa : 0xccffdd,
      });
      const sprite = new THREE.Sprite(mat);
      const scale = 0.15 + Math.random() * 0.2;
      sprite.scale.set(scale, scale, 1);
      sprite.position.set(
        (Math.random() - 0.5) * 30,
        1 + Math.random() * 4,
        (Math.random() - 0.5) * 30,
      );
      sprite.userData.baseX = sprite.position.x;
      sprite.userData.baseY = sprite.position.y;
      sprite.userData.baseZ = sprite.position.z;
      sprite.userData.speed = 0.1 + Math.random() * 0.2;
      sprite.userData.phase = Math.random() * Math.PI * 2;
      this.group.add(sprite);
      this.spores.push(sprite);
    }
  }

  private createSporeTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(200,255,200,1)');
    gradient.addColorStop(0.4, 'rgba(150,255,150,0.5)');
    gradient.addColorStop(1, 'rgba(100,200,100,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  // ─── Floor variation ──────────────────────────────────────────────
  setFloor(floorIndex: number, totalFloors: number, floorName: string, isBossFloor: boolean) {
    if (isBossFloor) {
      // Reddish fog for boss
      this.scene.fog = new THREE.FogExp2(0x1a0a0a, 0.04);
      this.ambientLight.color.setHex(0x1a0a0a);
      this.ambientLight.intensity = 0.3;
      this.moonLight.color.setHex(0x884444);
      this.moonLight.intensity = 0.6;
      // Shift wisp colors to red/orange
      this.wisps.forEach((w, i) => {
        (w.material as THREE.MeshBasicMaterial).color.setHex(0xff4422);
        this.wispLights[i].color.setHex(0xff4422);
        this.wispLights[i].intensity = 2.0;
      });
    } else {
      // Gradual intensity shift per floor — deeper = darker
      const progress = totalFloors > 1 ? floorIndex / (totalFloors - 1) : 0;
      const fogDensity = 0.03 + progress * 0.015;
      this.scene.fog = new THREE.FogExp2(0x0a1a0a, fogDensity);
      this.ambientLight.color.setHex(0x0a1a15);
      this.ambientLight.intensity = 0.4 - progress * 0.1;
      this.moonLight.color.setHex(0x4466aa);
      this.moonLight.intensity = 0.5 - progress * 0.15;
      // Reset wisp colors
      const wispColors = [0x22cc88, 0x44aaff, 0x88ff44];
      this.wisps.forEach((w, i) => {
        (w.material as THREE.MeshBasicMaterial).color.setHex(wispColors[i]);
        this.wispLights[i].color.setHex(wispColors[i]);
        this.wispLights[i].intensity = 1.5;
      });
    }
  }

  // ─── Boss telegraph (red circle on ground) ──────────────────────
  showTelegraph(x: number, z: number, radius: number, duration: number) {
    const geo = new THREE.CircleGeometry(radius, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const circle = new THREE.Mesh(geo, mat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(x, 0.05, z);
    this.group.add(circle);

    // Animate opacity up
    const startTime = performance.now();
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed >= duration) {
        this.group.remove(circle);
        geo.dispose();
        mat.dispose();
        return;
      }
      mat.opacity = Math.min(0.4, (elapsed / duration) * 0.6);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  // ─── Boss enrage visual ────────────────────────────────────────
  setBossEnrage(phase: number) {
    if (phase >= 2) {
      // Phase 3: intense red + wisps turn red
      this.scene.fog = new THREE.FogExp2(0x1a0505, 0.045);
      this.ambientLight.color.setHex(0x1a0505);
      this.ambientLight.intensity = 0.25;
      this.moonLight.color.setHex(0xaa2222);
      this.moonLight.intensity = 0.7;
      this.wisps.forEach((w, i) => {
        (w.material as THREE.MeshBasicMaterial).color.setHex(0xff2200);
        this.wispLights[i].color.setHex(0xff2200);
        this.wispLights[i].intensity = 2.5;
      });
    } else if (phase >= 1) {
      // Phase 2: dark reddish-brown
      this.scene.fog = new THREE.FogExp2(0x1a0a08, 0.04);
      this.ambientLight.color.setHex(0x1a0a08);
      this.ambientLight.intensity = 0.3;
      this.moonLight.color.setHex(0x886644);
      this.moonLight.intensity = 0.6;
      this.wisps.forEach((w, i) => {
        (w.material as THREE.MeshBasicMaterial).color.setHex(0xff6622);
        this.wispLights[i].color.setHex(0xff6622);
        this.wispLights[i].intensity = 2.0;
      });
    }
  }

  // ─── Animation loop ───────────────────────────────────────────────
  update(time: number) {
    // Will-o'-wisps float gently
    for (let i = 0; i < this.wisps.length; i++) {
      const wisp = this.wisps[i];
      const base = wisp.userData.basePos as THREE.Vector3;
      const speed = wisp.userData.speed as number;
      const phase = wisp.userData.phase as number;
      wisp.position.x = base.x + Math.sin(time * speed + phase) * 2;
      wisp.position.y = base.y + Math.sin(time * speed * 1.3 + phase + 1) * 0.8;
      wisp.position.z = base.z + Math.cos(time * speed * 0.7 + phase + 2) * 2;
      // Pulse opacity
      (wisp.material as THREE.MeshBasicMaterial).opacity =
        0.5 + Math.sin(time * 2 + phase) * 0.3;
      // Sync light
      this.wispLights[i].position.copy(wisp.position);
      this.wispLights[i].intensity = 1.2 + Math.sin(time * 2 + phase) * 0.6;
    }

    // Spores drift lazily
    for (const spore of this.spores) {
      const speed = spore.userData.speed as number;
      const phase = spore.userData.phase as number;
      spore.position.x = spore.userData.baseX + Math.sin(time * speed + phase) * 1.5;
      spore.position.y = spore.userData.baseY + Math.sin(time * speed * 0.6 + phase + 1) * 0.5;
      spore.position.z = spore.userData.baseZ + Math.cos(time * speed * 0.8 + phase + 2) * 1.5;
      (spore.material as THREE.SpriteMaterial).opacity =
        0.2 + Math.sin(time * 1.5 + phase) * 0.15;
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────
  dispose(scene: THREE.Scene) {
    // Traverse and dispose all geometries/materials
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
      if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    });
    scene.remove(this.group);
    this.wisps = [];
    this.spores = [];
    this.wispLights = [];
  }
}

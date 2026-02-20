import * as THREE from 'three';

function easeOutQuart(t: number) { return 1 - Math.pow(1 - t, 4); }

const FALL_END = 0.25;
const IMPACT = 0.255;
const KNEE_HOLD = 0.55;
const RISE_END = 0.85;
const TOTAL_DURATION = 4.0;

/**
 * Drop-from-sky spawn effect with shockwave, dust, ground cracks & impact light.
 * Attaches to the player's scene and drives position.y for the duration.
 */
export class DropSpawnEffect {
  public group: THREE.Group;
  public alive = true;
  /** While true the player should not be controllable */
  public active = true;
  /** Y offset to apply to the player mesh */
  public yOffset = 12;

  private time = 0;
  private landed = false;
  private impactTime = 0;

  // Sub-objects
  private impactLight: THREE.PointLight;
  private shockwave!: THREE.Mesh;
  private shockMat!: THREE.MeshBasicMaterial;
  private dust!: THREE.Points;
  private dustMat!: THREE.PointsMaterial;
  private dustVel!: Float32Array;
  private trail!: THREE.Points;
  private trailMat!: THREE.PointsMaterial;
  private cracks: THREE.Mesh[] = [];
  private aura: THREE.Mesh;
  private auraMat: THREE.MeshBasicMaterial;

  constructor(private scene: THREE.Scene, private color = 0x00c8ff) {
    this.group = new THREE.Group();
    this.group.name = 'drop-spawn-fx';
    scene.add(this.group);

    // Impact light
    this.impactLight = new THREE.PointLight(color, 0, 12, 2);
    this.impactLight.position.y = 0.5;
    this.group.add(this.impactLight);

    // Aura around player
    this.auraMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 16), this.auraMat);
    this.aura.position.y = 1;
    this.group.add(this.aura);

    this.createDustRing();
    this.createShockwave();
    this.createGroundCracks();
    this.createTrail();
  }

  private createDustRing() {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.2 + Math.random() * 0.3;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.05;
      pos[i * 3 + 2] = Math.sin(a) * r;
      const speed = 2 + Math.random() * 3;
      vel[i * 3] = Math.cos(a) * speed;
      vel[i * 3 + 1] = 0.5 + Math.random() * 2;
      vel[i * 3 + 2] = Math.sin(a) * speed;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustVel = vel;
    this.dustMat = new THREE.PointsMaterial({
      color: 0x887766, size: 0.08, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.dust = new THREE.Points(geo, this.dustMat);
    this.group.add(this.dust);
  }

  private createShockwave() {
    this.shockMat = new THREE.MeshBasicMaterial({
      color: this.color, transparent: true, opacity: 0,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.shockwave = new THREE.Mesh(new THREE.RingGeometry(0.01, 0.08, 64), this.shockMat);
    this.shockwave.rotation.x = -Math.PI / 2;
    this.shockwave.position.y = 0.04;
    this.group.add(this.shockwave);
  }

  private createGroundCracks() {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const len = 0.8 + Math.random() * 1.2;
      const crack = new THREE.Mesh(
        new THREE.PlaneGeometry(0.03, len),
        new THREE.MeshBasicMaterial({
          color: this.color, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      crack.rotation.x = -Math.PI / 2;
      crack.rotation.z = angle;
      crack.position.set(Math.cos(angle) * len * 0.5, 0.02, Math.sin(angle) * len * 0.5);
      this.cracks.push(crack);
      this.group.add(crack);
    }
  }

  private createTrail() {
    const count = 60;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.4;
      pos[i * 3 + 1] = 5 + Math.random() * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.trailMat = new THREE.PointsMaterial({
      color: this.color, size: 0.04, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.trail = new THREE.Points(geo, this.trailMat);
    this.group.add(this.trail);
  }

  /** Call every frame. Updates yOffset. */
  update(dt: number) {
    if (!this.alive) return;

    this.time += dt;
    const t = this.time / TOTAL_DURATION;

    if (t < FALL_END) {
      // Falling
      const fp = t / FALL_END;
      this.yOffset = 12 - (12 - 0) * fp * fp;

      // Trail particles fall
      this.trailMat.opacity = (1 - fp) * 0.7;
      const tp = this.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < tp.count; i++) (tp.array as Float32Array)[i * 3 + 1] -= dt * (8 + Math.random() * 4);
      tp.needsUpdate = true;

      // Aura glow
      this.auraMat.opacity = 0.15;
      this.aura.scale.setScalar(1.2 + Math.sin(this.time * 15) * 0.1);

    } else if (t < IMPACT) {
      // Impact frame
      if (!this.landed) { this.landed = true; this.impactTime = this.time; }
      this.yOffset = 0;

    } else if (t < KNEE_HOLD) {
      // Kneeling hold
      this.yOffset = 0;

    } else if (t < RISE_END) {
      // Rising
      this.yOffset = 0;
      const rp = easeOutQuart((t - KNEE_HOLD) / (RISE_END - KNEE_HOLD));
      // Aura pulse during rise
      const glow = Math.sin(rp * Math.PI);
      this.auraMat.opacity = glow * 0.2;
      this.aura.scale.setScalar(1 + glow * 0.5);

    } else {
      // Done
      this.yOffset = 0;
      this.active = false;
      this.auraMat.opacity *= 0.9;
      if (this.auraMat.opacity < 0.01) this.alive = false;
    }

    // Impact effects
    if (this.landed) {
      const ia = this.time - this.impactTime;

      // Shockwave
      if (ia < 1.0) {
        const sp = ia / 1.0;
        this.shockwave.scale.setScalar(1 + easeOutQuart(sp) * 10);
        this.shockMat.opacity = (1 - sp) * 0.7;
      }

      // Dust
      if (ia < 1.5) {
        const dp = ia / 1.5;
        this.dustMat.opacity = (1 - dp) * 0.6;
        const dPos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = dPos.array as Float32Array;
        for (let i = 0; i < dPos.count; i++) {
          const decay = 1 - dp;
          arr[i * 3] += this.dustVel[i * 3] * dt * decay;
          arr[i * 3 + 1] += this.dustVel[i * 3 + 1] * dt * decay - dt * 2 * dp;
          arr[i * 3 + 2] += this.dustVel[i * 3 + 2] * dt * decay;
          if (arr[i * 3 + 1] < 0.02) arr[i * 3 + 1] = 0.02;
        }
        dPos.needsUpdate = true;
      }

      // Ground cracks
      if (ia < 0.8) {
        const cp = easeOutQuart(ia / 0.8);
        for (const c of this.cracks) {
          (c.material as THREE.MeshBasicMaterial).opacity = (1 - ia / 2) * 0.8;
          c.scale.y = cp;
        }
      } else {
        for (const c of this.cracks) {
          (c.material as THREE.MeshBasicMaterial).opacity *= 0.98;
        }
      }

      // Impact light
      this.impactLight.intensity = ia < 0.5 ? (1 - ia / 0.5) * 5 : this.impactLight.intensity * 0.95;
      this.trailMat.opacity *= 0.95;
    }
  }

  /** Move the effect group to follow the player XZ position */
  setPosition(x: number, z: number) {
    this.group.position.set(x, 0, z);
  }

  dispose() {
    this.group.traverse((c) => {
      if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
      const mat = (c as THREE.Mesh).material;
      if (mat) {
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else (mat as THREE.Material).dispose();
      }
    });
    this.scene.remove(this.group);
  }
}

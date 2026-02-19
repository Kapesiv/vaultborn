import * as THREE from 'three';

export class SceneManager {
  public scene: THREE.Scene;

  constructor() {
    this.scene = new THREE.Scene();
    // Atmospheric fog - dark to match night sky
    this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.008);
    this.setupSkybox();
  }

  private setupSkybox() {
    // Load fantasy sky GLB
    import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      const loader = new GLTFLoader();
      loader.load('/models/sky.glb', (gltf) => {
        const sky = gltf.scene;
        sky.name = 'sky';

        // Scale to fit inside camera far plane (~90 to stay within 100-150 range)
        const box = new THREE.Box3().setFromObject(sky);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 150 / Math.max(maxDim, 0.01);
        sky.scale.setScalar(scale);

        // Make sky visible from inside
        sky.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            child.frustumCulled = false;
            const mesh = child as THREE.Mesh;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              mat.depthWrite = false;
              mat.side = THREE.DoubleSide;
              mat.fog = false; // sky ignores fog
              // Boost emissive so panorama is bright without scene lights
              if ('emissive' in mat) {
                (mat as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xffffff);
                (mat as THREE.MeshStandardMaterial).emissiveIntensity = 1.0;
              }
            }
          }
        });

        // Render before everything else
        sky.renderOrder = -1;

        this.scene.add(sky);
        console.log(`[SceneManager] Sky panorama loaded, scale: ${scale.toFixed(2)}, size:`, size.toArray().map(v => v.toFixed(1)));
      }, undefined, (err) => {
        console.error('[SceneManager] Failed to load sky GLB, falling back to procedural:', err);
        this.setupProceduralSky();
      });
    });
  }

  private setupProceduralSky() {
    const skyGeo = new THREE.SphereGeometry(500, 48, 24);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x050510) },
        midColor: { value: new THREE.Color(0x0a0a2a) },
        horizonColor: { value: new THREE.Color(0x1a1a3a) },
        bottomColor: { value: new THREE.Color(0x0a0a1a) },
        sunColor: { value: new THREE.Color(0x8888ff) },
        sunDir: { value: new THREE.Vector3(0.4, 0.55, 0.25).normalize() },
        offset: { value: 10 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform vec3 sunColor;
        uniform vec3 sunDir;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;

        void main() {
          vec3 dir = normalize(vWorldPosition + offset);
          float h = dir.y;

          vec3 color;
          if (h > 0.15) {
            float t = pow((h - 0.15) / 0.85, exponent);
            color = mix(midColor, topColor, t);
          } else if (h > 0.0) {
            float t = h / 0.15;
            color = mix(horizonColor, midColor, t);
          } else {
            float t = pow(clamp(-h, 0.0, 1.0), 0.4);
            color = mix(horizonColor, bottomColor, t);
          }

          float sunDot = max(dot(dir, sunDir), 0.0);
          float sunGlow = pow(sunDot, 32.0) * 0.8;
          float sunHaze = pow(sunDot, 4.0) * 0.15;
          color += sunColor * (sunGlow + sunHaze);

          float cloud = sin(dir.x * 8.0 + dir.z * 6.0) * cos(dir.x * 5.0 - dir.z * 9.0);
          cloud = smoothstep(0.2, 0.8, cloud * 0.5 + 0.5);
          float cloudMask = smoothstep(0.05, 0.4, h) * smoothstep(0.8, 0.3, h);
          color = mix(color, vec3(1.0, 1.0, 1.0), cloud * cloudMask * 0.08);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
  }

  // Clear all world objects (keep sky)
  clearWorld() {
    const toRemove: THREE.Object3D[] = [];
    this.scene.children.forEach(child => {
      if (child.name === 'hub-world' || child.name === 'dungeon-world') {
        toRemove.push(child);
      }
    });
    toRemove.forEach(obj => this.scene.remove(obj));
  }
}

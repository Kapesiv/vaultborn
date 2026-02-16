import * as THREE from 'three';

export class SceneManager {
  public scene: THREE.Scene;

  constructor() {
    this.scene = new THREE.Scene();
    // Atmospheric fog - matches horizon color for seamless blend
    this.scene.fog = new THREE.FogExp2(0xa8c4d8, 0.012);
    this.setupSkybox();
  }

  private setupSkybox() {
    // Realistic gradient sky with warm horizon
    const skyGeo = new THREE.SphereGeometry(500, 48, 24);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x1a3a6a) },    // deep blue zenith
        midColor: { value: new THREE.Color(0x6ca6d4) },    // clear sky blue
        horizonColor: { value: new THREE.Color(0xd4e4f0) }, // pale horizon
        bottomColor: { value: new THREE.Color(0xa8c4d8) },  // matches fog
        sunColor: { value: new THREE.Color(0xfff0d0) },     // sun glow
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

          // Sky gradient
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

          // Sun glow
          float sunDot = max(dot(dir, sunDir), 0.0);
          float sunGlow = pow(sunDot, 32.0) * 0.8;
          float sunHaze = pow(sunDot, 4.0) * 0.15;
          color += sunColor * (sunGlow + sunHaze);

          // Subtle clouds hint via noise
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

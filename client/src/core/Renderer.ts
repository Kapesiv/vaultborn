import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

// Custom vignette + color grading shader
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    darkness: { value: 0.4 },
    offset: { value: 1.2 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float darkness;
    uniform float offset;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vig = clamp(1.0 - dot(uv, uv), 0.0, 1.0);
      texel.rgb *= mix(1.0 - darkness, 1.0, vig);
      gl_FragColor = texel;
    }
  `,
};

export class Renderer {
  public renderer: THREE.WebGLRenderer;
  public composer: EffectComposer;
  private renderPass!: RenderPass;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false }); // SMAA handles AA
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.composer = new EffectComposer(this.renderer);

    window.addEventListener('resize', () => this.onResize());
  }

  setupPostProcessing(scene: THREE.Scene, camera: THREE.Camera) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // 1) Render scene
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // 2) Bloom - subtle glow on bright areas (emissive lights, portals, etc.)
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.35,  // strength - subtle
      0.6,   // radius
      0.7,   // threshold - only bright things bloom
    );
    this.composer.addPass(bloomPass);

    // 3) SMAA anti-aliasing (better than FXAA, works without MSAA)
    const smaaPass = new SMAAPass(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
    this.composer.addPass(smaaPass);

    // 4) Vignette
    const vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(vignettePass);

    // 5) Gamma correction (final output)
    const gammaPass = new ShaderPass(GammaCorrectionShader);
    this.composer.addPass(gammaPass);
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  render(_scene: THREE.Scene, _camera: THREE.Camera) {
    this.composer.render();
  }
}

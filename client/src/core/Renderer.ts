import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { quality } from './QualityProfile.js';

export class Renderer {
  public renderer: THREE.WebGLRenderer;
  public composer: EffectComposer;
  private renderPass!: RenderPass;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality.shadowType === 'pcfsoft'
      ? THREE.PCFSoftShadowMap
      : THREE.BasicShadowMap;
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

    // 2) Bloom — PC only
    if (quality.bloom) {
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        0.3,   // strength
        0.5,   // radius
        0.75,  // threshold
      );
      this.composer.addPass(bloomPass);
    }

    // 3) SMAA — PC only
    if (quality.smaa) {
      const pr = this.renderer.getPixelRatio();
      const smaaPass = new SMAAPass(w * pr, h * pr);
      this.composer.addPass(smaaPass);
    }
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

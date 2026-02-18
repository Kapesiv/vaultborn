import * as THREE from 'three';
import { lerpNumber } from '@saab/shared';
import { CharacterController } from './CharacterController.js';
import { characterLoader } from './CharacterLoader.js';
import type { Gender } from './LocalPlayer.js';

export class RemotePlayer {
  public mesh: THREE.Group;
  public nameSprite: THREE.Sprite;
  public targetPosition = new THREE.Vector3();
  public targetRotation = 0;
  public animation = 'idle';

  private prevPosition = new THREE.Vector3();
  private controller: CharacterController;

  constructor(scene: THREE.Scene, public id: string, public name: string, gender: Gender = 'male') {
    this.controller = new CharacterController();
    this.mesh = this.controller.group;

    this.nameSprite = this.createNameTag(name);
    this.mesh.add(this.nameSprite);

    scene.add(this.mesh);

    this.loadModel();
  }

  private async loadModel() {
    try {
      const { scene: model, animations } = await characterLoader.getClone('/models/player.glb');

      try {
        const walkClips = await characterLoader.loadAnimationClips('/models/walk.glb');
        for (const clip of walkClips) {
          clip.name = 'walk';
          this.stripRootDrift(clip);
          animations.push(clip);
        }
      } catch { /* walk anim optional */ }

      this.controller.attachModel(model, animations);
    } catch (err) {
      console.error(`[RemotePlayer:${this.id}] Failed to load model:`, err);
    }
  }

  /** Remove linear drift from root bone position, keeping oscillation. */
  private stripRootDrift(clip: THREE.AnimationClip): void {
    for (const track of clip.tracks) {
      const isRootPos = /hips?\.position/i.test(track.name)
        || /root\.position/i.test(track.name);
      if (!isRootPos) continue;

      const values = track.values;
      const stride = 3;
      const n = values.length / stride;
      if (n < 2) continue;

      for (let axis = 0; axis < stride; axis++) {
        const first = values[axis];
        const last = values[(n - 1) * stride + axis];
        const drift = last - first;
        for (let i = 0; i < n; i++) {
          values[i * stride + axis] -= drift * (i / (n - 1));
        }
      }
    }
  }

  private createNameTag(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(name, 128, 40);
    ctx.fillText(name, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.y = 2.2;
    sprite.scale.set(2, 0.5, 1);
    return sprite;
  }

  update(dt: number, _time: number) {
    // Smooth interpolation to server position
    const t = Math.min(1, dt * 10);
    this.mesh.position.x = lerpNumber(this.mesh.position.x, this.targetPosition.x, t);
    this.mesh.position.y = lerpNumber(this.mesh.position.y, this.targetPosition.y, t);
    this.mesh.position.z = lerpNumber(this.mesh.position.z, this.targetPosition.z, t);
    this.mesh.rotation.y = lerpNumber(this.mesh.rotation.y, this.targetRotation, t);

    // Detect movement from position deltas
    const dx = this.mesh.position.x - this.prevPosition.x;
    const dz = this.mesh.position.z - this.prevPosition.z;
    const isMoving = Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001;
    this.prevPosition.copy(this.mesh.position);

    // Animation state transitions via CharacterController
    this.controller.transitionTo(isMoving ? 'walk' : 'idle');
    this.controller.update(dt);
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}

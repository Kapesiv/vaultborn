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

    // Load character model — try player.fbx, fall back to erika.fbx
    this.loadModel(id);
  }

  private async loadModel(id: string) {
    const urls = ['/models/player.fbx', '/models/erika.fbx'];
    for (const url of urls) {
      try {
        const { scene: model, animations } = await characterLoader.getClone(url);
        this.controller.attachModel(model, animations);
        return;
      } catch (err) {
        console.error(`[RemotePlayer:${id}] Failed ${url}:`, err);
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

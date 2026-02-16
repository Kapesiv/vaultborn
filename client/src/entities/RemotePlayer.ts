import * as THREE from 'three';
import { lerpNumber } from '@saab/shared';

export class RemotePlayer {
  public mesh: THREE.Group;
  public nameSprite: THREE.Sprite;
  public targetPosition = new THREE.Vector3();
  public targetRotation = 0;

  constructor(scene: THREE.Scene, public id: string, public name: string) {
    this.mesh = this.createPlayerMesh(0xff4444);
    this.nameSprite = this.createNameTag(name);
    this.mesh.add(this.nameSprite);
    scene.add(this.mesh);
  }

  private createPlayerMesh(color: number): THREE.Group {
    const group = new THREE.Group();

    const bodyGeo = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.0;
    body.castShadow = true;
    group.add(body);

    const headGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.7 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.0;
    head.castShadow = true;
    group.add(head);

    const noseGeo = new THREE.ConeGeometry(0.1, 0.2, 4);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xff6644 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, 2.0, -0.35);
    nose.rotation.x = -Math.PI / 2;
    group.add(nose);

    return group;
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
    sprite.position.y = 2.8;
    sprite.scale.set(2, 0.5, 1);
    return sprite;
  }

  update(dt: number) {
    // Smooth interpolation to server position
    const t = Math.min(1, dt * 10);
    this.mesh.position.x = lerpNumber(this.mesh.position.x, this.targetPosition.x, t);
    this.mesh.position.y = lerpNumber(this.mesh.position.y, this.targetPosition.y, t);
    this.mesh.position.z = lerpNumber(this.mesh.position.z, this.targetPosition.z, t);
    this.mesh.rotation.y = lerpNumber(this.mesh.rotation.y, this.targetRotation, t);
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}

import * as THREE from 'three';
import { lerpNumber } from '@saab/shared';
import { buildCaveCharacter, type Gender, type ClothRefs } from './CharacterBuilder.js';

export class RemotePlayer {
  public mesh: THREE.Group;
  public nameSprite: THREE.Sprite;
  public targetPosition = new THREE.Vector3();
  public targetRotation = 0;
  public animation = 'idle';

  private clothRefs: ClothRefs;
  private prevPosition = new THREE.Vector3();

  constructor(scene: THREE.Scene, public id: string, public name: string, gender: Gender = 'male') {
    const result = buildCaveCharacter(gender);
    this.mesh = result.group;
    this.clothRefs = result.clothRefs;

    this.nameSprite = this.createNameTag(name);
    this.mesh.add(this.nameSprite);

    scene.add(this.mesh);
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

  update(dt: number, time: number) {
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

    // Limb animations
    const leftLeg = this.mesh.getObjectByName('leftLeg');
    const rightLeg = this.mesh.getObjectByName('rightLeg');
    const leftArm = this.mesh.getObjectByName('leftArm');
    const rightArm = this.mesh.getObjectByName('rightArm');

    if (isMoving) {
      const swing = Math.sin(time * 10) * 0.5;
      if (leftLeg) leftLeg.rotation.x = swing;
      if (rightLeg) rightLeg.rotation.x = -swing;
      if (leftArm) leftArm.rotation.x = -swing * 0.5;
      if (rightArm) rightArm.rotation.x = swing * 0.5;
    } else {
      const breathe = Math.sin(time * 2) * 0.02;
      if (leftLeg) leftLeg.rotation.x = 0;
      if (rightLeg) rightLeg.rotation.x = 0;
      if (leftArm) leftArm.rotation.x = breathe;
      if (rightArm) rightArm.rotation.x = -breathe;
    }

    // Cloth simulation
    const windStr = isMoving ? 0.18 : 0.025;

    // Tunic skirt flutter
    if (this.clothRefs.tunicGeo && this.clothRefs.tunicOrigPos) {
      const pos = this.clothRefs.tunicGeo.attributes.position;
      const orig = this.clothRefs.tunicOrigPos;
      const halfH = 0.3;
      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3], oy = orig[i * 3 + 1], oz = orig[i * 3 + 2];
        const tw = Math.max(0, (halfH - oy) / (halfH * 2));
        const w = tw * tw;
        const dist = Math.sqrt(ox * ox + oz * oz);
        if (dist > 0.01) {
          const radial = Math.sin(time * 7 + oy * 5 + Math.atan2(oz, ox) * 3) * w * windStr;
          pos.setX(i, ox + (ox / dist) * radial);
          pos.setZ(i, oz + (oz / dist) * radial);
        }
      }
      pos.needsUpdate = true;
      this.clothRefs.tunicGeo.computeVertexNormals();
    }

    // Cloak billow
    if (this.clothRefs.cloakGeo && this.clothRefs.cloakOrigPos) {
      const pos = this.clothRefs.cloakGeo.attributes.position;
      const orig = this.clothRefs.cloakOrigPos;
      const halfH = 0.8;
      const cloakWind = isMoving ? 0.28 : 0.035;
      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3], oy = orig[i * 3 + 1], oz = orig[i * 3 + 2];
        const tw = Math.max(0, (halfH - oy) / (halfH * 2));
        const w = tw * tw;
        const wave1 = Math.sin(time * 6 + oy * 4.5 + ox * 2.5) * w * cloakWind;
        const wave2 = Math.sin(time * 8.5 + oy * 6 + ox * 1.5) * w * cloakWind * 0.4;
        const lateralWave = Math.sin(time * 4.5 + oy * 3 + ox * 5) * w * cloakWind * 0.3;
        const pushBack = isMoving ? w * 0.12 : 0;
        pos.setX(i, ox + lateralWave);
        pos.setZ(i, oz + wave1 + wave2 + pushBack);
      }
      pos.needsUpdate = true;
      this.clothRefs.cloakGeo.computeVertexNormals();
    }

    // Hood rim flutter
    if (this.clothRefs.hoodGeo && this.clothRefs.hoodOrigPos) {
      const pos = this.clothRefs.hoodGeo.attributes.position;
      const orig = this.clothRefs.hoodOrigPos;
      const hoodWind = windStr * 0.6;
      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3], oy = orig[i * 3 + 1], oz = orig[i * 3 + 2];
        const rimWeight = Math.max(0, (0.05 - oy) / 0.25);
        if (rimWeight > 0) {
          const w = rimWeight * rimWeight;
          pos.setX(i, ox + Math.sin(time * 5.5 + ox * 5 + oz * 3) * w * hoodWind);
          pos.setZ(i, oz + Math.sin(time * 6.5 + oz * 4) * w * hoodWind);
        }
      }
      pos.needsUpdate = true;
      this.clothRefs.hoodGeo.computeVertexNormals();
    }
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}

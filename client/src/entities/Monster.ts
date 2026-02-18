import * as THREE from 'three';
import { lerpNumber, MONSTER_DEFS } from '@saab/shared';

export class MonsterEntity {
  public mesh: THREE.Group;
  public targetPosition = new THREE.Vector3();
  public targetRotation = 0;
  public hp = 0;
  public maxHp = 0;
  private hpBar: THREE.Mesh;

  constructor(scene: THREE.Scene, public id: string, public defId: string) {
    const def = MONSTER_DEFS[defId];
    this.mesh = this.createMonsterMesh(defId);
    this.hpBar = this.createHpBar();
    this.mesh.add(this.hpBar);
    scene.add(this.mesh);
    this.hp = def?.hp || 100;
    this.maxHp = def?.hp || 100;
  }

  setBossPhase(phase: number) {
    if (phase <= 0) return;
    const body = this.mesh.children[0] as THREE.Mesh;
    if (!body) return;
    const mat = body.material as THREE.MeshStandardMaterial;
    if (phase >= 2) {
      mat.emissive.setHex(0xff2200);
      mat.emissiveIntensity = 0.4;
    } else if (phase >= 1) {
      mat.emissive.setHex(0x884422);
      mat.emissiveIntensity = 0.25;
    }
  }

  private createMonsterMesh(defId: string): THREE.Group {
    const group = new THREE.Group();
    let color = 0x884422;
    let scale = 1;

    if (defId === 'forest_wolf') {
      color = 0x666666;
      scale = 0.8;
    } else if (defId === 'forest_spider') {
      color = 0x333333;
      scale = 0.6;
    } else if (defId === 'forest_treant') {
      color = 0x2d5a1e;
      scale = 2.0;
    } else if (defId === 'forest_shaman') {
      color = 0x446644;
      scale = 0.9;
    } else if (defId === 'forest_sapling') {
      color = 0x3d7a2e;
      scale = 0.5;
    }

    // Body (box for now - placeholder)
    const bodyGeo = new THREE.BoxGeometry(1 * scale, 0.8 * scale, 1.5 * scale);
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5 * scale;
    body.castShadow = true;
    group.add(body);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.08 * scale, 6, 6);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.2 * scale, 0.8 * scale, -0.7 * scale);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.2 * scale, 0.8 * scale, -0.7 * scale);
    group.add(rightEye);

    return group;
  }

  private createHpBar(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(1.2, 0.12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    const bar = new THREE.Mesh(geo, mat);
    bar.position.y = 2;
    return bar;
  }

  update(dt: number) {
    const t = Math.min(1, dt * 10);
    this.mesh.position.x = lerpNumber(this.mesh.position.x, this.targetPosition.x, t);
    this.mesh.position.y = lerpNumber(this.mesh.position.y, this.targetPosition.y, t);
    this.mesh.position.z = lerpNumber(this.mesh.position.z, this.targetPosition.z, t);
    this.mesh.rotation.y = lerpNumber(this.mesh.rotation.y, this.targetRotation, t);

    // Update HP bar
    const ratio = Math.max(0, this.hp / this.maxHp);
    this.hpBar.scale.x = ratio;
    (this.hpBar.material as THREE.MeshBasicMaterial).color.setHex(
      ratio > 0.5 ? 0x00ff00 : ratio > 0.25 ? 0xffff00 : 0xff0000
    );
    this.hpBar.visible = this.hp > 0 && this.hp < this.maxHp;

    // Hide dead monsters
    this.mesh.visible = this.hp > 0;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}

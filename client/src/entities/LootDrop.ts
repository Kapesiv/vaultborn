import * as THREE from 'three';
import { RARITY_COLORS } from '@saab/shared';

export class LootDropEntity {
  public mesh: THREE.Mesh;
  private time = 0;
  private baseY: number;

  constructor(
    scene: THREE.Scene,
    public id: string,
    public itemDefId: string,
    public rarity: string,
    x: number, y: number, z: number,
  ) {
    const colorHex = RARITY_COLORS[rarity] || '#ffffff';
    const color = new THREE.Color(colorHex);

    const geo = new THREE.OctahedronGeometry(0.3);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.5,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(x, y + 0.5, z);
    this.mesh.castShadow = true;
    this.baseY = y + 0.5;
    scene.add(this.mesh);
  }

  update(dt: number) {
    this.time += dt;
    // Bob up and down + rotate
    this.mesh.position.y = this.baseY + Math.sin(this.time * 2) * 0.2;
    this.mesh.rotation.y += dt * 2;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}

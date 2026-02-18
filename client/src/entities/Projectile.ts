import * as THREE from 'three';

export class ProjectileEntity {
  public mesh: THREE.Mesh;
  public light: THREE.PointLight;
  public velocity: THREE.Vector3;

  constructor(
    scene: THREE.Scene,
    public id: string,
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    type: string,
  ) {
    const color = type === 'nature_bolt' ? 0x44ff44 : 0xff8800;

    const geo = new THREE.SphereGeometry(0.2, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(x, y, z);

    this.light = new THREE.PointLight(color, 2, 6);
    this.light.position.set(x, y, z);

    this.velocity = new THREE.Vector3(vx, vy, vz);

    scene.add(this.mesh);
    scene.add(this.light);
  }

  update(dt: number) {
    this.mesh.position.x += this.velocity.x * dt;
    this.mesh.position.y += this.velocity.y * dt;
    this.mesh.position.z += this.velocity.z * dt;
    this.light.position.copy(this.mesh.position);
  }

  dispose(scene: THREE.Scene) {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.MeshBasicMaterial).dispose();
    scene.remove(this.mesh);
    scene.remove(this.light);
  }
}

import * as THREE from 'three';

export class CameraController {
  public camera: THREE.PerspectiveCamera;

  private offsetRight = 1.2;
  private offsetUp = 2.5;
  private offsetBack = 6;

  private pitch = 0.3;
  private yaw = 0;
  private lockedPitch = 0.3;

  // Y = toggle free look
  private freeLook = false;
  private freePitchMin = -0.6;
  private freePitchMax = 1.2;

  private currentPos = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  private smoothSpeed = 8;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 4, 8);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyY') {
        this.freeLook = !this.freeLook;
        if (!this.freeLook) {
          // Snap back to locked pitch
          this.pitch = this.lockedPitch;
        }
      }
    });
  }

  onMouseMove(dx: number, dy: number) {
    this.yaw -= dx * 0.003;
    if (this.freeLook) {
      this.pitch -= dy * 0.003;
      this.pitch = Math.max(this.freePitchMin, Math.min(this.freePitchMax, this.pitch));
    }
    // Locked mode: pitch stays fixed
  }

  getYaw(): number {
    return this.yaw;
  }

  isFreeLook(): boolean {
    return this.freeLook;
  }

  update(targetPos: THREE.Vector3, dt?: number) {
    const t = dt ? Math.min(1, this.smoothSpeed * dt) : 1;

    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);

    const backX = sinYaw * cosPitch * this.offsetBack;
    const backY = sinPitch * this.offsetBack + this.offsetUp;
    const backZ = cosYaw * cosPitch * this.offsetBack;

    const rightX = Math.cos(this.yaw) * this.offsetRight;
    const rightZ = -Math.sin(this.yaw) * this.offsetRight;

    const desiredX = targetPos.x + backX + rightX;
    const desiredY = targetPos.y + backY;
    const desiredZ = targetPos.z + backZ + rightZ;

    this.currentPos.x += (desiredX - this.currentPos.x) * t;
    this.currentPos.y += (desiredY - this.currentPos.y) * t;
    this.currentPos.z += (desiredZ - this.currentPos.z) * t;

    this.camera.position.copy(this.currentPos);

    const lookAtX = targetPos.x - sinYaw * 2;
    const lookAtY = targetPos.y + 1.5;
    const lookAtZ = targetPos.z - cosYaw * 2;

    this.currentLookAt.x += (lookAtX - this.currentLookAt.x) * t;
    this.currentLookAt.y += (lookAtY - this.currentLookAt.y) * t;
    this.currentLookAt.z += (lookAtZ - this.currentLookAt.z) * t;

    this.camera.lookAt(this.currentLookAt);
  }
}

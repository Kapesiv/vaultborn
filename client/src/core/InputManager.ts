import type { PlayerInput } from '@saab/shared';

export class InputManager {
  private keys = new Map<string, boolean>();
  private mouseLocked = false;
  private mouseDx = 0;
  private mouseDy = 0;
  private attackQueued: string | null = null;
  private jumpQueued = false;
  private seq = 0;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.set(e.code, true);
      // Space = jump
      if (e.code === 'Space') {
        e.preventDefault();
        this.jumpQueued = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.set(e.code, false);
    });

    // Right-click to lock pointer (for camera look)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.mouseLocked) {
        canvas.requestPointerLock();
        return;
      }
      // Mouse1 (left click) = attack
      if (e.button === 0) {
        this.attackQueued = 'basic';
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.mouseLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (this.mouseLocked) {
        this.mouseDx += e.movementX;
        this.mouseDy += e.movementY;
      }
    });
  }

  isKey(code: string): boolean {
    return this.keys.get(code) || false;
  }

  consumeMouse(): { dx: number; dy: number } {
    const result = { dx: this.mouseDx, dy: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return result;
  }

  getInput(rotation: number, dt: number): PlayerInput {
    const input: PlayerInput = {
      seq: this.seq++,
      forward: this.isKey('KeyW'),
      backward: this.isKey('KeyS'),
      left: this.isKey('KeyA'),
      right: this.isKey('KeyD'),
      jump: this.jumpQueued,
      rotation,
      dt,
    };

    if (this.attackQueued) {
      input.attack = this.attackQueued;
      this.attackQueued = null;
    }

    this.jumpQueued = false;

    return input;
  }

  isPointerLocked(): boolean {
    return this.mouseLocked;
  }
}

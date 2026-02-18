import type { PlayerInput } from '@saab/shared';
import { skillManager } from '../systems/SkillManager.js';
import { MobileTouchControls } from '../MobileTouchControls.js';

export class InputManager {
  private keys = new Map<string, boolean>();
  private mouseLocked = false;
  private mouseDx = 0;
  private mouseDy = 0;
  private attackQueued: string | null = null;
  private skillQueued: number | null = null; // hotbar slot 0-3
  private jumpQueued = false;
  private potionQueued = false;
  private seq = 0;
  private touch: MobileTouchControls;

  constructor(canvas: HTMLCanvasElement) {
    this.touch = new MobileTouchControls();
    this.touch.onAttack = () => { this.attackQueued = 'basic'; };
    window.addEventListener('keydown', (e) => {
      this.keys.set(e.code, true);
      // Space = jump
      if (e.code === 'Space') {
        e.preventDefault();
        this.jumpQueued = true;
      }
      // Skill hotkeys 1-4
      if (e.code === 'Digit1') this.skillQueued = 0;
      if (e.code === 'Digit2') this.skillQueued = 1;
      if (e.code === 'Digit3') this.skillQueued = 2;
      if (e.code === 'Digit4') this.skillQueued = 3;
      if (e.code === 'Digit5' || e.code === 'KeyH') this.potionQueued = true;
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
    if (this.keys.get(code)) return true;
    // Merge touch joystick into key checks
    if (this.touch.isActive()) {
      const t = this.touch.getInput();
      if (code === 'KeyW' && t.forward) return true;
      if (code === 'KeyS' && t.backward) return true;
      if (code === 'KeyA' && t.left) return true;
      if (code === 'KeyD' && t.right) return true;
    }
    return false;
  }

  isMoving(): boolean {
    return this.isKey('KeyW') || this.isKey('KeyS') || this.isKey('KeyA') || this.isKey('KeyD');
  }

  consumeMouse(): { dx: number; dy: number } {
    const result = { dx: this.mouseDx, dy: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return result;
  }

  getInput(rotation: number, dt: number): PlayerInput {
    // Touch joystick merges with keyboard
    const touchInput = this.touch.isActive() ? this.touch.getInput() : null;
    const input: PlayerInput = {
      seq: this.seq++,
      forward: this.isKey('KeyW') || (touchInput?.forward ?? false),
      backward: this.isKey('KeyS') || (touchInput?.backward ?? false),
      left: this.isKey('KeyA') || (touchInput?.left ?? false),
      right: this.isKey('KeyD') || (touchInput?.right ?? false),
      jump: this.jumpQueued,
      rotation,
      dt,
    };

    if (this.attackQueued) {
      input.attack = this.attackQueued;
      this.attackQueued = null;
    }

    // Skill hotkey overrides basic attack
    if (this.skillQueued !== null) {
      const skillId = skillManager.getHotbarSkillId(this.skillQueued);
      if (skillId && !skillManager.isOnCooldown(skillId)) {
        input.attack = skillId;
      }
      this.skillQueued = null;
    }

    this.jumpQueued = false;

    return input;
  }

  consumePotionRequest(): boolean {
    if (this.potionQueued) {
      this.potionQueued = false;
      return true;
    }
    return false;
  }

  isPointerLocked(): boolean {
    return this.mouseLocked;
  }
}

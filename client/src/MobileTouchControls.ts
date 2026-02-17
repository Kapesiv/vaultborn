export interface TouchInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  angle: number;
  force: number;
}

export class MobileTouchControls {
  private container: HTMLElement;
  private joystickBase: HTMLElement;
  private joystickThumb: HTMLElement;
  private attackButton: HTMLElement;

  private isTouchDevice: boolean;
  private activeTouch: number | null = null;
  private baseX: number = 0;
  private baseY: number = 0;
  private thumbX: number = 0;
  private thumbY: number = 0;
  private maxRadius: number = 50;

  private currentInput: TouchInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    angle: 0,
    force: 0,
  };

  public onAttack: (() => void) | null = null;

  constructor() {
    this.isTouchDevice = this.detectTouch();

    this.container = this.createContainer();
    this.joystickBase = this.createJoystickBase();
    this.joystickThumb = this.createJoystickThumb();
    this.attackButton = this.createAttackButton();

    this.joystickBase.appendChild(this.joystickThumb);
    this.container.appendChild(this.joystickBase);
    this.container.appendChild(this.attackButton);

    if (this.isTouchDevice) {
      document.body.appendChild(this.container);
      this.bindEvents();
    }
  }

  private detectTouch(): boolean {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth <= 1024
    );
  }

  private createContainer(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'mobile-touch-controls';
    el.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 1000;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 30px 30px 50px 30px;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    `;
    return el;
  }

  private createJoystickBase(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'joystick-base';
    el.style.cssText = `
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: radial-gradient(circle at 40% 40%,
        rgba(255, 255, 255, 0.12),
        rgba(255, 255, 255, 0.04));
      border: 2px solid rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      position: relative;
      pointer-events: auto;
      touch-action: none;
      box-shadow:
        0 0 30px rgba(0, 0, 0, 0.3),
        inset 0 0 20px rgba(255, 255, 255, 0.03);
      transition: border-color 0.2s ease;
    `;
    return el;
  }

  private createJoystickThumb(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'joystick-thumb';
    el.style.cssText = `
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%,
        rgba(200, 180, 140, 0.9),
        rgba(160, 130, 90, 0.7));
      border: 2px solid rgba(255, 255, 255, 0.25);
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      box-shadow:
        0 4px 15px rgba(0, 0, 0, 0.4),
        0 0 10px rgba(200, 180, 140, 0.2);
      transition: box-shadow 0.15s ease;
      touch-action: none;
    `;
    return el;
  }

  private createAttackButton(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'attack-button';
    el.style.cssText = `
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: radial-gradient(circle at 40% 35%,
        rgba(180, 60, 60, 0.85),
        rgba(120, 30, 30, 0.7));
      border: 2px solid rgba(255, 100, 100, 0.3);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      touch-action: none;
      box-shadow:
        0 0 25px rgba(180, 60, 60, 0.2),
        inset 0 0 15px rgba(255, 255, 255, 0.05);
      font-family: serif;
      font-size: 28px;
      color: rgba(255, 220, 200, 0.9);
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
      transition: transform 0.1s ease, box-shadow 0.1s ease;
    `;
    el.textContent = '\u2694';
    return el;
  }

  private bindEvents(): void {
    this.joystickBase.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    document.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });

    this.attackButton.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.attackButton.style.transform = 'scale(0.9)';
      this.attackButton.style.boxShadow = `
        0 0 35px rgba(255, 80, 80, 0.4),
        inset 0 0 20px rgba(255, 255, 255, 0.1)
      `;
      if (this.onAttack) this.onAttack();
    }, { passive: false });

    this.attackButton.addEventListener('touchend', () => {
      this.attackButton.style.transform = 'scale(1)';
      this.attackButton.style.boxShadow = `
        0 0 25px rgba(180, 60, 60, 0.2),
        inset 0 0 15px rgba(255, 255, 255, 0.05)
      `;
    });

    window.addEventListener('resize', () => {
      this.isTouchDevice = this.detectTouch();
      this.container.style.display = this.isTouchDevice ? 'flex' : 'none';
    });
  }

  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (this.activeTouch !== null) return;

    const touch = e.changedTouches[0];
    this.activeTouch = touch.identifier;

    const rect = this.joystickBase.getBoundingClientRect();
    this.baseX = rect.left + rect.width / 2;
    this.baseY = rect.top + rect.height / 2;

    this.updateThumbPosition(touch.clientX, touch.clientY);

    this.joystickBase.style.borderColor = 'rgba(200, 180, 140, 0.4)';
    this.joystickThumb.style.boxShadow = `
      0 4px 15px rgba(0, 0, 0, 0.4),
      0 0 20px rgba(200, 180, 140, 0.4)
    `;
  }

  private onTouchMove(e: TouchEvent): void {
    if (this.activeTouch === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.activeTouch) {
        e.preventDefault();
        this.updateThumbPosition(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.activeTouch) {
        this.activeTouch = null;
        this.resetThumb();
        break;
      }
    }
  }

  private updateThumbPosition(touchX: number, touchY: number): void {
    let dx = touchX - this.baseX;
    let dy = touchY - this.baseY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > this.maxRadius) {
      dx = (dx / distance) * this.maxRadius;
      dy = (dy / distance) * this.maxRadius;
    }

    this.thumbX = dx;
    this.thumbY = dy;

    this.joystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    const force = Math.min(distance / this.maxRadius, 1);
    const angle = Math.atan2(-dy, dx);

    const deadzone = 0.2;
    if (force < deadzone) {
      this.currentInput = {
        forward: false, backward: false, left: false, right: false,
        angle: 0, force: 0,
      };
      return;
    }

    const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    this.currentInput = {
      forward: normalizedAngle > Math.PI * 0.25 && normalizedAngle < Math.PI * 0.75,
      backward: normalizedAngle > Math.PI * 1.25 && normalizedAngle < Math.PI * 1.75,
      left: normalizedAngle > Math.PI * 0.75 && normalizedAngle < Math.PI * 1.25,
      right: normalizedAngle < Math.PI * 0.25 || normalizedAngle > Math.PI * 1.75,
      angle: angle,
      force: force,
    };
  }

  private resetThumb(): void {
    this.joystickThumb.style.transform = 'translate(-50%, -50%)';
    this.joystickBase.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    this.joystickThumb.style.boxShadow = `
      0 4px 15px rgba(0, 0, 0, 0.4),
      0 0 10px rgba(200, 180, 140, 0.2)
    `;

    this.currentInput = {
      forward: false, backward: false, left: false, right: false,
      angle: 0, force: 0,
    };
  }

  getInput(): TouchInput {
    return { ...this.currentInput };
  }

  isActive(): boolean {
    return this.isTouchDevice;
  }

  isTouching(): boolean {
    return this.activeTouch !== null;
  }

  destroy(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'flex' : 'none';
  }
}

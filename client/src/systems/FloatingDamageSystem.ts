import * as THREE from 'three';

interface FloatingText {
  sprite: THREE.Sprite;
  velocity: number;
  lifetime: number;
  maxLifetime: number;
}

export class FloatingDamageSystem {
  private scene: THREE.Scene;
  private texts: FloatingText[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(
    worldPos: THREE.Vector3,
    amount: number,
    opts: { isCrit?: boolean; isDodge?: boolean; isHeal?: boolean; dotType?: string } = {},
  ) {
    let text: string;
    let color: string;
    let fontSize: number;

    if (opts.isDodge) {
      text = 'DODGE';
      color = '#888888';
      fontSize = 28;
    } else if (opts.isHeal) {
      text = `+${amount}`;
      color = '#44ff44';
      fontSize = 32;
    } else if (opts.dotType === 'bleed') {
      text = `${amount}`;
      color = '#ff4444';
      fontSize = 24;
    } else if (opts.dotType === 'poison') {
      text = `${amount}`;
      color = '#aa44ff';
      fontSize = 24;
    } else if (opts.isCrit) {
      text = `${amount}!`;
      color = '#ffaa00';
      fontSize = 40;
    } else {
      text = `${amount}`;
      color = '#ffffff';
      fontSize = 28;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText(text, 64, 32);

    // Fill
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);

    const scale = opts.isCrit ? 1.8 : 1.2;
    sprite.scale.set(scale, scale * 0.5, 1);
    sprite.position.copy(worldPos);
    sprite.position.x += (Math.random() - 0.5) * 0.5;
    sprite.position.y += 1.5 + Math.random() * 0.5;

    this.scene.add(sprite);
    this.texts.push({
      sprite,
      velocity: 2,
      lifetime: 0,
      maxLifetime: 1.2,
    });
  }

  update(dt: number) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.lifetime += dt;
      t.sprite.position.y += t.velocity * dt;

      // Fade out in the second half
      const progress = t.lifetime / t.maxLifetime;
      if (progress > 0.5) {
        const fade = 1 - (progress - 0.5) / 0.5;
        t.sprite.material.opacity = fade;
      }

      if (t.lifetime >= t.maxLifetime) {
        t.sprite.material.map?.dispose();
        t.sprite.material.dispose();
        this.scene.remove(t.sprite);
        this.texts.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const t of this.texts) {
      t.sprite.material.map?.dispose();
      t.sprite.material.dispose();
      this.scene.remove(t.sprite);
    }
    this.texts = [];
  }
}

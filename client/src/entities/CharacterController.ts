import * as THREE from 'three';

export type AnimationState = 'idle' | 'walk' | 'attack';

const CROSSFADE_DURATION = 0.2;

/**
 * Encapsulates a GLB character model: root group, AnimationMixer,
 * animation state transitions, and bone-based attachment points.
 *
 * Before the GLB loads, a wireframe capsule placeholder is shown.
 */
export class CharacterController {
  public readonly group = new THREE.Group();

  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private currentState: AnimationState = 'idle';
  private modelLoaded = false;
  private placeholder: THREE.Mesh;
  private model: THREE.Group | null = null;

  /** Weapon attachment bone (cached after first lookup). */
  private weaponBone: THREE.Bone | null = null;
  /** Head bone (cached). */
  private headBone: THREE.Bone | null = null;

  constructor() {
    // Wireframe placeholder visible until GLB loads
    const geo = new THREE.CapsuleGeometry(0.3, 1.2, 4, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x88aaff, wireframe: true });
    this.placeholder = new THREE.Mesh(geo, mat);
    this.placeholder.position.y = 0.9;
    this.group.add(this.placeholder);
  }

  /** Replace placeholder with the real GLB model. */
  attachModel(scene: THREE.Group, animations: THREE.AnimationClip[]): void {
    // Remove placeholder
    this.group.remove(this.placeholder);
    this.placeholder.geometry.dispose();
    (this.placeholder.material as THREE.Material).dispose();

    this.model = scene;

    // Auto-scale FBX models (Mixamo uses cm, we use meters)
    const box = new THREE.Box3().setFromObject(scene);
    const height = box.max.y - box.min.y;
    console.log(`[CharacterController] Raw model height: ${height.toFixed(2)}, box:`, box.min.toArray().map(v => v.toFixed(1)), box.max.toArray().map(v => v.toFixed(1)));
    if (height > 10) {
      // Model is in centimeters — scale to ~1.8m
      const scale = 1.8 / height;
      scene.scale.setScalar(scale);
      console.log(`[CharacterController] Scaled to ${scale.toFixed(4)} (cm -> m)`);
    }

    // Rotate model to face -Z (forward / W direction)
    scene.rotation.y = Math.PI;

    // Log meshes for debugging
    let meshCount = 0;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshCount++;
        const mesh = child as THREE.Mesh;
        console.log(`[CharacterController] Mesh: "${child.name}", visible: ${mesh.visible}, material:`, (mesh.material as THREE.Material).type);
      }
    });
    console.log(`[CharacterController] Total meshes: ${meshCount}`);

    this.group.add(scene);
    this.modelLoaded = true;

    // Setup mixer
    this.mixer = new THREE.AnimationMixer(scene);

    // Map animations by name (case-insensitive lookup)
    for (const clip of animations) {
      const action = this.mixer.clipAction(clip);
      // Normalize common Mixamo names
      const name = this.normalizeAnimName(clip.name);
      this.actions.set(name, action);
      console.log(`[CharacterController] Mapped animation: "${clip.name}" -> "${name}"`);
    }

    // Start idle animation immediately to avoid T-pose
    const idleAction = this.getAction('idle');
    if (idleAction) {
      idleAction.play();
      console.log('[CharacterController] Playing idle animation');
    } else {
      // If no idle, play the first available animation
      const firstAction = this.actions.values().next().value;
      if (firstAction) {
        firstAction.play();
        console.log('[CharacterController] No idle found, playing first available animation');
      }
    }

    // Cache key bones
    this.weaponBone = this.getBone('mixamorigRightHand') ?? this.getBone('RightHand') ?? null;
    this.headBone = this.getBone('mixamorigHead') ?? this.getBone('Head') ?? null;

    // Bring arms down from T-pose — slightly away from body
    this.setRestPose();
  }

  /** Rotate arm bones down from T-pose to a relaxed arms-at-sides pose. */
  private setRestPose(): void {
    // Upper arms: rotate down (Z-axis) so arms hang at sides
    const leftArm = this.getBone('mixamorigLeftArm');
    const rightArm = this.getBone('mixamorigRightArm');

    if (leftArm) {
      leftArm.rotation.z = 1.5;
      leftArm.rotation.x = 0.05;
    }
    if (rightArm) {
      rightArm.rotation.z = -1.5;
      rightArm.rotation.x = 0.05;
    }

    const leftForeArm = this.getBone('mixamorigLeftForeArm');
    const rightForeArm = this.getBone('mixamorigRightForeArm');

    if (leftForeArm) {
      leftForeArm.rotation.z = 0.05;
    }
    if (rightForeArm) {
      rightForeArm.rotation.z = -0.05;
    }
  }

  /** Transition smoothly to a new animation state. */
  transitionTo(state: AnimationState, crossfade = CROSSFADE_DURATION): void {
    if (!this.modelLoaded || state === this.currentState) return;

    const currentAction = this.getAction(this.currentState);
    const nextAction = this.getAction(state);

    if (nextAction) {
      nextAction.reset();
      if (state === 'attack') {
        nextAction.setLoop(THREE.LoopOnce, 1);
        nextAction.clampWhenFinished = true;
      } else {
        nextAction.setLoop(THREE.LoopRepeat, Infinity);
      }
      if (currentAction) {
        currentAction.crossFadeTo(nextAction, crossfade, true);
      }
      nextAction.play();
    }

    this.currentState = state;
  }

  /** Update the animation mixer. */
  update(dt: number): void {
    if (this.mixer) {
      this.mixer.update(dt);
    }
    // If no idle animation, maintain rest pose when idle
    if (this.currentState === 'idle' && !this.getAction('idle')) {
      this.setRestPose();
    }
  }

  /** Attach a mesh to the right-hand bone (weapon socket). */
  attachWeapon(mesh: THREE.Object3D): void {
    if (this.weaponBone) {
      this.weaponBone.add(mesh);
    } else {
      // Fallback: attach to group root
      this.group.add(mesh);
    }
  }

  /** Get the weapon bone for removing old weapons etc. */
  getWeaponSocket(): THREE.Object3D {
    return this.weaponBone ?? this.group;
  }

  /** Attach a mesh to the head bone (helmet). */
  attachToHead(mesh: THREE.Object3D): void {
    if (this.headBone) {
      this.headBone.add(mesh);
    } else {
      this.group.add(mesh);
    }
  }

  /** Find a bone by name (traverses the skeleton). */
  getBone(name: string): THREE.Bone | undefined {
    let found: THREE.Bone | undefined;
    this.group.traverse((child) => {
      if ((child as THREE.Bone).isBone && child.name === name) {
        found = child as THREE.Bone;
      }
    });
    return found;
  }

  /** Listen for when the current (LoopOnce) animation finishes. */
  onAnimationFinished(callback: () => void): void {
    if (!this.mixer) return;
    const handler = (e: { action: THREE.AnimationAction }) => {
      callback();
      this.mixer?.removeEventListener('finished', handler as any);
    };
    this.mixer.addEventListener('finished', handler as any);
  }

  get isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  get animationMixer(): THREE.AnimationMixer | null {
    return this.mixer;
  }

  private getAction(state: AnimationState): THREE.AnimationAction | undefined {
    return this.actions.get(state);
  }

  /** Normalize Mixamo clip names to our state names. */
  private normalizeAnimName(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('idle') || lower.includes('breathing')) return 'idle';
    if (lower.includes('walk') || lower.includes('run') || lower.includes('jog')) return 'walk';
    if (lower.includes('attack') || lower.includes('slash') || lower.includes('swing') || lower.includes('stab')) return 'attack';
    // Return original for unmapped clips
    return name;
  }
}

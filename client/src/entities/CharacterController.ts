import * as THREE from 'three';

export type AnimationState = 'idle' | 'walk' | 'walkBack' | 'run' | 'crouch' | 'attack';

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

  /** Weapon attachment bone - right hand (cached after first lookup). */
  private weaponBone: THREE.Bone | null = null;
  /** Back/spine bone for stowing weapons (cached). */
  private backBone: THREE.Bone | null = null;
  /** Head bone (cached). */
  private headBone: THREE.Bone | null = null;
  /** Whether weapon is currently in hand (true) or stowed on back (false). */
  private weaponDrawn = false;

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

    // Scale model to match NPC height (~2.5m)
    const box = new THREE.Box3().setFromObject(scene);
    const height = box.max.y - box.min.y;
    const TARGET_HEIGHT = 3.0;
    const scale = TARGET_HEIGHT / Math.max(height, 0.01);
    scene.scale.setScalar(scale);
    console.log(`[CharacterController] Raw height: ${height.toFixed(2)}, scaled to ${TARGET_HEIGHT}m (×${scale.toFixed(4)})`);

    // Rotate model to face -Z (forward / W direction)
    scene.rotation.y = Math.PI;

    // Ground the model — shift so feet sit at local Y=0
    scene.updateMatrixWorld(true);
    const groundBox = new THREE.Box3().setFromObject(scene);
    if (groundBox.min.y !== 0) {
      scene.position.y -= groundBox.min.y;
    }

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
      // Strip root motion (position tracks on Hips) so the game's
      // movement system controls position, not the animation
      const name = this.normalizeAnimName(clip.name);
      if (name === 'walk' || name === 'walkBack' || name === 'run' || name === 'attack') {
        this.stripRootMotion(clip);
      } else if (name === 'crouch') {
        this.stripRootMotionKeepY(clip);
      }
      const action = this.mixer.clipAction(clip);
      this.actions.set(name, action);
      console.log(`[CharacterController] Mapped animation: "${clip.name}" -> "${name}" (${clip.tracks.length} tracks)`);
    }

    // Create procedural idle animation if none was loaded
    if (!this.getAction('idle')) {
      const idleClip = this.createProceduralIdle();
      if (idleClip) {
        const action = this.mixer.clipAction(idleClip);
        this.actions.set('idle', action);
        console.log('[CharacterController] Created procedural idle animation');
      }
    }

    // Use loaded walk animation if available, otherwise fall back to procedural
    if (!this.getAction('walk')) {
      const walkClip = this.createProceduralWalk();
      if (walkClip) {
        const walkAction = this.mixer.clipAction(walkClip);
        this.actions.set('walk', walkAction);
        console.log('[CharacterController] Created procedural walk animation (fallback)');
      }
    } else {
      console.log('[CharacterController] Using loaded walk animation');
    }

    // Fallback: if no run animation loaded, use walk at 1.5x speed
    if (!this.getAction('run')) {
      const walkAction = this.getAction('walk');
      if (walkAction) {
        const runClip = walkAction.getClip().clone();
        runClip.name = 'run';
        const runAction = this.mixer.clipAction(runClip);
        runAction.timeScale = 1.5;
        this.actions.set('run', runAction);
        console.log('[CharacterController] Run fallback: using walk at 1.5x speed');
      }
    } else {
      console.log('[CharacterController] Using loaded run animation');
    }

    // Use procedural axe swing only if no attack animation was loaded from FBX
    if (!this.getAction('attack')) {
      const attackClip = this.createProceduralAxeSwing();
      if (attackClip) {
        const attackAction = this.mixer.clipAction(attackClip);
        this.actions.set('attack', attackAction);
        console.log('[CharacterController] Created procedural axe-swing attack (fallback)');
      }
    } else {
      console.log('[CharacterController] Using loaded attack animation from FBX');
    }

    // Crouch fallback — procedural if no FBX loaded
    if (!this.getAction('crouch')) {
      const crouchClip = this.createProceduralCrouch();
      if (crouchClip) {
        const crouchAction = this.mixer.clipAction(crouchClip);
        this.actions.set('crouch', crouchAction);
        console.log('[CharacterController] Created procedural crouch (fallback)');
      }
    } else {
      console.log('[CharacterController] Using loaded crouch animation from FBX');
    }

    // Start idle animation immediately to avoid T-pose
    const idleAction = this.getAction('idle');
    if (idleAction) {
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.play();
      console.log('[CharacterController] Playing idle animation');
    }

    // Cache key bones
    this.weaponBone = this.getBone('mixamorigRightHand') ?? this.getBone('RightHand') ?? null;
    this.backBone = this.getBone('mixamorigSpine2') ?? this.getBone('mixamorigSpine1') ?? this.getBone('Spine2') ?? null;
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
      leftArm.rotation.set(1.0, 0, 0.3);
    }
    if (rightArm) {
      rightArm.rotation.set(1.0, 0, -0.3);
    }

    const leftForeArm = this.getBone('mixamorigLeftForeArm');
    const rightForeArm = this.getBone('mixamorigRightForeArm');

    if (leftForeArm) {
      leftForeArm.rotation.set(0, 0, 0);
    }
    if (rightForeArm) {
      rightForeArm.rotation.set(0, 0, 0);
    }
  }

  /** Transition smoothly to a new animation state. */
  transitionTo(state: AnimationState, crossfade = CROSSFADE_DURATION): void {
    if (!this.modelLoaded) return;
    // Allow re-triggering attack from attack state (restart the animation)
    if (state === this.currentState && state !== 'attack') return;

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
      if (currentAction && currentAction !== nextAction) {
        currentAction.crossFadeTo(nextAction, crossfade, true);
      }
      nextAction.play();
    } else if (currentAction) {
      // No target animation — fade out current so character stops
      currentAction.fadeOut(crossfade);
    }

    this.currentState = state;
  }

  /** Get the duration of an animation clip by state name. */
  getClipDuration(state: AnimationState): number {
    const action = this.getAction(state);
    return action ? action.getClip().duration : 0;
  }

  /** Whether backward walk should use dedicated animation or reversed forward. */
  get hasBackwardWalk(): boolean {
    return this.actions.has('walkBack');
  }

  /** Set walk animation playback direction: -1 for backward, 1 for forward. */
  setWalkDirection(backward: boolean): void {
    // If we have a dedicated backward walk animation, use it via transitionTo instead
    if (this.hasBackwardWalk) return;

    // Fallback: reverse the forward walk
    const walkAction = this.getAction('walk');
    if (walkAction) {
      walkAction.timeScale = backward ? -1 : 1;
    }
  }

  /** Update the animation mixer. */
  update(dt: number): void {
    if (this.mixer) {
      this.mixer.update(dt);
    }
    // Force model to stay in place after animation update.
    // Walk animations with root motion would otherwise move the model
    // within its parent group, causing visible drift.
    if (this.model) {
      this.model.position.set(0, 0, 0);
    }
    // Apply rest pose for arms when idle (walk animation handles its own arms)
    if (this.currentState === 'idle') {
      this.setRestPose();
    }
  }

  /** Attach a mesh to the right-hand bone (weapon socket). */
  attachWeapon(mesh: THREE.Object3D): void {
    if (this.weaponBone) {
      this.weaponBone.add(mesh);
      this.weaponDrawn = true;
      // Start stowed on back
      this.stowWeapon();
    } else {
      // Fallback: attach to group root
      this.group.add(mesh);
    }
  }

  /** Get the weapon bone for removing old weapons etc. */
  getWeaponSocket(): THREE.Object3D {
    return this.weaponBone ?? this.group;
  }

  /** Get the back bone for stowing weapons. */
  getBackSocket(): THREE.Object3D {
    return this.backBone ?? this.group;
  }

  /** Whether the weapon is currently drawn (in hand). */
  get isWeaponDrawn(): boolean {
    return this.weaponDrawn;
  }

  /**
   * Move the weapon from hand to back.
   * Repositions and reorients the weapon mesh to sit on the character's upper back.
   */
  stowWeapon(): void {
    if (!this.weaponDrawn) return;
    const weapon = this.weaponBone?.getObjectByName('weapon');
    if (!weapon || !this.backBone) return;

    this.weaponBone!.remove(weapon);
    // Position on upper back: flat against back, axe head tilted upward
    weapon.position.set(0.1, -0.15, -0.2);
    weapon.rotation.set(Math.PI / 2, -Math.PI / 5, Math.PI / 4);
    this.backBone.add(weapon);
    this.weaponDrawn = false;
  }

  /**
   * Move the weapon from back to hand.
   * Restores the weapon to grip position in the right hand.
   */
  drawWeapon(): void {
    if (this.weaponDrawn) return;
    const weapon = this.backBone?.getObjectByName('weapon');
    if (!weapon || !this.weaponBone) return;

    this.backBone!.remove(weapon);
    // Restore hand-grip position
    weapon.position.set(0, -0.1, 0);
    weapon.position.set(0.4, 0.2, 0.1);
    weapon.rotation.set(Math.PI * 3 / 4, -Math.PI / 2, 0);
    this.weaponBone.add(weapon);
    this.weaponDrawn = true;
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

  /**
   * Create a subtle procedural idle (breathing) animation from skeleton bones.
   */
  private createProceduralIdle(): THREE.AnimationClip | null {
    const hipsBone = this.getBone('mixamorigHips');
    const spineBone = this.getBone('mixamorigSpine');
    if (!hipsBone && !spineBone) return null;

    const duration = 3;
    const times = [0, 1.5, 3];
    const tracks: THREE.KeyframeTrack[] = [];

    if (hipsBone) {
      const y = hipsBone.position.y;
      tracks.push(new THREE.NumberKeyframeTrack(
        `${hipsBone.name}.position[y]`,
        times,
        [y, y + 0.02, y],
      ));
    }

    if (spineBone) {
      const rx = spineBone.rotation.x;
      tracks.push(new THREE.NumberKeyframeTrack(
        `${spineBone.name}.rotation[x]`,
        times,
        [rx, rx + 0.012, rx],
      ));
    }

    const clip = new THREE.AnimationClip('idle', duration, tracks);
    for (const track of clip.tracks) {
      track.setInterpolation(THREE.InterpolateSmooth);
    }
    return clip;
  }

  /** Create a procedural walk cycle using leg and arm bones. */
  private createProceduralWalk(): THREE.AnimationClip | null {
    const leftUpLeg = this.getBone('mixamorigLeftUpLeg');
    const rightUpLeg = this.getBone('mixamorigRightUpLeg');
    const leftLeg = this.getBone('mixamorigLeftLeg');
    const rightLeg = this.getBone('mixamorigRightLeg');
    const hipsBone = this.getBone('mixamorigHips');

    if (!leftUpLeg && !rightUpLeg) return null;

    const duration = 0.8; // one full step cycle
    const times = [0, 0.2, 0.4, 0.6, 0.8];
    const tracks: THREE.KeyframeTrack[] = [];

    // Legs swing forward/backward (X rotation)
    const legSwing = 0.4;
    if (leftUpLeg) {
      tracks.push(new THREE.NumberKeyframeTrack(
        `${leftUpLeg.name}.rotation[x]`,
        times,
        [0, -legSwing, 0, legSwing, 0],
      ));
    }
    if (rightUpLeg) {
      tracks.push(new THREE.NumberKeyframeTrack(
        `${rightUpLeg.name}.rotation[x]`,
        times,
        [0, legSwing, 0, -legSwing, 0],
      ));
    }

    // Knees bend on back-swing
    const kneeBend = 0.4;
    if (leftLeg) {
      tracks.push(new THREE.NumberKeyframeTrack(
        `${leftLeg.name}.rotation[x]`,
        times,
        [0, 0, 0, kneeBend, 0],
      ));
    }
    if (rightLeg) {
      tracks.push(new THREE.NumberKeyframeTrack(
        `${rightLeg.name}.rotation[x]`,
        times,
        [0, kneeBend, 0, 0, 0],
      ));
    }

    // Subtle hip bounce
    if (hipsBone) {
      const y = hipsBone.position.y;
      tracks.push(new THREE.NumberKeyframeTrack(
        `${hipsBone.name}.position[y]`,
        times,
        [y, y + 0.015, y, y + 0.015, y],
      ));
    }

    const clip = new THREE.AnimationClip('walk', duration, tracks);
    for (const track of clip.tracks) {
      track.setInterpolation(THREE.InterpolateSmooth);
    }
    return clip;
  }

  /** Procedural crouch: lower hips, bend knees, hunch spine. */
  private createProceduralCrouch(): THREE.AnimationClip | null {
    const hipsBone = this.getBone('mixamorigHips');
    const spineBone = this.getBone('mixamorigSpine');
    const leftUpLeg = this.getBone('mixamorigLeftUpLeg');
    const rightUpLeg = this.getBone('mixamorigRightUpLeg');
    const leftLeg = this.getBone('mixamorigLeftLeg');
    const rightLeg = this.getBone('mixamorigRightLeg');
    if (!hipsBone) return null;

    const duration = 0.8;
    const times = [0, 0.4, 0.8];
    const tracks: THREE.KeyframeTrack[] = [];

    // Lower hips significantly
    const y = hipsBone.position.y;
    const crouchY = y - 25; // lower the body (bone-local units)
    tracks.push(new THREE.NumberKeyframeTrack(
      `${hipsBone.name}.position[y]`,
      times,
      [crouchY, crouchY - 1, crouchY],
    ));

    // Hunch spine forward
    if (spineBone) {
      const rx = spineBone.rotation.x;
      tracks.push(new THREE.NumberKeyframeTrack(
        `${spineBone.name}.rotation[x]`,
        times,
        [rx + 0.3, rx + 0.32, rx + 0.3],
      ));
    }

    // Bend upper legs forward (thighs)
    const thighBend = 1.2;
    if (leftUpLeg) {
      tracks.push(new THREE.NumberKeyframeTrack(
        `${leftUpLeg.name}.rotation[x]`,
        times,
        [thighBend, thighBend + 0.05, thighBend],
      ));
    }
    if (rightUpLeg) {
      tracks.push(new THREE.NumberKeyframeTrack(
        `${rightUpLeg.name}.rotation[x]`,
        times,
        [thighBend, thighBend - 0.05, thighBend],
      ));
    }

    // Bend knees
    const kneeBend = -1.4;
    if (leftLeg) {
      tracks.push(new THREE.NumberKeyframeTrack(
        `${leftLeg.name}.rotation[x]`,
        times,
        [kneeBend, kneeBend - 0.03, kneeBend],
      ));
    }
    if (rightLeg) {
      tracks.push(new THREE.NumberKeyframeTrack(
        `${rightLeg.name}.rotation[x]`,
        times,
        [kneeBend, kneeBend + 0.03, kneeBend],
      ));
    }

    const clip = new THREE.AnimationClip('crouch', duration, tracks);
    for (const track of clip.tracks) {
      track.setInterpolation(THREE.InterpolateSmooth);
    }
    return clip;
  }

  /**
   * Remove position tracks from Hips bone to prevent root motion.
   * Keeps rotation tracks so the walk pose looks correct.
   */
  private stripRootMotion(clip: THREE.AnimationClip): void {
    const before = clip.tracks.length;
    clip.tracks = clip.tracks.filter((track) => {
      // Remove position/scale tracks on Hips/root bone (they cause the model to fly away)
      const isHips = /hips/i.test(track.name);
      if (isHips && (track.name.includes('.position') || track.name.includes('.scale'))) {
        console.log(`[CharacterController] Stripped root motion track: ${track.name}`);
        return false;
      }
      return true;
    });
    console.log(`[CharacterController] stripRootMotion: ${before} -> ${clip.tracks.length} tracks`);
  }

  /**
   * Strip horizontal root motion (X/Z) but keep vertical (Y) so crouch lowers the character.
   */
  private stripRootMotionKeepY(clip: THREE.AnimationClip): void {
    clip.tracks = clip.tracks.filter((track) => {
      const isHips = /hips/i.test(track.name);
      // Remove scale tracks entirely
      if (isHips && track.name.includes('.scale')) {
        console.log(`[CharacterController] Stripped crouch scale track: ${track.name}`);
        return false;
      }
      // For position tracks, zero out X and Z but keep Y
      if (isHips && track.name.includes('.position')) {
        const values = track.values;
        // VectorKeyframeTrack: values = [x0,y0,z0, x1,y1,z1, ...]
        for (let i = 0; i < values.length; i += 3) {
          values[i] = 0;       // zero X
          values[i + 2] = 0;   // zero Z
        }
        console.log(`[CharacterController] Zeroed X/Z on crouch position track: ${track.name} (kept Y)`);
      }
      return true;
    });
  }

  /** Normalize Mixamo clip names to our state names. */
  private normalizeAnimName(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('idle') || lower.includes('breathing')) return 'idle';
    if (lower === 'run' || lower.includes('dribble') || lower.includes('sprint')) return 'run';
    if (lower.includes('walkback') || lower.includes('walk back') || lower.includes('walk_back')) return 'walkBack';
    if (lower.includes('walk') || lower.includes('jog')) return 'walk';
    if (lower.includes('crouch')) return 'crouch';
    if (lower.includes('attack') || lower.includes('slash') || lower.includes('swing') || lower.includes('stab')) return 'attack';
    // Return original for unmapped clips
    return name;
  }

  /**
   * Procedural right-hand overhead axe chop.
   * Winds up by raising the right arm, then swings down hard.
   */
  private createProceduralAxeSwing(): THREE.AnimationClip | null {
    const rightArm = this.getBone('mixamorigRightArm');
    const rightForeArm = this.getBone('mixamorigRightForeArm');
    const spine = this.getBone('mixamorigSpine');
    const spine1 = this.getBone('mixamorigSpine1');
    if (!rightArm) return null;

    const duration = 0.7;
    // Keyframes: rest → windup → swing → impact → recover
    //            0      0.15      0.35     0.45     0.7
    const times = [0, 0.15, 0.35, 0.45, 0.7];
    const tracks: THREE.KeyframeTrack[] = [];

    // Right upper arm — X rotation (swing arc), Z rotation (arm lift)
    // Rest pose: x=1.0, z=-0.3 (arm hanging at side, mirrored from left)
    // Windup: raise arm up and back over shoulder
    // Swing: chop downward hard
    tracks.push(new THREE.NumberKeyframeTrack(
      `${rightArm.name}.rotation[x]`,
      times,
      [1.0, -1.2, 2.2, 2.4, 1.0],
    ));
    tracks.push(new THREE.NumberKeyframeTrack(
      `${rightArm.name}.rotation[z]`,
      times,
      [-0.3, 0.8, -0.1, -0.2, -0.3], // mirrored Z from left-hand version
    ));

    // Right forearm — bend elbow during windup, extend on swing
    if (rightForeArm) {
      tracks.push(new THREE.NumberKeyframeTrack(
        `${rightForeArm.name}.rotation[x]`,
        times,
        [0, -0.8, -0.2, 0, 0],
      ));
    }

    // Spine — lean into the swing
    if (spine) {
      const rx = spine.rotation.x;
      tracks.push(new THREE.NumberKeyframeTrack(
        `${spine.name}.rotation[x]`,
        times,
        [rx, rx - 0.1, rx + 0.2, rx + 0.25, rx],
      ));
    }

    // Spine1 — torso twist (mirrored direction)
    if (spine1) {
      const ry = spine1.rotation.y;
      tracks.push(new THREE.NumberKeyframeTrack(
        `${spine1.name}.rotation[y]`,
        times,
        [ry, ry - 0.2, ry + 0.3, ry + 0.25, ry], // mirrored twist
      ));
    }

    const clip = new THREE.AnimationClip('attack', duration, tracks);
    for (const track of clip.tracks) {
      track.setInterpolation(THREE.InterpolateSmooth);
    }
    return clip;
  }
}

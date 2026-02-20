import * as THREE from 'three';

// Shared materials (created once, reused across all goblins)
const skinMat = new THREE.MeshStandardMaterial({ color: 0x2d8c2d, roughness: 0.75 });
const darkSkinMat = new THREE.MeshStandardMaterial({ color: 0x237023, roughness: 0.8 });
const eyeMat = new THREE.MeshStandardMaterial({
  color: 0xffee44,
  emissive: 0xccaa00,
  emissiveIntensity: 0.8,
  roughness: 0.3,
});
const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
const clothMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.85 });
const footMat = new THREE.MeshStandardMaterial({ color: 0x1f6b1f, roughness: 0.8 });

/**
 * Creates a procedural goblin mesh ~0.5m tall from primitives.
 * Named sub-groups: 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'
 * for animation control.
 */
export function createGoblin(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'goblin';

  // ── Body ──
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.18), skinMat);
  body.position.y = 0.22;
  body.castShadow = true;
  root.add(body);

  // ── Loincloth ──
  const loincloth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.20), clothMat);
  loincloth.position.y = 0.10;
  root.add(loincloth);

  // ── Head group ──
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.50;

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), skinMat);
  skull.castShadow = true;
  head.add(skull);

  // Nose (bulbous, stretched forward)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), darkSkinMat);
  nose.position.set(0, -0.02, -0.12);
  nose.scale.set(1, 0.8, 1.3);
  head.add(nose);

  // Ears (pointed cones, angled outward)
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), skinMat);
    ear.position.set(side * 0.13, 0.02, 0);
    ear.rotation.z = side * -1.2;
    head.add(ear);
  }

  // Eyes (yellow with dark pupils)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), eyeMat);
    eye.position.set(side * 0.055, 0.03, -0.10);
    head.add(eye);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 4), pupilMat);
    pupil.position.set(side * 0.055, 0.03, -0.12);
    head.add(pupil);
  }

  root.add(head);

  // ── Arms ──
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side === -1 ? 'leftArm' : 'rightArm';
    arm.position.set(side * 0.14, 0.30, 0);

    // Upper arm
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.12, 5), skinMat);
    upper.position.y = -0.06;
    arm.add(upper);

    // Forearm
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.10, 5), skinMat);
    forearm.position.y = -0.16;
    arm.add(forearm);

    // Hand (little sphere)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), darkSkinMat);
    hand.position.y = -0.22;
    arm.add(hand);

    root.add(arm);
  }

  // ── Legs ──
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side === -1 ? 'leftLeg' : 'rightLeg';
    leg.position.set(side * 0.07, 0.08, 0);

    // Thigh
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.08, 5), skinMat);
    thigh.position.y = -0.02;
    leg.add(thigh);

    // Shin
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.07, 5), skinMat);
    shin.position.y = -0.10;
    leg.add(shin);

    // Foot (comically large)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.09), footMat);
    foot.position.set(0, -0.14, -0.02);
    leg.add(foot);

    root.add(leg);
  }

  return root;
}

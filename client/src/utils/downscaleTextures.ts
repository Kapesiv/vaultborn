import * as THREE from 'three';

/** Downscale all textures on a loaded model to maxSize for performance */
export function downscaleTextures(root: THREE.Object3D, maxSize = 1024): void {
  const processed = new Set<THREE.Texture>();
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mat = (child as THREE.Mesh).material;
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const m of mats) {
      if (!m || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
      const std = m as THREE.MeshStandardMaterial;
      const texProps: (keyof THREE.MeshStandardMaterial)[] = [
        'map', 'normalMap', 'roughnessMap', 'metalnessMap',
        'aoMap', 'emissiveMap', 'bumpMap', 'displacementMap',
      ];
      for (const prop of texProps) {
        const tex = std[prop] as THREE.Texture | null;
        if (!tex || processed.has(tex) || !tex.image) continue;
        processed.add(tex);
        const img = tex.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement;
        const w = img.width ?? 0;
        const h = img.height ?? 0;
        if (w <= maxSize && h <= maxSize) continue;
        const scale = maxSize / Math.max(w, h);
        const nw = Math.round(w * scale);
        const nh = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = nw;
        canvas.height = nh;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img as CanvasImageSource, 0, 0, nw, nh);
        tex.image = canvas;
        tex.needsUpdate = true;
      }
    }
  });
}

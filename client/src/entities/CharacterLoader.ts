import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

interface CachedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

class CharacterLoaderSingleton {
  private gltfLoader = new GLTFLoader();
  private fbxLoader = new FBXLoader();
  private cache = new Map<string, CachedModel>();
  private pending = new Map<string, Promise<CachedModel>>();

  /** Pre-load model files so they're cached before use. */
  preload(urls: string[]): void {
    for (const url of urls) {
      if (!this.cache.has(url) && !this.pending.has(url)) {
        this.loadModel(url);
      }
    }
  }

  /** Get a cloned scene + animations from a cached (or freshly loaded) model. */
  async getClone(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    if (this.isFBX(url)) {
      // FBX: load fresh each time (SkeletonUtils.clone breaks FBX models)
      const fresh = await this.loadFreshFBX(url);
      return { scene: fresh.scene, animations: fresh.animations };
    }

    let cached = this.cache.get(url);
    if (!cached) {
      cached = await this.loadModel(url);
    }

    const clonedScene = SkeletonUtils.clone(cached.scene) as THREE.Group;
    const clonedAnims = cached.animations.map(clip => clip.clone());

    return { scene: clonedScene, animations: clonedAnims };
  }

  /**
   * Load a base model + separate animation FBX files.
   * Animations are extracted from additional FBX files and merged into one result.
   */
  async getCloneWithAnimations(
    modelUrl: string,
    animUrls: { name: string; url: string }[],
  ): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    // Load the base model fresh (FBX doesn't clone well with SkeletonUtils)
    const baseModel = await this.loadFreshFBX(modelUrl);
    const allAnims: THREE.AnimationClip[] = [];

    // Include any animations from the base model
    for (const clip of baseModel.animations) {
      allAnims.push(clip);
    }

    // Load each animation FBX and extract its clips
    for (const { name, url } of animUrls) {
      try {
        let animCached = this.cache.get(url);
        if (!animCached) {
          animCached = await this.loadModel(url);
        }
        for (const clip of animCached.animations) {
          const renamed = clip.clone();
          renamed.name = name;
          allAnims.push(renamed);
        }
      } catch (e) {
        console.warn(`[CharacterLoader] Failed to load animation ${name} from ${url}`, e);
      }
    }

    console.log(`[CharacterLoader] Model ready with ${allAnims.length} animations`);
    return { scene: baseModel.scene, animations: allAnims };
  }

  /** Load FBX fresh (no cache, no clone issues). */
  private loadFreshFBX(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    return new Promise((resolve, reject) => {
      this.fbxLoader.load(
        url,
        (group: THREE.Group) => {
          group.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          let meshCount = 0;
          group.traverse((c) => { if ((c as THREE.Mesh).isMesh) meshCount++; });
          console.log(`[CharacterLoader] Fresh load: ${url}, meshes: ${meshCount}, anims: ${(group.animations ?? []).length}`);
          resolve({ scene: group, animations: group.animations ?? [] });
        },
        undefined,
        (error) => {
          console.error(`[CharacterLoader] FAILED fresh load: ${url}`, error);
          reject(error);
        },
      );
    });
  }

  /** Load a single FBX and return just its animation clips. */
  async loadAnimationClips(url: string): Promise<THREE.AnimationClip[]> {
    let cached = this.cache.get(url);
    if (!cached) {
      cached = await this.loadModel(url);
    }
    return cached.animations.map(clip => clip.clone());
  }

  private isFBX(url: string): boolean {
    return url.toLowerCase().endsWith('.fbx');
  }

  private loadModel(url: string): Promise<CachedModel> {
    let promise = this.pending.get(url);
    if (promise) return promise;

    if (this.isFBX(url)) {
      promise = this.loadFBX(url);
    } else {
      promise = this.loadGLTF(url);
    }

    this.pending.set(url, promise);
    return promise;
  }

  private loadFBX(url: string): Promise<CachedModel> {
    return new Promise<CachedModel>((resolve, reject) => {
      this.fbxLoader.load(
        url,
        (group: THREE.Group) => {
          group.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          const cached: CachedModel = {
            scene: group,
            animations: group.animations ?? [],
          };
          this.cache.set(url, cached);
          this.pending.delete(url);
          console.log(`[CharacterLoader] Loaded FBX: ${url} (${cached.animations.length} animations)`);

          for (const clip of cached.animations) {
            console.log(`  - Animation: "${clip.name}" (${clip.duration.toFixed(1)}s)`);
          }

          resolve(cached);
        },
        undefined,
        (error) => {
          this.pending.delete(url);
          console.warn(`[CharacterLoader] Failed to load FBX: ${url}`, error);
          reject(error);
        },
      );
    });
  }

  private loadGLTF(url: string): Promise<CachedModel> {
    return new Promise<CachedModel>((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf: GLTF) => {
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          const cached: CachedModel = {
            scene: gltf.scene,
            animations: gltf.animations,
          };
          this.cache.set(url, cached);
          this.pending.delete(url);
          console.log(`[CharacterLoader] Loaded GLB: ${url} (${gltf.animations.length} animations)`);
          resolve(cached);
        },
        undefined,
        (error) => {
          this.pending.delete(url);
          console.warn(`[CharacterLoader] Failed to load GLB: ${url}`, error);
          reject(error);
        },
      );
    });
  }
}

export const characterLoader = new CharacterLoaderSingleton();

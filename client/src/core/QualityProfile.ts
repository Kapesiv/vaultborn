/** Detect mobile/low-end devices and expose quality settings. */

export interface QualitySettings {
  /** Max pixel ratio (PC: 1.5, mobile: 1.0) */
  pixelRatio: number;
  /** Shadow map resolution (PC: 2048, mobile: 1024) */
  shadowMapSize: number;
  /** Enable bloom post-process */
  bloom: boolean;
  /** Enable SMAA anti-aliasing */
  smaa: boolean;
  /** Shadow map type: 'pcfsoft' or 'basic' */
  shadowType: 'pcfsoft' | 'basic';
  /** Camera far plane */
  farPlane: number;
  /** Hub shadow camera extent (half-size) */
  shadowExtent: number;
}

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || ('ontouchstart' in window && window.innerWidth <= 1024);

const PC_PROFILE: QualitySettings = {
  pixelRatio: 1.0,
  shadowMapSize: 1024,
  bloom: true,
  smaa: false,
  shadowType: 'pcfsoft',
  farPlane: 150,
  shadowExtent: 40,
};

const MOBILE_PROFILE: QualitySettings = {
  pixelRatio: 1.0,
  shadowMapSize: 1024,
  bloom: false,
  smaa: false,
  shadowType: 'basic',
  farPlane: 100,
  shadowExtent: 30,
};

export const quality: QualitySettings = isMobile ? MOBILE_PROFILE : PC_PROFILE;
export const isMobileDevice = isMobile;

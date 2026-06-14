/**
 * Unified e-ink rendering engine for Xteink X4.
 *
 * Convention: (bw=0,gs=0)=black, (0,1)=dark, (1,0)=light, (1,1)=white
 * All outputs match SSD1677 display hardware directly — no firmware inversion.
 */

export {
  quantizeGamma,
  quantizeThreshold,
  quantizeFloydSteinberg,
  quantize1bit,
  quantizeAtkinson,
  quantizeBayer4x4,
  quantizeBayer8x8,
  quantizeStucki,
  quantizeSierraLite,
  quantizeJarvis,
  quantizeBlueNoise,
} from './quantize.js';

export {
  canvasToKp,
  canvasToPortraitPlanes,
  pixelsToLandscapePlanes,
  pixelsToPortraitPlanes,
  pixelsTo1bitPlane,
  pixelsTo1bitLandscapePlane,
  encodePlanes,
  encodePlanesRaw,
  encodeKpV2,
} from './encoder.js';

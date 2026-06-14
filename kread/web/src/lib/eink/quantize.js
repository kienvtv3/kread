/**
 * Convert 8-bit grayscale to 4-level (2-bit) with gamma correction.
 *
 * E-ink displays have non-linear response. Gamma correction compensates:
 * - Linear quantization: thresholds at 64, 128, 192
 * - Gamma-corrected (γ=1.8): adjusts thresholds for perceptual uniformity on e-ink
 *
 * @param {Uint8ClampedArray} rgba - Canvas ImageData.data (RGBA, 4 bytes/pixel)
 * @param {number} width
 * @param {number} height
 * @param {number} gamma - Gamma value (default 1.8 for e-ink)
 * @returns {Uint8Array} - 2-bit pixel values (0=black, 1=dark gray, 2=light gray, 3=white)
 */
export function quantizeGamma(rgba, width, height, gamma = 1.2) {
  const pixels = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    // Convert RGBA to grayscale (luminosity method)
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    // Gamma-corrected quantization to 4 levels.
    // gamma > 1.0 darkens midtones → bolder text on e-ink.
    // Equal thresholds (64/128/192) after gamma correction.
    const corrected = Math.pow(gray / 255, gamma) * 255;
    if (corrected < 64) {
      pixels[i] = 0;
    } else if (corrected < 128) {
      pixels[i] = 1;
    } else if (corrected < 192) {
      pixels[i] = 2;
    } else {
      pixels[i] = 3;
    }
  }

  return pixels;
}

/**
 * Simple threshold quantization (no gamma, no dithering).
 * Thresholds at 64, 128, 192.
 */
export function quantizeThreshold(rgba, width, height) {
  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    if (gray < 64) pixels[i] = 0;
    else if (gray < 128) pixels[i] = 1;
    else if (gray < 192) pixels[i] = 2;
    else pixels[i] = 3;
  }
  return pixels;
}

/**
 * Floyd-Steinberg dithering to 4 levels.
 * Good for images/photos, not for text.
 */
/**
 * 1-bit quantization (B&W, no grayscale).
 * For UI assets that are always B&W.
 */
export function quantize1bit(rgba, width, height) {
  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const gray = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    pixels[i] = gray < 128 ? 0 : 1;
  }
  return pixels;
}

/**
 * Atkinson dithering to 4 levels (2-bit).
 * Diffuses error to 6 neighbors.
 *
 * @param {number} [gamma=1.8] — gamma correction
 * @param {number} [strength=1.0] — 0=no dither (like gamma threshold), 1=full 75% diffusion
 */
export function quantizeAtkinson(rgba, width, height, gamma = 1.8, strength = 1.0) {
  const buffer = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const gray = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    buffer[i] = Math.pow(gray / 255.0, 1.0 / gamma);
  }

  const pixels = new Uint8Array(width * height);
  const levels = [0.0, 0.333, 0.667, 1.0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = Math.max(0, Math.min(1, buffer[idx]));

      let nearest = 0, minDist = Math.abs(old - levels[0]);
      for (let l = 1; l < 4; l++) {
        const dist = Math.abs(old - levels[l]);
        if (dist < minDist) { minDist = dist; nearest = l; }
      }
      pixels[idx] = nearest;

      // Atkinson: 1/8 per neighbor × 6 = 75%, scaled by strength
      // strength=0.5 → 37.5% diffusion (subtle dots)
      // strength=0.25 → ~19% diffusion (very subtle)
      const error = (old - levels[nearest]) * strength / 8;
      if (x + 1 < width) buffer[idx + 1] += error;
      if (x + 2 < width) buffer[idx + 2] += error;
      if (y + 1 < height) {
        if (x > 0) buffer[idx + width - 1] += error;
        buffer[idx + width] += error;
        if (x + 1 < width) buffer[idx + width + 1] += error;
      }
      if (y + 2 < height) buffer[idx + width * 2] += error;
    }
  }
  return pixels;
}

/**
 * @param {number} [strength=1.0] — 0=no dither, 1=full error diffusion
 */
export function quantizeFloydSteinberg(rgba, width, height, gamma = 1.8, strength = 1.0) {
  const invGamma = 1.0 / gamma;
  const buffer = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const gray = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    buffer[i] = Math.pow(gray / 255.0, invGamma);
  }
  const pixels = new Uint8Array(width * height);
  const levels = [0.0, 0.333, 0.667, 1.0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = Math.max(0, Math.min(1, buffer[idx]));
      let nearest = 0, minDist = Math.abs(old - levels[0]);
      for (let l = 1; l < 4; l++) {
        const dist = Math.abs(old - levels[l]);
        if (dist < minDist) { minDist = dist; nearest = l; }
      }
      pixels[idx] = nearest;
      const error = (old - levels[nearest]) * strength;
      if (x + 1 < width) buffer[idx + 1] += error * 7 / 16;
      if (y + 1 < height) {
        if (x > 0) buffer[idx + width - 1] += error * 3 / 16;
        buffer[idx + width] += error * 5 / 16;
        if (x + 1 < width) buffer[idx + width + 1] += error * 1 / 16;
      }
    }
  }
  return pixels;
}

/**
 * Ordered dithering with 4x4 Bayer matrix.
 * Produces fine, regular pattern. Good for smooth gradients on e-ink.
 */
/**
 * @param {number} [strength=1.0] — 0=no pattern (gamma only), 1=full Bayer pattern
 */
export function quantizeBayer4x4(rgba, width, height, gamma = 1.8, strength = 1.0) {
  const matrix = [
    [ 0, 8, 2,10],
    [12, 4,14, 6],
    [ 3,11, 1, 9],
    [15, 7,13, 5],
  ]
  const pixels = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const gray = 0.299 * rgba[i*4] + 0.587 * rgba[i*4+1] + 0.114 * rgba[i*4+2]
      const normalized = Math.pow(gray / 255.0, gamma)
      const threshold = (matrix[y % 4][x % 4] + 0.5) / 16.0
      const val = normalized + (threshold - 0.5) * 0.5 * strength
      if (val < 0.167) pixels[i] = 0
      else if (val < 0.5) pixels[i] = 1
      else if (val < 0.833) pixels[i] = 2
      else pixels[i] = 3
    }
  }
  return pixels
}

/**
 * Ordered dithering with 8x8 Bayer matrix.
 * Finer pattern, smoother gradients than 4x4.
 */
/**
 * @param {number} [strength=1.0] — 0=no pattern, 1=full Bayer 8×8 pattern
 */
export function quantizeBayer8x8(rgba, width, height, gamma = 1.8, strength = 1.0) {
  const matrix = [
    [ 0,32, 8,40, 2,34,10,42],
    [48,16,56,24,50,18,58,26],
    [12,44, 4,36,14,46, 6,38],
    [60,28,52,20,62,30,54,22],
    [ 3,35,11,43, 1,33, 9,41],
    [51,19,59,27,49,17,57,25],
    [15,47, 7,39,13,45, 5,37],
    [63,31,55,23,61,29,53,21],
  ]
  const pixels = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const gray = 0.299 * rgba[i*4] + 0.587 * rgba[i*4+1] + 0.114 * rgba[i*4+2]
      const normalized = Math.pow(gray / 255.0, gamma)
      const threshold = (matrix[y % 8][x % 8] + 0.5) / 64.0
      const val = normalized + (threshold - 0.5) * 0.5 * strength
      if (val < 0.167) pixels[i] = 0
      else if (val < 0.5) pixels[i] = 1
      else if (val < 0.833) pixels[i] = 2
      else pixels[i] = 3
    }
  }
  return pixels
}

/**
 * Stucki dithering to 4 levels (2-bit).
 * 12-neighbor error diffusion. Smoothest of error-diffusion methods.
 */
/**
 * @param {number} [strength=1.0] — 0=no dither, 1=full Stucki diffusion
 */
export function quantizeStucki(rgba, width, height, gamma = 1.8, strength = 1.0) {
  const buffer = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const gray = 0.299 * rgba[i*4] + 0.587 * rgba[i*4+1] + 0.114 * rgba[i*4+2]
    buffer[i] = Math.pow(gray / 255.0, 1.0 / gamma)
  }
  const pixels = new Uint8Array(width * height)
  const levels = [0.0, 0.333, 0.667, 1.0]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const old = Math.max(0, Math.min(1, buffer[idx]))
      let nearest = 0, minDist = Math.abs(old - levels[0])
      for (let l = 1; l < 4; l++) {
        const d = Math.abs(old - levels[l])
        if (d < minDist) { minDist = d; nearest = l }
      }
      pixels[idx] = nearest
      const error = (old - levels[nearest]) * strength
      // Stucki weights: /42 denominator
      const spread = (dx, dy, w) => {
        const nx = x + dx, ny = y + dy
        if (nx >= 0 && nx < width && ny < height) buffer[ny * width + nx] += error * w / 42
      }
      spread(1, 0, 8); spread(2, 0, 4)
      spread(-2, 1, 2); spread(-1, 1, 4); spread(0, 1, 8); spread(1, 1, 4); spread(2, 1, 2)
      spread(-2, 2, 1); spread(-1, 2, 2); spread(0, 2, 4); spread(1, 2, 2); spread(2, 2, 1)
    }
  }
  return pixels
}

/**
 * Sierra Lite dithering to 4 levels (2-bit).
 * 2-neighbor error diffusion. Fastest, sharpest of error-diffusion.
 * Smaller dots than Atkinson.
 */
/**
 * @param {number} [strength=1.0] — 0=no dither, 1=full Sierra Lite diffusion
 */
export function quantizeSierraLite(rgba, width, height, gamma = 1.8, strength = 1.0) {
  const buffer = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const gray = 0.299 * rgba[i*4] + 0.587 * rgba[i*4+1] + 0.114 * rgba[i*4+2]
    buffer[i] = Math.pow(gray / 255.0, 1.0 / gamma)
  }
  const pixels = new Uint8Array(width * height)
  const levels = [0.0, 0.333, 0.667, 1.0]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const old = Math.max(0, Math.min(1, buffer[idx]))
      let nearest = 0, minDist = Math.abs(old - levels[0])
      for (let l = 1; l < 4; l++) {
        const d = Math.abs(old - levels[l])
        if (d < minDist) { minDist = d; nearest = l }
      }
      pixels[idx] = nearest
      const error = (old - levels[nearest]) * strength
      // Sierra Lite: 2/4 right, 1/4 below-left, 1/4 below
      if (x + 1 < width) buffer[idx + 1] += error * 2 / 4
      if (y + 1 < height) {
        if (x > 0) buffer[idx + width - 1] += error * 1 / 4
        buffer[idx + width] += error * 1 / 4
      }
    }
  }
  return pixels
}

/**
 * Jarvis-Judice-Ninke dithering to 4 levels (2-bit).
 * 12-neighbor error diffusion with 48 denominator. Very smooth gradients.
 * @param {number} [strength=1.0] — 0=no dither, 1=full diffusion
 */
export function quantizeJarvis(rgba, width, height, gamma = 1.8, strength = 1.0) {
  const buffer = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const gray = 0.299 * rgba[i*4] + 0.587 * rgba[i*4+1] + 0.114 * rgba[i*4+2]
    buffer[i] = Math.pow(gray / 255.0, 1.0 / gamma)
  }
  const pixels = new Uint8Array(width * height)
  const levels = [0.0, 0.333, 0.667, 1.0]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const old = Math.max(0, Math.min(1, buffer[idx]))
      let nearest = 0, minDist = Math.abs(old - levels[0])
      for (let l = 1; l < 4; l++) {
        const d = Math.abs(old - levels[l])
        if (d < minDist) { minDist = d; nearest = l }
      }
      pixels[idx] = nearest
      const error = (old - levels[nearest]) * strength
      const spread = (dx, dy, w) => {
        const nx = x + dx, ny = y + dy
        if (nx >= 0 && nx < width && ny < height) buffer[ny * width + nx] += error * w / 48
      }
      spread(1,0,7); spread(2,0,5)
      spread(-2,1,3); spread(-1,1,5); spread(0,1,7); spread(1,1,5); spread(2,1,3)
      spread(-2,2,1); spread(-1,2,3); spread(0,2,5); spread(1,2,3); spread(2,2,1)
    }
  }
  return pixels
}

/**
 * Blue noise dithering to 4 levels (2-bit).
 * Uses interleaved gradient noise (Jorge Jimenez, 2014) — blue-noise-like
 * distribution without lookup texture. No repeating pattern visible.
 * @param {number} [strength=1.0] — 0=no noise (gamma only), 1=full blue noise
 */
export function quantizeBlueNoise(rgba, width, height, gamma = 1.8, strength = 1.0) {
  const pixels = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const gray = 0.299 * rgba[i*4] + 0.587 * rgba[i*4+1] + 0.114 * rgba[i*4+2]
      const normalized = Math.pow(gray / 255.0, gamma)
      // Interleaved gradient noise — produces blue-noise-like distribution
      const n = 52.9829189 * (0.06711056 * x + 0.00583715 * y)
      const noise = n - Math.floor(n)
      const val = normalized + (noise - 0.5) * 0.5 * strength
      if (val < 0.167) pixels[i] = 0
      else if (val < 0.5) pixels[i] = 1
      else if (val < 0.833) pixels[i] = 2
      else pixels[i] = 3
    }
  }
  return pixels
}

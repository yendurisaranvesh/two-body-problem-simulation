/* ==========================================================================
   textures.js — procedural textures generated on <canvas> (no image files).
   ========================================================================== */
(function (TBS) {
  'use strict';

  /* ---------- seamless 3D value noise (sampled on the sphere => no seam) */
  function makeNoise(seed) {
    const perm = new Uint8Array(512);
    let s = seed >>> 0 || 1;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const vals = Float32Array.from({ length: 256 }, rnd);
    const fade = (t) => t * t * (3 - 2 * t);
    const lerp = (a, b, t) => a + (b - a) * t;
    const h = (x, y, z) => vals[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
    function noise(x, y, z) {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
      const x0 = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), xf);
      const x1 = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf);
      const x2 = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf);
      const x3 = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf);
      return lerp(lerp(x0, x1, yf), lerp(x2, x3, yf), zf);
    }
    return function fbm(x, y, z, oct = 5) {
      let a = 0.5, f = 1, sum = 0, norm = 0;
      for (let i = 0; i < oct; i++) { sum += a * noise(x * f, y * f, z * f); norm += a; a *= 0.5; f *= 2.03; }
      return sum / norm;
    };
  }

  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function ramp(stops, t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        return mix(c0, c1, (t - t0) / (t1 - t0));
      }
    }
    return stops[stops.length - 1][1];
  }

  const PALETTES = {
    cyan: [
      [0.00, [6, 30, 52]], [0.30, [10, 90, 130]], [0.50, [20, 170, 205]],
      [0.66, [70, 225, 245]], [0.82, [170, 250, 255]], [1.00, [235, 255, 255]],
    ],
    amber: [
      [0.00, [70, 22, 4]], [0.28, [150, 60, 10]], [0.48, [222, 120, 24]],
      [0.66, [255, 175, 50]], [0.84, [255, 220, 140]], [1.00, [255, 245, 220]],
    ],
  };

  /** Banded, turbulent gas-giant style surface for a body. */
  function surfaceTexture(kind, seed) {
    const W = 512, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    const fbm = makeNoise(seed);
    const pal = PALETTES[kind];
    const bandFreq = kind === 'cyan' ? 7 : 11;
    for (let j = 0; j < H; j++) {
      const lat = (j / (H - 1) - 0.5) * Math.PI;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      for (let i = 0; i < W; i++) {
        const lon = (i / W) * Math.PI * 2;
        const x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
        const warp = fbm(x * 2.2 + 5, y * 2.2, z * 2.2, 4);
        const turb = fbm(x * 4 + warp * 2.5, y * 4, z * 4 + warp * 2.5, 5);
        const band = 0.5 + 0.5 * Math.sin((y + (warp - 0.5) * 0.35) * bandFreq * Math.PI);
        let t = 0.55 * band + 0.6 * turb - 0.12;
        if (kind === 'amber') {
          // a great storm
          const dx = lon - 4.0, dy = lat + 0.35;
          const d = Math.sqrt(dx * dx * 0.35 + dy * dy * 6);
          if (d < 0.28) t = t * 0.4 + 0.75 * (1 - d / 0.28) + 0.1;
        } else {
          t += (fbm(x * 9, y * 9, z * 9, 3) - 0.5) * 0.25;
        }
        const col = ramp(pal, t);
        const k = (j * W + i) * 4;
        img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  /** Soft radial glow (used for sprites / halos / particles). */
  function glowTexture(stops) {
    const S = 256;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    (stops || [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.55)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']])
      .forEach(([o, col]) => grd.addColorStop(o, col));
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  }

  /** Thin bright ring for landing ripples. */
  function ringTexture() {
    const S = 256;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(S / 2, S / 2, S * 0.30, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.72, 'rgba(255,255,255,0.0)');
    grd.addColorStop(0.86, 'rgba(255,255,255,1)');
    grd.addColorStop(0.92, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  }

  /** Cache so that previews and the main scene share textures. */
  const cache = {};
  TBS.Textures = {
    surface(kind) { return cache['s' + kind] || (cache['s' + kind] = surfaceTexture(kind, kind === 'cyan' ? 7 : 42)); },
    glow() { return cache.glow || (cache.glow = glowTexture()); },
    dot() {
      return cache.dot || (cache.dot = glowTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]));
    },
    ring() { return cache.ring || (cache.ring = ringTexture()); },
  };

  TBS.COLORS = {
    cyan: 0x2ee9ff, cyanDeep: 0x0a8fb0,
    amber: 0xffb12e, amberDeep: 0xff7a12,
  };
})(window.TBS = window.TBS || {});

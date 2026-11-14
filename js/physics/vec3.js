/* ==========================================================================
   vec3.js — minimal double-precision 3-vector maths for the physics engine.
   Deliberately independent of Three.js so the physics layer has no rendering
   dependency at all.
   ========================================================================== */
(function (TBS) {
  'use strict';

  const V = {
    create: (x = 0, y = 0, z = 0) => ({ x, y, z }),
    clone: (a) => ({ x: a.x, y: a.y, z: a.z }),
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    scale: (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
    dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    cross: (a, b) => ({
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    }),
    lenSq: (a) => a.x * a.x + a.y * a.y + a.z * a.z,
    len: (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z),
    normalize: (a) => {
      const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1;
      return { x: a.x / l, y: a.y / l, z: a.z / l };
    },
    /** In-place a += b*s (hot path, avoids allocation) */
    addScaledInPlace: (a, b, s) => { a.x += b.x * s; a.y += b.y * s; a.z += b.z * s; return a; },
  };

  TBS.Vec3 = V;
})(window.TBS = window.TBS || {});

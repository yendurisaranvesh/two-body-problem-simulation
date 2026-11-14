/* ==========================================================================
   TwoBodySystem.js — the physics core.

   Pure numerical model of two point masses under Newtonian gravity:

       F12 = G m1 m2 (r2 - r1) / |r2 - r1|^3

   Integrated with the Velocity Verlet scheme (2nd-order, symplectic,
   time-reversible), so total energy shows bounded oscillation rather than
   secular drift and angular momentum is conserved to round-off.

   This file has NO knowledge of Three.js, the DOM, or animation. The renderer
   only ever reads `bodies[i].pos` and the diagnostics returned here.

   Coordinate convention: y is "up"; the default orbital plane is x–z.
   ========================================================================== */
(function (TBS) {
  'use strict';
  const V = TBS.Vec3;

  class TwoBodySystem {
    /**
     * @param {object} p
     *  m1, m2       masses
     *  R1, R2       physical radii (used ONLY for collision detection)
     *  G            gravitational constant
     *  separation   initial distance between centres
     *  vFactor      |v_rel| as a multiple of the circular-orbit speed
     *  vAngle       deg; 0 = purely tangential, +90 = radially outward
     *  inclination  deg; tilts the initial velocity out of the x–z plane
     *  comSpeed     drift speed of the centre of mass (along +x)
     *  dt           fixed integration time-step
     */
    constructor(p) {
      this.params = Object.assign({}, p);
      this.collisions = true;
      this.softening = 0;          // Plummer softening length (0 = exact Newton)
      this.adaptive = false;       // optional step-size control near periapsis
      this.reset();
    }

    /* ---------------------------------------------------------------- setup */
    reset() {
      const p = this.params;
      const M = p.m1 + p.m2;
      const d = p.separation;

      // Place the centre of mass at the origin.
      const r1 = V.create(-(p.m2 / M) * d, 0, 0);
      const r2 = V.create((p.m1 / M) * d, 0, 0);

      // Relative velocity v_rel = v2 - v1, built from user parameters.
      const vCirc = Math.sqrt(p.G * M / d);
      const a = (p.vAngle || 0) * Math.PI / 180;
      const inc = (p.inclination || 0) * Math.PI / 180;
      const rHat = V.create(1, 0, 0);
      const tHat = V.create(0, 0, -1);            // gives +y angular momentum (CCW from above)
      const yHat = V.create(0, 1, 0);
      const tilted = V.add(V.scale(tHat, Math.cos(inc)), V.scale(yHat, Math.sin(inc)));
      const dir = V.add(V.scale(tilted, Math.cos(a)), V.scale(rHat, Math.sin(a)));
      const vRel = V.scale(dir, p.vFactor * vCirc);

      // Split v_rel so that total momentum = M * v_com.
      const vCom = V.create(p.comSpeed || 0, 0, 0);
      const v1 = V.sub(vCom, V.scale(vRel, p.m2 / M));
      const v2 = V.add(vCom, V.scale(vRel, p.m1 / M));

      this.bodies = [
        { name: 'Body 1', m: p.m1, R: p.R1, pos: r1, vel: v1, acc: V.create() },
        { name: 'Body 2', m: p.m2, R: p.R2, pos: r2, vel: v2, acc: V.create() },
      ];

      this.time = 0;
      this.steps = 0;
      this.collided = false;
      this.minSep = d;
      this.maxSep = d;
      this._computeAccelerations();
      this.initial = this.diagnostics();
      return this;
    }

    /** Characteristic time-scale: period of a circular orbit at the initial separation. */
    get circularPeriod() {
      const p = this.params;
      return 2 * Math.PI * Math.sqrt(Math.pow(p.separation, 3) / (p.G * (p.m1 + p.m2)));
    }

    /* -------------------------------------------------------------- forces */
    _computeAccelerations() {
      const [b1, b2] = this.bodies;
      const G = this.params.G;
      const r = V.sub(b2.pos, b1.pos);
      const d2 = V.lenSq(r) + this.softening * this.softening;
      const inv3 = 1 / (d2 * Math.sqrt(d2));
      // a1 = +G m2 r / |r|^3 ,  a2 = -G m1 r / |r|^3   (Newton's 3rd law)
      b1.acc = V.scale(r, G * b2.m * inv3);
      b2.acc = V.scale(r, -G * b1.m * inv3);
    }

    /* --------------------------------------------------- Velocity Verlet */
    /**
     *  x(t+dt) = x + v dt + ½ a(t) dt²
     *  a(t+dt) = F(x(t+dt)) / m
     *  v(t+dt) = v + ½ [a(t) + a(t+dt)] dt
     */
    step(dt) {
      const b = this.bodies;
      for (const body of b) {
        V.addScaledInPlace(body.pos, body.vel, dt);
        V.addScaledInPlace(body.pos, body.acc, 0.5 * dt * dt);
      }
      const aOld = [V.clone(b[0].acc), V.clone(b[1].acc)];
      this._computeAccelerations();
      for (let i = 0; i < 2; i++) {
        V.addScaledInPlace(b[i].vel, aOld[i], 0.5 * dt);
        V.addScaledInPlace(b[i].vel, b[i].acc, 0.5 * dt);
      }
      this.time += dt;
      this.steps++;

      const sep = this.separation();
      if (sep < this.minSep) this.minSep = sep;
      if (sep > this.maxSep) this.maxSep = sep;
      if (this.collisions && sep <= b[0].R + b[1].R) this.collided = true;
    }

    /**
     * Advance by `duration` of simulated time using steps of at most `dt`.
     * Returns the number of Verlet steps actually taken.
     */
    advance(duration, dt, maxSteps = 50000) {
      let remaining = duration, n = 0;
      while (remaining > 1e-15 && n < maxSteps && !this.collided) {
        let h = dt;
        if (this.adaptive) {
          // Keep the step a small fraction of the local dynamical time.
          const r = this.separation();
          const tDyn = Math.sqrt(r * r * r / (this.params.G * (this.params.m1 + this.params.m2)));
          h = Math.min(dt, 0.01 * tDyn);
        }
        h = Math.min(h, remaining);
        this.step(h);
        remaining -= h;
        n++;
      }
      return n;
    }

    /* --------------------------------------------------------- diagnostics */
    separation() { return V.len(V.sub(this.bodies[1].pos, this.bodies[0].pos)); }

    centerOfMass() {
      const [a, b] = this.bodies, M = a.m + b.m;
      return V.scale(V.add(V.scale(a.pos, a.m), V.scale(b.pos, b.m)), 1 / M);
    }
    centerOfMassVelocity() {
      const [a, b] = this.bodies, M = a.m + b.m;
      return V.scale(V.add(V.scale(a.vel, a.m), V.scale(b.vel, b.m)), 1 / M);
    }

    diagnostics() {
      const [a, b] = this.bodies;
      const G = this.params.G, M = a.m + b.m, mu = a.m * b.m / M;
      const r = V.sub(b.pos, a.pos), v = V.sub(b.vel, a.vel);
      const rl = V.len(r), vl = V.len(v);

      const KE = 0.5 * a.m * V.lenSq(a.vel) + 0.5 * b.m * V.lenSq(b.vel);
      const PE = -G * a.m * b.m / Math.sqrt(rl * rl + this.softening * this.softening);
      const E = KE + PE;

      const P = V.add(V.scale(a.vel, a.m), V.scale(b.vel, b.m));
      const com = this.centerOfMass(), vcom = this.centerOfMassVelocity();
      // Total angular momentum about the (moving) centre of mass
      const L = V.add(
        V.scale(V.cross(V.sub(a.pos, com), V.sub(a.vel, vcom)), a.m),
        V.scale(V.cross(V.sub(b.pos, com), V.sub(b.vel, vcom)), b.m));

      // Relative-orbit (Kepler) elements
      const GM = G * M;
      const h = V.cross(r, v);                 // specific angular momentum
      const eps = 0.5 * vl * vl - GM / rl;     // specific orbital energy
      const eVec = V.sub(V.scale(V.cross(v, h), 1 / GM), V.scale(r, 1 / rl));
      const e = V.len(eVec);
      const aSemi = Math.abs(eps) > 1e-14 ? -GM / (2 * eps) : Infinity;
      const p = V.lenSq(h) / GM;               // semi-latus rectum
      const rPeri = p / (1 + e);
      const rApo = e < 1 ? p / (1 - e) : Infinity;
      const period = (eps < 0 && aSemi > 0) ? 2 * Math.PI * Math.sqrt(aSemi * aSemi * aSemi / GM) : Infinity;
      const incl = V.len(h) > 0 ? Math.acos(Math.max(-1, Math.min(1, h.y / V.len(h)))) * 180 / Math.PI : 0;

      let type;
      if (V.len(h) < 1e-9 * rl * vl + 1e-14) type = 'Radial (head-on)';
      else if (e < 0.01) type = 'Circular';
      else if (e < 0.995) type = 'Elliptical';
      else if (e <= 1.005) type = 'Parabolic';
      else type = 'Hyperbolic';

      return {
        time: this.time, steps: this.steps,
        separation: rl, relSpeed: vl,
        speed1: V.len(a.vel), speed2: V.len(b.vel),
        force: G * a.m * b.m / (rl * rl),
        KE, PE, E, P, Pmag: V.len(P), L, Lmag: V.len(L),
        mu, M, eps, e, eVec, h, a: aSemi, p, rPeri, rApo, period, incl,
        bound: eps < 0, type, com, vcom,
      };
    }

    /**
     * Points of the osculating Kepler conic of the RELATIVE orbit r = r2 - r1,
     * in the frame of the centre of mass. Renderer maps them to each body:
     *     r1 = com - (m2/M) r ,   r2 = com + (m1/M) r
     */
    conicPoints(n = 256, D = this.diagnostics()) {
      const hMag = V.len(D.h);
      if (hMag < 1e-9) return [];
      const hHat = V.scale(D.h, 1 / hMag);
      let P = D.e > 1e-6 ? V.scale(D.eVec, 1 / D.e)
        : V.normalize(V.sub(this.bodies[1].pos, this.bodies[0].pos));
      const Q = V.cross(hHat, P);
      let thMax = Math.PI;
      if (D.e >= 1) thMax = Math.acos(-1 / D.e) * 0.985;   // stay inside asymptotes
      const pts = [];
      const limit = 40 * this.params.separation;
      for (let i = 0; i <= n; i++) {
        const th = -thMax + (2 * thMax * i) / n;
        const rr = D.p / (1 + D.e * Math.cos(th));
        if (!(rr > 0) || rr > limit) continue;
        pts.push(V.add(V.scale(P, rr * Math.cos(th)), V.scale(Q, rr * Math.sin(th))));
      }
      return pts;
    }
  }

  /** Static helper: preview of an initial configuration without integrating. */
  TwoBodySystem.preview = function (p) { return new TwoBodySystem(p).diagnostics(); };

  TBS.TwoBodySystem = TwoBodySystem;
})(window.TBS = window.TBS || {});

/* ==========================================================================
   IntroAnimation.js — cinematic "drop" introduction.

   PURELY VISUAL. It moves the rendered meshes only; it never reads or writes
   the physics bodies' state except to learn the target (initial) positions.
   When it ends (or is skipped) the meshes sit exactly at the physics initial
   positions, and the integrator starts from t = 0 with untouched values.
   ========================================================================== */
(function (TBS) {
  'use strict';

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  // drop: gentle acceleration, then a soft, decelerating touchdown
  const easeDrop = (t) => (t < 0.55 ? 0.62 * Math.pow(t / 0.55, 2) : 0.62 + 0.38 * easeOutCubic((t - 0.55) / 0.45));
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  class IntroAnimation {
    constructor(renderer, system, ui) {
      this.r = renderer; this.sys = system; this.ui = ui;
      const [a, b] = system.bodies;
      this.target1 = { ...a.pos }; this.target2 = { ...b.pos };
      const S = renderer.S;
      this.h = S * 1.7;   // drop height
      this.T = { gridIn: 0, d1: 0.9, d2: 1.55, dur: 1.75, settle: 3.9, end: 5.1 };
      this.t = 0; this.done = false;
      this.landed1 = this.landed2 = false;
      this.captions = [
        [0.0, 'Establishing inertial reference frame'],
        [this.T.d1 + 0.2, 'Introducing Body 1'],
        [this.T.d2 + 0.25, 'Introducing Body 2'],
        [this.T.settle - 0.3, 'Assigning initial velocities · gravity ON'],
      ];
      // initial cinematic camera: high and wide, then glide down
      renderer.rig.set({ target: new THREE.Vector3(0, S * 0.3, 0), radius: S * 5.2, theta: -0.9, phi: 0.42 }, true);
      renderer.rig.set({ target: new THREE.Vector3(0, S * 0.15, 0), radius: S * 3.2, theta: 0.2, phi: 0.85 });
      renderer.rig.damping = 1.2;
      renderer.gridFade = 0;
      renderer.wellOn = false;
      this._hideVectors(true);
      this._place(0);
    }

    _hideVectors(h) {
      const r = this.r;
      this._saved = this._saved || { ...r.opts };
      if (h) Object.assign(r.opts, { vel: false, force: false, com: false, line: false, conic: false, trails: false });
    }

    _bodyAt(target, t0) {
      const k = clamp01((this.t - t0) / this.T.dur);
      const e = easeDrop(k);
      return { k, p: { x: target.x, y: target.y + this.h * (1 - e), z: target.z } };
    }

    _place(dt) {
      const r = this.r, T = this.T, S = r.S;
      const A = this._bodyAt(this.target1, T.d1), B = this._bodyAt(this.target2, T.d2);
      r.placeBodies(A.p, B.p);

      // appear: scale up + fade glow while starting the fall
      const grow = (g, k, R) => { const s = R * (0.15 + 0.85 * easeOutCubic(clamp01(k * 3))); g.scale.setScalar(s); g.visible = this.t >= (g === r.b1 ? T.d1 : T.d2) - 0.05; };
      grow(r.b1, A.k, this.sys.params.R1);
      grow(r.b2, B.k, this.sys.params.R2);

      // trailing sparks while falling
      const spark = (k, p, color, R) => {
        if (k <= 0 || k >= 0.98 || dt === 0) return;
        const n = Math.ceil(70 * dt);
        for (let i = 0; i < n; i++) {
          const j = { x: p.x + (Math.random() - 0.5) * R * 1.4, y: p.y + R * (0.4 + Math.random()), z: p.z + (Math.random() - 0.5) * R * 1.4 };
          r.particles.emit(j, { x: (Math.random() - 0.5) * S * 0.02, y: S * 0.05 * Math.random(), z: (Math.random() - 0.5) * S * 0.02 }, color, 0.6 + Math.random() * 0.5);
        }
      };
      spark(A.k, A.p, TBS.COLORS.cyan, this.sys.params.R1);
      spark(B.k, B.p, TBS.COLORS.amber, this.sys.params.R2);

      if (A.k >= 1 && !this.landed1) { this.landed1 = true; this._land(this.target1, TBS.COLORS.cyan, this.sys.params.m1); }
      if (B.k >= 1 && !this.landed2) { this.landed2 = true; this._land(this.target2, TBS.COLORS.amber, this.sys.params.m2); }

      r.gridFade = easeInOutCubic(clamp01(this.t / 1.2));
    }

    _land(p, color, m) {
      const S = this.r.S;
      this.r.ripple(p, color, 1);
      this.r.particles.burst(p, color, 90, S * 0.35, 1.3);
    }

    update(dt) {
      if (this.done) return true;
      this.t += dt;
      const T = this.T;
      this._place(dt);

      // caption timeline
      let cap = this.captions[0][1];
      for (const [t, c] of this.captions) if (this.t >= t) cap = c;
      this.ui && this.ui.introCaption(cap);

      // after both landed, sculpt the gravity wells in and swing the camera home
      if (this.t > T.d2 + T.dur && !this.wellsIn) {
        this.wellsIn = true;
        this.r.wellOn = true;
        this.r.grid.addRipple(0, 0, 0.6);
      }
      if (this.t > T.settle && !this.homed) {
        this.homed = true;
        this.r.rig.damping = 1.6;
        this.r.rig.set(Object.assign({ target: new THREE.Vector3(0, 0, 0) }, this.r.homeView));
        Object.assign(this.r.opts, this._saved);
      }
      if (this.t >= T.end) this.finish();
      return this.done;
    }

    /** Jump straight to the final state (also used by SKIP). */
    finish() {
      if (this.done) return;
      this.done = true;
      const r = this.r;
      r.placeBodies(this.target1, this.target2);
      r.b1.scale.setScalar(this.sys.params.R1); r.b2.scale.setScalar(this.sys.params.R2);
      r.b1.visible = r.b2.visible = true;
      r.gridFade = 1; r.wellOn = true;
      Object.assign(r.opts, this._saved);
      r.rig.damping = 6;
      if (!this.homed) r.rig.set(Object.assign({ target: new THREE.Vector3(0, 0, 0) }, r.homeView), false);
      this.onDone && this.onDone();
    }
  }

  TBS.IntroAnimation = IntroAnimation;
})(window.TBS = window.TBS || {});

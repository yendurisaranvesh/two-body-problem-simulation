/* ==========================================================================
   CameraRig.js — damped spherical orbit camera (rotate / pan / zoom, touch),
   with smooth programmatic transitions used by the intro and camera presets.
   ========================================================================== */
(function (TBS) {
  'use strict';

  class CameraRig {
    constructor(camera, dom) {
      this.camera = camera;
      this.dom = dom;
      this.enabled = true;
      // current & goal spherical state
      this.cur = { target: new THREE.Vector3(), radius: 80, theta: 0.6, phi: 1.05 };
      this.goal = { target: new THREE.Vector3(), radius: 80, theta: 0.6, phi: 1.05 };
      this.damping = 6;          // higher = snappier
      this.minRadius = 2; this.maxRadius = 4000;
      this.followOffset = new THREE.Vector3(); // added to target (used for COM follow)
      this._bind();
      this.apply();
    }

    set(state, instant = false) {
      if (state.target) this.goal.target.copy(state.target);
      if (state.radius !== undefined) this.goal.radius = state.radius;
      if (state.theta !== undefined) this.goal.theta = state.theta;
      if (state.phi !== undefined) this.goal.phi = state.phi;
      if (instant) {
        this.cur.target.copy(this.goal.target);
        Object.assign(this.cur, { radius: this.goal.radius, theta: this.goal.theta, phi: this.goal.phi });
        this.apply();
      }
    }

    update(dt) {
      const k = 1 - Math.exp(-this.damping * dt);
      this.cur.target.lerp(this.goal.target, k);
      this.cur.radius += (this.goal.radius - this.cur.radius) * k;
      this.cur.theta += (this.goal.theta - this.cur.theta) * k;
      this.cur.phi += (this.goal.phi - this.cur.phi) * k;
      this.apply();
    }

    apply() {
      const { target, radius, theta, phi } = this.cur;
      const sp = Math.sin(phi);
      this.camera.position.set(
        target.x + radius * sp * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * sp * Math.cos(theta));
      this.camera.lookAt(target);
    }

    _bind() {
      const el = this.dom;
      let mode = null, lx = 0, ly = 0, pinch = 0;
      const pan = (dx, dy) => {
        const s = this.goal.radius * 0.0016;
        const cam = this.camera;
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
        this.goal.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
      };
      const rotate = (dx, dy) => {
        this.goal.theta -= dx * 0.0055;
        this.goal.phi = Math.min(Math.PI - 0.05, Math.max(0.05, this.goal.phi - dy * 0.0055));
      };
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('pointerdown', (e) => {
        if (!this.enabled || e.pointerType === 'touch') return;
        mode = (e.button === 2 || e.shiftKey) ? 'pan' : 'rot';
        lx = e.clientX; ly = e.clientY;
        el.setPointerCapture(e.pointerId);
        this.onUserInput && this.onUserInput(mode);
      });
      el.addEventListener('pointermove', (e) => {
        if (!mode || e.pointerType === 'touch') return;
        const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
        mode === 'pan' ? pan(dx, dy) : rotate(dx, dy);
      });
      el.addEventListener('pointerup', () => { mode = null; });
      el.addEventListener('wheel', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.goal.radius = Math.min(this.maxRadius, Math.max(this.minRadius, this.goal.radius * Math.exp(e.deltaY * 0.0012)));
      }, { passive: false });

      // touch
      el.addEventListener('touchstart', (e) => {
        if (!this.enabled) return;
        if (e.touches.length === 1) { mode = 'rot'; lx = e.touches[0].clientX; ly = e.touches[0].clientY; }
        if (e.touches.length === 2) {
          mode = 'pinch';
          pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          lx = (e.touches[0].clientX + e.touches[1].clientX) / 2; ly = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        }
        this.onUserInput && this.onUserInput(mode);
      }, { passive: true });
      el.addEventListener('touchmove', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        if (mode === 'rot' && e.touches.length === 1) {
          const t = e.touches[0]; rotate(t.clientX - lx, t.clientY - ly); lx = t.clientX; ly = t.clientY;
        } else if (e.touches.length === 2) {
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          this.goal.radius = Math.min(this.maxRadius, Math.max(this.minRadius, this.goal.radius * pinch / d));
          pan(cx - lx, cy - ly); pinch = d; lx = cx; ly = cy;
        }
      }, { passive: false });
      el.addEventListener('touchend', () => { mode = null; });
    }
  }

  TBS.CameraRig = CameraRig;
})(window.TBS = window.TBS || {});

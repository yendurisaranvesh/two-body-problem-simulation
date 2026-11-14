/* ==========================================================================
   Charts.js — lightweight live time-series charts on a 2D canvas.
   ========================================================================== */
(function (TBS) {
  'use strict';
  const F = TBS.fmt;

  class Charts {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.mode = 'energy';
      this.max = 1600;
      this.clear();
      new ResizeObserver(() => this._resize()).observe(canvas);
      this._resize();
    }
    clear() { this.t = []; this.K = []; this.U = []; this.E = []; this.r = []; this.dE = []; this.lastT = -Infinity; }
    _resize() {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const w = this.cv.clientWidth, h = this.cv.clientHeight;
      this.cv.width = Math.max(1, w * dpr); this.cv.height = Math.max(1, h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w; this.h = h; this.draw();
    }
    push(D, E0, sampleDt) {
      if (D.time - this.lastT < sampleDt) return;
      this.lastT = D.time;
      this.t.push(D.time); this.K.push(D.KE); this.U.push(D.PE); this.E.push(D.E);
      this.r.push(D.separation); this.dE.push((D.E - E0) / Math.abs(E0 || 1));
      if (this.t.length > this.max) {      // decimate: keep every other sample
        for (const k of ['t', 'K', 'U', 'E', 'r', 'dE']) this[k] = this[k].filter((_, i) => i % 2 === 0);
      }
    }

    draw() {
      const { ctx, w, h } = this;
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const n = this.t.length;
      const L = 64, R = 14, T = 24, B = 20;
      const pw = w - L - R, ph = h - T - B;
      let series;
      if (this.mode === 'energy') series = [
        { d: this.K, c: '#5cf2a5', name: 'Kinetic K' },
        { d: this.U, c: '#a98bff', name: 'Potential U' },
        { d: this.E, c: '#ffffff', name: 'Total E = K + U', wide: true },
      ];
      else if (this.mode === 'sep') series = [{ d: this.r, c: '#2ee9ff', name: 'Separation r(t)', wide: true }];
      else series = [{ d: this.dE, c: '#ffb12e', name: 'Relative energy error (E − E₀)/|E₀|', wide: true }];

      let lo = Infinity, hi = -Infinity;
      for (const s of series) for (const v of s.d) { if (v < lo) lo = v; if (v > hi) hi = v; }
      if (!isFinite(lo)) { lo = -1; hi = 1; }
      if (this.mode === 'sep') lo = Math.min(lo, 0);
      if (hi - lo < 1e-15) { const m = Math.abs(hi) || 1; lo -= m * 0.1; hi += m * 0.1; }
      const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
      const t0 = n ? this.t[0] : 0, t1 = n ? Math.max(this.t[n - 1], t0 + 1e-9) : 1;
      const X = (t) => L + ((t - t0) / (t1 - t0)) * pw;
      const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * ph;

      // grid + axes labels
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = 'rgba(154,166,194,.75)'; ctx.strokeStyle = 'rgba(150,175,230,.10)'; ctx.lineWidth = 1;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) {
        const v = lo + (hi - lo) * (i / 4), y = Y(v);
        ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
        ctx.fillText(this.mode === 'error' ? F.sci(v, 1) : F.num(v, 3), L - 6, y);
      }
      if (lo < 0 && hi > 0 && this.mode !== 'sep') {
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(w - R, Y(0)); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let i = 0; i <= 5; i++) {
        const t = t0 + (t1 - t0) * i / 5;
        ctx.textAlign = i === 0 ? 'left' : i === 5 ? 'right' : 'center';
        ctx.fillText((i === 5 ? 't = ' : '') + F.num(t, 3), X(t), h - B + 5);
      }

      // lines
      for (const s of series) {
        if (n < 2) break;
        ctx.strokeStyle = s.c; ctx.lineWidth = s.wide ? 2 : 1.4;
        ctx.shadowColor = s.c; ctx.shadowBlur = s.wide ? 8 : 0;
        ctx.beginPath();
        const step = Math.max(1, Math.floor(n / pw));
        for (let i = 0; i < n; i += step) { const x = X(this.t[i]), y = Y(s.d[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.lineTo(X(this.t[n - 1]), Y(s.d[n - 1]));
        ctx.stroke(); ctx.shadowBlur = 0;
      }
      // legend
      let lx = L + 10;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '11px Space Grotesk, sans-serif';
      for (const s of series) {
        ctx.fillStyle = s.c; ctx.fillRect(lx, 7, 14, 3);
        ctx.fillStyle = 'rgba(231,236,247,.85)'; ctx.fillText(s.name, lx + 20, 8.5);
        lx += ctx.measureText(s.name).width + 44;
      }
    }
  }

  TBS.Charts = Charts;
})(window.TBS = window.TBS || {});

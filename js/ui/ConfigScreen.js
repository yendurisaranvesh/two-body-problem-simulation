/* ==========================================================================
   ConfigScreen.js — initial configuration UI: two bodies + initial conditions.
   ========================================================================== */
(function (TBS) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const F = TBS.fmt;

  const PRESETS = {
    circular:  { m1: 100, m2: 10,  R1: 2.2, R2: 1.0, sep: 40, vf: 1.00, va: 0,  inc: 0,  vcm: 0, G: 1 },
    ellipse:   { m1: 100, m2: 20,  R1: 2.4, R2: 1.2, sep: 40, vf: 0.72, va: 0,  inc: 0,  vcm: 0, G: 1 },
    binary:    { m1: 60,  m2: 60,  R1: 1.8, R2: 1.8, sep: 30, vf: 0.85, va: 0,  inc: 0,  vcm: 0, G: 1 },
    planet:    { m1: 1000, m2: 2,  R1: 4.0, R2: 0.7, sep: 60, vf: 1.00, va: 0,  inc: 0,  vcm: 0, G: 1 },
    escape:    { m1: 100, m2: 40,  R1: 2.2, R2: 1.6, sep: 30, vf: 1.55, va: 0,  inc: 0,  vcm: 0, G: 1 },
    inclined:  { m1: 80,  m2: 30,  R1: 2.0, R2: 1.3, sep: 36, vf: 0.80, va: 10, inc: 35, vcm: 0, G: 1 },
    drift:     { m1: 80,  m2: 25,  R1: 2.0, R2: 1.2, sep: 30, vf: 0.90, va: 0,  inc: 0,  vcm: 0.45, G: 1 },
    collision: { m1: 100, m2: 50,  R1: 2.2, R2: 1.8, sep: 40, vf: 0.00, va: 0,  inc: 0,  vcm: 0, G: 1 },
  };

  // [sliderId, numberId, paramKey, decimals]
  const FIELDS = [
    ['m1', 'm1n', 'm1', 2], ['R1', 'R1n', 'R1', 2],
    ['m2', 'm2n', 'm2', 2], ['R2', 'R2n', 'R2', 2],
    ['sep', 'sepn', 'sep', 1], ['vf', 'vfn', 'vf', 3],
    ['va', 'van', 'va', 0], ['inc', 'incn', 'inc', 0],
    ['vcm', 'vcmn', 'vcm', 2], ['G', 'Gn', 'G', 3],
  ];

  class ConfigScreen {
    constructor(onLaunch) {
      this.onLaunch = onLaunch;
      this.values = { ...PRESETS.ellipse };
      this.previews = [];
      try {
        this.previews = [new TBS.BodyPreview($('preview1'), 'cyan'), new TBS.BodyPreview($('preview2'), 'amber')];
      } catch (e) { console.warn('Preview unavailable', e); }

      for (const [sid, nid, key, dec] of FIELDS) {
        const s = $(sid), n = $(nid);
        const log = s.dataset.log ? s.dataset.log.split(',').map(Number) : null;
        const toSlider = (v) => (log ? Math.log(v / log[0]) / Math.log(log[1] / log[0]) : v);
        const fromSlider = (u) => (log ? log[0] * Math.pow(log[1] / log[0], u) : u);
        const round = (v) => +(+v).toFixed(dec);
        const set = (v, from) => {
          const lo = log ? log[0] : +s.min, hi = log ? log[1] : +s.max;
          if (!isFinite(v)) return;
          v = Math.min(hi, Math.max(lo, v));
          this.values[key] = round(v);
          if (from !== 's') s.value = toSlider(this.values[key]);
          if (from !== 'n') n.value = this.values[key];
          this._fill(s);
          this._clearPreset();
          this.refresh();
        };
        s.addEventListener('input', () => set(fromSlider(+s.value), 's'));
        n.addEventListener('change', () => set(parseFloat(n.value), 'n'));
        n.addEventListener('keydown', (e) => { if (e.key === 'Enter') n.blur(); });
        this[`_set_${key}`] = (v) => { set(v); };
      }

      document.querySelectorAll('[data-preset]').forEach((b) =>
        b.addEventListener('click', () => this.applyPreset(b.dataset.preset)));
      $('launch').addEventListener('click', () => this.launch());
      this.applyPreset('ellipse');
    }

    _fill(s) {
      const p = ((s.value - s.min) / (s.max - s.min)) * 100;
      s.style.setProperty('--p', p + '%');
    }
    _clearPreset() { if (!this._applying) document.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('on')); }

    applyPreset(name) {
      const p = PRESETS[name]; if (!p) return;
      this._applying = true;
      for (const [, , key] of FIELDS) this[`_set_${key}`](p[key]);
      this._applying = false;
      document.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === name));
      this.refresh();
    }

    params() {
      const v = this.values;
      return {
        m1: v.m1, m2: v.m2, R1: v.R1, R2: v.R2, G: v.G, separation: v.sep,
        vFactor: v.vf, vAngle: v.va, inclination: v.inc, comSpeed: v.vcm,
      };
    }

    refresh() {
      const p = this.params();
      this.previews[0] && this.previews[0].setRadius(p.R1);
      this.previews[1] && this.previews[1].setRadius(p.R2);
      const sys = new TBS.TwoBodySystem(p);
      const D = sys.diagnostics();
      const M = p.m1 + p.m2;
      const vc = Math.sqrt(p.G * M / p.separation);
      const overlap = p.separation <= p.R1 + p.R2;
      const willHit = !overlap && (D.rPeri <= p.R1 + p.R2 || D.type.startsWith('Radial'));
      const badge = D.type;
      let verdict;
      if (overlap) verdict = `<b style="color:var(--bad)">The bodies overlap.</b> Increase the separation above R₁ + R₂ = ${F.num(p.R1 + p.R2)}.`;
      else if (D.type.startsWith('Radial')) verdict = `<b>Head-on fall.</b> With no sideways velocity there is no angular momentum, so the bodies fall straight toward each other and collide.`;
      else if (D.bound) verdict = `<b>${badge} bound orbit</b> (E &lt; 0). The pair will keep circling their centre of mass, which sits <b>${F.num(p.m2 / M * p.separation)}</b> from Body 1, every <b>${F.num(D.period)}</b> time units.` +
        (willHit ? ` <b style="color:var(--bad)">Warning:</b> the closest approach (${F.num(D.rPeri)}) is smaller than R₁ + R₂, so they will collide.` : '');
      else verdict = `<b>${badge} trajectory</b> (E ${D.type === 'Parabolic' ? '≈' : '&gt;'} 0). The relative speed is at or above escape speed (${F.num(vc * Math.SQRT2)}), so the bodies swing past each other once and separate for good.`;

      $('prediction').innerHTML = `
        <div class="p"><div class="k">Orbit type</div><div class="v">${badge}</div></div>
        <div class="p"><div class="k">Eccentricity e</div><div class="v">${F.num(D.e, 3)}</div></div>
        <div class="p"><div class="k">Period T</div><div class="v">${F.num(D.period)}</div></div>
        <div class="p"><div class="k">v<sub>circ</sub> · v<sub>esc</sub></div><div class="v">${F.num(vc, 3)} · ${F.num(vc * Math.SQRT2, 3)}</div></div>
        <div class="p"><div class="k">Periapsis · apoapsis</div><div class="v">${F.num(D.rPeri, 3)} · ${F.num(D.rApo, 3)}</div></div>
        <div class="p"><div class="k">Mass ratio m₁/m₂</div><div class="v">${F.num(p.m1 / p.m2, 3)}</div></div>
        <div class="verdict">${verdict}</div>`;
      $('launch').disabled = overlap;
    }

    launch() {
      if ($('launch').disabled) return;
      this.onLaunch(this.params(), $('playIntro').checked);
    }

    render(dt) { this.previews.forEach((p) => p.render(dt)); }
  }

  TBS.ConfigScreen = ConfigScreen;
})(window.TBS = window.TBS || {});

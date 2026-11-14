/* ==========================================================================
   SimulationUI.js — controls, live telemetry, labels, narrative, shortcuts.
   Talks to the app only through the `app` interface passed in.
   ========================================================================== */
(function (TBS) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const F = TBS.fmt;

  class SimulationUI {
    constructor(app) {
      this.app = app;
      this.root = $('sim');
      this._lastTele = 0;

      $('btnPlay').addEventListener('click', () => app.togglePlay());
      $('btnStep').addEventListener('click', () => app.stepOnce());
      $('btnReset').addEventListener('click', () => app.reset());
      $('btnReconfig').addEventListener('click', () => app.reconfigure());
      $('btnSkip').addEventListener('click', () => app.skipIntro());
      $('btnCollReset').addEventListener('click', () => { this.collision(false); app.reset(); });
      $('btnCollIgnore').addEventListener('click', () => { this.collision(false); app.ignoreCollision(); });
      $('btnHide').addEventListener('click', () => this.toggleUI());
      $('btnHelp').addEventListener('click', () => this.guide(true));
      $('guideClose').addEventListener('click', () => this.guide(false));
      $('guide').addEventListener('click', (e) => { if (e.target.id === 'guide') this.guide(false); });

      const speed = $('speed');
      const onSpeed = () => { const m = Math.pow(2, +speed.value); $('speedVal').textContent = (m < 1 ? m.toFixed(2) : m.toFixed(1)) + '×'; app.setSpeed(m); this._fill(speed); };
      speed.addEventListener('input', onSpeed); onSpeed();
      const dt = $('dt');
      const onDt = () => { const f = Math.pow(10, +dt.value); $('dtVal').textContent = F.sci(f, 1) + ' T'; app.setDtFraction(f); this._fill(dt); };
      dt.addEventListener('input', onDt); onDt();
      const tl = $('trailLen');
      const onTl = () => { $('trailVal').textContent = tl.value + ' pts'; app.setTrailLength(+tl.value); this._fill(tl); };
      tl.addEventListener('input', onTl); onTl();
      $('optAdaptive').addEventListener('change', (e) => app.setAdaptive(e.target.checked));

      const opts = { optTrails: 'trails', optConic: 'conic', optVel: 'vel', optForce: 'force', optCom: 'com', optLine: 'line', optWell: 'well', optLabels: 'labels', optFollow: 'follow' };
      for (const [id, key] of Object.entries(opts)) {
        $(id).addEventListener('change', (e) => app.setOption(key, e.target.checked));
      }
      this.optIds = opts;

      document.querySelectorAll('#camSeg button').forEach((b) => b.addEventListener('click', () => this.setCam(b.dataset.cam)));
      document.querySelectorAll('.dock-tabs button').forEach((b) => b.addEventListener('click', () => {
        document.querySelectorAll('.dock-tabs button').forEach((x) => x.classList.toggle('on', x === b));
        app.setChart(b.dataset.chart);
      }));

      window.addEventListener('keydown', (e) => this._key(e));
    }

    _fill(s) { s.style.setProperty('--p', ((s.value - s.min) / (s.max - s.min)) * 100 + '%'); }

    setCam(mode) {
      document.querySelectorAll('#camSeg button').forEach((x) => x.classList.toggle('on', x.dataset.cam === mode));
      this.app.setCamera(mode);
    }

    toggleOpt(key) {
      const id = Object.keys(this.optIds).find((k) => this.optIds[k] === key);
      const el = $(id); el.checked = !el.checked; el.dispatchEvent(new Event('change'));
    }

    toggleUI() { this.root.classList.toggle('hide-ui'); }
    guide(show) { $('guide').classList.toggle('show', show); }

    _key(e) {
      if (!this.root.classList.contains('active')) return;
      if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
      const k = e.key;
      if (k === ' ') { e.preventDefault(); this.app.togglePlay(); }
      else if (k === 'r' || k === 'R') this.app.reset();
      else if (k === '.') this.app.stepOnce();
      else if (k === 't' || k === 'T') this.toggleOpt('trails');
      else if (k === 'k' || k === 'K') this.toggleOpt('conic');
      else if (k === 'v' || k === 'V') this.toggleOpt('vel');
      else if (k === 'f' || k === 'F') this.toggleOpt('force');
      else if (k === 'h' || k === 'H') this.toggleUI();
      else if (k === '?' || k === '/') this.guide(!$('guide').classList.contains('show'));
      else if (k === 'Escape') { this.guide(false); this.app.skipIntro(); }
      else if ('12345'.includes(k)) this.setCam(['orbit', 'top', 'side', 'b1', 'b2'][+k - 1]);
    }

    /* --------------------------------------------------------- state */
    setPlaying(p) { $('btnPlay').textContent = p ? '❚❚' : '▶'; $('btnPlay').classList.toggle('primary', !p); }
    setIntro(on) { this.root.classList.toggle('intro', on); }
    introCaption(text) { const c = $('introCaption'); if (c.textContent !== text) c.textContent = text; }
    collision(show) { $('collision').classList.toggle('show', show); }

    /* ---------------------------------------------------- per frame */
    labels(renderer, system, D, show) {
      const place = (el, pos, offsetY) => {
        const s = renderer.worldToScreen(pos);
        el.classList.toggle('hidden', !show || !s.visible);
        el.style.transform = `translate(${s.x}px, ${s.y - offsetY}px) translate(-50%, -100%)`;
      };
      const [a, b] = system.bodies;
      // offset label above the sphere's projected radius
      const pxR = (body) => {
        const p0 = renderer.worldToScreen(body.pos);
        const p1 = renderer.worldToScreen({ x: body.pos.x, y: body.pos.y + body.R, z: body.pos.z });
        return Math.abs(p0.y - p1.y) + 10;
      };
      place($('lab1'), a.pos, pxR(a));
      place($('lab2'), b.pos, pxR(b));
      place($('labCom'), D.com, 14);
      if (!renderer.opts.com) $('labCom').classList.add('hidden');
    }

    telemetry(D, system, now) {
      if (now - this._lastTele < 90) return;
      this._lastTele = now;
      const I = system.initial;
      const [a, b] = system.bodies;
      const set = (id, v) => { const el = $(id); if (el.innerHTML !== v) el.innerHTML = v; };
      const dist = (p) => Math.hypot(p.x - D.com.x, p.y - D.com.y, p.z - D.com.z);

      set('tTime', F.fixed(D.time, 2));
      set('tOrbits', isFinite(I.period) ? F.fixed(D.time / I.period, 2) : '—');
      const badge = $('tType');
      badge.textContent = D.type + (D.bound ? ' · bound' : D.type === 'Parabolic' ? '' : ' · unbound');
      badge.className = 'badge ' + (D.type === 'Parabolic' ? 'para' : D.bound ? 'bound' : 'unbound');

      set('d_m1', F.num(a.m)); set('d_m2', F.num(b.m));
      set('d_v1', F.num(D.speed1)); set('d_v2', F.num(D.speed2));
      set('d_r1', F.num(dist(a.pos))); set('d_r2', F.num(dist(b.pos)));
      set('d_sep', F.num(D.separation));
      set('d_F', F.num(D.force));
      set('d_minmax', `${F.num(system.minSep, 3)} / ${F.num(system.maxSep, 3)}`);
      set('d_K', F.num(D.KE)); set('d_U', F.num(D.PE)); set('d_E', F.num(D.E));
      const dE = Math.abs((D.E - I.E) / (Math.abs(I.E) || 1));
      const dL = I.Lmag > 0 ? Math.abs(D.Lmag - I.Lmag) / I.Lmag : 0;
      const cls = (x) => (x < 1e-6 ? 'ok' : x < 1e-3 ? 'meh' : 'bad');
      set('d_dE', `<span class="${cls(dE)}">${F.sci(dE, 2)}</span>`);
      set('d_L', F.num(D.Lmag));
      set('d_dL', `<span class="${cls(dL)}">${F.sci(dL, 2)}</span>`);
      set('d_P', F.num(D.Pmag));
      set('d_e', F.num(D.e, 4));
      set('d_a', D.bound ? F.num(D.a) : (isFinite(D.a) ? F.num(D.a) + ' (hyp.)' : '∞'));
      set('d_pa', `${F.num(D.rPeri, 3)} / ${F.num(D.rApo, 3)}`);
      set('d_T', F.num(D.period));
      set('d_mu', F.num(D.mu));

      // plain-language narration
      const r = { x: b.pos.x - a.pos.x, y: b.pos.y - a.pos.y, z: b.pos.z - a.pos.z };
      const v = { x: b.vel.x - a.vel.x, y: b.vel.y - a.vel.y, z: b.vel.z - a.vel.z };
      const rdot = (r.x * v.x + r.y * v.y + r.z * v.z) / D.separation;
      const vs = D.relSpeed || 1;
      let msg;
      if (D.type === 'Circular') msg = 'A <b>circular orbit</b>: the distance stays constant, so gravity changes only the direction of motion, never the speed.';
      else if (Math.abs(rdot) < 0.06 * vs && D.e > 0.02) {
        msg = D.separation < (D.rPeri + (isFinite(D.rApo) ? D.rApo : D.rPeri * 3)) / 2
          ? '<b>Closest approach (periapsis).</b> Speeds and forces are at their maximum here.'
          : '<b>Farthest point (apoapsis).</b> Speeds are at their minimum, and kinetic energy is stored as potential energy.';
      } else if (rdot < 0) msg = '<b>Falling together.</b> Gravity speeds both bodies up: U becomes more negative and K grows.';
      else msg = D.bound ? '<b>Moving apart.</b> Gravity slows them down: K turns back into U, and they will turn around.'
        : '<b>Escaping.</b> Gravity slows them, but they have enough energy that they will never return.';
      set('narrative', msg);
    }
  }

  TBS.SimulationUI = SimulationUI;
})(window.TBS = window.TBS || {});

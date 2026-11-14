/* format.js — number formatting helpers for the UI */
(function (TBS) {
  'use strict';
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const supers = (s) => String(s).split('').map((c) => SUP[c] || c).join('');
  const minus = (s) => s.replace(/^-/, '−');

  /** scientific: 1.23×10⁻⁴ */
  const sci = (x, d = 2) => {
    if (x === Infinity) return '∞';
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    let e = Math.floor(Math.log10(Math.abs(x)));
    let m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed(d)) >= 10) { m /= 10; e += 1; }
    return minus(`${m.toFixed(d)}×10${supers(e)}`);
  };

  /** general: ~4 significant figures, switches to scientific for extremes */
  const num = (x, sig = 4) => {
    if (x === Infinity) return '∞';
    if (x === -Infinity) return '−∞';
    if (!isFinite(x)) return '—';
    const a = Math.abs(x);
    if (a === 0) return '0';
    if (a < 1e-3 || a >= 1e6) return sci(x, sig - 2);
    if (a >= 1000) return minus(x.toFixed(0));
    return minus(String(+x.toPrecision(sig)));
  };

  const fixed = (x, d = 2) => (x === Infinity ? '∞' : isFinite(x) ? minus(x.toFixed(d)) : '—');
  TBS.fmt = { num, fixed, sci };
})(window.TBS = window.TBS || {});

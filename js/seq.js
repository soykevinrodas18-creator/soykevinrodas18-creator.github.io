/* cinematic-seq.js — Apple-style scroll flipbook runtime. No dependencies. Include once.
 *
 * <section class="seq" data-seq="seq/hero/" data-count="160"
 *          [data-ext="webp"] [data-pad="3"]
 *          [data-focus="0:0.74,0.28:0.5,1:0.5"]   progress:focusX keyframes (where the crop centers)
 *          [data-fit="cover|contain"] [data-fit-scale="0.8"] [data-offset-y="0.12"]
 *          [data-flash="0.297:0.035,0.6:0.02"]   progress:halfWidth — red flash + zoom that hides AI cuts
 *          [data-smooth="0.18"]>                    lerp factor toward the scroll target (1 = no smoothing)
 *   <div class="sticky">
 *     <canvas class="seq-canvas"></canvas>
 *     <div class="seq-flash"></div>
 *     <div class="stage" data-from="0.1" data-to="0.3">…</div>         gets .on / .past
 *     <div class="anchor" data-fx="0.5" data-fy="0.52">…</div>           pinned to a point OF THE FRAME
 *   </div>
 * </section>
 * Sets on the section: --p (0..1), --flash, --zoom. On each .anchor: --ax, --ay (px), --as (scale).
 * Fires `seq:stage` (detail {stage, on}) on the section when a stage toggles.
 */
(function () {
  if (window.__cinematicSeq) return; window.__cinematicSeq = true;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var parseKeys = function (s, def) {
    if (!s) return [[0, def], [1, def]];
    return s.split(',').map(function (kv) { var q = kv.split(':'); return [parseFloat(q[0]), parseFloat(q[1])]; });
  };
  var atKeys = function (k, p) {
    if (p <= k[0][0]) return k[0][1];
    for (var i = 1; i < k.length; i++) if (p <= k[i][0]) {
      var a = k[i - 1], b = k[i], t = (p - a[0]) / (b[0] - a[0] || 1); t = t * t * (3 - 2 * t); return a[1] + (b[1] - a[1]) * t;
    }
    return k[k.length - 1][1];
  };

  var seqs = [];
  var init = function (sec) {
    if (sec.__seq) return;
    var count = parseInt(sec.getAttribute('data-count'), 10) || 0, canvas = sec.querySelector('.seq-canvas');
    if (!count || !canvas) return;
    var A = function (n, d) { var v = sec.getAttribute('data-' + n); return v == null ? d : v; };
    var st = sec.__seq = {
      sec: sec, canvas: canvas, ctx: canvas.getContext('2d', { alpha: false }), count: count, frames: new Array(count),
      p: 0, cur: 0, drawn: -1, visible: true, prefix: A('seq', ''), ext: A('ext', 'webp'), pad: parseInt(A('pad', '3'), 10),
      focus: parseKeys(A('focus', ''), 0.5), fit: A('fit', 'cover'), fitScale: parseFloat(A('fit-scale', '1')), offY: parseFloat(A('offset-y', '0')),
      smooth: parseFloat(A('smooth', '0.18')), bg: A('bg', '#000'), bgT: A('bg-t', 'rgba(0,0,0,0)'),
      flashes: A('flash', '').split(',').filter(Boolean).map(function (s) { var q = s.split(':'); return [parseFloat(q[0]), parseFloat(q[1])]; }),
      stages: [].slice.call(sec.querySelectorAll('.stage')), anchors: [].slice.call(sec.querySelectorAll('.anchor'))
    };
    var load = function (i, prio) {
      if (st.frames[i] || i >= count) return;
      var img = new Image(); img.decoding = 'async'; if (prio) img.fetchPriority = prio;
      img.onload = function () { img.ok = true; if (Math.abs(i - st.cur) < 6) st.drawn = -1; };
      img.src = st.prefix + String(i).padStart(st.pad, '0') + '.' + st.ext;
      st.frames[i] = img;
    };
    // Coarse pass (every 6th frame) so scrubbing works at once; then fill in the rest.
    load(0, 'high'); for (var i = 6; i < count; i += 6) load(i, 'high');
    var fill = function () { for (var j = 0; j < count; j++) load(j, 'low'); };
    if (document.readyState === 'complete') setTimeout(fill, 200); else addEventListener('load', fill);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { st.visible = es[0].isIntersecting; }, { rootMargin: '200px' }).observe(sec);
    seqs.push(st);
  };

  var nearest = function (st, idx) {
    for (var d = 0; d < st.count; d++) { var a = st.frames[idx - d], b = st.frames[idx + d]; if (a && a.ok) return a; if (b && b.ok) return b; }
    return null;
  };

  var draw = function (st, idx) {
    var img = nearest(st, idx); if (!img) return;
    var c = st.canvas, dpr = Math.min(devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    var cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    var iw = img.naturalWidth, ih = img.naturalHeight, portrait = h > w, s;
    if (st.fit === 'contain') s = portrait ? Math.max(w / iw, (h * 0.5) / ih) * st.fitScale : Math.min(w / iw, h / ih) * st.fitScale;
    else s = portrait ? Math.max(w / iw, (h * 0.62) / ih) : Math.max(w / iw, h / ih);
    var dw = iw * s, dh = ih * s, fx = atKeys(st.focus, st.p);
    var x = dw > w ? clamp(w / 2 - dw * fx, w - dw, 0) : (w - dw) / 2, y = (h - dh) / 2 + h * st.offY;
    var ctx = st.ctx;
    ctx.fillStyle = st.bg; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, x * dpr, y * dpr, dw * dpr, dh * dpr);
    if (dh < h) { // feather top/bottom edges into the black letterbox
      var f = dh * 0.18, g = ctx.createLinearGradient(0, y * dpr, 0, (y + f) * dpr);
      g.addColorStop(0, st.bg); g.addColorStop(1, st.bgT); ctx.fillStyle = g; ctx.fillRect(0, y * dpr, cw, f * dpr);
      g = ctx.createLinearGradient(0, (y + dh) * dpr, 0, (y + dh - f) * dpr);
      g.addColorStop(0, st.bg); g.addColorStop(1, st.bgT); ctx.fillStyle = g; ctx.fillRect(0, (y + dh - f) * dpr, cw, f * dpr);
    }
    st.box = { x: x, y: y, w: dw, h: dh };
    st.anchors.forEach(function (el) {
      if (el.hasAttribute('data-fw')) el.style.setProperty('--aw', (dw * parseFloat(el.getAttribute('data-fw'))).toFixed(1) + 'px');
      if (el.hasAttribute('data-fh')) el.style.setProperty('--ah', (dh * parseFloat(el.getAttribute('data-fh'))).toFixed(1) + 'px');
      el.style.setProperty('--ax', (x + dw * parseFloat(el.getAttribute('data-fx'))).toFixed(1) + 'px');
      el.style.setProperty('--ay', (y + dh * parseFloat(el.getAttribute('data-fy'))).toFixed(1) + 'px');
      el.style.setProperty('--as', clamp(dh / 900, 0.55, 1.4).toFixed(3));
    });
  };

  var tick = function () {
    document.querySelectorAll('.seq').forEach(init);
    seqs.forEach(function (st) {
      var r = st.sec.getBoundingClientRect(), span = r.height - innerHeight;
      st.p = span > 0 ? clamp(-r.top / span, 0, 1) : 0;
      var target = st.p * (st.count - 1);
      st.cur = reduce ? target : st.cur + (target - st.cur) * st.smooth;
      if (Math.abs(target - st.cur) < 0.01) st.cur = target;
      var idx = Math.round(st.cur);
      if (st.visible && idx !== st.drawn) { draw(st, idx); st.drawn = idx; }
      var p = st.cur / (st.count - 1);
      st.sec.style.setProperty('--p', p.toFixed(4));
      if (st.flashes.length) {
        var fl = 0;
        st.flashes.forEach(function (f) { var d = Math.abs(p - f[0]) / f[1]; if (d < 1) fl = Math.max(fl, Math.cos(d * Math.PI / 2)); });
        st.sec.style.setProperty('--flash', (fl * 0.95).toFixed(3));
        st.sec.style.setProperty('--zoom', (1 + fl * 0.12).toFixed(3));
      }
      st.stages.forEach(function (el) {
        var from = parseFloat(el.getAttribute('data-from')), to = parseFloat(el.getAttribute('data-to'));
        var on = p >= from && (p <= to || to >= 1);
        if (on !== el.classList.contains('on')) {
          el.classList.toggle('on', on);
          st.sec.dispatchEvent(new CustomEvent('seq:stage', { detail: { stage: el, on: on } }));
        }
        el.classList.toggle('past', p > to && to < 1);
      });
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  addEventListener('resize', function () { seqs.forEach(function (st) { st.drawn = -1; }); });
  window.CinematicSeq = { list: seqs };
})();

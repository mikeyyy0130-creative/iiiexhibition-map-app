// スマホ向けボトムシート(peek / half / full の3段階、ドラッグで切り替え)

const STATES = ['peek', 'half', 'full'];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createSheet(root, { onChange } = {}) {
  const grip = root.querySelector('.sheet-grip');
  const head = root.querySelector('.sheet-head');
  const body = root.querySelector('.sheet-body');
  let state = 'peek';
  let heights = {};
  let current = 0; // いま見えている高さ(px)

  function measure() {
    const vh = window.innerHeight;
    const topbar = document.querySelector('.topbar')?.offsetHeight || 56;
    const full = vh - topbar - 6;
    // 横向きなど縦が短い画面でも peek < half < full の順を保ち、地図が見える余白を残す
    const peek = Math.round(Math.min(Math.max(vh * 0.32, 196), 270, full * 0.45));
    const half = Math.round(Math.min(Math.max(vh * 0.56, peek + 60), full));
    heights = { peek, half, full };
    root.style.height = `${full}px`;
  }

  function apply(px, animate) {
    current = px;
    root.classList.toggle('is-animating', !!animate && !reduceMotion());
    root.style.transform = `translateY(${heights.full - px}px)`;
    document.documentElement.style.setProperty('--sheet-visible', `${Math.round(px)}px`);
    // 画面外に隠れている分だけ下に余白を足し、最後の項目までスクロールで届くようにする
    body.style.paddingBottom = `calc(${Math.max(0, heights.full - px) + 24}px + env(safe-area-inset-bottom))`;
  }

  function setState(next, { animate = true, silent = false } = {}) {
    if (!STATES.includes(next)) return;
    const changed = next !== state;
    state = next;
    root.dataset.state = state;
    grip.setAttribute('aria-label', state === 'full' ? 'パネルを小さくする' : 'パネルを大きくする');
    grip.setAttribute('aria-expanded', String(state !== 'peek'));
    apply(heights[state], animate);
    if (!silent) onChange?.(state, heights[state], changed);
  }

  function nearest(px, velocity) {
    // 素早く弾いたら、その方向の次の段階へ
    const order = STATES.map((s) => [s, heights[s]]);
    if (Math.abs(velocity) > 0.45) {
      const idx = STATES.indexOf(state);
      const dir = velocity < 0 ? 1 : -1; // 上方向(負)= 大きく
      const target = order
        .filter(([, h]) => (dir > 0 ? h > px : h < px))
        .sort((a, b) => (dir > 0 ? a[1] - b[1] : b[1] - a[1]))[0];
      if (target) return target[0];
      return STATES[Math.min(Math.max(idx + dir, 0), STATES.length - 1)];
    }
    return order.sort((a, b) => Math.abs(a[1] - px) - Math.abs(b[1] - px))[0][0];
  }

  // ---- ドラッグ(つまみ・ヘッダー部分:マウス/タッチ共通) ----
  let drag = null;
  function dragStart(y) {
    drag = { y0: y, h0: current, last: y, t: performance.now(), v: 0, moved: false };
    root.classList.remove('is-animating');
  }
  function dragMove(y) {
    if (!drag) return;
    const now = performance.now();
    const dt = Math.max(1, now - drag.t);
    drag.v = (y - drag.last) / dt;
    drag.last = y;
    drag.t = now;
    if (Math.abs(y - drag.y0) > 4) drag.moved = true;
    const px = Math.min(Math.max(drag.h0 - (y - drag.y0), heights.peek * 0.6), heights.full);
    apply(px, false);
  }
  function dragEnd() {
    if (!drag) return false;
    const moved = drag.moved;
    if (moved) setState(nearest(current, drag.v));
    drag = null;
    return moved;
  }

  let suppressClick = false;
  for (const el of [grip, head]) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // ヘッダー内のボタンやタブはドラッグ開始点にしない(ただしつまみは常に可)
      if (el === head && e.target.closest('button, a, input, select, [role="tab"]')) return;
      dragStart(e.clientY);
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => drag && dragMove(e.clientY));
    const end = () => {
      suppressClick = dragEnd();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  grip.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    setState(state === 'peek' ? 'half' : state === 'half' ? 'full' : 'peek');
  });

  // ---- 本文のタッチ:full 以外では上に引くとシートが伸びる/一番上で下に引くと縮む ----
  let t = null;
  body.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      const p = e.touches[0];
      t = { x0: p.clientX, y0: p.clientY, top0: body.scrollTop, mode: null };
    },
    { passive: true },
  );
  body.addEventListener(
    'touchmove',
    (e) => {
      if (!t || e.touches.length !== 1) return;
      const p = e.touches[0];
      const dx = p.clientX - t.x0;
      const dy = p.clientY - t.y0;
      if (!t.mode) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dx) > Math.abs(dy)) t.mode = 'scroll';
        else if (state !== 'full' && dy < 0) t.mode = 'sheet';
        else if (t.top0 <= 0 && dy > 0) t.mode = 'sheet';
        else t.mode = 'scroll';
        if (t.mode === 'sheet') dragStart(t.y0);
      }
      if (t.mode === 'sheet') {
        e.preventDefault();
        dragMove(p.clientY);
      }
    },
    { passive: false },
  );
  const touchEnd = () => {
    if (t?.mode === 'sheet') dragEnd();
    t = null;
  };
  body.addEventListener('touchend', touchEnd);
  body.addEventListener('touchcancel', touchEnd);

  // ---- 画面サイズ変更 ----
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      measure();
      setState(state, { animate: false });
    }, 120);
  });

  measure();
  setState('peek', { animate: false, silent: true });

  return {
    get state() {
      return state;
    },
    get visibleHeight() {
      return heights[state];
    },
    heightOf: (s) => heights[s],
    setState,
    /** ヘッダーと本文を差し替える */
    render(headNodes, bodyNodes, { keepScroll = false } = {}) {
      const top = body.scrollTop;
      // キーボード・読み上げ利用時にフォーカスが <body> に飛ばないよう、同じ役割の要素へ戻す
      const active = document.activeElement;
      const hadFocus = root.contains(active) && active !== grip;
      const focusKey = hadFocus ? active.closest('[data-focus-key]')?.dataset.focusKey : null;
      head.replaceChildren(...[headNodes].flat().filter(Boolean));
      body.replaceChildren(...[bodyNodes].flat().filter(Boolean));
      body.scrollTop = keepScroll ? top : 0;
      if (hadFocus) {
        const target =
          (focusKey && root.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)) || head.querySelector('.sheet-title');
        if (target) {
          if (!target.matches('button, a, [tabindex]')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }
      }
    },
    body,
    head,
  };
}

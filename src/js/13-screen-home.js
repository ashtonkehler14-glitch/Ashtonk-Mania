/* Main menu (osu!lazer's MainMenu + ButtonSystem + OsuLogo). The 512px logo waits in the middle of the screen with the
 * toolbar hidden; clicking it (or pressing any key) shrinks it to half size 228px left of centre and opens the button
 * bar around it: settings on its left; play (→ solo / multi → lounge / ranked play), edit and browse on its right.
 * Six idle seconds bring the big logo back. Behind it is lazer’s triangle artwork in the Zako palette. */

/** The logo's two canvases — the music visualiser round it and the triangles drifting in it — drawn in a thread of
 *  their own. A canvas drawn on the page is handed to the compositor again on every frame it changes: on the menu, with
 *  music playing, that was a quarter of the page's time on a slow computer. Drawn in a worker (OffscreenCanvas) it goes
 *  to the screen from there. The page still works out what's to be drawn each frame (HomeScreen.loop) and sends it in
 *  one message; where a canvas can't be handed to a worker, the page draws them itself as before. */
const LogoPainter = {
  w: null, broken: false, ready: false,
  SRC: `"use strict";
let vis = null, tris = null, geo = null, grad = null, gradFor = null;
onmessage = ({ data: m }) => {
  if (m.ping) { postMessage({ ready: true }); return; }
  if (m.canvases) { vis = m.canvases.vis; tris = m.canvases.tris; grad = null; return; }
  if (m.geo) { geo = m.geo; return; }
  if (m.vsize && vis) { vis.width = vis.height = m.vsize; }
  if (m.tsize && tris) { tris.width = tris.height = m.tsize; grad = null; }
  if (m.vis && vis && geo) {
    const { R, M, CW, N, bw, cosA, sinA } = geo, k = m.vis.k, freq = m.vis.freq, x = vis.getContext('2d');
    x.setTransform(k, 0, 0, k, 0, 0);
    x.clearRect(0, 0, CW, CW);
    if (freq) {
      x.globalCompositeOperation = 'lighter';
      x.fillStyle = 'rgba(255,255,255,0.2)';
      x.beginPath();
      const c = CW / 2;
      for (let j = 0; j < N * 5; j++) {
        const v = freq[j % N];
        if (v < 1 / 600) continue;
        const len = Math.min(M, 600 * v), co = cosA[j], si = sinA[j];
        const px = c + co * R, py = c + si * R, ox = -si * bw / 2, oy = co * bw / 2, ax = co * len, ay = si * len;
        x.moveTo(px - ox, py - oy); x.lineTo(px - ox + ax, py - oy + ay); x.lineTo(px + ox + ax, py + oy + ay); x.lineTo(px + ox, py + oy); x.closePath();
      }
      x.fill();
    }
  }
  if (m.tri && tris) {
    const TS = tris.width, sc = m.tri.sc, p = m.tri.pts, triW = 300 * sc, triH = 260 * sc, x = tris.getContext('2d');
    if (!grad || gradFor !== TS) { grad = x.createLinearGradient(0, 0, 0, TS); grad.addColorStop(0, '#f4dda0'); grad.addColorStop(1, '#a78d4b'); gradFor = TS; }
    x.clearRect(0, 0, TS, TS);
    x.strokeStyle = grad; x.lineWidth = 0.009 * 260 * sc * 2.6; x.lineJoin = 'round';
    x.beginPath();
    for (let i = 0; i < p.length; i += 2) { const lx = p[i], ty = p[i + 1]; x.moveTo(lx + triW / 2, ty); x.lineTo(lx + triW, ty + triH); x.lineTo(lx, ty + triH); x.closePath(); }
    x.stroke();
  }
};`,
  /** The painter's thread, started — it takes canvases only once it has answered (a canvas handed over can't be had
   *  back: one that never ran would leave the logo blank). */
  start() {
    if (this.w || this.broken) return;
    try {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || !HTMLCanvasElement.prototype.transferControlToOffscreen) throw new Error('no painter here');
      this.w = new Worker(URL.createObjectURL(new Blob([this.SRC], { type: 'text/javascript' })));
      this.w.onmessage = ({ data }) => { if (data && data.ready) this.ready = true; };
      this.w.onerror = e => { if (e.preventDefault) e.preventDefault(); this.broken = true; this.ready = false; };
      this.w.postMessage({ ping: true });
      if (this._geo) this.w.postMessage({ geo: this._geo });
    } catch (e) { this.broken = true; }
  },
  /** The two canvases handed to the painter's thread; false where that can't be done yet (the page draws them). */
  adopt(vis, tris) {
    this.start();
    if (!this.ready || this.broken) return false;
    try {
      const v = vis.transferControlToOffscreen(), t = tris.transferControlToOffscreen();
      this.w.postMessage({ canvases: { vis: v, tris: t } }, [v, t]);
      return true;
    } catch (e) { this.broken = true; return false; }
  },
  /** The visualiser's fixed geometry (sent once). */
  geometry(g) { if (this._geo) return; this._geo = g; if (this.w) this.w.postMessage({ geo: g }); },
  frame(m) { if (this.w) this.w.postMessage(m, [m.vis && m.vis.freq, m.tri && m.tri.pts].filter(Boolean).map(a => a.buffer)); },
};

/** A device that's known to be slow starts the menus light (see HomeScreen.loop): one found slow before (remembered
 *  for two weeks), or one whose hardware says so — a Chromebook with 4 cores and 4 GB or less, or anything with 2 GB
 *  or less — instead of dropping frames for the two seconds it takes to notice. */
const LowEnd = {
  known() {
    try { const t = +localStorage.getItem('am.slowMenus'); if (t && Date.now() - t < 14 * 864e5) return true; } catch { /* private mode */ }
    const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
    return mem <= 2 || (/\bCrOS\b/.test(navigator.userAgent) && cores <= 4 && mem <= 4);
  },
  /** Found slow: the lighter menus from now on (and for the next two weeks). */
  mark() {
    if (document.documentElement.classList.contains('slow')) return;
    document.documentElement.classList.add('slow');
    try { localStorage.setItem('am.slowMenus', String(Date.now())); } catch { /* private mode */ }
  },
  /** A list scrolling at under ~33fps for two seconds of scrolling (or with a quarter of its frames late) is a slow
   *  device too — found wherever it scrolls (the beatmap listing first of all), not only on the main menu. Frames
   *  are only looked at while something is scrolling: a list at rest costs nothing. */
  watchScroll() {
    let raf = 0, until = 0, last = 0, ms = 0, n = 0, late = 0, period = 16.7;
    const tick = now => {
      raf = 0;
      const dt = last ? now - last : 0; last = now;
      if (document.documentElement.classList.contains('slow')) return;
      // (a hitch — a page of results arriving — counts as one late frame, not as the whole of its length; a hidden tab
      // doesn't count at all, nor does the first frame, with no frame before it to time)
      if (dt > 0 && !document.hidden) {
        if (dt < period) period = Math.max(5, dt); else period += (Math.min(dt, 100) - period) * 0.002;
        ms += Math.min(dt, 100); n++; if (dt > period * 1.6) late++;
      }
      if (ms >= 2000) { if (ms / n > period * 1.8 || late / n > 0.25) this.mark(); ms = n = late = 0; }
      if (now < until) raf = requestAnimationFrame(tick);
    };
    document.addEventListener('scroll', () => {
      if (Screens.currentName === 'gameplay' || document.documentElement.classList.contains('slow')) return;
      until = performance.now() + 200;
      if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
    }, { capture: true, passive: true });
  },
};
if (LowEnd.known()) document.documentElement.classList.add('slow');
LowEnd.watchScroll();

const HomeScreen = {
  tab: 'home',
  menuState: 'initial',
  IDLE_MS: 6000, // lazer's GameIdleTracker(6000)
  // ButtonSystemState order: a button shows between its min and max state, contracts below and explodes above
  ORDER: { initial: 1, top: 2, play: 3, multi: 4, edit: 5, entering: 6 },
  enter() {
    this.logo = this.buildLogo();
    this.left = h('div.lz-left'); this.right = h('div.lz-right');
    this.buildButtons();
    this.area = h('div.lz-area', h('div.lz-area-bg'), this.left, this.right);
    this.flashL = h('div.msf.l'); this.flashR = h('div.msf.r');
    // lazer's SongTicker: the new song's title and artist at the top right for a few seconds
    this.ticker = h('div.lz-ticker', this.tkTitle = h('div.lz-tk-t'), this.tkArtist = h('div.lz-tk-a'));
    // lazer's background source: the skin's menu background (the triangles) or the beatmap's
    const el = h('div.home.lz-menu', { dataset: { state: 'initial' } }, Settings.get('ui.menuBackground') === 'beatmap' ? null : MenuTriangles.mount(), this.flashL, this.flashR,
      h('div.lz-stage', this.area, this.logo), this.ticker, NeruMascot.build(),
      this.fountainCv = h('canvas.lz-fountain', { style: { visibility: 'hidden' } }));
    this._parts = []; this._spewers = [];
    this.el = el;
    // coming back (from song select, the lounge…): lazer resumes the menu where you left it — the same row of buttons,
    // growing back out of the logo — instead of starting over at the big logo
    const resume = this._resume || (this._visited ? 'top' : null);
    this._resume = null;
    // (from "entering": the logo is already small in the bar, the bar fades back in and the buttons grow out)
    if (resume) { this.menuState = 'entering'; el.dataset.state = 'entering'; this.setState(resume); } else this.setState(Screens.history.length ? 'top' : 'initial', true);
    // the end of lazer's intro: the logo appears from nothing with a white flash and its impact ring (first visit only)
    if (!Screens.history.length && !this._introDone && Settings.get('ui.animSpeed')) {
      this._introDone = true;
      requestAnimationFrame(() => {
        this.hoverEl.animate([{ scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1 }], { duration: 600, easing: 'cubic-bezier(.16, 1, .3, 1)' });
        this.flash(0.6, 1500, 'cubic-bezier(.16, 1, .3, 1)');
        setTimeout(() => this.impact(), 120);
      });
    }
    this.startMenuMusic();
    this._idleAt = performance.now();
    this._poke = () => { this._idleAt = performance.now(); };
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel']) window.addEventListener(ev, this._poke, { passive: true });
    this._offMusic = Bus.on('music:changed', m => this.showTicker(m));
    this._offDaily = Bus.on('daily', () => this.paintDaily());
    // (the background source changed in settings: the triangles come or go straight away)
    this._offBgSrc = Bus.on('settings:changed', k => {
      if (k !== 'ui.menuBackground' || !this.el) return;
      const tri = this.el.querySelector(':scope > .lz-tri'), want = Settings.get('ui.menuBackground') !== 'beatmap';
      if (want && !tri) this.el.prepend(MenuTriangles.mount());
      else if (!want && tri) { MenuTriangles.stop(); tri.remove(); }
    });
    if (Presence.ws) Daily.ask();
    this.paintDaily(); this._dailyT = setInterval(() => this.paintDaily(), 1000);
    this.loop();
    return el;
  },
  leave() {
    cancelAnimationFrame(this._raf); clearTimeout(this._perfT); NeruMascot.stop(); MenuTriangles.stop();
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel']) window.removeEventListener(ev, this._poke);
    if (this._offMusic) this._offMusic();
    if (this._offDaily) this._offDaily(); clearInterval(this._dailyT);
    if (this._offBgSrc) this._offBgSrc();
    clearTimeout(this._tbT); $('#app').classList.remove('hide-toolbar');
  },

  /** The buttons, in lazer's flow order (left of the logo: settings, back; right: the multi, play, edit and top-level
   *  groups). [id, label, icon, colour, keys, min state, max state, padded side, action]. Colours are lazer's. */
  buttonDefs() {
    const solo = () => this.enterMode(() => Screens.go('songselect', {}, { transition: 'zoom' }));
    return {
      left: [
        ['settings', 'settings', 'gear', '#555555', ['KeyO', 'KeyS'], 'top', 'top', 'r', () => SettingsPanel.open()],
        ['back', 'back', 'backcircle', '#333a5e', [], 'play', 'edit', 'r', () => this.setState(this.menuState === 'multi' ? 'play' : 'top')],
      ],
      right: [
        ['lounge', 'lounge', 'couch', '#5e3fba', ['KeyL', 'KeyM'], 'multi', 'multi', 'l', () => this.enterMode(() => Screens.go('multiplayer'))],
        ['ranked', 'ranked play', 'crown', '#5e3fba', ['KeyR'], 'multi', 'multi', null, () => this.enterMode(() => Screens.go('multiplayer', { ranked: true }))],
        ['solo', 'solo', 'user', '#6644cc', ['KeyP'], 'play', 'play', 'l', solo],
        ['multi', 'multi', 'online', '#5e3fba', ['KeyM'], 'play', 'play', null, () => this.setState('multi')],
        // lazer's DailyChallengeButton: (94, 63, 186), D
        ['daily', 'weekly challenge', 'calendar', '#5e3fba', ['KeyD'], 'play', 'play', null, () => this.enterMode(() => Screens.go('daily'))],
        // your beatmaps: import them, extract them (.osz) and edit collections
        ['beatmaps', 'beatmap', 'beatmap', '#eeaa00', ['KeyB'], 'edit', 'edit', 'l', () => this.enterMode(() => Screens.go('beatmaps'))],
        // skins: preview and import them, and edit the one you use (its layout editor)
        ['skin', 'skin', 'brush', '#eeaa00', ['KeyS'], 'edit', 'edit', null, () => this.enterMode(() => Screens.go('skins'))],
        ['play', 'play', 'osulogo', '#6644cc', ['KeyP', 'KeyM', 'KeyL'], 'top', 'top', 'l', () => this.setState('play')],
        ['edit', 'edit', 'editcircle', '#eeaa00', ['KeyE'], 'top', 'top', null, () => this.setState('edit')],
        ['browse', 'browse', 'beatmap', '#a5cc00', ['KeyB', 'KeyD'], 'top', 'top', null, () => this.enterMode(() => Screens.go('explore'))],
      ],
    };
  },
  /** The weekly challenge button: this week's beatmap cover and the time left (days and hh:mm:ss), as lazer's. */
  paintDaily() {
    const b = this.btns && this.btns.find(x => x.dataset.id === 'daily'), d = Daily.data;
    if (!b) return;
    const cv = b.querySelector('.lz-cover'), cd = b.querySelector('.lz-countdown');
    if (d && d.map && cv && cv._set !== d.map.onlineSetId) { cv._set = d.map.onlineSetId; OnlineBeatmaps.loadCover(cv, d.map.onlineSetId, ['card@2x', 'card', 'cover']); }
    if (cd) {
      const left = d && d.map ? Math.max(0, d.endsAt - Date.now()) : 0;
      cd.textContent = left ? Daily.remaining(left) : '';
    }
  },
  buildButtons() {
    this.btns = [];
    const d = this.buttonDefs();
    const mk = ([id, label, ic, color, keys, min, max, pad, fn]) => {
      const ico = h('span.lz-ico', h('span.lz-ico-b', icon(ic)));
      // (lazer's DailyChallengeButton is 1.3× as wide, with the day's beatmap cover behind it and a countdown)
      const daily = id === 'daily';
      const b = h(`button.lz-btn.gone${pad ? '.p' + pad : ''}${daily ? '.lz-daily' : ''}`, { style: { '--c': color, '--w': daily ? '182px' : pad ? '160px' : '140px' }, dataset: { id }, 'aria-label': label, tabindex: -1 },
        h('span.lz-bg', daily ? h('span.lz-cover') : null), h('span.lz-inner', ico, h('span.lz-label', label), daily ? h('span.lz-countdown') : null));
      Object.assign(b, { _keys: keys, _min: this.ORDER[min], _max: this.ORDER[max], _fn: fn, _ico: ico });
      b.addEventListener('click', () => this.trigger(b));
      b.addEventListener('pointerenter', () => this.hoverIn(b));
      b.addEventListener('pointerleave', () => this.hoverOut(b));
      b.addEventListener('pointerdown', () => b.classList.add('down'));
      this.btns.push(b);
      return b;
    };
    this.left.append(...d.left.map(mk));
    this.right.append(...d.right.map(mk));
    // (one listener for the whole menu, added once: one per visit used to pile up)
    if (!this._upBound) { this._upBound = true; window.addEventListener('pointerup', () => this.btns && this.btns.forEach(b => b.classList.remove('down'))); }
  },
  /** lazer's MainMenuButton.trigger: the click sound, the action, and a white flash that fades over 800ms. */
  trigger(b) {
    if (!b.classList.contains('exp')) return;
    UISounds.click();
    const bg = b.firstChild;
    bg.classList.remove('flash'); void bg.offsetWidth; bg.classList.add('flash');
    b._fn();
  },
  /** Choosing something that leaves the menu: the bar folds away (lazer's EnteringMode) as the next screen opens. */
  enterMode(go) { this._resume = ['play', 'multi', 'edit'].includes(this.menuState) ? this.menuState : 'top'; this.setState('entering'); go(); },
  setState(state, instant = false) {
    const last = this.menuState;
    if (state === last && !instant) return;
    if (state !== 'initial') this._visited = true;
    this.menuState = state;
    this.el.dataset.state = state;
    this.el.classList.toggle('lz-instant', instant);
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => this.el && this.el.classList.remove('lz-instant')));
    const S = this.ORDER[state];
    // the bar fades in 150ms after the logo starts moving when coming from the big logo (lazer's delayed sequence)
    const delay = last === 'initial' && !instant ? 150 : 0;
    clearTimeout(this._stT);
    const apply = () => {
      for (const b of this.btns) {
        let st;
        if (state === 'initial') st = 'con';
        else if (state === 'entering') st = 'con1';
        else st = S >= b._min && S <= b._max ? 'exp' : S < b._min ? 'con' : 'xpl';
        this.btnState(b, st, instant);
      }
    };
    if (delay) this._stT = setTimeout(apply, delay); else apply();
    // lazer hides the toolbar while the big logo waits, and brings it back as the logo lands in the bar
    clearTimeout(this._tbT);
    if (state === 'initial') $('#app').classList.add('hide-toolbar');
    else if (last === 'initial' && !instant) this._tbT = setTimeout(() => $('#app').classList.remove('hide-toolbar'), 200);
    else $('#app').classList.remove('hide-toolbar');
    // the logo's impact ring as it lands in the bar
    if (last === 'initial' && (state === 'top' || state === 'play') && !instant) setTimeout(() => this.impact(), 200);
  },
  btnState(b, st, instant) {
    const cur = b._st;
    if (cur === st) return;
    b._st = st;
    clearTimeout(b._goneT);
    b.classList.remove('exp', 'con', 'con1', 'xpl');
    if (st === 'exp') {
      if (b.classList.contains('gone') && !instant) {
        b.classList.remove('gone');
        void b.offsetWidth; // start from nothing so the width grows out
      }
      b.classList.remove('gone');
      b.classList.add('exp');
      b.tabIndex = 0;
    } else {
      b.tabIndex = -1;
      if (b.classList.contains('gone') || instant) { b.classList.add(st, 'gone'); return; }
      b.classList.add(st);
      b._goneT = setTimeout(() => { if (b._st === st) b.classList.add('gone'); }, st === 'con1' ? 820 : st === 'xpl' ? 220 : 520);
    }
  },
  /** lazer's MainMenuButton hover: the button widens to 1.5× with an elastic spring, and its icon tips over and starts
   *  bouncing to the beat. */
  hoverIn(b) {
    if (!b.classList.contains('exp')) return;
    UISounds.hover();
    // (animations off — Performance mode —: the icon stays as it is. Tipping it over and back, each hover read the
    // page's styles three times over for nothing that showed)
    if (!Settings.get('ui.animSpeed')) return;
    b._tipped = true;
    const ico = b._ico, until = clamp(this._nextBeatIn || 300, 60, 1000);
    this._rightward = !!this._rightward;
    ico.getAnimations().forEach(a => a.cancel());
    ico.firstChild.getAnimations().forEach(a => a.cancel());
    ico.animate([{ rotate: '0deg' }, { rotate: `${this._rightward ? -8 : 8}deg` }], { duration: until, easing: 'cubic-bezier(.37, 0, .63, 1)', fill: 'forwards' });
    ico.firstChild.animate([{ scale: '1 1' }, { scale: '1.2 1.08' }], { duration: until, easing: 'cubic-bezier(.5, 1, .89, 1)', fill: 'forwards' });
  },
  hoverOut(b) {
    if (!b._tipped) return;
    b._tipped = false;
    const ico = b._ico, inner = ico.firstChild;
    const r = getComputedStyle(ico).rotate, s = getComputedStyle(inner).scale, t = getComputedStyle(inner).translate;
    ico.getAnimations().forEach(a => a.cancel()); inner.getAnimations().forEach(a => a.cancel());
    ico.animate([{ rotate: r === 'none' ? '0deg' : r }, { rotate: '0deg' }], { duration: 500, easing: 'cubic-bezier(.5, 1, .89, 1)' });
    inner.animate([{ scale: s === 'none' ? '1' : s, translate: t === 'none' ? '0 0' : t }, { scale: '1', translate: '0 0', offset: 0.4 }, { scale: '1', translate: '0 0' }], { duration: 500, easing: 'cubic-bezier(.5, 1, .89, 1)' });
  },
  /** On each beat the hovered button's icon swings to the other side over the beat and hops up 10px and back. */
  onBeat(beatLength) {
    this._rightward = !this._rightward;
    const b = this.el && Settings.get('ui.animSpeed') && this.btns.find(x => x.matches(':hover') && x.classList.contains('exp'));
    if (!b) return;
    b._tipped = true;
    const ico = b._ico, inner = ico.firstChild, half = beatLength / 2;
    const r = getComputedStyle(ico).rotate;
    ico.getAnimations().forEach(a => a.cancel()); inner.getAnimations().forEach(a => a.cancel());
    ico.animate([{ rotate: r === 'none' ? '0deg' : r }, { rotate: `${this._rightward ? 8 : -8}deg` }], { duration: half * 2, easing: 'cubic-bezier(.37, 0, .63, 1)', fill: 'forwards' });
    inner.animate([
      { translate: '0 0', scale: '1.2 1.08', easing: 'cubic-bezier(.5, 1, .89, 1)' },
      { translate: '0 -10px', scale: '1.2 1.2', offset: 0.5, easing: 'cubic-bezier(.11, 0, .5, 0)' },
      { translate: '0 0', scale: '1.2 1.08' }], { duration: half * 2, fill: 'forwards' });
  },
  /** lazer's MenuSideFlashes: the screen's edges light up with the music — both on each bar's first beat, or
   *  left and right in turn on every beat during kiai — as bright as the track is loud, fading over a beat. */
  sideFlash(beat, beatLength, meter = 4, kiai, amp) {
    if (!this.flashL || !Settings.get('ui.animSpeed')) return;
    meter = meter || 4;
    // kept soft: a glow that breathes with the music rather than a flash (capped well below full strength)
    const alpha = clamp((amp - 0.3) / 1.6, 0, kiai ? 0.36 : 0.28);
    if (alpha < 0.04) return;
    const rise = 140, dur = rise + beatLength * 1.4;
    // (from wherever the last glow has faded to, so beats close together never pop)
    const flash = el => { const from = +getComputedStyle(el).opacity || 0; el.getAnimations().forEach(a => a.cancel()); el.animate([{ opacity: from, easing: 'cubic-bezier(.3, 0, .2, 1)' }, { opacity: alpha, offset: rise / dur, easing: 'cubic-bezier(.25, .6, .3, 1)' }, { opacity: 0 }], { duration: dur }); };
    if (kiai ? beat % 2 === 0 : beat % meter === 0) flash(this.flashL);
    if (kiai ? beat % 2 === 1 : beat % meter === 0) flash(this.flashR);
  },
  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return false;
    if (/^F\d+$/.test(e.key)) return false;
    // lazer: any key at the big logo presses the logo
    if (this.menuState === 'initial' && !['Escape', 'Tab'].includes(e.key)) { this.logoClick(); return true; }
    if (e.code === 'KeyU') { UISounds.click(); Screens.go('profile'); return true; } // (listed under ? as a main menu key)
    if (e.key === 'Enter') {
      if (document.activeElement && document.activeElement.classList.contains('lz-btn')) document.activeElement.click();
      else this.logoClick();
      return true;
    }
    const hit = this.btns.find(b => b.classList.contains('exp') && b._keys.includes(e.code));
    if (hit) { this.trigger(hit); return true; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const btns = this.btns.filter(b => b.classList.contains('exp')), i = btns.indexOf(document.activeElement);
      const n = btns[clamp(i + (e.key === 'ArrowRight' ? 1 : -1), 0, btns.length - 1)];
      if (n) { n.focus(); UISounds.hover(); }
      return true;
    }
    return false;
  },
  onBack() {
    if (this.menuState === 'multi') { UISounds.back(); this.setState('play'); return true; }
    if (this.menuState === 'play' || this.menuState === 'edit') { UISounds.back(); this.setState('top'); return true; }
    if (this.menuState === 'top') { UISounds.back(); this.setState('initial'); return true; }
    return true;
  },
  /** The logo: from the big logo, open the bar; in the bar, press the first button of the row showing. */
  logoClick() {
    this.flash(0.4, 1500, 'cubic-bezier(.16, 1, .3, 1)');
    const first = { top: 'play', play: 'solo', multi: 'lounge', edit: 'beatmaps' }[this.menuState];
    if (this.menuState === 'initial') { UISounds.click(); this.setState('top'); return; }
    const b = first && this.btns.find(x => x.dataset.id === first);
    if (b) this.trigger(b);
  },

  /** Lazer's 512px logo with a glass-wave face, the white ring and wordmark over it, the music visualiser around it, and the hover (1.1×,
   *  elastic), press (0.9×), drag (rubber band), beat (a 2% squeeze, a ripple, a white flash in kiai) and impact
   *  animations. */
  buildLogo() {
    this.vis = h('canvas.lz-vis');
    this.tris = h('canvas.lz-tris');
    this._off = false; this._visW = this._triW = 0;
    const wave = this.glassWave = h('span.lz-glass-wave', { 'aria-hidden': 'true' });
    wave.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" aria-hidden="true"><path d="M-512 410 q128 -82 256 0 t256 0 t256 0 t256 0 t256 0 t256 0" stroke="#ffe699" stroke-width="3"/><path d="M-512 427 q128 65 256 0 t256 0 t256 0 t256 0 t256 0 t256 0" stroke="#fff4dd" stroke-width="2.5"/><path d="M-512 422 q128 -48 256 0 t256 0 t256 0 t256 0 t256 0 t256 0" stroke="#ffd0e7" stroke-width="2"/></svg>';
    this._wavePaths = [...wave.querySelectorAll('path')]; this._waveAt = 0; this._wavePhase = 0; this._waveLevel = 0;
    this.flashEl = h('span.lz-flash');
    this.impactEl = h('span.lz-impact');
    this.ripple = h('span.lz-ripple', h('span.lz-ring'));
    this.beatEl = h('div.lz-lbt',
      h('span.lz-cookie-disc.lz-home-disc', this.tris, wave, this.flashEl),
      h('span.lz-ring', h('span.lz-cookie-text', 'ashtonk!', h('small', 'mania'))),
      this.impactEl);
    this.ampEl = h('div.lz-la', this.beatEl);
    this.bounceEl = h('div.lz-lb', this.ripple, this.ampEl);
    this.hoverEl = h('div.lz-lh', this.bounceEl);
    this.cookie = h('button.lz-cookie', { 'aria-label': 'Ashtonk!mania logo', onclick: e => { if (this._dragged) { this._dragged = false; return; } this.logoClick(); } });
    this.cookie.addEventListener('pointerenter', () => { UISounds.hover(); this.hoverEl.classList.add('hover'); });
    this.cookie.addEventListener('pointerleave', () => this.hoverEl.classList.remove('hover'));
    this.cookie.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      this.bounceEl.classList.add('down');
      const x0 = e.clientX, y0 = e.clientY, k = 1 / (this.menuState === 'initial' ? 1 : 0.5);
      this._dragged = false;
      const move = ev => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0, len = Math.hypot(dx, dy);
        if (len > 4) this._dragged = true;
        const f = len > 0 ? Math.pow(len, 0.6) / len : 0;
        this.bounceEl.style.translate = `${dx * f * k}px ${dy * f * k}px`;
        this.bounceEl.classList.add('drag');
      };
      const up = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        this.bounceEl.classList.remove('down', 'drag'); this.bounceEl.style.translate = '';
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    return h('div.lz-logo', this.hoverEl, this.cookie);
  },
  /** New logo canvases in place of the old: one drawn on by the page can't be handed to the painter, and one handed to
   *  it can't be had back. */
  swapCanvases() {
    const v = h('canvas.lz-vis'), t = h('canvas.lz-tris');
    this.vis.replaceWith(v); this.tris.replaceWith(t); this.vis = v; this.tris = t;
    this._triGrad = null; this._visW = this._triW = 0;
  },
  flash(alpha, ms, easing) {
    this.flashEl.getAnimations().forEach(a => a.cancel());
    this.flashEl.animate([{ opacity: alpha }, { opacity: 0 }], { duration: ms, easing });
  },
  impact() {
    this.impactEl.getAnimations().forEach(a => a.cancel());
    this.impactEl.animate([{ opacity: 1, scale: 0.94 }, { opacity: 0, scale: 1.12 }], { duration: 250, easing: 'linear' });
  },
  /** Small vector waves deform in place; no spectrum canvas or endless sideways translation. */
  moveWaves(now) {
    if (!Settings.get('ui.animSpeed') || matchMedia('(prefers-reduced-motion: reduce)').matches) { this._waveAt = now; return; }
    if (now - this._waveAt < 33) return;
    const dt = Math.min(100, now - (this._waveAt || now)) / 1000; this._waveAt = now;
    const playing = Music.playing, tm = Music.meta && Music.meta.timing;
    const tp = tm && tm.length ? tm[Math.max(0, bsearchLE(tm, Music.time, 'time'))] : null;
    const beatMs = tp ? menuBeatLength(tp.beatLength) : 600;
    const beat = playing ? (Music.time - (tp ? tp.time : 0)) / beatMs : 0;
    let level = 0;
    const an = AudioManager.analyser;
    if (playing && an) {
      const data = this._waveAudio && this._waveAudio.length === an.fftSize ? this._waveAudio : (this._waveAudio = new Float32Array(an.fftSize));
      an.getFloatTimeDomainData(data);
      let sum = 0; for (let i = 0; i < data.length; i += 8) sum += data[i] * data[i];
      level = Math.min(1, Math.sqrt(sum / Math.ceil(data.length / 8)) * 3);
    }
    this._waveLevel += (level - this._waveLevel) * (1 - Math.exp(-dt * 5));
    this._wavePhase += dt * (playing ? 0.7 + 500 / beatMs : .35);
    const pulse = playing ? Math.pow(.5 + .5 * Math.cos(beat * Math.PI * 2), 3) : 0;
    const phase = this._wavePhase, amplitude = 10 + 19 * this._waveLevel + 5 * pulse;
    this._wavePaths.forEach((path, j) => {
      const points = [];
      for (let i = 0; i <= 32; i++) {
        const x = -8 + i * 16.5, u = x / 512;
        const y = 416 + j * 9 + amplitude * Math.sin(u * Math.PI * 2 + j * 1.6 + Math.sin(phase * .47) * .8) * Math.cos(phase * .63 + j * .7)
          + 7 * Math.sin(u * Math.PI * 3 - phase * .45 + j);
        points.push(`${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(2)}`);
      }
      path.setAttribute('d', points.join(' '));
    });
  },
  /** Keep menu beats and idle navigation without spectrum reads or visualiser canvas uploads. */
  loop() {
    let lastBeat = -1;
    const tick = now => {
      if (!this.el || !this.el.isConnected) return;
      const perf = Settings.get('graphics.performanceMode');
      if (!perf) {
        this.moveWaves(now);
        const tm = Music.meta && Music.meta.timing;
        if (tm && tm.length && Music.playing) {
          const t = Music.time + 60, i = Math.max(0, bsearchLE(tm, t, 'time')), tp = tm[i], L = menuBeatLength(tp.beatLength);
          const beat = Math.floor((t - tp.time) / L), key = i * 100000 + beat;
          this._nextBeatIn = tp.time + (beat + 1) * L - 60 - Music.time;
          if (key !== lastBeat && t >= tp.time && beat >= 0) {
            lastBeat = key;
            const kp = tm.kiai && tm.kiai.length ? tm.kiai[Math.max(0, bsearchLE(tm.kiai, t, 'time'))] : null;
            this._kiai = !!(kp && kp.on && t >= kp.time);
            this.logoBeat(L, 0.6, this._kiai);
            setTimeout(() => { if (this.el && this.el.isConnected) this.onBeat(L); }, 60);
          }
        } else {
          this._kiai = false; this._nextBeatIn = 300;
          if (now - (this._idleBeat || 0) > 600) { this._idleBeat = now; this.onBeat(600); }
        }
      }
      if (this.menuState !== 'initial' && this.menuState !== 'entering' && now - this._idleAt > this.IDLE_MS && !Overlays.stack.length && !SettingsPanel.o && !NowPlaying.open) this.setState('initial');
      if (perf) this._perfT = setTimeout(() => { this._raf = requestAnimationFrame(tick); }, 400);
      else this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  },
  /** lazer's StarFountain: each corner fountain (250px in from the side) spews 240 stars a second for 0.8s, shot
   *  upwards at ~1400px/s with gravity pulling them back, the sideways push (toward the middle, straight up or
   *  outward, picked at random) easing from 500px/s to the other way over the burst; each star lives 0.3–1s, fades
   *  out, grows to ~2.2× and spins. Drawn additively. */
  shootFountains() {
    if (!Settings.get('ui.animSpeed')) return;
    const dir = Math.floor(Math.random() * 3) - 1, now = performance.now();
    const l = dir === -1 ? 1 : dir === 0 ? 0 : -1, r = -l;
    this._spewers = [{ side: 'l', dir: l, t0: now, n: 0 }, { side: 'r', dir: r, t0: now, n: 0 }];
  },
  starSprite() {
    if (this._star) return this._star;
    const c = document.createElement('canvas'); c.width = 68; c.height = 68;
    const x = c.getContext('2d');
    const path = () => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 9 : 21; x.lineTo(34 + Math.cos(a) * rr, 36 + Math.sin(a) * rr); } x.closePath(); };
    x.shadowColor = 'rgba(140, 220, 255, .9)'; x.shadowBlur = 10; x.fillStyle = '#fff'; path(); x.fill();
    x.shadowBlur = 0; path(); x.fill();
    return (this._star = c);
  },
  drawFountains(now) {
    const cv = this.fountainCv;
    if (!cv) return;
    const parts = this._parts, sp = this._spewers;
    // (an empty fountain is hidden: a full-screen layer of nothing is still composited every frame)
    if (!parts.length && !sp.length) { if (this._fountainDirty) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); cv.style.visibility = 'hidden'; this._fountainDirty = false; } return; }
    if (!this._fountainDirty) cv.style.visibility = '';
    const W = cv.clientWidth, H = cv.clientHeight, dpr = Zoom.dpr();
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const rnd = v => (Math.random() * 2 - 1) * v;
    for (let i = sp.length - 1; i >= 0; i--) {
      const f = sp[i], el = now - f.t0, want = Math.min(192, Math.floor(Math.min(el, 800) * 0.24));
      for (; f.n < want; f.n++) {
        const at = f.n / 0.24; // when this star was due
        parts.push({ x0: f.side === 'l' ? 250 : W - 250, born: f.t0 + at, D: 300 + Math.random() * 700,
          vx: f.dir * 500 * (1 - 2 * at / 800) + rnd(60), vy: -1400 + rnd(100), a0: rnd(4), a1: rnd(2), s1: 2.2 + rnd(0.4) });
      }
      if (el >= 800) sp.splice(i, 1);
    }
    const x = cv.getContext('2d'), star = this.starSprite();
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    x.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i], k = now - p.born;
      if (k < 0) continue;
      if (k >= p.D) { parts.splice(i, 1); continue; }
      const prog = k / p.D, sc = 1 + (p.s1 - 1) * prog;
      const px = p.x0 + p.vx * k / 1000, py = H + (p.vy + 800 * (p.D / 1000) * prog) * k / 1000;
      x.globalAlpha = 1 - prog;
      x.setTransform(dpr * sc, 0, 0, dpr * sc, px * dpr, py * dpr);
      x.rotate(p.a0 + (p.a1 - p.a0) * prog);
      x.drawImage(star, -17, -17, 34, 34);
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.setTransform(1, 0, 0, 1, 0, 0);
    this._fountainDirty = true;
  },
  /** lazer's OsuLogo.OnNewBeat: a 2% squeeze over 60ms then out over two beats, a ripple of the ring growing 4% as it
   *  fades, and in kiai a white flash and a brighter visualiser; the triangles get a push. */
  logoBeat(beatLength, adj, kiai) {
    if (!Settings.get('ui.animSpeed')) return;
    // (not while a panel — settings, mod select, chat… — is open over the menu: the beat squeezing the logo and its
    // visualiser together made the browser redo the whole page's layers every frame, and the panel stuttered)
    if (Overlays.stack.length || SettingsPanel.o) return;
    const b = this.beatEl;
    b.getAnimations().forEach(a => a.cancel());
    b.animate([{ scale: 1, easing: 'cubic-bezier(.5, 1, .89, 1)' }, { scale: 1 - 0.02 * adj, offset: 60 / (60 + beatLength * 2), easing: 'cubic-bezier(.22, 1, .36, 1)' }, { scale: 1 }], { duration: 60 + beatLength * 2 });
    const a = +this.ampEl.style.scale || 1;
    this.ripple.getAnimations().forEach(x => x.cancel());
    this.ripple.animate([{ scale: a, opacity: 0.15 * adj }, { scale: a * (1 + 0.04 * adj), opacity: 0 }], { duration: beatLength, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    if (kiai && (+getComputedStyle(this.flashEl).opacity || 0) < 0.4) {
      this.flashEl.getAnimations().forEach(x => x.cancel());
      this.flashEl.animate([{ opacity: 0, easing: 'cubic-bezier(.5, 1, .89, 1)' }, { opacity: 0.2 * adj, offset: 60 / (60 + beatLength) }, { opacity: 0 }], { duration: 60 + beatLength });
      this.vis.getAnimations().forEach(x => x.cancel());
      this.vis.animate([{ opacity: 0.5, easing: 'cubic-bezier(.5, 1, .89, 1)' }, { opacity: 0.9 * adj, offset: 60 / (60 + beatLength) }, { opacity: 0.5 }], { duration: 60 + beatLength });
    }
    setTimeout(() => { this._kick = (this._kick || 0) + adj * (kiai ? 6 : 3); NeruMascot.beat(adj, kiai); }, 60);
  },
  /** lazer's SongTicker: fades in over 0.4s, stays 4s, fades out over 0.8s. */
  showTicker(m) {
    if (!m || !this.ticker || m.id === this._tickerFor) return;
    this._tickerFor = m.id;
    this.tkTitle.textContent = m.title; this.tkArtist.textContent = m.artist;
    this.ticker.getAnimations().forEach(a => a.cancel());
    this.ticker.animate([{ opacity: 0 }, { opacity: 1, offset: 400 / 5200 }, { opacity: 1, offset: 4400 / 5200 }, { opacity: 0 }], { duration: 5200 });
  },
  async startMenuMusic() {
    const id = Settings.get('last.map');
    let map = id && BeatmapManager.maps.get(id);
    if (!map || map.problems.length) { const all = BeatmapManager.playableMaps(); map = all[Math.floor(Math.random() * all.length)]; }
    if (!map) { Background.set(null); return; }
    const seq = Music._seq, url = await BeatmapManager.bgURL(map) || await BeatmapManager.thumbURL(BeatmapManager.setById.get(map.setId));
    if (seq !== Music._seq) return; // (left already for a screen that started its own song, with its own background)
    Background.set(url);
    if (Music.meta && Music.loaded && (Music.playing || MenuMusic.paused)) { Music.onEnded = () => MenuMusic.autoNext(); return; }
    if (Settings.get('audio.autoplay') !== false) await MenuMusic.play(map);
  },
};

/** osu!lazer's main menu background (its default menu-background artwork): a still picture of triangles — a gradient
 *  from top to bottom, big solid triangles banked up both sides with soft shadows, faint outlined triangles across
 *  the middle, and a ring of small bright outlined triangles around the logo. lazer ships it in a few colours; here
 *  it takes the colour of the playing song's background, and crossfades to the next song's colour. Drawn once per
 *  colour (and size), never animated. Geometry is in a 2000×1125 frame, scaled to cover the screen. */
const MenuTriangles = {
  col: null, running: false,
  // up-pointing equilateral triangles [apex x, apex y, side]; `down` ones point down from a top edge [left x, top y, side]
  // (traced from lazer's menu-background artwork; the light wedges between them are gaps between solids)
  SOLID: [
    [160, -310, 600], [7, -76, 700], [272, 237, 256], [359, 175, 102], [530, -130, 240], [673, 15, 100],
    [-50, 453, 800], [98, 640, 400], [207, 557, 252], [137, 700, 600], [378, 842, 700], [478, 912, 100], [790, 1000, 95], [730, 1035, 150],
    [1666, -63, 260], [2025, -320, 600], [1950, -83, 500], [1963, 157, 400], [1958, 303, 1100], [1697, 410, 97], [1760, 450, 100],
    [1632, 620, 255], [1660, 735, 164], [1680, 782, 800], [1384, 925, 600],
  ],
  OUTLINE: [
    [730, 62, 196], [834, -45, 190], [957, -153, 221], [518, 8, 340], [460, 234, 190], [420, 460, 195], [505, 535, 200], [338, 530, 62],
    [482, 655, 315], [643, 807, 280], [767, 860, 140], [890, 1000, 170], [1300, -70, 220], [1448, -103, 393], [1519, 180, 260],
    [1651, 124, 198], [1507, 443, 130], [1570, 483, 170], [1523, 705, 165], [1462, 731, 340], [1290, 897, 330], [1148, 1053, 90],
  ],
  // the ring around the logo: [apex x, apex y, side]
  RING: [
    [833, 202, 64], [963, 200, 110], [1036, 167, 70], [740, 296, 170], [848, 324, 83], [803, 355, 136], [694, 497, 98], [748, 540, 98],
    [633, 601, 64], [737, 602, 158], [818, 678, 170], [882, 739, 64], [986, 853, 64],
    [1148, 280, 103], [1219, 264, 186], [1321, 363, 103], [1236, 477, 64], [1269, 497, 83], [1353, 583, 64], [1254, 600, 94],
    [1220, 617, 195], [1119, 712, 195],
  ],
  /** A worker that paints the picture, encodes it and finds a background's colour, away from the main thread (on a
   *  slow Chromebook those took a quarter of a second each time the menu opened). null where workers can't. */
  worker() {
    if (this._w !== undefined) return this._w;
    this._w = null;
    try {
      if (typeof OffscreenCanvas !== 'function' || typeof Worker !== 'function') return null;
      const src = `const clamp = ${clamp.toString()};
const rgbToHsl = ${rgbToHsl.toString()};
const T = { OUTLINE: ${JSON.stringify(this.OUTLINE)}, SOLID: ${JSON.stringify(this.SOLID)}, RING: ${JSON.stringify(this.RING)}, ${this.paint.toString()} };
onmessage = async ({ data: m }) => {
  try {
    if (m.avg) {
      const bm = await createImageBitmap(await (await fetch(m.avg)).blob(), { resizeWidth: 12, resizeHeight: 12, resizeQuality: 'medium' });
      const c = new OffscreenCanvas(12, 12), x = c.getContext('2d'); x.drawImage(bm, 0, 0); bm.close();
      const d = x.getImageData(0, 0, 12, 12).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { const w = 0.2 + Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w; }
      const [hh, ss] = rgbToHsl(r / n, g / n, b / n);
      postMessage({ id: m.id, col: [hh, clamp(ss * 1.1 + 0.08, 0.16, 0.62)] });
    } else {
      const c = new OffscreenCanvas(m.W, m.H);
      T.paint(c.getContext('2d'), m.W, m.H, m.col);
      postMessage({ id: m.id, blob: await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 }) });
    }
  } catch (e) { postMessage({ id: m.id, err: String(e) }); }
};`;
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      const wait = new Map(); let id = 0;
      w.onmessage = ({ data }) => { const f = wait.get(data.id); if (f) { wait.delete(data.id); f(data); } };
      w.onerror = () => { for (const f of wait.values()) f({ err: 'worker' }); wait.clear(); this._w = null; };
      this._w = { ask: m => new Promise(r => { const k = ++id; wait.set(k, r); w.postMessage({ ...m, id: k }); }) };
    } catch (e) { this._w = null; }
    return this._w;
  },
  mount() {
    this.el = h('div.lz-tri', { 'aria-hidden': 'true' });
    this.running = true; this.col = null; this._drawn = null;
    this._ro = new ResizeObserver(() => { clearTimeout(this._rt); this._rt = setTimeout(() => this.render(true), 120); });
    this._ro.observe(this.el);
    this._offBg = Bus.on('bg:changed', url => this.fromImage(url));
    this.fromImage(Background.current);
    return this.el;
  },
  stop() { this.running = false; this._sampleSeq = (this._sampleSeq || 0) + 1; if (this._offBg) this._offBg(); this._offBg = null; if (this._ro) this._ro.disconnect(); this._ro = null; clearTimeout(this._rt); },
  /** Keep the graphite base; song artwork only nudges its hue and saturation. */
  async fromImage(url) {
    const seq = this._sampleSeq = (this._sampleSeq || 0) + 1;
    if (!this.col || !url) { this.col = [255, .14]; this.render(); }
    if (!url) return;
    try {
      let col;
      const worker = this.worker();
      if (worker) col = (await worker.ask({ avg: url })).col;
      if (!col) {
        const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; await img.decode();
        const cv = document.createElement('canvas'); cv.width = cv.height = 12;
        const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, 12, 12);
        const data = ctx.getImageData(0, 0, 12, 12).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) { const w = .2 + Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]); r += data[i] * w; g += data[i + 1] * w; b += data[i + 2] * w; n += w; }
        col = rgbToHsl(r / n, g / n, b / n);
      }
      if (!this.running || seq !== this._sampleSeq) return;
      const delta = ((col[0] - 255 + 540) % 360) - 180;
      this.col = [255 + delta * .18, .12 + Math.min(.04, col[1] * .06)];
      this.render();
    } catch { /* Artwork unavailable: keep the quiet graphite background. */ }
  },
  /** Draw the picture in the current colour and fade it in over the last one. */
  render(resized = false) {
    const el = this.el;
    if (!el || !el.isConnected || !this.col) { if (el && !el.isConnected && this.running) requestAnimationFrame(() => this.running && this.render(resized)); return; }
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(el.clientWidth * dpr)), H = Math.max(1, Math.round(el.clientHeight * dpr));
    const key = `${this.col[0].toFixed(1)}|${this.col[1].toFixed(3)}|${W}x${H}`;
    if (key === this._drawn) return;
    this._drawn = key;
    // (the pictures already made are kept: coming back to the menu shows the last one straight away)
    if (!this._urls) this._urls = new Map();
    const show = async url => {
      const img = h('img', { alt: '', decoding: 'async', draggable: false });
      img.src = url;
      try { await img.decode(); } catch (e) { /* shown when it loads */ }
      if (key !== this._drawn || !el.isConnected) return;
      const old = [...el.children], drop = () => old.forEach(o => o.remove());
      el.append(img);
      if (!old.length || resized) { drop(); return; }
      img.classList.add('in');
      requestAnimationFrame(() => requestAnimationFrame(() => img.classList.remove('in')));
      setTimeout(drop, 1000);
    };
    if (this._urls.has(key)) { show(this._urls.get(key)); return; }
    // painted off screen and shown as a picture, not the canvas: a still image is decoded and uploaded once, where
    // Chrome hands a canvas to the compositor again on every frame the menu animates (a big cost on slow
    // Chromebooks). (An OffscreenCanvas encodes it away from the main thread, as a JPEG: a PNG of the whole screen
    // took a fifth of a second.)
    const w = this.worker(), col = this.col;
    const here = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; this.paint(cv.getContext('2d'), W, H, col); return new Promise(r => cv.toBlob(r, 'image/jpeg', 0.95)); };
    const encoded = w ? w.ask({ W, H, col }).then(a => a.blob || here()) : here();
    encoded.catch(() => null).then(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      this._urls.set(key, url);
      if (this._urls.size > 4) { const [k, u] = this._urls.entries().next().value; this._urls.delete(k); setTimeout(() => URL.revokeObjectURL(u), 2000); }
      if (key === this._drawn) show(url);
    });
  },
  paint(x, W, H, [hue, sat]) {
    // Zako: use the same palette in the worker and fallback renderer.
    hue = Number.isFinite(hue) ? hue : 255; sat = clamp(sat || .14, .12, .16);
    const S = v => (v * 100).toFixed(1) + '%', hsl = (h2, s2, l2, a = 1) => `hsla(${((h2 % 360) + 360) % 360} ${S(clamp(s2, 0, 1))} ${S(clamp(l2, 0, 1))} / ${a})`;
    // the gradient: lighter at the top, darker at the bottom
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hsl(hue, sat, .23)); g.addColorStop(1, hsl(hue, sat, .18));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // Screen-relative edge decorations keep the centre clear at every aspect ratio.
    const unit = Math.min(W, H), R3 = Math.sqrt(3) / 2;
    const triangle = (u, v, size, down = false) => {
      const ax = W * u, ay = H * v, half = unit * size / 2, height = half * 2 * R3 * (down ? -1 : 1);
      x.beginPath(); x.moveTo(ax, ay); x.lineTo(ax + half, ay + height); x.lineTo(ax - half, ay + height); x.closePath();
    };
    x.lineWidth = Math.max(1, unit * .0018); x.lineJoin = 'round';
    const edges = [[.08,.025,.09], [.29,.018,.055], [.73,.025,.065], [.94,.02,.10],
      [.025,.31,.055], [.975,.67,.055], [.09,.98,.08,true], [.31,.98,.05,true],
      [.75,.98,.065,true], [.94,.98,.09,true]];
    const accents = [[333,.65,.67], [45,.65,.63], [255,.65,.72]];
    edges.forEach(([u,v,size,down], i) => {
      const c = accents[i % accents.length];
      x.strokeStyle = hsl(c[0], c[1], c[2], .22);
      triangle(u,v,size,down); x.stroke();
    });
    x.fillStyle = hsl(hue, sat, .40, .10);
    for (const t of [[.015,.01,.16], [.99,.03,.20], [.025,.99,.16,true], [.99,.99,.19,true]]) {
      triangle(...t); x.fill();
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  },
};
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, s, l];
}

/** Where menu music / song-select previews start: the beatmap's PreviewTime, or 40% in (as osu! does) when
 *  the map doesn't set one. */
function previewStart(map) { return map.previewTime > 0 ? map.previewTime : Math.round((map.length || 0) * 0.4); }
/** Red-line timing for the menu beat pulse (parsed after playback has started). */
async function beatTiming(map) {
  const parsed = await BeatmapManager.load(map.id).catch(() => null);
  if (!parsed) return null;
  const out = BeatmapParser.timing(parsed.bm).red.map(r => ({ time: r.time, beatLength: r.beatLength, meter: r.meter || 4 }));
  // kiai sections (bit 1 of a timing point's effects), for the menu's side flashes
  out.kiai = (parsed.bm.timingPoints || []).map(t => ({ time: t.time, on: !!(t.effects & 1) })).sort((a, b) => a.time - b.time);
  return out;
}

/** Background music (main menu / everywhere outside gameplay) with previous / pause / next. */
const MenuMusic = {
  paused: false, current: null, history: [],
  async play(map, { fromPreview = true } = {}) {
    if (!map) return;
    const tok = this._tok = {};
    try {
      await AudioManager.resume();
      const blob = await BeatmapManager.getFile(map.setId, map.audioFile);
      if (tok !== this._tok) return; // another track was requested meanwhile
      if (!blob) throw new Error('missing audio');
      if (!await Music.open(blob, `${map.setId}/${map.audioFile}`, { setId: map.setId, mapId: map.id, timing: null }) || tok !== this._tok) return;
      Music.play(fromPreview ? previewStart(map) : 0, { fadeIn: 600 });
      Music.onEnded = () => this.autoNext();
      this.paused = false;
      this.setCurrent(map);
      beatTiming(map).then(timing => { if (tok === this._tok && Music.meta && Music.meta.mapId === map.id) Music.meta.timing = timing; });
    } catch (e) { console.warn('menu music', e); }
  },
  autoNext() { if (Settings.get('audio.autoplay') !== false) this.next(); },
  setCurrent(map) { this.current = map; Toolbar.setNowPlaying(map); Bus.emit('music:changed', map); },
  /** Ranked Play — its lounge and the match screen — has no song playing behind it, only the match's own (a card's
   *  preview, the round's song): the menu's song fades out there and waits, and goes on where it was once you're out
   *  (`resume`: not into a song of the match's, which plays its own). */
  hush(on, resume = true) {
    if (on === !!this._hushed) return;
    this._hushed = on;
    if (on) {
      this._hushedPlaying = Music.playing;
      if (Music.playing) { const pos = Music.time; Music.stop(300); Music.pausedPos = pos; }
    } else if (Settings.get('audio.autoplay') !== false && resume && this._hushedPlaying && Music.loaded && !Music.playing) Music.play(Music.pausedPos, { fadeIn: 400 });
    Bus.emit('music:changed', this.current);
  },
  toggle() {
    if (this._hushed) return; // (Ranked Play: no music)
    const selected = Screens.currentName === 'songselect' && BeatmapManager.maps.get(SongSelect.selectedId);
    if (!Music.playing && selected && !selected.problems.length && (!Music.loaded || Music.meta?.mapId !== selected.id)) { SongSelect.preview(selected, { manual: true }); return; }
    // nothing loaded yet (preview audio off, or the first track never started): play starts one
    if (!Music.loaded && !Music.playing) {
      const sel = Screens.currentName === 'songselect' && BeatmapManager.maps.get(SongSelect.selectedId);
      if (sel && !sel.problems.length) this.play(sel); else this.next();
      return;
    }
    if (Music.playing) { Music.pause(); this.paused = true; }
    else if (Music.loaded) { Music.play(Music.pausedPos, { fadeIn: 250 }); this.paused = false; }
    Bus.emit('music:changed', this.current);
  },
  /** Switching tracks also switches the selected beatmap when song select is open (like lazer). */
  async go(map, fromPreview) {
    if (!map) return;
    Settings.set('last.map', map.id);
    if (Screens.currentName === 'songselect') { SongSelect.select(map.id); if (Settings.get('audio.autoplay') === false || !Settings.get('audio.previewAudio')) SongSelect.preview(map, { manual: true }); return; }
    Background.set(await BeatmapManager.bgURL(map));
    this.play(map, { fromPreview });
  },
  /** Next track. With shuffle on (lazer's default) it's a shuffled run through every set, so a small library plays
   *  each song once before any repeats; with it off, the next set in the list. */
  async next() {
    if (this._hushed) return; // (a match's song ended in Ranked Play: nothing after it)
    const sets = this.playable();
    if (!sets.length) return;
    this.dir = 1;
    if (this.current) this.history.push(this.current.id);
    let set;
    if (Settings.get('audio.shuffle') === false) {
      const i = this.current ? sets.findIndex(s => s.id === this.current.setId) : -1;
      set = sets[(i + 1) % sets.length];
    } else {
      const have = new Set(sets.map(s => s.id));
      this.queue = (this.queue || []).filter(id => have.has(id) && (!this.current || id !== this.current.setId));
      if (!this.queue.length) {
        const ids = sets.map(s => s.id).filter(id => sets.length < 2 || !this.current || id !== this.current.setId);
        for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
        this.queue = ids;
      }
      set = BeatmapManager.setById.get(this.queue.shift());
    }
    this.go(set.maps.find(m => !m.problems.length), false);
  },
  /** lazer's MusicController.PreviousTrack: past 5 seconds in, back to the start of this one; otherwise the track
   *  before (the one played before it with shuffle on, the set above it in the list with shuffle off). */
  async prev() {
    if (Music.loaded && Music.time >= 5000) { if (Music.playing) Music.play(0, { fadeIn: 150 }); else Music.pausedPos = 0; Bus.emit('music:changed', this.current); return; }
    this.dir = -1;
    if (Settings.get('audio.shuffle') === false) {
      const sets = this.playable();
      if (!sets.length) return;
      const i = this.current ? sets.findIndex(s => s.id === this.current.setId) : 0;
      const set = sets[(i - 1 + sets.length) % sets.length];
      this.go(set.maps.find(m => !m.problems.length), false);
      return;
    }
    const id = this.history.pop();
    const map = id && BeatmapManager.maps.get(id);
    if (!map) { this.dir = 0; if (Music.loaded) Music.play(0, { fadeIn: 150 }); return; }
    this.go(map, false);
  },
  playable() { return BeatmapManager.sets.filter(s => s.maps.some(m => !m.problems.length)); },
  /** The song playing was deleted with its beatmap set: on to another (song select picks its own), or with none left,
   *  silence and lazer's "no beatmaps available!" — not the deleted song, still playable from memory. */
  removed() {
    const cur = this.current;
    if (!cur || BeatmapManager.maps.has(cur.id) || Screens.currentName === 'gameplay') return;
    this.history = this.history.filter(id => BeatmapManager.maps.has(id));
    if (this.playable().length && Settings.get('audio.autoplay') !== false) { if (Screens.currentName !== 'songselect') this.next(); return; }
    this._tok = {}; Music.unload(); this.current = null; this.paused = false; Background.set(null);
    Toolbar.setNowPlaying(null); Bus.emit('music:changed', null);
  },
};
Bus.on('library:changed', () => MenuMusic.removed());

// Turning autoplay off is immediate, including previews still loading. Explicit music controls remain available.
Bus.on('settings:changed', k => {
  if (k !== 'audio.autoplay' && k !== '*') return;
  if (Settings.get('audio.autoplay') === false) {
    MenuMusic._tok = {}; SongSelect._previewTok = {}; clearTimeout(SongSelect._previewT);
    if (Screens.currentName !== 'gameplay') {
      if (Music.playing) Music.pause(); MenuMusic.paused = true;
      if (typeof ExplorerScreen !== 'undefined') { ExplorerScreen._resumeMusic = false; ExplorerScreen.stopPreview(); }
      Bus.emit('music:changed', MenuMusic.current);
    }
  } else if (Screens.currentName === 'songselect') {
    const m = BeatmapManager.maps.get(SongSelect.selectedId); if (m) SongSelect.schedulePreview(m);
  } else if (Screens.currentName === 'home' && !Music.playing) HomeScreen.startMenuMusic();
});

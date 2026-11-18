/* OG is the preserved presentation from 651ec35, not a recolouring of Default. */
const GuiStyle = {
  mode: null, defaults: null, icons: new Map(), flats: new Map(),
  icon(name, cls = '') {
    const key = name + '|' + cls;
    if (!this.icons.has(key)) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const src = (/\bfill\b/.test(cls) && OG_ICON_SRC[name + '-fill']) || OG_ICON_SRC[name];
      svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      svg.dataset.icon = name; svg.dataset.iconClass = cls;
      if (src?.[0] === 'L') {
        svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', `i lzi ${cls}`);
        svg.style.setProperty('--lzi', `url("${OG_ICON_IMG[src[1]]}")`);
      } else if (src) {
        svg.setAttribute('viewBox', `0 0 ${src[1]} ${src[2]}`); svg.setAttribute('class', `i fai ${cls}`);
        const p = document.createElementNS(svg.namespaceURI, 'path'); p.setAttribute('d', src[3]); p.style.cssText = 'fill:currentColor;stroke:none'; svg.append(p);
      } else {
        svg.setAttribute('viewBox', '0 0 256 256'); svg.setAttribute('class', `i phi ${cls}`);
        svg.innerHTML = (ICON_SRC[name] || ICON_SRC.question)[1];
      }
      this.icons.set(key, svg);
    }
    return this.icons.get(key).cloneNode(true);
  },
  flatIcon(name, alpha) {
    const key = name + '|' + alpha;
    if (!this.flats.has(key)) {
      const src = OG_ICON_SRC[name];
      const content = src?.[0] === 'L' ? `<image href="${OG_ICON_IMG[src[1]]}" width="24" height="24"/>`
        : src ? `<path d="${src[3]}"/>` : (ICON_SRC[name] || ICON_SRC.question)[1];
      const box = src?.[0] === 'L' ? '0 0 24 24' : src ? `0 0 ${src[1]} ${src[2]}` : '0 0 256 256';
      this.flats.set(key, `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" fill="#fff" opacity="${alpha}">${content}</svg>`)}")`);
    }
    return h('i.fi', { 'aria-hidden':'true', dataset:{icon:name,iconAlpha:String(alpha)}, style:{backgroundImage:this.flats.get(key)} });
  },
  apply(og) {
    if (this.mode === og) return;
    const changed = this.mode !== null;
    this.mode = og;
    const keys = Object.keys(OG_REFERENCE.home);
    this.defaults ||= { home:Object.fromEntries(keys.map(k=>[k,HomeScreen[k]])), triangles:Object.fromEntries(Object.keys(OG_REFERENCE.triangles).map(k=>[k,MenuTriangles[k]])), logoSource:LogoPainter.SRC };
    Object.assign(HomeScreen, og ? OG_REFERENCE.home : this.defaults.home);
    MenuTriangles._w?.close?.(); delete MenuTriangles._w;
    Object.assign(MenuTriangles, og ? OG_REFERENCE.triangles : this.defaults.triangles);
    MenuTriangles.guiMode = og ? 'og' : 'default'; MenuTriangles._drawn = null;
    if (MenuTriangles.running) MenuTriangles.fromImage(Background.current);
    LogoPainter.w?.terminate(); Object.assign(LogoPainter,{w:null,ready:false,broken:false,SRC:og ? OG_REFERENCE.logoSource : this.defaults.logoSource});
    if (changed) {
      // Rebuild the visual pieces in place; keep the current page, song, settings and game state.
      if (HomeScreen.el?.isConnected) {
        const home = HomeScreen, state = home.menuState;
        cancelAnimationFrame(home._raf); clearTimeout(home._perfT);
        const logo = home.buildLogo(); home.logo.replaceWith(logo); home.logo = logo;
        clearEl(home.left); clearEl(home.right); home.buildButtons(); home.setState(state,true); home.paintDaily();
        home.el.querySelector('.lz-bottom')?.remove(); home.tip = null;
        if (og) { home.tip = h('div.lz-tipbox'); home.el.append(h('div.lz-bottom',home.tip)); home.showTip(); }
        home.loop();
      }
      if (SettingsPanel.o) { const top = SettingsPanel.scrollEl.scrollTop; SettingsPanel.build(SettingsPanel.q || ''); SettingsPanel.scrollEl.scrollTop = top; }
      if (Toolbar.clock) { Toolbar.build(); Toolbar.sync(); }
      for (const old of $$('svg[data-icon]')) {
        const cls = old.dataset.iconClass ?? [...old.classList].filter(c=>!['i','phi','lzi','fai'].includes(c)).join(' ');
        old.replaceWith(icon(old.dataset.icon, cls));
      }
      for (const old of $$('i.fi[data-icon]')) old.replaceWith(flatIcon(old.dataset.icon, Number(old.dataset.iconAlpha)));
      if (Screens.currentName === 'explore') {
        Screens.current.el.style.setProperty('--o-h', og ? OVERLAY_HUES.blue : OVERLAY_HUES.pink);
        ExplorerScreen._mDirty = true; ExplorerScreen.renderResults();
        if (ExplorerScreen.setView) ExplorerScreen.renderSet();
      }
    }
    Screens.syncMenuFrame();
  },
};

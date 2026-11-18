/* Only the menu presentation changes between Default and the preserved OG appearance. */
const OG_TRIANGLE_PAINTER = {
paint(x, W, H, [hue, sat]) {
    const k = Math.max(W / 2000, H / 1125), ox = (W - 2000 * k) / 2, oy = (H - 1125 * k) / 2;
    const S = v => (v * 100).toFixed(1) + '%', hsl = (h2, s2, l2, a = 1) => `hsla(${((h2 % 360) + 360) % 360} ${S(clamp(s2, 0, 1))} ${S(clamp(l2, 0, 1))} / ${a})`;
    // the gradient: lighter at the top, darker at the bottom
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hsl(hue, sat, 0.205)); g.addColorStop(1, hsl(hue + 4, sat * 1.05, 0.095));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.setTransform(k, 0, 0, k, ox, oy);
    const R3 = Math.sqrt(3) / 2;
    const up = (ax, ay, s) => { x.beginPath(); x.moveTo(ax, ay); x.lineTo(ax + s / 2, ay + s * R3); x.lineTo(ax - s / 2, ay + s * R3); x.closePath(); };
    // faint outlines first (they sit behind the solid banks)
    x.lineWidth = 2.2; x.lineJoin = 'miter';
    for (const [ax, ay, s] of this.OUTLINE) {
      const l = 0.16 - 0.07 * clamp((ay + s * R3 / 2) / 1125, 0, 1);
      x.strokeStyle = hsl(hue, sat * 1.05, l, 0.9); up(ax, ay, s); x.stroke();
    }
    // the solid banks, each a shade darker than the gradient behind it, with lazer's soft shadow
    // (one gradient for all of them, so overlapping triangles merge into one bank, as in lazer's picture)
    x.shadowColor = 'rgba(0, 0, 0, .3)'; x.shadowBlur = 16 * k;
    const sg = x.createLinearGradient(0, 0, 0, 1125);
    sg.addColorStop(0, hsl(hue, sat * 1.04, 0.152)); sg.addColorStop(1, hsl(hue + 3, sat * 1.04, 0.066));
    x.fillStyle = sg;
    x.beginPath();
    for (const [ax, ay, s] of this.SOLID) { x.moveTo(ax, ay); x.lineTo(ax + s / 2, ay + s * R3); x.lineTo(ax - s / 2, ay + s * R3); x.closePath(); }
    x.fill(); // (one shape: overlapping triangles merge, with no seams or shadows inside a bank)
    x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0;
    // the ring: bright outlines in two accent colours, top to bottom (lazer's orange → peach and pink → peach)
    const a1 = [hue + 48, 0.82, 0.62], a2 = [hue + 62, 0.95, 0.83], b1 = [hue - 8, 0.95, 0.74];
    x.lineWidth = 2.6;
    for (const [ax, ay, s] of this.RING) {
      const t = clamp((ay + s * 0.43 - 170) / 720, 0, 1), left = ax < 1000;
      const top = left ? a1 : b1, c = [top[0] + (a2[0] - top[0]) * t, top[1] + (a2[1] - top[1]) * t, top[2] + (a2[2] - top[2]) * t];
      x.strokeStyle = hsl(c[0], c[1], c[2]); up(ax, ay, s); x.stroke();
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  },
}.paint;
const GuiStyle = {
  mode: null, defaultPaint: null,
  apply(og) {
    if (this.mode === og) return;
    this.mode = og;
    this.defaultPaint ||= MenuTriangles.paint;
    MenuTriangles._w?.close?.(); delete MenuTriangles._w;
    MenuTriangles.paint = og ? OG_TRIANGLE_PAINTER : this.defaultPaint;
    MenuTriangles.guiMode = og ? 'og' : 'default';
    MenuTriangles._drawn = null;
    if (MenuTriangles.running) MenuTriangles.render(true);
    Screens.syncMenuFrame();
  },
};

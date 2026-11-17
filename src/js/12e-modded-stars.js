/* Menu ratings use the same converted notes, rate and strain calculator as gameplay. */
const ModdedStars = {
  values: new Map(), pending: new Map(), queue: Promise.resolve(),
  context(map, options = {}) {
    const mods = ModSystem.normalize(options.mods || []), config = ModSystem.config(options.modConfig || {});
    const rate = Number.isFinite(options.rate) && options.rate > 0 ? options.rate : ModSystem.rate(mods, config);
    const keys = map?.mode === 0 ? ModSystem.keyMod(mods) : 0, conversion = mods.filter(id => id === 'NLN' || id === 'IN');
    return { mods, rate, keys, conversion, seed: options.seed || 0, legacy: options.rules && options.rules < 4, key: `${map?.hash}|${rate}|${keys}|${conversion.join(',')}|${options.seed || 0}|${options.rules && options.rules < 4 ? 'legacy' : 'current'}` };
  },
  baseUnchanged(map, c) { return c.rate === 1 && !c.keys && !c.conversion.length && !c.legacy && Number.isFinite(map?.stars); },
  value(map, options = {}) {
    const c = this.context(map, options);
    if (this.baseUnchanged(map, c)) return map.stars;
    return this.values.get(c.key) ?? null;
  },
  calculate(map, options = {}) {
    const c = this.context(map, options), cached = this.value(map, options);
    if (cached !== null) return Promise.resolve(cached);
    if (!map?.id || !BeatmapManager.maps.has(map.id)) return Promise.reject(new Error('Beatmap not installed'));
    if (this.pending.has(c.key)) return this.pending.get(c.key);
    const work = this.queue.catch(()=>{}).then(async()=>{
      const { bm, notes } = await BeatmapManager.load(map.id), keys = c.keys || map.keys;
      const source = c.legacy ? BeatmapParser.toManiaNotes(bm, c.keys, { legacy: true }) : c.keys ? BeatmapParser.toManiaNotes(bm, c.keys) : notes;
      const prepared = c.conversion.length ? prepareNotes(source, keys, c.mods, c.seed, { red: BeatmapParser.timing(bm).red }) : source;
      const stars = DifficultyCalculator.calculate(prepared, keys, c.rate, { legacy: !!c.legacy });
      this.values.set(c.key, stars); while (this.values.size > 150) this.values.delete(this.values.keys().next().value);
      await sleep(0);
      return stars;
    }).finally(()=>this.pending.delete(c.key));
    this.pending.set(c.key, work); this.queue = work.catch(()=>{}); return work;
  },
  badge(map, options = {}) {
    const el = h('span.mod-star-rating'), known = this.value(map, options);
    if (known !== null) { el.append(starBadge(known)); return el; }
    el.append(h('span.muted', icon('star'), ' …')); el.title = 'Calculating the rating with mods';
    this.calculate(map, options).then(stars=>{el.replaceChildren(starBadge(stars));el.title='';}).catch(()=>{el.title='Download the beatmap to calculate its rating with mods';});
    return el;
  },
  label(map, version, options = {}) {
    const el = h('span'), paint = stars => { el.textContent = `${version} · ★${stars === null ? '…' : stars.toFixed(2)}`; };
    paint(this.value(map, options));this.calculate(map, options).then(paint).catch(()=>{});return el;
  },
};

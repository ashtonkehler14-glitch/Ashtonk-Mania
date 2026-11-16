/* Web-Osu-Mania backup import: only the stored beatmap archives are restored.
 * Settings, scores, collections and account progress are not imported from backups. */

const WomImport = {
  /** Does this zip look like a WOM backup (rather than a beatmap or skin archive)? */
  looksLike(zip) {
    return zip.entries.some(e => /^(settings|highScores|collections|storedBeatmapSets|savedBeatmapSets)\.json$/.test(e.name) || /^beatmapFiles\/\d+/.test(e.name));
  },
  /** WOM's zustand stores are saved as {state, version}; older ones as the bare object. */
  state(text) { const o = JSON.parse(text); return o && typeof o === 'object' && 'state' in o ? o.state : o; },

  /** Import a backup file. Returns what came across: {sets, scores, settings, collections, skipped, errors}. */
  async run(file, { onStatus = () => {} } = {}) {
    const zip = await ZipReader.fromFile(file); // (a part at a time: with its beatmaps, a backup can be gigabytes)
    if (!this.looksLike(zip)) throw new Error('This isn\'t a Web-Osu-Mania backup. In Web-Osu-Mania, open Settings → Backup & Restore and export one.');
    const out = { sets: [], scores: 0, settings: false, collections: 0, skipped: 0, errors: [] };

    // Import the original song files, without consuming backup account records.
    const osz = zip.entries.filter(e => /^beatmapFiles\/\d+.*\.osz$/i.test(e.name));
    const report = { sets: [], skins: [], replays: [], errors: [], warnings: [] };
    for (let i = 0; i < osz.length; i++) {
      const e = osz[i], setId = Number(/^beatmapFiles\/(\d+)/.exec(e.name)[1]);
      onStatus(`Importing beatmaps… ${i + 1}/${osz.length}`);
      try {
        const f = new File([await zip.blob(e, 'application/zip')], e.name.split('/').pop(), { type: 'application/zip' });
        const sets = await BeatmapManager.importOsz(f, report);
        for (const s of sets) if (!s.onlineId || s.onlineId < 0) { s.onlineId = setId; await DB.put('sets', { ...s, maps: undefined }); }
        out.sets.push(...sets);
      } catch (err) { out.errors.push(`${e.name.split('/').pop()}: ${friendlyError(err)}`); }
    }
    out.errors.push(...report.errors);
    if (out.sets.length) Bus.emit('library:changed');

    // Backup files only supply beatmaps; account progress and settings are left alone.
    onStatus(null);
    return out;
  },

  /** A short "what came across" line for toasts and the setup screen. */
  summary(r) {
    const parts = [];
    if (r.sets.length) parts.push(plural(r.sets.length, 'beatmap set') + (r.downloaded ? ` (${r.downloaded} downloaded for your collections)` : ''));
    if (r.scores) parts.push(plural(r.scores, 'score'));
    if (r.collections) parts.push(plural(r.collections, 'collection'));
    if (r.settings) parts.push('settings and keybinds');
    return parts.length ? parts.join(', ') : 'nothing new';
  },

  /** Pick a backup and import it, with the usual import pill and a toast. */
  async pickAndImport() {
    const [f] = await pickFiles({ accept: '.zip', multiple: false });
    if (f) return this.importFile(f);
    return null;
  },
  async importFile(f) {
    await AudioManager.resume();
    const pill = h('div.import-pill', h('span.spinner'), h('span', 'Reading backup…'));
    $('#app').appendChild(pill);
    try {
      const r = await this.run(f, { onStatus: m => { if (m) pill.lastChild.textContent = m; } });
      Toast.ok('Web-Osu-Mania beatmaps imported', WomImport.summary(r) + (r.skipped ? ` (${plural(r.skipped, 'score')} for beatmaps that weren't in the backup were left out)` : ''));
      if (r.errors.length) Toast.err('Some of it couldn\'t be imported', r.errors.slice(0, 5).join('\n'));
      if (r.sets.length) App.keepStorage && App.keepStorage();
      return r;
    } catch (e) {
      Toast.err('Couldn\'t import the backup', friendlyError(e));
      return null;
    } finally { pill.remove(); }
  },
};

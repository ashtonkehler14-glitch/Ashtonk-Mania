/* Shared @-completion for chat inputs. Nothing is sent until the normal send action. */
const ChatMentions = {
  escape(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); },
  has(text, name = ProfileManager.profile.name) {
    if (!name?.trim()) return false;
    return new RegExp(`(^|[^\\p{L}\\p{N}_])@${this.escape(name.trim())}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(String(text || ''));
  },
  players(input) {
    const room = Multiplayer.room;
    let list = input?.closest('.mp-tabpane, .gp-chat:not(.spectator-chat)') && room ? room.players : Presence.players;
    if (input?.closest('.spectator-chat')) list = [...(list || []), ...SpectatorChat.lines.map(l => l.from), Spectate.target].filter(Boolean);
    const seen = new Set();
    return (list || []).filter(p => {
      if (!p.name || p.pid && p.pid === Presence.pid() || p.id && p.id === Presence.me) return false;
      const key = p.name.toLocaleLowerCase(); if (seen.has(key)) return false; seen.add(key); return true;
    });
  },
  matches(input) {
    const end = input.selectionStart ?? input.value.length;
    if (input.selectionEnd !== end) return null;
    const m = /(?:^|\s)@([^\s@]*)$/.exec(input.value.slice(0, end));
    return m ? { start: end - m[1].length - 1, end, query: m[1].toLocaleLowerCase() } : null;
  },
  notify(line, where, onClick) {
    const from = typeof line.from === 'object' ? line.from : line;
    if (!from?.name || from.pid && from.pid === Presence.pid() || typeof line.from === 'string' && line.from === Multiplayer.me || Settings.get('online.status') === 'dnd' || !this.has(line.text)) return;
    Toast.show(`${from.name} mentioned you in ${where}`, String(line.text).slice(0, 120), { onClick, hold: true });
  },
  init() {
    const eligible = el => el instanceof HTMLInputElement && !el.disabled && el.matches('.ch-input, .gp-chat-in, input[aria-label="Chat message"]');
    Bus.on('screen:changed', () => this.hide());
    document.addEventListener('focusout', e => { if (e.target === this.input) setTimeout(() => { if (this.input && document.activeElement !== this.input) this.hide(); }, 0); });
    document.addEventListener('input', e => { if (eligible(e.target)) this.show(e.target); });
    document.addEventListener('focusin', e => { if (eligible(e.target)) this.show(e.target); else if (!this.popup?.contains(e.target)) this.hide(); });
    document.addEventListener('pointerdown', e => { if (e.target !== this.input && !this.popup?.contains(e.target)) this.hide(); }, true);
    document.addEventListener('keydown', e => {
      if (!this.popup || e.target !== this.input || e.isComposing) return;
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { this.hide(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); this.active = (this.active + (e.key === 'ArrowDown' ? 1 : -1) + this.options.length) % this.options.length; this.paintActive(); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); this.choose(this.active); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.hide(); }
    }, true);
    document.addEventListener('scroll', e => { if (!this.popup?.contains(e.target)) this.hide(); }, true);
    window.addEventListener('resize', () => this.hide());
  },
  show(input) {
    this.hide();
    const token = this.matches(input); if (!token) return;
    const options = this.players(input).filter(p => p.name.toLocaleLowerCase().includes(token.query)).sort((a,b) => Number(b.name.toLocaleLowerCase().startsWith(token.query)) - Number(a.name.toLocaleLowerCase().startsWith(token.query)) || a.name.localeCompare(b.name)).slice(0, 6);
    if (!options.length) return;
    this.input = input; this.token = token; this.options = options; this.active = 0;
    this.popup = h('div.chat-mentions', { id: 'chat-mention-options', role: 'listbox', 'aria-label': 'Mention a player' }, h('div.chat-mentions-title', 'Mention a player'), ...options.map((p,i) => h('button.chat-mention-option', { id: `chat-mention-${i}`, role: 'option', type: 'button', onpointerdown: e => { e.preventDefault(); this.choose(i); } }, Presence.avatarEl(p, 26), h('span', p.name))));
    document.body.append(this.popup);
    input.setAttribute('aria-controls', this.popup.id); input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-autocomplete', 'list');
    const rect = input.getBoundingClientRect(), width = Math.min(320, innerWidth - 24);
    Object.assign(this.popup.style, { width: width + 'px', left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)) + 'px' });
    if (rect.top > 140) Object.assign(this.popup.style, { bottom: (innerHeight - rect.top + 6) + 'px', maxHeight: Math.min(240, rect.top - 18) + 'px' });
    else Object.assign(this.popup.style, { top: (rect.bottom + 6) + 'px', maxHeight: Math.max(60, Math.min(240, innerHeight - rect.bottom - 18)) + 'px' });
    this.paintActive();
  },
  paintActive() {
    [...this.popup.querySelectorAll('[role=option]')].forEach((el,i) => { el.setAttribute('aria-selected', String(i === this.active)); if (i === this.active) el.scrollIntoView({ block: 'nearest' }); });
    this.input.setAttribute('aria-activedescendant', `chat-mention-${this.active}`);
  },
  choose(index) {
    const input = this.input, p = this.options?.[index], token = this.token;
    if (!input || !p || !token) return;
    const insert = `@${p.name} `, value = input.value.slice(0,token.start) + insert + input.value.slice(token.end);
    if (input.maxLength > 0 && value.length > input.maxLength) return;
    input.value = value; input.setSelectionRange(token.start + insert.length, token.start + insert.length); this.hide(); input.focus({ preventScroll: true });
  },
  hide() {
    this.popup?.remove(); this.popup = null;
    if (this.input) { this.input.setAttribute('aria-expanded', 'false'); this.input.removeAttribute('aria-activedescendant'); this.input.removeAttribute('aria-controls'); }
    this.input = null;
  },
};

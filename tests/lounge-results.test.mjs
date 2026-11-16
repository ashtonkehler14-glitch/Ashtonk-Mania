import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function load(files) {
  let src = readFileSync(new URL('../src/js/' + files[0], import.meta.url), 'utf8');
  src = files[0].startsWith('15-') ? src.slice(src.indexOf('const GameplayScreen =')) : src.slice(src.indexOf('function roleOfPid'), src.indexOf('/** Phosphor'));
  const ctx = vm.createContext({ J: {} });
  vm.runInContext(src + '\n;globalThis.exports = ' + (files[0].startsWith('15-') ? '{ GameplayScreen }' : '{ chatName }'), ctx);
  return { ...ctx.exports, __ctx: ctx };
}

function setup() {
  const { GameplayScreen: screen, __ctx: ctx } = load(['15-screen-gameplay.js']);
  const listeners = new Set(), timers = new Map(), routes = [];
  let seq = 0;
  Object.assign(ctx, {
    Multiplayer: { room: { code: 'ROOM' }, lastResults: null },
    Screens: { go: (...args) => routes.push(args) },
    Bus: { on: (_, fn) => { listeners.add(fn); return () => listeners.delete(fn); } },
    h: () => ({ remove() {} }),
    setTimeout: (fn, ms) => { timers.set(++seq, { fn, ms }); return seq; },
    clearTimeout: id => timers.delete(id),
  });
  screen.s = {}; screen.hud = { append() {} };
  return { screen, ctx, listeners, timers, routes };
}

test('lounge waits for final standings, even when a room update replaces its object', () => {
  const t = setup(); t.screen.mpAfter({ score: 100 }, null);
  assert.equal(t.routes.length, 0);
  assert.equal([...t.timers.values()][0].ms, 60000);
  t.ctx.Multiplayer.room = { code: 'ROOM' };
  for (const fn of t.listeners) fn();
  assert.equal(t.routes.length, 0);
  t.ctx.Multiplayer.lastResults = { winner: 'me' };
  for (const fn of t.listeners) fn();
  assert.equal(t.routes[0][0], 'results');
  assert.equal(t.listeners.size, 0); assert.equal(t.timers.size, 0);
});

test('results ready beforehand opens immediately; timeout and cancellation clean up listeners', () => {
  const ready = setup(); ready.ctx.Multiplayer.lastResults = { winner: 'me' }; ready.screen.mpAfter({}, null);
  assert.equal(ready.routes.length, 1); assert.equal(ready.listeners.size, 0);
  const timeout = setup(); timeout.screen.mpAfter({}, null); [...timeout.timers.values()][0].fn();
  assert.equal(timeout.routes.length, 1); assert.equal(timeout.listeners.size, 0);
  const cancelled = setup(); cancelled.screen.mpAfter({}, null); cancelled.screen._mpResultsCancel();
  assert.equal(cancelled.routes.length, 0); assert.equal(cancelled.timers.size, 0); assert.equal(cancelled.listeners.size, 0);
});

test('quick play and ranked play keep their room standings flow', () => {
  for (const kind of ['qp', 'rp']) {
    const t = setup(); t.ctx.Multiplayer.room[kind] = {}; t.screen.mpAfter({}, null);
    assert.equal(t.routes[0][0], 'multiplayer'); assert.equal(t.listeners.size, 0);
  }
});

test('chat name uses validated role colour, including room session lookup and offline history', () => {
  const { chatName, __ctx: ctx } = load(['12-ui-core.js']);
  ctx.Presence = { pid: () => 'self', role: { colour: '#ffcc22' }, players: [{ pid: 'friend', role: { colour: '#44aaff' } }] };
  ctx.Multiplayer = { room: { players: [{ id: 'session', pid: 'friend' }] } };
  const el = () => ({ style: { color: 'default' } });
  assert.equal(chatName(el(), { pid: 'self' }).style.color, '#ffcc22');
  assert.equal(chatName(el(), { from: 'session' }).style.color, '#44aaff');
  assert.equal(chatName(el(), { pid: 'offline', role: { colour: '#abcdef' } }).style.color, '#abcdef');
  assert.equal(chatName(el(), { role: { colour: 'url(bad)' } }).style.color, 'default');
  assert.equal(chatName(el(), {}).style.color, 'default');
});

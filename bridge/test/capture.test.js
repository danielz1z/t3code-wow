import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StripCapture, pickMacWindow, pickKwinWindow } from '../src/capture.js';

const screens = [
  { x: 0, y: 0, width: 1512, height: 982, scale: 2 }, // built-in Retina, the primary
  { x: 1512, y: -100, width: 2560, height: 1440, scale: 1 }, // external, NSScreen's bottom-left origin
];
const win = (pid, X, Y, Width, Height, extra = {}) => ({ pid, layer: 0, onscreen: true, bounds: { X, Y, Width, Height }, ...extra });

test('a window on the Retina screen', () => {
  const w = pickMacWindow({ windows: [win(5, 0, 0, 1512, 982)], screens }, 5);
  assert.deepEqual([w.found, w.visible, w.scale], [true, true, 2]);
});

test('a windowed client on the external screen, found by pid over a same-named window', () => {
  const info = { windows: [win(9, 10, 10, 800, 600), win(5, 1600, -300, 1280, 748)], screens };
  const w = pickMacWindow(info, 5);
  assert.deepEqual([w.x, w.y, w.scale], [1600, -300, 1]);
});

test('ignores menus and tiny windows, and reports a window on another Space as hidden', () => {
  const info = { windows: [win(5, 0, 0, 1512, 30, { layer: 25 }), win(5, 0, 0, 40, 40), win(5, 0, 0, 1512, 982, { onscreen: false })], screens };
  const w = pickMacWindow(info, 5);
  assert.deepEqual([w.found, w.visible], [true, false]);
  assert.equal(pickMacWindow({ windows: [], screens }, 5).found, false);
});

const kwin = (pid, caption, extra = {}) => ({ pid, caption, uuid: `{${pid}}`, x: 10, y: 20, width: 1280, height: 720, minimized: false, desktops: ['d1'], ...extra });

test('KWin: the game by pid over a same-named window, else by caption', () => {
  const infos = [kwin(9, 'World of Warcraft'), kwin(5, 'World of Warcraft', { x: 300 })];
  assert.equal(pickKwinWindow(infos, 5, 'd1').x, 300);
  assert.equal(pickKwinWindow(infos, 77, 'd1').uuid, '{9}');
  assert.equal(pickKwinWindow([kwin(9, 'Battle.net')], 77, 'd1').found, false);
});

test('Windows: a configured region of the screen comes back as an image the decoder can read', { skip: process.platform !== 'win32' && 'needs Windows PowerShell' }, async () => {
  const res = await new StripCapture({ region: { x: 0, y: 0 } }).grab();
  const { width, height } = StripCapture.stripPixels(4);
  assert.deepEqual([res.status, res.via, res.image.width, res.image.height, res.image.data.length], ['ok', 'screen', width, height, width * height * 3]);
});

test('KWin: hidden when minimized or on another desktop, visible on all desktops', () => {
  assert.equal(pickKwinWindow([kwin(5, 'World of Warcraft', { minimized: true })], 5, 'd1').visible, false);
  assert.equal(pickKwinWindow([kwin(5, 'World of Warcraft')], 5, 'd2').visible, false);
  assert.equal(pickKwinWindow([kwin(5, 'World of Warcraft', { desktops: [] })], 5, 'd2').visible, true);
});

test('window lookups slow down while the window stays put, and speed up when it changes', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const cap = new StripCapture();
  let current = { found: true, visible: true, x: 0, y: 0, width: 800, height: 600, scale: 1 };
  let lookups = 0;
  const lookup = async () => {
    lookups++;
    return { ...current };
  };
  // Lookups at each second for 40 seconds: how many reach the lookup?
  const run = async (seconds) => {
    lookups = 0;
    for (let s = 0; s < seconds; s++) {
      await cap.cachedWindow(7, lookup);
      t.mock.timers.tick(1000);
    }
    return lookups;
  };
  assert.equal(await run(2), 1);
  // Unchanged: 2 s, then 4 s, then 8 s at most.
  assert.ok((await run(40)) <= 7);
  // Moved: the next lookup that runs sees it, and goes back to every 2 seconds.
  current = { ...current, x: 100 };
  t.mock.timers.tick(8000);
  assert.equal((await cap.cachedWindow(7, lookup)).x, 100);
  assert.equal(cap.winCache.ttl, 2000);
  // Hidden: stays at 2 seconds, so coming back is noticed quickly.
  // (The first second still uses the lookup made just after the move.)
  current = { ...current, visible: false };
  assert.equal(await run(10), 4);
  assert.equal(cap.winCache.ttl, 2000);
});

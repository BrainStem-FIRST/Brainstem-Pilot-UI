// Recapture the Documentation screenshots from the running dev server.
//
// The docs shipped with images of a UI that no longer exists — a four-card home screen, "My
// Autonomous Paths", the skeleton/variant builders. Rather than hand-cropping replacements,
// this drives headless Chrome over the DevTools protocol: it builds the same in-memory state
// a user would (add a path slot, draw waypoints, open a panel) and captures the result, so
// the images stay reproducible when the UI moves again.
//
//   npm run dev            # in another terminal
//   node scripts/capture-docs.mjs
//
// Paths and autos live in a project folder chosen through a file picker, which headless
// Chrome cannot open. Everything here is therefore built in memory: it renders identically,
// it just isn't saved anywhere.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const BASE = 'http://localhost:5173/Brainstem-Pilot-UI';
const OUT = new URL('../public/docs/', import.meta.url).pathname;
const SIZE = { width: 1440, height: 900 };
// Chrome writes a full browser profile here — hundreds of MB. Removed on the way out so
// repeated runs don't quietly fill the disk.
const PROFILE = '/tmp/brainstem-doc-shots';

// ── Minimal CDP client ───────────────────────────────────────────────────────

let ws;
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function connect() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find(t => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
          }
        };
        return;
      }
    } catch { /* chrome still starting */ }
    await sleep(250);
  }
  throw new Error('could not attach to Chrome');
}

/** Run an expression in the page and return its value. Throws on a page-side error. */
async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'page error');
  return result.value;
}

async function goto(path) {
  await send('Page.navigate', { url: `${BASE}${path}` });
  await sleep(1400); // dev server + first paint + entrance animations
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(`${OUT}${name}.png`, Buffer.from(data, 'base64'));
  console.log(`  ✓ ${name}.png`);
}

// ── Page-side helpers, injected before each capture ──────────────────────────

const HELPERS = `
  window.__btn = (label) => [...document.querySelectorAll('button')]
    .find(b => b.innerText.trim() === label);
  window.__click = async (label, ms = 500) => {
    const b = window.__btn(label);
    if (!b) throw new Error('no button: ' + label);
    b.click();
    await new Promise(r => setTimeout(r, ms));
  };
  // Find a dropdown by its placeholder option ("— Subsystem —") rather than by index:
  // the command dropdown only appears once a subsystem is chosen, so indices shift.
  window.__pick = async (placeholder, value, ms = 600) => {
    const sel = [...document.querySelectorAll('select')]
      .find(s => (s.options[0]?.text ?? '').includes(placeholder));
    if (!sel) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, ms));
    return true;
  };
  true;
`;

const SEED = `
  localStorage.setItem('brainstem_local_subsystem_config', JSON.stringify({
    subsystems: [
      { id: 'sys-shooter', name: 'Shooter', visualBinding: '', commands: [
        { id: 'c1', name: 'Shooter On' }, { id: 'c2', name: 'Fire' }] },
      { id: 'sys-intake', name: 'Intake', visualBinding: '', commands: [
        { id: 'c3', name: 'Intake On' }, { id: 'c4', name: 'Intake Off' }] },
      { id: 'sys-turret', name: 'Turret', visualBinding: '', commands: [
        { id: 'c5', name: 'Track Turret' }] },
    ],
  }));
  localStorage.setItem('brainstem_league_preference', 'frc');
  localStorage.removeItem('brainstem_auto_workspace_tabs');
  true;
`;

// ── Captures ─────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT, { recursive: true });

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    `--window-size=${SIZE.width},${SIZE.height}`,
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    await connect();
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      ...SIZE, deviceScaleFactor: 2, mobile: false,
    });

    await goto('/');
    await evaluate(SEED);

    console.log('capturing…');

    // Home screen
    await goto('/');
    await sleep(900); // staggered card entrance
    await shot('welcome');

    // Settings — two tabs
    await goto('/settings');
    await evaluate(HELPERS);
    await shot('robot-settings');
    await evaluate(`window.__click('App Settings', 700)`).catch(() => {});
    await shot('app-settings');

    // Subsystem configurator
    await goto('/subsystem-config');
    await evaluate(HELPERS);
    // Expand the first subsystem by clicking its *name*, not the first button in the card —
    // that was the delete control, and it quietly removed the subsystem the later captures
    // depend on.
    await evaluate(`(async () => {
      const row = [...document.querySelectorAll('*')]
        .find(el => el.children.length === 0 && el.textContent.trim() === 'Shooter');
      row?.closest('div[class*="rounded"]')?.click();
      await new Promise(r => setTimeout(r, 700));
    })()`).catch(() => {});
    await shot('subsystem-config');

    // Re-seed: the configurator writes to localStorage, so anything the capture touched there
    // must not leak into the workspace shots.
    await evaluate(SEED);

    // Auto workspace — a real sequence with a warning showing
    await goto('/auto-workspace/docs-demo');
    await evaluate(HELPERS);
    await evaluate(`(async () => {
      await window.__click('Path', 400);  await window.__click('New Path', 900);
      await window.__click('Point', 400); await window.__click('New Point', 900);
      await window.__click('Subsystem', 900);
      await window.__click('Wait', 700);
    })()`);
    // Unfinished slots first: this is the Warnings section's illustration.
    await shot('warnings');

    // Now finish them, so the Autos section shows a complete sequence.
    const filled = await evaluate(`(async () => {
      const card = [...document.querySelectorAll('p')]
        .find(p => p.textContent.trim() === 'Unassigned');
      card?.closest('[class*="rounded-xl"]')?.click();
      await new Promise(r => setTimeout(r, 700));
      const opts = [...document.querySelectorAll('select')]
        .map(s => [...s.options].map(o => o.text));
      const okSys = await window.__pick('Subsystem', 'Shooter');
      const okCmd = await window.__pick('Command', 'Shooter On');
      const wait = document.querySelector('input[type=number]');
      if (wait) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(wait, '0.8');
        wait.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));
      }
      return { opts, okSys, okCmd };
    })()`);
    console.log('  · subsystem options seen:', JSON.stringify(filled));
    await shot('auto-workspace');

    // Path editor — select the path slot so the field and sidebar are live
    await evaluate(`(async () => {
      const card = [...document.querySelectorAll('p')].find(p => p.textContent.trim() === 'Path 1');
      card?.closest('[class*="rounded-xl"]')?.click();
      await new Promise(r => setTimeout(r, 900));
    })()`);
    await shot('path-editor');

    // Waypoint detail — select a waypoint to open its panel
    await evaluate(`(async () => {
      const wp = [...document.querySelectorAll('button')].find(b => /Start \\(/.test(b.innerText));
      wp?.click();
      await new Promise(r => setTimeout(r, 800));
    })()`).catch(() => {});
    await shot('waypoints-zoom');

    // Constraints panel
    await evaluate(`(async () => {
      document.querySelector('input[type="number"]')?.scrollIntoView({ block: 'center' });
      await new Promise(r => setTimeout(r, 500));
    })()`).catch(() => {});
    await shot('constraints-panel');

    // Rotation targets + subsystem triggers, both expanded
    await evaluate(`(async () => {
      for (const label of ['Rotation Targets', 'Subsystem Triggers']) {
        const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes(label));
        b?.click(); await new Promise(r => setTimeout(r, 400));
      }
      const add = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Add Target');
      add?.click(); await new Promise(r => setTimeout(r, 500));
    })()`).catch(() => {});
    await shot('rotation-targets');

    await evaluate(`(async () => {
      const add = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Add Trigger');
      add?.click(); await new Promise(r => setTimeout(r, 600));
      await window.__pick('Subsystem', 'Shooter');
      await window.__pick('Command', 'Fire');
    })()`).catch(() => {});
    await shot('subsystem-triggers');

    // Auto list and the Path & Point Index
    await goto('/string-builder');
    await shot('autos-list');

    await goto('/library');
    await shot('paths-list');

    console.log('done — public/docs/ updated');
  } finally {
    try { ws?.close(); } catch { /* already gone */ }
    chrome.kill();
    await sleep(400);
    try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

main().catch(err => { console.error(err); process.exit(1); });

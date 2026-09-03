import Phaser from 'phaser';
import { buildUrl, guessDevice, parseParams, type RigParams } from './params';
import { buildReport, emitError, emitReport, FrameSampler, type FrameStats } from './report';
import { MATRIX } from './scenarios/matrix';
import { loadScenario } from './scenarios/registry';
import type { Scenario, ScenarioHandle } from './scenarios/types';

/** The Makerspace canvas is a fixed 4:3 letterboxed stage. The rig uses the same aspect. */
const STAGE_WIDTH = 1024;
const STAGE_HEIGHT = 768;

const params = parseParams(window.location.search);

// PWA app shell (CW-01.8). Production only, so the dev server never serves stale files; ?sw=0 skips
// it so a cold-load measurement sees every byte on the page's own network.
if (import.meta.env.PROD && 'serviceWorker' in navigator && params.extra['sw'] !== '0') {
  navigator.serviceWorker.register(new URL('sw.js', window.location.href).toString()).catch((err: unknown) => console.warn('RIG_SW', String(err)));
}

if (params.scenario === '') {
  renderIndex();
} else {
  void runScenario(params);
}

function renderIndex(): void {
  const root = document.getElementById('index');
  if (!root) return;
  root.hidden = false;
  const device = guessDevice(navigator.userAgent, navigator.maxTouchPoints);

  const header = document.createElement('div');
  header.innerHTML = `
    <h1>Kodable Creator Rig</h1>
    <p>Open a scenario, wait for the report box, then paste the JSON into the results table.
       Set the device tag first so the report is labeled. Duration is seconds of measurement after a 3 s warm-up.</p>
    <label>Device tag <input id="device" value="${device}" size="18"></label>
    <label>Duration <input id="duration" type="number" value="20" min="3" max="600" size="5"> s</label>
    <label>Adapter <select id="adapter"><option value="none">none</option></select></label>
    <label id="send-label" hidden><input id="send" type="checkbox" checked> Send reports to this server (results/)</label>
  `;
  root.appendChild(header);

  const deviceInput = header.querySelector<HTMLInputElement>('#device');
  const durationInput = header.querySelector<HTMLInputElement>('#duration');
  const adapterSelect = header.querySelector<HTMLSelectElement>('#adapter');
  const sendLabel = header.querySelector<HTMLLabelElement>('#send-label');
  const sendInput = header.querySelector<HTMLInputElement>('#send');

  const list = document.createElement('div');
  root.appendChild(list);

  const render = (): void => {
    list.innerHTML = '';
    for (const s of MATRIX) {
      const card = document.createElement('section');
      card.className = 'scenario';
      const title = document.createElement('h2');
      title.textContent = `${s.title} (${s.task})`;
      const desc = document.createElement('p');
      desc.className = 'desc';
      desc.textContent = s.description;
      const variants = document.createElement('div');
      variants.className = 'variants';
      const adapters = s.adapters.length > 0 ? s.adapters : ['none'];
      for (const v of s.variants) {
        for (const adapter of adapters) {
          if (adapters.length > 1 && adapterSelect && adapterSelect.value !== 'none' && adapterSelect.value !== adapter) continue;
          const a = document.createElement('a');
          a.href = buildUrl('./', {
            scenario: s.id,
            adapter,
            device: deviceInput?.value ?? '',
            duration: durationInput?.value ?? '20',
            ...v.params,
            ...(sendInput?.checked && !sendLabel?.hidden ? { send: 1 } : {}),
          });
          a.textContent = adapters.length > 1 ? `${v.label} · ${adapter}` : v.label;
          variants.appendChild(a);
        }
      }
      card.append(title, desc, variants);
      list.appendChild(card);
    }
  };

  // Populate the adapter filter from the matrix.
  const allAdapters = new Set<string>();
  for (const s of MATRIX) for (const a of s.adapters) allAdapters.add(a);
  for (const a of allAdapters) {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    adapterSelect?.appendChild(opt);
  }

  deviceInput?.addEventListener('input', render);
  durationInput?.addEventListener('input', render);
  adapterSelect?.addEventListener('change', render);
  sendInput?.addEventListener('change', render);
  render();

  // Offer auto-send only where a collector answers (the Vite dev or preview server, not Pages).
  void fetch(new URL('report', window.location.href), { method: 'HEAD' })
    .then((res) => {
      if (res.ok && sendLabel) {
        sendLabel.hidden = false;
        render();
      }
    })
    .catch(() => undefined);
}

async function runScenario(p: RigParams): Promise<void> {
  const stage = document.getElementById('stage');
  if (stage) stage.style.display = 'block';
  const hud = document.getElementById('hud');
  const hashBox = document.getElementById('hash');
  const device = p.device !== '' ? p.device : guessDevice(navigator.userAgent, navigator.maxTouchPoints);

  const loaded = await loadScenario(p.scenario);
  if (!loaded) {
    emitError(`unknown scenario "${p.scenario}"`);
    return;
  }
  const scenario: Scenario = loaded;
  const effective: RigParams = { ...p, count: p.count > 0 ? p.count : scenario.defaultCount };

  let handle: ScenarioHandle | null = null;
  const sampler = new FrameSampler();
  const startedAt = new Date().toISOString();

  class RigScene extends Phaser.Scene {
    constructor() {
      super('rig');
    }
    async create(): Promise<void> {
      try {
        handle = await scenario.create(this, effective);
      } catch (err) {
        emitError(`scenario.create failed: ${(err as Error).message}`);
        return;
      }
      const stats = await sampler.start(effective.warmup * 1000, effective.duration * 1000, () => handle?.busy?.() === true);
      finish(stats);
    }
    private firstFrameMarked = false;
    override update(time: number, delta: number): void {
      if (handle && !this.firstFrameMarked) {
        // First interactive frame of the scenario: the load-time measurement reads this mark.
        this.firstFrameMarked = true;
        performance.mark('rig:first-frame');
      }
      handle?.update?.(delta, time);
      if (hud) {
        hud.textContent =
          `${effective.scenario} count=${effective.count} adapter=${effective.adapter} device=${device}\n` +
          `fps ${sampler.liveFps().toFixed(1)}  frame ${(sampler.recent[sampler.recent.length - 1] ?? 0).toFixed(1)} ms`;
      }
      if (hashBox && handle?.hash) {
        const h = handle.hash();
        if (h) {
          hashBox.textContent = h;
          hashBox.style.display = 'block';
        }
      }
    }
  }

  const finish = (stats: FrameStats): void => {
    const pass = handle?.pass ? handle.pass(stats) : null;
    const extra = handle?.extra ? handle.extra() : {};
    const notes = handle?.notes ? handle.notes() : [];
    if (sampler.extendedMs >= 500) notes.push(`measured window extended by ${(sampler.extendedMs / 1000).toFixed(1)} s until the scenario finished`);
    if (handle?.busy?.()) notes.push('scenario still busy at the cap; the device is too slow for this variant');
    emitReport(buildReport(effective, device, stats, startedAt, pass, notes, extra));
  };

  window.addEventListener('error', (e) => emitError(e.message));
  window.addEventListener('unhandledrejection', (e) => emitError(String(e.reason)));

  new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    backgroundColor: '#192661',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [RigScene],
  });
}

// The guided tour: a few steps through the basic workflow, each pointing at the part of the screen it
// is about and opening the settings tab it needs. **? Tour** starts it, and it starts by itself on a
// first visit. docs/tutorial.md is the written version.
import type { Tab, Ui } from './ui';

interface Step {
  title: string;
  text: string;
  /** Before the step shows: a settings tab to open, or 'ride' for the ride with the settings closed. */
  view?: Tab | 'ride';
  /** What to point at; the card sits in the middle when there's nothing (or it isn't there). */
  target?: () => HTMLElement | null | undefined;
}

const SEEN_KEY = 'pov-wheel-sim.tour';
const TUTORIAL_URL = 'https://github.com/adamburr/pov-wheel-sim/blob/main/docs/tutorial.md';

const pane = (tab: Tab) => document.querySelector<HTMLElement>(`[data-pane="${tab}"]`);
/** A setting in a tab, by its label. */
const control = (tab: Tab, name: string) => [...(pane(tab)?.querySelectorAll<HTMLElement>('.lil-controller') ?? [])]
  .find((c) => c.querySelector('.lil-name')?.textContent === name);
/** A folder's title bar in a tab, by its title. */
const folder = (tab: Tab, title: string) => [...(pane(tab)?.querySelectorAll<HTMLElement>('.lil-title') ?? [])]
  .find((t) => t.textContent?.trim() === title);
/** An element that only has content once its view has loaded. */
const filled = (el: HTMLElement | null) => (el && el.childElementCount ? el : null);

const STEPS: Step[] = [
  {
    title: 'Welcome',
    text: 'This shows what a persistence-of-vision display on your bike wheel will look like before you build it, '
      + 'and designs the parts to build it with. It is pre-alpha: none of its designs has been built and tested yet, so '
      + 'check everything before you build. The tour takes a minute: leave it any time (Esc), and replay it from ? Tour.',
    view: 'ride',
  },
  {
    title: 'What people see',
    text: 'The big view is what the eye sees as the bike rides along. This strip watches the bike ride past like a phone '
      + 'camera at the roadside, at night.',
    view: 'ride',
    target: () => document.getElementById('strip-frame'),
  },
  {
    title: 'The wheel\'s buttons',
    text: 'Next ▶ is the wheel\'s preset button: the next look (or N). ☀ is its brightness button (or B); a double-click switches '
      + 'the wheel off and on. Then the speed. Auto rides stop-and-go and moves to the next look at each stop; untick it to '
      + 'ride steadily at the slider\'s speed.',
    view: 'ride',
    target: () => document.getElementById('ride'),
  },
  {
    title: 'Settings',
    text: 'Everything else is in Settings. The tour opens it for you.',
    view: 'ride',
    target: () => document.getElementById('panel-toggle'),
  },
  {
    title: 'Your build',
    text: 'Start with the hardware. Strips per side: 1 to 4 LED strips on each side of the wheel. More are brighter and '
      + 'steadier; fewer are lighter and cheaper.',
    view: 'hardware',
    target: () => control('hardware', 'Strips per side'),
  },
  {
    title: 'Your wheel',
    text: 'Pick your wheel\'s size here: it fills in typical values. To build, measure your wheel and type the numbers into '
      + 'Rim, Hub and Fork, because the panels are cut to fit them.',
    view: 'hardware',
    target: () => folder('hardware', 'Wheel'),
  },
  {
    title: 'The looks',
    text: 'The looks the wheel\'s button steps through. Click one to select it; ↑ / ↓ reorder them; ＋ New preset copies one.',
    view: 'presets',
    target: () => document.getElementById('preset-list'),
  },
  {
    title: 'Your own picture',
    text: 'What the selected look shows: a pattern, or Image / video. For your own picture, just drop or paste it anywhere on '
      + 'the page.',
    view: 'presets',
    target: () => control('presets', 'Show'),
  },
  {
    title: 'Eye or camera',
    text: 'Seen by: the human eye, or a camera. A camera with a 1/4 s shutter or longer shows the whole picture, as a photo '
      + 'would. Stats has the numbers behind it, with a warning for anything that won\'t work.',
    view: 'simulator',
    target: () => folder('simulator', 'Camera'),
  },
  {
    title: 'The panels',
    text: 'Two flat panels hold the strips, tied to the spokes; here they are, drawn for your wheel. Check the warnings, print '
      + 'the Reference DXF at 1:1 to lay on the wheel, then send the Cut file to a laser or knife cutter.',
    view: 'panels',
    target: () => filled(pane('panels')?.querySelector<HTMLElement>('.panels-actions') ?? null),
  },
  {
    title: 'The electronics',
    text: 'The circuit, the wiring, the hub module and the carrier board, drawn for your build, and the shopping list to '
      + 'download.',
    view: 'electronics',
    target: () => filled(pane('electronics')?.querySelector<HTMLElement>('.panels-actions') ?? null),
  },
  {
    title: 'Save it',
    text: 'Name your setup and Save it as a file, pictures and all; Open loads one. The browser also keeps it between visits, '
      + 'but keep the file.',
    view: 'presets',
    target: () => document.querySelector<HTMLElement>('#panel header'),
  },
  {
    title: 'That\'s it',
    text: 'The written tutorial goes through it all step by step.',
    view: 'ride',
  },
];

export interface Tour { start: () => void }

export function buildTour(ui: Ui): Tour {
  const ring = document.createElement('div');
  ring.className = 'tour-ring';
  const card = document.createElement('div');
  card.className = 'tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = `
    <div class="tour-count"></div><h2></h2><p></p>
    <div class="tour-buttons">
      <button type="button" data-act="close">Close</button>
      <span></span>
      <button type="button" data-act="back">Back</button>
      <button type="button" data-act="next" class="primary">Next</button>
    </div>`;
  document.body.append(ring, card);
  const q = <T extends HTMLElement>(s: string) => card.querySelector<T>(s)!;
  const back = q<HTMLButtonElement>('[data-act="back"]'), next = q<HTMLButtonElement>('[data-act="next"]');

  let at = -1, frame = 0, target: HTMLElement | null = null, waitUntil = 0;
  const open = () => at >= 0;

  function show(i: number) {
    at = i;
    const s = STEPS[i];
    if (s.view === 'ride') {
      ui.openTab('presets', false); // the ride in the main area, not a drawing
      if (document.body.classList.contains('panel-open')) document.getElementById('panel-close')?.click();
    } else if (s.view) ui.openTab(s.view);
    q('.tour-count').textContent = `${i + 1} of ${STEPS.length}`;
    q('h2').textContent = s.title;
    const p = q('p');
    p.textContent = s.text;
    if (i === STEPS.length - 1) {
      const a = document.createElement('a');
      a.href = TUTORIAL_URL;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Open the tutorial';
      p.append(' ', a);
    }
    back.disabled = i === 0;
    next.textContent = i === STEPS.length - 1 ? 'Done' : 'Next';
    target = null;
    waitUntil = performance.now() + 2500; // a tab's drawing may take a moment to load
    card.hidden = false;
    place(); // at once, not only on the next frame
    next.focus({ preventScroll: true });
  }

  function close() {
    if (!open()) return;
    at = -1;
    cancelAnimationFrame(frame);
    card.hidden = true;
    ring.hidden = true;
    ui.openTab('presets', false);
    if (document.body.classList.contains('panel-open')) document.getElementById('panel-close')?.click();
    try { localStorage.setItem(SEEN_KEY, 'seen'); } catch { /* blocked storage: it may show again next time */ }
  }

  /** Keep the ring on the target and the card beside it, as the panel slides and the page resizes. */
  function follow() {
    if (!open()) return;
    frame = requestAnimationFrame(follow);
    place();
  }

  /** Put the ring on the step's target and the card beside it (or in the middle). */
  function place() {
    const s = STEPS[at];
    if (!target || !target.isConnected) {
      target = s.target?.() ?? null;
      if (target) target.scrollIntoView({ block: 'nearest' });
    }
    const vw = innerWidth, vh = innerHeight, gap = 12, cw = card.offsetWidth, ch = card.offsetHeight;
    const r = target?.getBoundingClientRect();
    const visible = !!r && r.width > 0 && r.height > 0;
    ring.hidden = !visible;
    let x = (vw - cw) / 2, y = (vh - ch) / 2;
    if (visible) {
      Object.assign(ring.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
      // beside the target where the card fits: left of it (the settings panel), below, above, then right. Below
      // and above, the card slides along to stay on screen.
      const along = Math.min(Math.max(8, r.left + (r.width - cw) / 2), vw - cw - 8);
      const spots: [number, number][] = [[r.left - gap - cw, r.top], [along, r.bottom + gap], [along, r.top - gap - ch], [r.right + gap, r.top]];
      const fits = ([sx, sy]: [number, number]) => sx >= 8 && sy >= 8 && sx + cw <= vw - 8 && sy + ch <= vh - 8;
      // none fits (a target taller than the screen leaves): the end of the screen farther from the target's middle
      [x, y] = spots.find(fits) ?? [along, (r.top + r.bottom) / 2 > vh / 2 ? 8 : vh - ch - 8];
    } else if (s.target && performance.now() < waitUntil) {
      ring.hidden = true; // still loading: keep looking
    }
    card.style.left = `${Math.min(Math.max(8, x), vw - cw - 8)}px`;
    card.style.top = `${Math.min(Math.max(8, y), vh - ch - 8)}px`;
  }

  function start() {
    cancelAnimationFrame(frame);
    show(0);
    frame = requestAnimationFrame(follow);
  }

  next.onclick = () => (at < STEPS.length - 1 ? show(at + 1) : close());
  back.onclick = () => { if (at > 0) show(at - 1); };
  q<HTMLButtonElement>('[data-act="close"]').onclick = close;
  window.addEventListener('keydown', (e) => {
    if (!open() || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement).matches('input, textarea, select')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back.click(); }
  }, true);
  card.hidden = true;
  ring.hidden = true;
  return { start };
}

/** Whether this browser has seen (or closed) the tour. */
export function tourSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === 'seen'; } catch { return true; }
}

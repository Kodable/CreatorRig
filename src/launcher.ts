// The park map: Bruno's Theme Park home screen. Three big ride cards, one per
// activity in PARK_ACTIVITIES (src/activities/registry.ts). See
// src/activities/types.ts for ActivityDef.
import type { ActivityDef } from './activities/types';

/** Hero art composed from the real part/fuzz PNGs (see public/home/README via the
 * commit that added them) — one per ride, keyed by ActivityDef.id. Falls back to the
 * activity's emoji icon if a ride has no composed hero yet. */
const HERO_IMAGE: Record<string, string> = {
  coaster: '/home/coaster.png',
  catapult: '/home/catapult.png',
  vehicle: '/home/vehicle.png',
};

const TODAY = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

export function renderLauncher(root: HTMLElement, activities: ActivityDef[], onPick: (id: string) => void): void {
  root.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'launcher-page';

  const hero = document.createElement('div');
  hero.className = 'launcher-hero';

  const heading = document.createElement('h1');
  heading.className = 'launcher-heading';
  heading.textContent = "Bruno's Theme Park";
  hero.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'launcher-intro';
  intro.textContent = "Step right up! Pick a ride and help Bruno run the show.";
  hero.appendChild(intro);

  page.appendChild(hero);

  const row = document.createElement('div');
  row.className = 'ride-row';

  for (const activity of activities) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `ride-card ride-card--${activity.id}`;
    card.addEventListener('click', () => onPick(activity.id));

    const heroBox = document.createElement('div');
    heroBox.className = 'ride-hero';
    const heroSrc = HERO_IMAGE[activity.id];
    if (heroSrc) {
      const img = document.createElement('img');
      img.src = heroSrc;
      img.alt = '';
      img.className = 'ride-hero-img';
      heroBox.appendChild(img);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'ride-hero-fallback';
      fallback.textContent = activity.icon;
      heroBox.appendChild(fallback);
    }
    card.appendChild(heroBox);

    const body = document.createElement('div');
    body.className = 'ride-body';

    const title = document.createElement('div');
    title.className = 'ride-title';
    title.textContent = activity.title;
    body.appendChild(title);

    const bruno = document.createElement('div');
    bruno.className = 'ride-bruno';
    bruno.textContent = activity.bruno;
    body.appendChild(bruno);

    const play = document.createElement('div');
    play.className = 'ride-play';
    play.textContent = 'Play!';
    body.appendChild(play);

    card.appendChild(body);
    row.appendChild(card);
  }

  page.appendChild(row);

  const footer = document.createElement('div');
  footer.className = 'launcher-footer';
  footer.textContent = `Playtest build — Kodable · ${TODAY}`;
  page.appendChild(footer);

  root.appendChild(page);
}

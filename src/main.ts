// Router for Bruno's Theme Park: shows the park map (#launcher) or hands off
// to the activity named by the `activity` query parameter (#stage). No Phaser
// import here — each activity owns its own game instance.
import { PARK_ACTIVITIES, findActivity } from './activities/registry';
import { renderLauncher } from './launcher';
import type { ActivityHandle } from './activities/types';

const launcherEl = document.getElementById('launcher')!;
const stageEl = document.getElementById('stage')!;
const gameEl = document.getElementById('game')!;
const uiEl = document.getElementById('ui')!;

let current: ActivityHandle | undefined;

function route(): void {
  const params = new URLSearchParams(location.search);
  const activityId = params.get('activity');
  const def = activityId ? findActivity(activityId) : undefined;

  current?.destroy();
  current = undefined;

  if (def) {
    launcherEl.hidden = true;
    stageEl.hidden = false;
    current = def.start({
      game: gameEl,
      ui: uiEl,
      params,
      exit(): void {
        history.pushState(null, '', location.pathname);
        route();
      },
    });
  } else {
    stageEl.hidden = true;
    launcherEl.hidden = false;
    renderLauncher(launcherEl, PARK_ACTIVITIES, (id: string) => {
      history.pushState(null, '', '?activity=' + id);
      route();
    });
  }
}

window.addEventListener('popstate', route);

route();

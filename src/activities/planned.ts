// Renders the "under construction" placeholder page shared by every activity
// that isn't playable yet. See src/activities/types.ts for the frozen contract.
import type { ActivityDef, ActivityHandle, ActivityHost } from './types';

export function plannedActivity(meta: Omit<ActivityDef, 'start' | 'status'>): ActivityDef {
  return {
    ...meta,
    status: 'planned',
    start(host: ActivityHost): ActivityHandle {
      host.ui.innerHTML = '';
      // #ui is styled (in style.css, frozen) as a 1024x768 box scaled onto the
      // coaster canvas via an inline transform set by Hud. A prior coaster
      // session may have left that transform on host.ui; clear it so our
      // full-viewport placeholder page isn't confined to that stale box.
      host.ui.style.transform = 'none';
      host.ui.style.width = '100%';
      host.ui.style.height = '100%';

      const page = document.createElement('div');
      page.className = 'planned-page';

      const card = document.createElement('div');
      card.className = 'planned-card';

      const icon = document.createElement('div');
      icon.className = 'planned-icon';
      icon.textContent = meta.icon;
      card.appendChild(icon);

      const title = document.createElement('h1');
      title.className = 'planned-title';
      title.textContent = meta.title;
      card.appendChild(title);

      const badge = document.createElement('div');
      badge.className = 'planned-badge';
      badge.textContent = 'Under construction';
      card.appendChild(badge);

      const bruno = document.createElement('div');
      bruno.className = 'planned-bruno';
      bruno.textContent = meta.bruno;
      card.appendChild(bruno);

      const section = (label: string, text: string): HTMLElement => {
        const sec = document.createElement('div');
        sec.className = 'planned-section';
        const h = document.createElement('h2');
        h.className = 'planned-section-label';
        h.textContent = label;
        const p = document.createElement('p');
        p.className = 'planned-section-text';
        p.textContent = text;
        sec.append(h, p);
        return sec;
      };

      card.appendChild(section('What you build', meta.plan.objects));
      card.appendChild(section('What you do', meta.plan.child));
      card.appendChild(section('What Bruno measures', meta.plan.signals));
      if (meta.plan.open) card.appendChild(section('Open questions', meta.plan.open));

      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'planned-back';
      back.textContent = '← Back to the park';
      back.addEventListener('click', () => host.exit());
      card.appendChild(back);

      page.appendChild(card);
      host.ui.appendChild(page);

      return {
        destroy(): void {
          host.ui.style.transform = '';
          host.ui.style.width = '';
          host.ui.style.height = '';
          host.ui.innerHTML = '';
        },
      };
    },
  };
}

// FROZEN CONTRACT: owned by the orchestrator; agents do not modify it.
// One "activity" is one course of Bruno's theme park (the physics lane of the course matrix).
// Only the coaster is playable today; the other five are planned and show a placeholder page.

export type ActivityStatus = 'ready' | 'planned';

/** What the course matrix says the course needs. Shown on the placeholder page. */
export interface ActivityPlan {
  objects: string;   // what the child places or tunes
  child: string;     // what the child does in edit and in play
  signals: string;   // what a goal reads
  open?: string;     // open questions, if any
}

export interface ActivityHost {
  /** The Phaser mount (an empty div that fills the viewport). */
  game: HTMLElement;
  /** The HTML overlay mount (an empty div over the game). */
  ui: HTMLElement;
  /** Query parameters of the current URL (for example `level`). */
  params: URLSearchParams;
  /** Leave the activity and return to the park map. */
  exit(): void;
}

export interface ActivityHandle {
  /** Tears down everything the activity created: the Phaser game, DOM nodes, timers, listeners. */
  destroy(): void;
}

export interface ActivityDef {
  id: string;            // URL slug: coaster, goldberg, structures, catapult, vehicle, bridge
  title: string;         // "Fuzz Rollercoaster"
  icon: string;          // one emoji for the park map card
  bruno: string;         // Bruno's one-line pitch on the card
  status: ActivityStatus;
  plan: ActivityPlan;
  start(host: ActivityHost): ActivityHandle;
}

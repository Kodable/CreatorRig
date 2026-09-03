/**
 * The editor's state, owned by React: selection, per-object properties and the camera.
 * A tiny external store (useSyncExternalStore) so both React and the Phaser scene read one
 * source and every change is one notify.
 */
export interface ObjectProps {
  id: number;
  name: string;
  frame: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  depth: number;
  tintR: number;
  tintG: number;
  tintB: number;
  mass: number;
  friction: number;
  bounce: number;
  density: number;
  layer: number;
  tag: string;
  speed: number;
  hp: number;
  points: number;
}

/** The 20 inputs the properties panel binds, in panel order. */
export const PANEL_FIELDS: (keyof Omit<ObjectProps, 'id' | 'frame'>)[] = [
  'name', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'alpha', 'depth', 'tintR', 'tintG',
  'tintB', 'mass', 'friction', 'bounce', 'density', 'layer', 'tag', 'speed', 'hp', 'points',
];

export interface CameraState {
  zoom: number;
  scrollX: number;
  scrollY: number;
}

export interface EditorState {
  objects: ObjectProps[];
  selected: number | null;
  camera: CameraState;
  /** Bumped on every object change so the scene applies only what changed. */
  version: number;
  objectVersion: Record<number, number>;
}

type Listener = () => void;

export class EditorStore {
  private state: EditorState;
  private listeners = new Set<Listener>();
  /** Store notifications, a proxy for React re-render pressure. */
  notifies = 0;

  constructor(objects: ObjectProps[], camera: CameraState) {
    const objectVersion: Record<number, number> = {};
    for (const o of objects) objectVersion[o.id] = 0;
    this.state = { objects, selected: null, camera, version: 0, objectVersion };
  }

  getState = (): EditorState => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(next: Partial<EditorState>): void {
    this.state = { ...this.state, ...next, version: this.state.version + 1 };
    this.notifies++;
    for (const fn of this.listeners) fn();
  }

  select(id: number | null): void {
    if (id !== this.state.selected) this.set({ selected: id });
  }

  setProps(id: number, patch: Partial<ObjectProps>): void {
    const objects = this.state.objects.map((o) => (o.id === id ? { ...o, ...patch } : o));
    this.set({ objects, objectVersion: { ...this.state.objectVersion, [id]: (this.state.objectVersion[id] ?? 0) + 1 } });
  }

  setCamera(camera: Partial<CameraState>): void {
    this.set({ camera: { ...this.state.camera, ...camera } });
  }

  object(id: number): ObjectProps | undefined {
    return this.state.objects.find((o) => o.id === id);
  }
}

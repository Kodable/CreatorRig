import { memo, Profiler, useEffect, useMemo, useRef, useSyncExternalStore, type ReactElement } from 'react';
import { PANEL_FIELDS, type EditorStore, type ObjectProps } from './store';

/** World to CSS pixels inside the stage, supplied by the scene (camera and scale aware). */
export type Project = (x: number, y: number) => { x: number; y: number; scale: number };

export interface UiMetrics {
  commits: number;
  commitMs: number[];
}

interface AppProps {
  store: EditorStore;
  project: Project;
  metrics: UiMetrics;
  /** Selecting from the list also asks the scene to bring the object into view. */
  onReveal: (id: number) => void;
  /** Imperative gizmo: the scene moves the gizmo element itself during a drag. */
  gizmoRef: React.RefObject<HTMLDivElement | null>;
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

export function App(props: AppProps): ReactElement {
  const state = useSyncExternalStore(props.store.subscribe, props.store.getState);
  const selected = state.selected === null ? undefined : state.objects.find((o) => o.id === state.selected);
  return (
    <Profiler
      id="overlay"
      onRender={(_id, _phase, actualDuration) => {
        props.metrics.commits++;
        props.metrics.commitMs.push(actualDuration);
      }}
    >
      <Rail count={state.objects.length} selected={state.selected} zoom={state.camera.zoom} />
      <Gizmo selected={selected} project={props.project} gizmoRef={props.gizmoRef} />
      <Panel store={props.store} objects={state.objects} selected={selected} onReveal={props.onReveal} />
    </Profiler>
  );
}

const Rail = memo(function Rail({ count, selected, zoom }: { count: number; selected: number | null; zoom: number }): ReactElement {
  return (
    <nav className="ov-rail">
      {['Select', 'Move', 'Shapes', 'Code', 'Play'].map((t) => (
        <button key={t} type="button" className="ov-tool" title={t}>
          {t.slice(0, 2)}
        </button>
      ))}
      <div className="ov-rail-info">
        {count} objects
        <br />
        sel {selected ?? '-'}
        <br />
        {Math.round(zoom * 100)}%
      </div>
    </nav>
  );
});

function Gizmo({ selected, project, gizmoRef }: { selected: ObjectProps | undefined; project: Project; gizmoRef: React.RefObject<HTMLDivElement | null> }): ReactElement | null {
  if (!selected) return null;
  const p = project(selected.x, selected.y);
  // Sprites in the atlas are about 148 x 118 px; the box follows scale and rotation.
  const w = 148 * selected.scaleX * p.scale;
  const h = 118 * selected.scaleY * p.scale;
  return (
    <div
      ref={gizmoRef}
      className="ov-gizmo"
      data-object-id={selected.id}
      style={{ transform: `translate(${p.x - w / 2}px, ${p.y - h / 2}px) rotate(${selected.rotation}rad)`, width: w, height: h }}
    >
      {HANDLES.map((h) => (
        <div key={h} className={`ov-handle ov-handle-${h}`} data-handle={h} />
      ))}
      <div className="ov-handle ov-handle-rotate" data-handle="rotate" />
    </div>
  );
}

function Panel({ store, objects, selected, onReveal }: { store: EditorStore; objects: ObjectProps[]; selected: ObjectProps | undefined; onReveal: (id: number) => void }): ReactElement {
  const listRef = useRef<HTMLDivElement>(null);
  // Selecting from the canvas scrolls the list row into view, the mirror of "select from panel".
  useEffect(() => {
    if (!selected || !listRef.current) return;
    listRef.current.querySelector(`[data-object-id="${selected.id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected?.id]);
  // Row data changes identity only when a name changes, so the memoized list skips position updates.
  const namesKey = objects.map((o) => o.name).join('\u0000');
  const rows = useMemo<Row[]>(() => objects.map((o) => ({ id: o.id, name: o.name })), [namesKey]);
  return (
    <aside className="ov-panel">
      <h3>Properties</h3>
      {selected ? (
        <div className="ov-fields">
          {PANEL_FIELDS.map((field) => {
            const value = selected[field];
            const isText = typeof value === 'string';
            return (
              <label key={field}>
                <span>{field}</span>
                <input
                  name={field}
                  type={isText ? 'text' : 'number'}
                  step={isText ? undefined : 'any'}
                  value={isText ? value : Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
                  onChange={(e) => store.setProps(selected.id, { [field]: isText ? e.target.value : Number(e.target.value) } as Partial<ObjectProps>)}
                />
              </label>
            );
          })}
        </div>
      ) : (
        <p className="ov-muted">Tap an object. Drag to move; handles resize and rotate; wheel or pinch zooms; shift-drag or two fingers pan.</p>
      )}
      <h3>Objects</h3>
      <ObjectList listRef={listRef} rows={rows} selectedId={selected?.id ?? null} store={store} onReveal={onReveal} />
    </aside>
  );
}

interface Row {
  id: number;
  name: string;
}

/**
 * The 60-row list re-renders only when a name or the selection changes, not on every position
 * change of a dragged object. Without this, each pointer move re-rendered 60 buttons.
 */
const ObjectList = memo(function ObjectList({ listRef, rows, selectedId, store, onReveal }: { listRef: React.RefObject<HTMLDivElement | null>; rows: Row[]; selectedId: number | null; store: EditorStore; onReveal: (id: number) => void }): ReactElement {
  return (
    <div className="ov-list" ref={listRef}>
      {rows.map((o) => (
        <button
          key={o.id}
          type="button"
          data-object-id={o.id}
          className={o.id === selectedId ? 'ov-row ov-row-selected' : 'ov-row'}
          onClick={() => {
            store.select(o.id);
            onReveal(o.id);
          }}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
});

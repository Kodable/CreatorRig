// FROZEN CONTRACT: this file is a shared contract owned by the orchestrator; agents do not modify it.
export interface Vec2 { x: number; y: number }
export const DS = 0.1;                       // resample spacing, meters

/** A control point of the one track object. A 'loop' point is a fixed vertical loop piece
 * (radius LOOP_RADIUS in core/trackPoints.ts) whose bottom sits at the point. A locked point was
 * placed by the level: the child cannot move or delete it. */
export type PointKind = 'curve' | 'loop';
export interface TrackPoint { x: number; y: number; kind: PointKind; locked?: boolean }
/** A finish zone in world meters: the track's last point must lie inside the circle. */
export interface FinishZone { x: number; y: number; r: number }

export interface TrackSample { pos: Vec2; s: number; tangent: Vec2; kappa: number; dyds: number }
export interface LoopSpan { entryS: number; exitS: number }
export interface Track {
  readonly length: number;
  readonly samples: readonly TrackSample[]; // spaced DS apart, last sample at s = length
  readonly maxDrop: number;
  readonly loops: readonly LoopSpan[];
  lookup(s: number): TrackSample;           // clamps s to [0, length]
}

export type Outcome = 'running' | 'reachedEnd' | 'rolledBack' | 'stuck' | 'fell';
export interface CartSnapshot {
  s: number; v: number; pos: Vec2; theta: number; up: Vec2;   // up = seat normal, unit
  gNormal: number; airborne: boolean; time: number; sMax: number; outcome: Outcome;
}
export interface SimConstants { G: number; MU: number; DRAG: number; V0: number; STICK: number }   // STICK: seat g the fuzz can hold on to while inverted

export interface Metrics {
  maxDrop: number; maxSpeed: number; length: number; hangTime: number;
  loops: number; loopsCompleted: number; maxG: number; reachedEnd: number;   // reachedEnd is 0 or 1
  atFinish: number;   // 1 when the track's last point lies inside the level's finish zone, else 0 (0 when the level has no zone)
}
export type Metric = keyof Metrics;
export interface Goal { metric: Metric; op: '>=' | '<=' | '=='; value: number; label: string }
export interface GoalResult { goal: Goal; current: number; pass: boolean }
export interface Level {
  id: string; title: string; bruno: string; goals: Goal[]; preset?: TrackPoint[]; finish?: FinishZone;
  hints: { rolledBack: string; stuck: string; fell: string };
}

export type Mode = 'edit' | 'play' | 'done';
/** The editor tool: what a tap on the track or on empty space adds. */
export type EditTool = 'point' | 'loop';
export interface HudState {
  mode: Mode; level: Level; metrics: Metrics; tool: EditTool;
  live: { speed: number; g: number; airborne: boolean };
  goals: GoalResult[]; outcome: Outcome | null; passed: boolean; canPlay: boolean; canUndo: boolean;
}

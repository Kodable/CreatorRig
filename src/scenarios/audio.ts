import type Phaser from 'phaser';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import type { Scenario, ScenarioHandle } from './types';

/**
 * Audio: Web Audio unlock on mobile Safari. The context is created and resumed on the first tap
 * and a short beep plays on every tap. The rig resumes the context when the tab comes back to the
 * foreground and when Safari reports an interruption (a call, Siri, a timer), and plays again so
 * the human hears whether sound survived. Everything is logged on screen and in the report.
 *
 * Device finding: after an interruption iOS Safari reports the context `suspended` and then
 * `running` again, but the audio clock stays frozen and nothing plays. resume() does not help.
 * The rig detects the frozen clock (running, but currentTime did not advance during a beep),
 * closes the context and creates a new one on the next tap, and reports whether that recovered.
 */
const audio: Scenario = {
  id: 'audio',
  defaultCount: 0,
  create(scene: Phaser.Scene, _params: RigParams): ScenarioHandle {
    const lines: string[] = [];
    const text = scene.add.text(24, 24, '', { fontSize: '20px', color: '#ffffff', fontFamily: 'ui-monospace, Menlo, monospace', lineSpacing: 6 });
    scene.add.text(512, 700, 'Tap anywhere to play a beep. Then: switch apps and come back, start Siri or a timer, tap again.', { fontSize: '18px', color: '#ffb40f', align: 'center', wordWrap: { width: 900 } }).setOrigin(0.5);
    const log = (line: string): void => {
      lines.push(`${(performance.now() / 1000).toFixed(1)}s ${line}`);
      text.setText(lines.slice(-24).join('\n'));
    };

    let ctx: AudioContext | null = null;
    const state = {
      taps: 0,
      beeps: 0,
      firstTapPlayed: null as boolean | null,
      hidden: 0,
      resumed: 0,
      playedAfterResume: 0,
      interruptions: 0,
      playedAfterInterruptionWithResume: 0,
      frozenClockDetected: 0,
      recreations: 0,
      playedAfterRecreate: 0,
      lastState: 'none',
      sampleRate: 0,
    };
    let pendingInterruption = false;
    let hiddenNow = false;

    const createContext = (why: string): AudioContext => {
      const c = new AudioContext();
      state.sampleRate = c.sampleRate;
      c.addEventListener('statechange', () => {
        const s = String(c.state);
        state.lastState = s;
        log(`context state: ${s}`);
        // iOS reports an interruption as `interrupted` (newer) or as `suspended` while the tab is
        // visible (older). A suspension while hidden is the normal background behavior.
        if (s === 'interrupted' || (s === 'suspended' && !hiddenNow)) {
          state.interruptions++;
          pendingInterruption = true;
        }
      });
      log(`AudioContext ${why}, state ${c.state}, ${c.sampleRate} Hz`);
      return c;
    };

    const beep = async (why: string): Promise<boolean> => {
      if (!ctx) ctx = createContext('created');
      const c = ctx;
      try {
        if (c.state !== 'running') await c.resume();
      } catch (err) {
        log(`resume failed: ${String(err)}`);
      }
      const running = c.state === 'running';
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + 0.25);
      const ended = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 1500);
        osc.onended = () => {
          clearTimeout(timer);
          resolve(true);
        };
      });
      const clockMoved = c.currentTime > t0;
      const played = running && ended && clockMoved;
      if (played) state.beeps++;
      log(`${why}: ${played ? 'beep played' : 'NO sound'} (state ${c.state}, clock ${c.currentTime.toFixed(2)})`);
      if (running && !clockMoved) {
        // Frozen clock: the context claims to run but produces nothing. Recreate it.
        state.frozenClockDetected++;
        log('clock frozen while running: closing the context, a new one comes with the next beep');
        try {
          await c.close();
        } catch {
          // ignore
        }
        ctx = null;
        state.recreations++;
        const again = await beep(`${why}, recreated context`);
        if (again) state.playedAfterRecreate++;
        return again;
      }
      return played;
    };

    const onTap = (): void => {
      state.taps++;
      const first = state.taps === 1;
      const afterInterruption = pendingInterruption;
      const recreationsBefore = state.recreations;
      void beep(first ? 'first tap' : `tap ${state.taps}`).then((played) => {
        if (first) state.firstTapPlayed = played;
        if (afterInterruption) {
          pendingInterruption = false;
          if (played && state.recreations === recreationsBefore) state.playedAfterInterruptionWithResume++;
        }
      });
    };
    scene.input.on('pointerdown', onTap);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        hiddenNow = true;
        state.hidden++;
        log('tab hidden');
        return;
      }
      hiddenNow = false;
      state.resumed++;
      log('tab visible again');
      if (!ctx) return;
      void beep('after resume').then((played) => {
        if (played) state.playedAfterResume++;
      });
    });

    return {
      pass(_stats: FrameStats): boolean | null {
        if (state.taps === 0) return null;
        if (!state.firstTapPlayed) return false;
        if (state.resumed > 0 && state.playedAfterResume === 0) return false;
        // After an interruption, sound must come back, by resume or by recreating the context.
        if (state.interruptions > 0 && state.playedAfterInterruptionWithResume === 0 && state.playedAfterRecreate === 0) return false;
        if (state.frozenClockDetected > 0 && state.playedAfterRecreate === 0) return false;
        return true;
      },
      extra(): Record<string, unknown> {
        return { ...state, contextState: ctx?.state ?? 'none', log: lines };
      },
      notes(): string[] {
        if (state.taps === 0) return ['no tap during the window; tap the stage, background the tab and come back, trigger an interruption, tap again'];
        const notes: string[] = [];
        if (state.frozenClockDetected > 0) notes.push(`after an interruption the context reported running with a frozen clock ${state.frozenClockDetected} time(s); resume() did not bring sound back, recreating the context ${state.playedAfterRecreate > 0 ? 'did' : 'did NOT'}`);
        if (state.interruptions === 0) notes.push('no interruption seen; start Siri or a timer alarm while the page is open, dismiss it, then tap again');
        return notes;
      },
    };
  },
};

export default audio;

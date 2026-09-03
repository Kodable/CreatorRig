import type Phaser from 'phaser';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import type { Scenario, ScenarioHandle } from './types';

/**
 * Audio: Web Audio unlock on mobile Safari. The context is created and resumed on the first tap
 * and a short beep plays on every tap. The rig resumes the context when the tab comes back to the
 * foreground and when Safari reports an interruption (a call, Siri, a timer), and plays again so
 * the human hears whether sound survived. Everything is logged on screen and in the report.
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
    const state = { taps: 0, beeps: 0, firstTapPlayed: null as boolean | null, hidden: 0, resumed: 0, playedAfterResume: 0, interruptions: 0, playedAfterInterruption: 0, lastState: 'none', sampleRate: 0 };
    let pendingInterruption = false;

    const beep = async (why: string): Promise<boolean> => {
      if (!ctx) {
        ctx = new AudioContext();
        state.sampleRate = ctx.sampleRate;
        ctx.addEventListener('statechange', () => {
          const s = String(ctx?.state);
          state.lastState = s;
          log(`context state: ${s}`);
          if (s === 'interrupted') {
            state.interruptions++;
            pendingInterruption = true;
          }
        });
        log(`AudioContext created, state ${ctx.state}, ${ctx.sampleRate} Hz`);
      }
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
      const played = running && ended && c.currentTime > t0;
      if (played) state.beeps++;
      log(`${why}: ${played ? 'beep played' : 'NO sound'} (state ${c.state}, clock ${c.currentTime.toFixed(2)})`);
      return played;
    };

    const onTap = (): void => {
      state.taps++;
      const first = state.taps === 1;
      void beep(first ? 'first tap' : `tap ${state.taps}`).then((played) => {
        if (first) state.firstTapPlayed = played;
        if (pendingInterruption) {
          pendingInterruption = false;
          if (played) state.playedAfterInterruption++;
        }
      });
    };
    scene.input.on('pointerdown', onTap);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        state.hidden++;
        log('tab hidden');
        return;
      }
      state.resumed++;
      log('tab visible again');
      if (!ctx) return;
      void beep('after resume').then((played) => {
        if (played) state.playedAfterResume++;
        if (pendingInterruption) {
          pendingInterruption = false;
          if (played) state.playedAfterInterruption++;
        }
      });
    });

    return {
      pass(_stats: FrameStats): boolean | null {
        if (state.taps === 0) return null;
        if (!state.firstTapPlayed) return false;
        if (state.resumed > 0 && state.playedAfterResume === 0) return false;
        if (state.interruptions > 0 && state.playedAfterInterruption === 0) return false;
        return true;
      },
      extra(): Record<string, unknown> {
        return { ...state, contextState: ctx?.state ?? 'none', log: lines };
      },
      notes(): string[] {
        if (state.taps === 0) return ['no tap during the window; tap the stage, background the tab and come back, trigger an interruption, tap again'];
        return [];
      },
    };
  },
};

export default audio;

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
 * Device findings (iPad and iPhone, iOS 18.7): after a Siri or timer interruption the context
 * reports `suspended` then `running`, but the audio clock stays frozen and nothing plays; resume()
 * does not help, and a brand-new AudioContext comes up frozen too. The rig therefore tries, once
 * per tap, a ladder of known cures and reports which one brought sound back: (1) resume, (2) play
 * a silent HTMLAudioElement on the gesture to reactivate the iOS audio session, then resume,
 * (3) close and recreate the context. navigator.audioSession.type is set to "playback" where the
 * API exists.
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
      recoveries: [] as string[],
      recoveredByResume: 0,
      recoveredByMediaUnlock: 0,
      recoveredByRecreate: 0,
      recoveryFailed: 0,
      audioSessionApi: typeof (navigator as Navigator & { audioSession?: unknown }).audioSession !== 'undefined',
      lastState: 'none',
      sampleRate: 0,
    };
    let pendingInterruption = false;
    let hiddenNow = false;
    // Each tap starts a new run; an older ladder stops at its next step. Never block taps:
    // on iOS resume() on an interrupted context can hang forever.
    let run = 0;
    const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T | undefined> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const t = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          log(`${label} did not settle within ${ms} ms`);
          resolve(undefined);
        }, ms);
      });
      try {
        return await Promise.race([p, t]);
      } finally {
        clearTimeout(timer);
      }
    };
    const flash = (x: number, y: number): void => {
      const ring = scene.add.circle(x, y, 30).setStrokeStyle(4, 0xffb40f);
      scene.tweens.add({ targets: ring, scale: 2, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    };
    // A 0.1 s silent WAV; playing it on a gesture is the classic iOS audio-session unlock.
    const silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQQAAAAAAAA=');
    silent.setAttribute('playsinline', '');

    const createContext = (why: string): AudioContext => {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
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

    /** One 250 ms tone on the given context; true when the graph ran (ended fired and the clock advanced). */
    const tone = async (c: AudioContext): Promise<{ played: boolean; running: boolean; clockMoved: boolean }> => {
      try {
        if (c.state !== 'running') await withTimeout(c.resume(), 1500, 'resume()');
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
        const timer = setTimeout(() => resolve(false), 1200);
        osc.onended = () => {
          clearTimeout(timer);
          resolve(true);
        };
      });
      const clockMoved = c.currentTime > t0;
      return { played: running && ended && clockMoved, running, clockMoved };
    };

    const beep = async (why: string): Promise<boolean> => {
      const my = ++run;
      if (!ctx) ctx = createContext('created');
      let r = await tone(ctx);
      if (my !== run) return r.played;
      log(`${why}: ${r.played ? 'beep played' : 'NO sound'} (state ${ctx.state}, clock ${ctx.currentTime.toFixed(2)})`);
      if (r.played) {
        state.beeps++;
        return true;
      }
      if (!(r.running && !r.clockMoved)) return false;
      // Frozen clock while "running": the iOS interruption case. One ladder of cures per tap.
      state.frozenClockDetected++;
      // 1. resume again on this gesture
      r = await tone(ctx);
      if (my !== run) return r.played;
      if (r.played) {
        state.beeps++;
        state.recoveredByResume++;
        state.recoveries.push('resume');
        log('recovered by a second resume');
        return true;
      }
      // 2. silent media element on the gesture, then resume
      try {
        await withTimeout(silent.play(), 1500, 'silent <audio>.play()');
        log('silent <audio> played');
      } catch (err) {
        log(`silent <audio> failed: ${String(err)}`);
      }
      r = await tone(ctx);
      if (my !== run) return r.played;
      if (r.played) {
        state.beeps++;
        state.recoveredByMediaUnlock++;
        state.recoveries.push('mediaUnlock');
        log('recovered by the media-element unlock');
        return true;
      }
      // 3. close and recreate
      try {
        await withTimeout(ctx.close(), 1500, 'close()');
      } catch {
        // ignore
      }
      ctx = createContext('recreated');
      r = await tone(ctx);
      if (my !== run) return r.played;
      if (r.played) {
        state.beeps++;
        state.recoveredByRecreate++;
        state.recoveries.push('recreate');
        log('recovered by recreating the context');
        return true;
      }
      state.recoveryFailed++;
      state.recoveries.push('failed');
      log(`no cure worked on this tap (state ${ctx.state}, clock ${ctx.currentTime.toFixed(2)}); try again after switching apps and back`);
      showReloadButton();
      return false;
    };

    // The only cure seen on the iPad: a reload. This is the pattern a runtime would offer.
    let reloadButton: Phaser.GameObjects.Text | null = null;
    const showReloadButton = (): void => {
      if (reloadButton) return;
      reloadButton = scene.add
        .text(512, 620, 'Sound is stuck. Tap here to reload and fix it', { fontSize: '26px', color: '#1a2142', backgroundColor: '#ffb40f', padding: { x: 18, y: 12 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      reloadButton.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        window.location.reload();
      });
    };

    const onTap = (pointer: Phaser.Input.Pointer): void => {
      flash(pointer.x, pointer.y);
      state.taps++;
      const first = state.taps === 1;
      const afterInterruption = pendingInterruption;
      const frozenBefore = state.frozenClockDetected;
      void beep(first ? 'first tap' : `tap ${state.taps}`).then((played) => {
        if (first) state.firstTapPlayed = played;
        if (afterInterruption) {
          pendingInterruption = false;
          if (played && state.frozenClockDetected === frozenBefore) state.playedAfterInterruptionWithResume++;
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
        // After an interruption, sound must come back by some cure.
        const recovered = state.recoveredByResume + state.recoveredByMediaUnlock + state.recoveredByRecreate > 0;
        if (state.interruptions > 0 && state.playedAfterInterruptionWithResume === 0 && !recovered) return false;
        if (state.frozenClockDetected > 0 && !recovered) return false;
        return true;
      },
      extra(): Record<string, unknown> {
        return { ...state, contextState: ctx?.state ?? 'none', log: lines };
      },
      notes(): string[] {
        if (state.taps === 0) return ['no tap during the window; tap the stage, background the tab and come back, trigger an interruption, tap again'];
        const notes: string[] = [];
        if (state.frozenClockDetected > 0) notes.push(`frozen clock after an interruption ${state.frozenClockDetected} time(s); cures: ${state.recoveries.join(', ')}`);
        if (state.interruptions === 0) notes.push('no interruption seen; start Siri or a timer alarm while the page is open, dismiss it, then tap again');
        return notes;
      },
    };
  },
};

export default audio;

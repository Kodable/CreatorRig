import type Phaser from 'phaser';
import { Capacitor } from '@capacitor/core';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import type { Scenario, ScenarioHandle } from './types';

/**
 * Text input over the canvas inside the shell: a DOM input (never a Phaser DOM element) with
 * user-select text and a 16 px font so iOS does not zoom, the keyboard in resize mode "none" so
 * the web view and the canvas keep their size, a JS shift of the field by the keyboard height,
 * and dismissal on a tap outside the field (blur plus Keyboard.hide). The report says whether the
 * canvas kept its size, how far the field moved, and how many dismissals worked.
 */
const textinput: Scenario = {
  id: 'textinput',
  defaultCount: 0,
  async create(scene: Phaser.Scene, _params: RigParams): Promise<ScenarioHandle> {
    const stage = document.getElementById('stage') ?? document.body;
    const field = document.createElement('input');
    field.type = 'text';
    field.placeholder = 'Name your creation';
    field.className = 'ti-field';
    field.setAttribute('autocapitalize', 'words');
    field.setAttribute('autocomplete', 'off');
    stage.appendChild(field);
    const hint = scene.add.text(512, 120, 'Tap the field, type, then tap the canvas to dismiss the keyboard.', { fontSize: '20px', color: '#ffb40f', align: 'center', wordWrap: { width: 900 } }).setOrigin(0.5);
    const status = scene.add.text(40, 200, '', { fontSize: '22px', color: '#ffffff', fontFamily: 'ui-monospace, Menlo, monospace', lineSpacing: 8 });

    const canvas = scene.sys.game.canvas;
    const canvasSize0 = { w: canvas.clientWidth, h: canvas.clientHeight, inner: window.innerHeight };
    const state = { focus: 0, blur: 0, keyboardShows: 0, keyboardHeight: 0, shiftPx: 0, dismissals: 0, typed: 0, canvasResized: false, minInnerHeight: window.innerHeight, native: Capacitor.isNativePlatform(), keyboardPlugin: false };
    const fieldBottomGap = 24;
    const applyShift = (keyboardHeight: number): void => {
      // Keep the field above the keyboard: move it up by whatever the keyboard covers.
      const rect = field.getBoundingClientRect();
      const overlap = rect.bottom + fieldBottomGap - (window.innerHeight - keyboardHeight);
      state.shiftPx = overlap > 0 ? Math.ceil(overlap) : 0;
      field.style.transform = `translateY(${-state.shiftPx}px)`;
    };
    const render = (): void => {
      status.setText(Object.entries(state).map(([k, v]) => `${k}: ${String(v)}`).join('\n'));
    };

    field.addEventListener('focus', () => {
      state.focus++;
      render();
    });
    field.addEventListener('blur', () => {
      state.blur++;
      field.style.transform = '';
      render();
    });
    field.addEventListener('input', () => {
      state.typed = field.value.length;
      render();
    });

    if (state.native) {
      const { Keyboard } = await import('@capacitor/keyboard');
      state.keyboardPlugin = true;
      await Keyboard.addListener('keyboardWillShow', (info) => {
        state.keyboardShows++;
        state.keyboardHeight = info.keyboardHeight;
        applyShift(info.keyboardHeight);
        render();
      });
      await Keyboard.addListener('keyboardWillHide', () => {
        field.style.transform = '';
        state.shiftPx = 0;
        render();
      });
    } else if ('visualViewport' in window && window.visualViewport) {
      // Browser stand-in: the visual viewport shrinks by the keyboard height.
      window.visualViewport.addEventListener('resize', () => {
        const kb = Math.max(0, window.innerHeight - (window.visualViewport?.height ?? window.innerHeight));
        if (kb > 0) {
          state.keyboardShows++;
          state.keyboardHeight = kb;
          applyShift(kb);
        } else {
          field.style.transform = '';
          state.shiftPx = 0;
        }
        render();
      });
    }

    // Tap outside the field: blur and hide the keyboard.
    const outside = (e: PointerEvent): void => {
      if (e.target === field) return;
      if (document.activeElement === field) {
        field.blur();
        state.dismissals++;
        if (state.native) void import('@capacitor/keyboard').then(({ Keyboard }) => Keyboard.hide());
        render();
      }
    };
    stage.addEventListener('pointerdown', outside, true);

    render();
    void hint;
    return {
      update(): void {
        if (canvas.clientWidth !== canvasSize0.w || canvas.clientHeight !== canvasSize0.h) state.canvasResized = true;
        if (window.innerHeight < state.minInnerHeight) state.minInnerHeight = window.innerHeight;
      },
      pass(_stats: FrameStats): boolean | null {
        if (state.focus === 0) return null;
        return state.keyboardShows > 0 && !state.canvasResized && state.dismissals > 0 && state.shiftPx >= 0;
      },
      extra(): Record<string, unknown> {
        return { ...state, canvasCss: `${canvasSize0.w}x${canvasSize0.h}`, innerHeightAtStart: canvasSize0.inner };
      },
      notes(): string[] {
        if (state.focus === 0) return ['no focus during the window; tap the field, type, tap outside'];
        const notes: string[] = [];
        if (state.canvasResized) notes.push('the canvas changed size while the keyboard was up: the web view resized');
        if (state.keyboardShows === 0) notes.push('no keyboard height event arrived');
        return notes;
      },
    };
  },
};

export default textinput;

import type Phaser from 'phaser';
import type { RigParams } from '../params';
import type { FrameStats } from '../report';
import type { Scenario, ScenarioHandle } from './types';

const FONT = { family: 'Kodable', url: 'fonts/Kodable.ttf' };
const SAMPLE = 'Kodable Creator: Fuzz, Blue & Friends 0123456789';

/**
 * Fonts: one text object is created the moment the Kodable font is requested, before it has
 * loaded, and one after document.fonts.ready. If the first shows fallback glyphs and keeps them,
 * the runtime rule is "await fonts.ready before any text object". Widths tell the story: a text
 * measured with the fallback font differs from one measured with Kodable.
 */
const fonts: Scenario = {
  id: 'fonts',
  defaultCount: 0,
  async create(scene: Phaser.Scene, _params: RigParams): Promise<ScenarioHandle> {
    const t0 = performance.now();
    const face = new FontFace(FONT.family, `url(${FONT.url})`);
    document.fonts.add(face);
    const loading = face.load();
    const style = { fontFamily: `"${FONT.family}", sans-serif`, fontSize: '40px', color: '#ffffff' };

    // Before: created synchronously after the request, so the font cannot be ready yet.
    const before = scene.add.text(40, 120, SAMPLE, style);
    const widthBefore = before.width;
    const wasLoadedAtCreate = document.fonts.check(`40px "${FONT.family}"`);
    scene.add.text(40, 80, 'created before fonts.ready:', { fontSize: '16px', color: '#9aa1c0' });

    let loadError = '';
    try {
      await loading;
    } catch (err) {
      loadError = String(err);
    }
    await document.fonts.ready;
    const readyMs = Math.round(performance.now() - t0);

    const after = scene.add.text(40, 260, SAMPLE, style);
    scene.add.text(40, 220, 'created after fonts.ready:', { fontSize: '16px', color: '#9aa1c0' });
    const widthAfter = after.width;
    const widthBeforeStill = before.width;

    // Third: the first object re-rendered after the font arrived, the fix a runtime would apply.
    const redrawn = scene.add.text(40, 400, SAMPLE, style);
    scene.add.text(40, 360, 'first object after setText() with the font loaded:', { fontSize: '16px', color: '#9aa1c0' });
    before.setText(SAMPLE);
    const widthBeforeRedrawn = before.width;

    const fallbackBaked = Math.abs(widthBefore - widthAfter) > 0.5;
    const staysBaked = Math.abs(widthBeforeStill - widthAfter) > 0.5;
    scene.add.text(40, 520, fallbackBaked ? `First text baked FALLBACK glyphs (width ${Math.round(widthBefore)} vs ${Math.round(widthAfter)} px) and ${staysBaked ? 'kept them until setText()' : 'updated by itself'}.` : 'First text already had the Kodable font.', { fontSize: '18px', color: '#ffb40f', wordWrap: { width: 940 } });
    void redrawn;

    return {
      pass(_stats: FrameStats): boolean | null {
        return loadError === '';
      },
      extra(): Record<string, unknown> {
        return {
          font: FONT.family,
          fontLoadedAtCreate: wasLoadedAtCreate,
          fontsReadyMs: readyMs,
          widthBefore: Math.round(widthBefore * 10) / 10,
          widthAfter: Math.round(widthAfter * 10) / 10,
          widthBeforeAfterReady: Math.round(widthBeforeStill * 10) / 10,
          widthBeforeAfterSetText: Math.round(widthBeforeRedrawn * 10) / 10,
          fallbackBaked,
          staysBakedUntilSetText: staysBaked,
          ruleNeeded: fallbackBaked && staysBaked,
          loadError: loadError || null,
        };
      },
      notes(): string[] {
        if (loadError) return [`font failed to load: ${loadError}`];
        return fallbackBaked && staysBaked ? ['runtime rule confirmed: await document.fonts.ready before creating any text object, or call setText after the font loads'] : [];
      },
    };
  },
};

export default fonts;

// Bruno's hard hat (2026-10-12, Gao: "he's supposed to have a hard hat"). The Spine rig
// (public/spine/Engineer_skeleton.json) keeps the hat in its own skin, 'hardhat default'
// (slot engineer-eng_hat on bone engineer/eng_hat); the 'default' skin has everything else. A
// skeleton shows only its default skin unless told otherwise, so both scenes that draw Bruno
// (src/kit/BuilderScene.ts, src/game/CoasterScene.ts) combine the two here.
import { Skin, type SpineGameObject } from '@esotericsoftware/spine-phaser-v4';

/** The skins Bruno wears, in order. The hat skin's name has a space in it. */
export const BRUNO_SKINS = ['default', 'hardhat default'] as const;

/** Puts Bruno's hard hat on. A skin missing from the rig is skipped (no hat beats no Bruno). */
export function wearBrunoSkins(bruno: SpineGameObject): void {
  const data = bruno.skeleton.data;
  const skin = new Skin('bruno');
  for (const name of BRUNO_SKINS) {
    const part = data.findSkin(name);
    if (part) skin.addSkin(part);
    else console.warn(`Bruno: Spine skin '${name}' not found`);
  }
  bruno.skeleton.setSkin(skin);
  bruno.skeleton.setSlotsToSetupPose();
}

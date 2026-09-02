/**
 * Every audio content asset in the game, in one place — the audio
 * counterpart of `content/enemies/index.ts`. `app/audio/` builds its players
 * from these lists; `tests/content/audio.test.ts` validates them.
 */
export {
  INSTRUMENT_DEFINITIONS,
  accordion,
  tuba,
  brassStab,
  clarinet,
  bell,
} from './instruments.js';
export { SFX_DEFINITIONS, ENEMY_SFX_CATEGORY, type EnemySfxCategory } from './sfx.js';
export { BARK_DEFINITIONS, sauber, gehWeida, passtScho } from './barks.js';
export { PROMILLE_AUDIO_TIERS } from './promille-audio.js';
export {
  TRACK_DEFINITIONS,
  floor1DerKeller,
  floor2DorfUndAcker,
  bossKellerassel,
  bossDerStier,
  titleTheme,
  hubTheme,
  victoryTheme,
} from './tracks.js';

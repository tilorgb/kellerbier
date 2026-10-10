import type { SfxDefinition } from '../app/audio/types.js';

/**
 * What the sound bench is asked for when a cue is selected in the SFX editor:
 * "the source, the action and how it is recorded" (the generator's own hint),
 * written as the prompt itself so it can be run as it stands or tweaked.
 *
 * `IDEAS` holds the authored picture of how each shipped cue should sound —
 * acoustic words, not the game-design description (`SfxDefinition.description`
 * says *when* a cue plays, the bench needs *what it sounds like*). A cue with
 * no entry — a new id, or a family member added later — falls back to
 * `derivedIdea`, which reads the same picture off the definition's own synth
 * parameters, so the box is never empty and never a bare id.
 */

const ONE_SHOT = 'single sound, close microphone, dry, no music, no reverb';

const IDEAS: Readonly<Record<string, string>> = {
  'hit-squelch': 'soft wet thud of a fist hitting a ripe fruit, short squelch, single impact',
  'hit-metal': 'sharp metallic clang of a wrench hitting an empty steel barrel, short ring-out',
  'hit-animal': 'dull thump on a hide with a short startled animal grunt, single impact',
  'hit-folk': 'quick smack of a wooden spoon on a padded jacket with a short brassy blip',
  'hit-oompah': 'muffled thump on a tuba bell with a short brass honk, single impact',
  'death-squelch': 'big wet splat and a slow soft deflating squelch, single event',
  'death-metal': 'metal barrel collapsing, a heavy crunch then rattling pieces settling',
  'death-animal': 'low drawn-out animal groan trailing off, then a heavy body thump on straw',
  'death-folk': 'short surprised grunt, a clatter of wooden tools dropped on a stone floor',
  'death-oompah': 'a brass band note sliding down and out of tune, ending with a bass drum thud',
  'player-shot-rolling-r':
    'a quick rolled letter R, a tongue trill rrrr on the roof of the mouth, short and voiced',
  'player-shot': 'short soft pop of a beer tap spurting a quick jet of liquid, light and snappy',
  'shot-squelch': 'wet blorp of a bubble bursting, slimy spit, short',
  'shot-metal': 'metallic thunk and hiss of a pressure valve launching a small canister',
  'shot-animal': 'short animal squawk with a sharp spitting burst',
  'shot-folk': 'snappy wooden twang of a slingshot release',
  'shot-oompah': 'short brass toot with a popping burst of air',
  'windup-laser-charge':
    'rising electrical whine of a laser charging, crackling sparks and a corroded buzz building to a peak, no impact',
  'shot-laser': 'short dry buzzing zap of a small laser, a crackling stutter, sharp and thin',
  'shot-laser-big':
    'heavy corroded roar of a big laser firing, a rattling crackle with a deep burning growl underneath',
  'attack-windup': 'tense short rising whoosh of air being drawn in, building quickly, no impact',
  'windup-waldradler-bell': 'two bright dings of a bicycle bell, ring ring, short and cheerful',
  'room-clear': 'bright short reward chime of two clinking beer glasses, a sparkling finish',
  'low-health': 'two dull heartbeat thumps, low and muffled, with a faint warning tone',
  'enemy-split': 'wet tearing crack and several small pieces scattering across a floor',
  'player-hit': 'dull punchy thud of a body taking a blow, short breath of air knocked out',
  'player-death': 'long sad deflating sigh, a glass tipping over and rolling to a stop',
  'wall-hit': 'tiny dry tick of a small projectile hitting a stone wall, very short',
  'pickup-generic': 'short bright pickup blip, a small glass clink with a rising shimmer',
  'pickup-pedestal': 'magical reveal, soft rising shimmer ending in a clear bell strike',
  'shop-purchase': 'coins dropped into a metal till with a ring of a cash drawer bell',
  'door-open': 'heavy wooden cellar door swinging open, creaking hinge and a latch click',
  'door-locked': 'rattle of a locked wooden door handle and a dull knock, no creak',
  'secret-reveal':
    'stone wall grinding aside with falling dust and a low rumble, then a hollow echo',
  'floor-card-whoosh': 'broad smooth whoosh of a banner sweeping past, airy, medium length',
  footstep: 'single footstep of a boot on a damp cellar stone floor, dull and close',
  'footstep-wade': 'single boot step into shallow water, a quick splash with trickling drops',
  'ui-open': 'soft light interface open, a gentle wooden tap with a quick rising air swish',
  'ui-close': 'soft light interface close, a gentle wooden tap with a quick falling air swish',
  'ui-confirm': 'crisp short positive click, two quick bright wood-block taps',
  'ui-cancel': 'short low dull click, a single soft descending wooden tap',
  'ui-unlock-fanfare': 'short bright triumphant brass fanfare with a glass clink, cheerful',
  'item-sneeze-inhale':
    'thin rising sharp sniff, a held breath drawn through the nose, no sneeze yet',
  'item-sneeze': 'one big explosive sneeze, wet and loud, a sudden burst of air',
  'item-poison-cleanse':
    'short clean rising chime over a soft fizz, like a tablet dissolving in water',
  'item-zecke-latch': 'small wet click of a tick biting skin with a low sour hum',
  'windup-specht-drum': 'woodpecker drumming on a dry tree trunk, fast woody rattle, trrrrr',
  'item-zecke-shake-off': 'quick flick of dry air with a bright falling-away ping',
  'item-explosion':
    'deep cellar blast, a dull thump with rumbling debris and a short low brass boom',
};

export function suggestSfxPrompt(def: SfxDefinition): string {
  const idea = IDEAS[def.id] ?? derivedIdea(def);
  return `${idea}, ${ONE_SHOT}`;
}

/** An idea read off the definition itself, for a cue `IDEAS` does not know yet. */
function derivedIdea(def: SfxDefinition): string {
  const parts: string[] = [];
  const subject = plainDescription(def.description);
  parts.push(subject.length > 0 ? subject : def.id.replace(/-/g, ' '));

  const noise = def.noise;
  if (noise !== undefined) {
    parts.push(noiseCharacter(noise.filter));
    parts.push(noise.durationSeconds <= 0.12 ? 'very short' : 'short');
  }
  const tone = def.tone;
  if (tone !== undefined) {
    parts.push(`with a ${tone.instrument.replace(/-/g, ' ')} note around ${tone.note}`);
  }
  if (def.repeat !== undefined && def.repeat.count > 1) {
    parts.push(`${String(def.repeat.count)} rapid repeats`);
  }
  return parts.join(', ');
}

function noiseCharacter(filter: NonNullable<SfxDefinition['noise']>['filter']): string {
  if (filter === undefined) {
    return 'broadband burst of noise';
  }
  if (filter.type === 'lowpass') {
    return filter.frequencyHz <= 600 ? 'low dull thud' : 'muffled soft impact';
  }
  if (filter.type === 'highpass') {
    return 'bright airy hiss';
  }
  return filter.frequencyHz >= 2000 ? 'sharp ringing tap' : 'woody mid-range knock';
}

/** A design description reads as a sentence about the game; keep its first clause and drop issue refs and code ticks. */
function plainDescription(text: string): string {
  const firstSentence = text.split(/[.:—]/)[0] ?? text;
  return firstSentence
    .replace(/\(#\d+(?:\/#\d+)*\)/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

# Recorded audio assets

Real recordings — a DAW export of the main theme, a mic'd sound effect, a real spoken voice
line — dropped in here by the audio editor's "Recorded sample" panel (`music`, `sfx`, and
`barks` tabs alike). Everything else in the game's audio (`src/content/audio/*`) is
synthesised live from Web Audio oscillators and filtered noise, with no binary asset at all —
this folder is the one place that changes.

## Where these came from

**Every file in this folder that is not listed under "Generated files" below was recorded by the
project owner personally** — the theme (`01-consolidated.mp3`) and all nine sound effects (stated
2026-10-02, `docs/LEGAL_REVIEW.md` Finding 3). None of those is from a sample library or anyone
else's work, so there is no licence to honour and no credit owed.

Keep it that way, or write it down: a file added here that somebody else made needs its source
and its licence recorded in this section in the same change.

## Generated files

A sound effect can also be made from a text prompt: the audio editor's "Recorded sample" panel has
a Generate control on the `sfx` tab, which asks the local sound bench (Stable Audio Open 1.0, run
through ComfyUI on the machine that has the GPU) for a few takes. The model is under the Stability
AI Community License. A generated file is not a recording, and the storefront's generative-AI
disclosure has to cover it, so each one is listed here.

Nobody has to remember to: choosing a take writes its row in the same request that writes the file
(`tools/audio-editor/sound-bench.mjs`), with the prompt and seed that would make it again. A real
recording uploaded over one of these names takes its row back out.

| File | Prompt | Seed | Added |
|---|---|---|---|
| `item-poison-cleanse.mp3` | short clean rising chime over a soft fizz, like a tablet dissolving in water, single sound, close microphone, dry, no music, no reverb | 815596472, take 1 of 4 | 2026-10-07 |
| `death-animal.mp3` | low drawn-out animal groan trailing off, then a heavy body thump on straw, single sound, close microphone, dry, no music, no reverb | 2012419546, take 3 of 4 | 2026-10-07 |

## What goes here, and how it gets here

Upload a file through the audio editor (`npm run dev`, then `/audio-editor.html`) rather than
copying one in by hand: the upload endpoint (`tools/audio-editor/server.mjs`, dev-only)
slugifies the file name into an asset id and writes it here, and the same panel is what wires
that id into a track/SFX/bark's `sample` field in `src/content/audio/*.ts`. A file with no
content pointing at it is dead weight — the same "a sprite nobody looks up costs an atlas
entry" concern `assets/sprites/README.md` raises, just for a much heavier asset.

## Format

Whatever `AudioContext.decodeAudioData` accepts — in practice **WAV, MP3, or OGG/Vorbis**.
WAV (uncompressed) is the natural export target for the fidelity a crop/fade/filter edit wants
to work from; MP3/OGG both decode fine too. There is no separate "shipping" transcode step yet
— a file lands in the built game exactly as uploaded, so a very large export (a several-minute
uncompressed stem) is a bundle-size cost, not just a repo one. Keep an upload to what it's
actually for: a floor theme loop, a one-shot SFX, a short voice line — none of which need to be
long or full-band-mix heavy.

## How it's played

`app/audio/sample-player.ts` decodes a file once per browser session and caches the result; a
`SampleEdit` (trim start/end, fade in/out, gain, an optional lowpass/bandpass/highpass filter —
the same `InstrumentFilter` shape a synthesised instrument's own filter uses) is applied live at
playback time, non-destructively. The uploaded file is never modified by an edit — re-cropping
or nudging a fade is just a different `SampleEdit` against the same asset.

## Asset id

A file's name here, without its extension, is its `assetId` — `main-theme.wav` is referenced
as `'main-theme'`. Two files that would collide on that id (`take.wav` and `take.mp3`) aren't
supported; the upload endpoint refuses the second.

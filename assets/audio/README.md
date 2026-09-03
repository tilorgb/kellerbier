# Recorded audio assets

Real recordings — a DAW export of the main theme, a mic'd sound effect, a real spoken voice
line — dropped in here by the audio editor's "Recorded sample" panel (`music`, `sfx`, and
`barks` tabs alike). Everything else in the game's audio (`src/content/audio/*`) is
synthesised live from Web Audio oscillators and filtered noise, with no binary asset at all —
this folder is the one place that changes.

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

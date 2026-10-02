# Putting a build on itch.io

How the tester build gets onto an itch.io page (#365). The page's own content — description,
screenshots, what it says about the alpha — is #367.

## Make the zip

```bash
npm run build:itch
```

That builds the tester build (`dist-tester/`, the release-mode game with the playtest welcome
screen and questions) and packs it into `dist-itch/kellerbier-<commit>.zip`, with `index.html` at
the root of the archive and `THIRD-PARTY-NOTICES.txt` beside it. The script refuses to write a zip itch.io would reject: more than 1,000
files, more than 500 MB extracted, a single file over 200 MB, or a path over 240 characters.

The commit in the file name is the same id every telemetry run from that build carries (#361), so
an upload can be matched to its rows in the report.

## Page settings

On the project's edit page:

- **Kind of project:** HTML
- Upload the zip and tick **This file will be played in the browser**
- **Embed options:** *Embed in page*, viewport **1280 × 720** — the game renders 640 × 360 and
  scales by whole factors, so this is exactly 2×
- **Fullscreen button:** on
- **Mobile friendly:** leave off until the touch controls have been tried on a real phone (#367)
- **Visibility:** *Draft* for the checklist below, then *Restricted* or unlisted for the alpha

## Check it in the embed

An itch.io page runs the game in an iframe on another origin, which a GitHub Pages link does not.
None of this has been checked yet — do it once on the draft page and tick it off in #365:

- [ ] The loading bar finishes and the title screen appears
- [ ] Keys work after the first click, and arrow keys / Space do not scroll the page behind
- [ ] The playtest welcome screen appears, and typing in the question box does not move Alois
- [ ] A finished run arrives: it shows up in `npm run telemetry:report` with this build's commit
- [ ] Reloading the page keeps the save (settings, progress, the welcome not asked again)
- [ ] Settings → fullscreen works, and so does itch.io's own fullscreen button
- [ ] `C` copies the run details (the embed may block the clipboard — note it if so)
- [ ] A gamepad is picked up
- [ ] Music and sound start after the first click

Anything that fails is either fixed or filed as its own issue.

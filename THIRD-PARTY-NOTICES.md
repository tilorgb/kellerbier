# Third-party notices

What Kellerbier ships that somebody else made, and the terms it is used under. `npm run
build:itch` puts this file in the upload, because the notices have to travel with the game.

**Incomplete.** [`docs/LEGAL_REVIEW.md`](docs/LEGAL_REVIEW.md) Findings 3 and 4 are still open:
the recorded audio's origin, and the licences of the image model and LoRA behind the four
illustrations. Their entries belong here once they are known.

---

## three.js

The renderer. https://threejs.org

```
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Made in this repository

Nothing below is third-party; it is listed so nobody goes looking for a licence that does not
exist.

- **Fonts** — both faces are authored as source in `src/render/ui/`.
- **Sprites and UI art** — authored in `tools/art/authoring/` and `src/render/ui/`.
- **Synthesised music and sound** — `src/content/audio/`, generated at run time.

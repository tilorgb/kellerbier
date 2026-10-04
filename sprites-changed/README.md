# sprites-changed

Drop new versions of existing sprites here, then run:

```
npm run sprites:replace            # replace them
npm run sprites:replace -- --dry-run   # only show what would happen
```

- Name the file like the sprite it replaces: `kuh.png`, or `kuh@2x.png` for a
  higher-resolution version (see `assets/sprites/README.md`).
- Animations: `name.strip.png`, optionally with a new `name.anim.json`. Without
  one, the old sidecar is kept.
- If a name exists in more than one floor (today only `spore`), put the file in
  a subfolder named after the floor, e.g. `floor-2-rural/spore.png`.
- The old files move to `sprites-archive/<date-time>/`, with a `REPLACED.txt`
  listing what was swapped.
- Nothing is replaced if any new file breaks the art pipeline (palette, size,
  sidecar) — fix it and run again.

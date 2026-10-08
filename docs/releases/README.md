# Release notes

One file per itch.io build, named `YYYY-MM-DD.md`, newest last. Each is written for a **player**,
not a maintainer, and is posted as the page's devlog entry for that build.

## Cutting a release

1. `npm run release:notes -- --write` creates `docs/releases/<today>.md`, with the commit
   range since the previous file's `Build:` line listed as comments.
2. Rewrite it: a one-line headline, then **New**, **Changed**, **Fixed**, **Known**. Delete
   the comment block and any empty section.
3. `npm run build:itch`, and put the zip's commit id (`kellerbier-<id>.zip`) on the `Build:`
   line, so the next release starts its range from there.
4. Upload the zip (`tools/release/ITCH.md`) and run the embed checklist.
5. `npm run release:post` prints the post title and copies the body to the clipboard, ready for the devlog editor (as HTML, because itch.io's Markdown mode renders the notes badly; it drops the `Build:` line, comments and empty sections). Paste it into **Create new post**, put the title in the title field and publish.
6. Commit the file. Nothing else in the repo needs to change.

## Rules

- **No main-boss spoilers**: no boss names, mechanics or screenshots for the main boss of any
  floor; mini-bosses are fine (`docs/ITCH_PAGE.md`). Say "a new boss" and stop.
- **Names are the user's.** Use item, enemy and floor names exactly as the PR titles and
  `docs/CONTENT_BIBLE.md` have them; never coin or "correct" one (`CLAUDE.md`).
- Say when text is a draft or not native-reviewed, rather than leaving it to be found.

## Where it goes on itch.io

- **Devlog:** dashboard → the project → **Devlog** → **Create new post**. Paste the notes, set
  the title to the headline, and publish. itch.io shows it on the page and notifies followers.
- **Page description:** update only the **In this build** block (`docs/ITCH_PAGE.md`) with
  the two or three biggest points. The full notes live in the devlog.

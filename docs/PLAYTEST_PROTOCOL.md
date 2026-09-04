# Kellerbier — Playtest Protocol

A structured playtest is a loop, not an event (#159). This is what makes two different people
running a session produce notes that can actually be compared, and what #54's balance pass —
telemetry, the balance simulator, the targeted tuning — depends on having run at least once
before it starts.

---

## 1. The build

Every pull request already gets a playable preview link, per `CONTRIBUTING.md` — that is for
reviewing *that change*, and is not what a playtest session hands a tester. For a session, use
the **current build**:

> `https://<owner>.github.io/<repo>/`

This is what `main` publishes on every merge (`.github/workflows/ci.yml`'s `preview` job, target
`.` rather than `pr/<number>`) — a single stable link that is always today's game, needing no
setup, no build step and no account. Handing someone this link is the whole "distributable
build" acceptance criterion: **someone who is not on the project can be playing within five
minutes of being asked**, because there is nothing between the link and the game.

If a specific unreleased change needs a playtest before it merges (a big enough feel or balance
change that waiting for the next session is worse than a one-off), use that PR's own preview
link instead and say so in the session notes — the findings below still apply, they are just
scoped to a change rather than the shipped build.

## 2. The session identifier

Settings → Privacy has an opt-in telemetry toggle (#54). Turning it on mints a random,
anonymous session id and shows it on that same screen — nothing else on the id is ever
requested (no name, no contact info). Ask the tester, once, near the start of the session:

> "Would you turn on 'Share anonymous playtest telemetry' in Settings, and read me the code
> next to it?"

Write that code down against this session's notes. It is what lets a later balance pass join
this session's *qualitative* notes ("died on the third room of floor 2, didn't understand why")
to the *quantitative* telemetry that run produced, once the tester exports it
(`app/telemetry/file.ts`'s download, from the same tab) and hands the file over. Telemetry stays
opt-in — a tester who would rather not is still a full session, just without that join.

## 3. What the tester is told

As little as possible. The point of a playtest is watching what someone does with *no* framing,
because the framing is exactly what will not be there for a stranger on itch.io (M9). Say:

> "This is a small game, still in progress. Play it however you'd normally play something like
> it. I'm going to watch and take notes, not help — if you get stuck, that's useful information,
> not a problem to fix on the spot. Say what you're thinking as you go, if that's comfortable,
> but don't perform for me — I'd rather see what you'd actually do alone."

Do not explain controls, the Promille meter, what an item does, or that there is a boss. All of
that is what the tutorial floor (#35) is supposed to teach on its own — a session where the
observer explains it first is a session that can never tell you whether floor 1 actually
teaches it.

**The one exception:** a hard technical blocker (the page fails to load, a keybinding conflicts
with the tester's own OS shortcut). Unblock the technical problem, not the game.

## 4. What is observed

The feedback form (§5) captures what the tester says afterwards. This is what a form never
surfaces — the observer's own notes, taken live:

- **Where they got stuck.** Not "died," but genuinely stuck: standing in a room unsure what to
  do next, walking past a door repeatedly, not realising a locked door needs a key.
- **What they never noticed.** The minimap. The Promille meter. An item's pickup text. A HUD
  element that changed and they didn't react to it.
- **Which enemy killed them, and whether they understood why.** "Killed by the Böllerschmeißer,
  saw the telegraph and dodged too late" is a different finding from "killed by the
  Böllerschmeißer, didn't know they'd been hit until the game-over screen."
- **Whether they read the Promille meter at all**, once it's unlocked/visible in the session —
  glanced at it, ignored it, or never looked at the HUD in that area of the screen at all.
- **Anything treated as scenery that was not.** The concrete recurring case this protocol exists
  to catch: an interactive prop (the Maibaum, a pedestal, a locked door) walked straight past
  because nothing about it read as "this does something."
- **The moment they did something nobody on the project had considered.** This is the single
  most valuable thing a session produces — write it down even (especially) if it seems like a
  mistake on the tester's part. A mistake many different testers make in the same place is not a
  tester problem.

### First-session friction (floor 1 specifically)

Floor 1 is the tutorial (#35), and a tester's *first* session on it is the only chance anyone
gets to see whether it actually teaches — every session after that, for that person, is playing
a floor they already understand. Weight the observation checklist above extra heavily for
anyone's first fifteen minutes:

- Did they find fire/aim/move on their own, or hesitate at the very first enemy?
- Did the first item pickup register as "I should walk into that," or did they need to be
  standing on it a while first?
- Did they reach the boss room understanding roughly what killed them on the way, floor to
  floor?

## 5. What is deliberately not asked

Do not ask "did you like it," "was that fun," or anything else that invites a polite answer
instead of a factual one. Do not ask leading questions about a specific mechanic the observer is
personally worried about ("did the Promille meter feel confusing?") — that plants the framing
the whole session was trying to avoid. Ask what they *did*, not what they would like:

> "What were you trying to do when you died there?" beats "was that fight too hard?"

## 6. The feedback form

Short enough that people finish it — five questions, free text, no scales:

1. In your own words, what is this game?
2. What's one thing that killed you or slowed you down that you didn't understand at the time?
3. What's one thing you picked up or found that you didn't understand?
4. Was there a moment you wanted to do something the game wouldn't let you? What was it?
5. Would you play another run right now? Why or why not?

Given verbally or on paper, whichever is less friction for the session. Attach the answers to
the session's notes alongside the observation checklist and the telemetry session id.

## 7. Cadence

- **Regular sessions**, roughly every two weeks during active M6–M8 work — often enough that a
  change lands, gets watched, and the next change can respond, rarely enough that it does not
  become a tax on shipping.
- **Unscheduled sessions**, triggered by:
  - A feel- or balance-significant change landing (a new floor-2 threat pass, a Promille tuning
    change, a new boss) — one session before the next regular one, rather than waiting.
  - #54's balance pass itself needing fresh eyes on a specific tuning change.
  - Three or more findings on the same room/mechanic piling up unreviewed (§8) — that is a
    backlog, not a coincidence, and is worth a dedicated session rather than waiting for the
    pile to explain itself.
- **At least one full round**, run and its findings triaged into issues, is a hard prerequisite
  for #54's targeted balance work starting for real — not a nice-to-have. `docs/BALANCE_METHODOLOGY.md`
  says what "for real" means once that round exists.

A round is 3-5 sessions with different people. Fewer than that and "two different people's notes
can be compared" (this protocol's own acceptance criterion) has nothing to compare against.

## 8. Where findings live

Every session's notes (observations, the feedback form's answers, the telemetry session id if
one was granted) get written up and triaged into GitHub issues **the same week**, using the
[Playtest finding](../.github/ISSUE_TEMPLATE/playtest-finding.yml) issue template — one issue
per distinct finding, not one issue per session. A session that never gets triaged is a session
that did not happen, as far as the rest of the project can tell; the template exists so triage is
filling in a form, not writing a report from scratch.

Label each finding issue the same way any other issue is labelled (`CONTRIBUTING.md`) —
`gameplay`/`feel`/`content`/`design` are the common ones a playtest finding lands under — so it
enters the normal backlog rather than living in a separate playtest-only pile.

---

## Acceptance criteria, and how this document meets them

- **Someone who is not on the project can be playing the current build within five minutes of
  being asked** — §1: the root GitHub Pages link, no build step, no account.
- **Two different people running a session produce notes that can be compared** — §3-5: what is
  said, what is watched for, and what is asked are all fixed in advance rather than improvised
  per session.
- **Findings land as issues with the session they came from attached** — §8, via the issue
  template's session-id field.
- **At least one full round has been run, and its findings triaged, before #54's balance pass
  starts** — §7's "hard prerequisite," and `docs/BALANCE_METHODOLOGY.md`'s own status section
  tracks whether that round has actually happened yet.

# CLAUDE.md — Working rules for Claude on Pubby

These rules apply to every session on this repo. Read this file first.

## Core rules

1. **Plan first, code second.** Nothing is coded until the user has approved the plan (or a specific change) in writing.
2. **No code without approval.** Documentation, planning, and the MD files may be edited freely. Any source code, config, or build file needs explicit approval first.
3. **Commit and push only after approval.** Never commit or push on your own initiative.
4. **Update all MD files before every commit and push.** That means `CLAUDE.md`, `PROJECT.md`, `CODE.md`, `TODO.md`, and `DEVLOG.md`, even if only some of them changed. Each one must be checked and updated where relevant.
5. **Playable test build before every commit and push.** Before asking for approval to commit, give the user something playable that covers the new work, so they can test it themselves on their phone. Approval to commit comes only after the user has tested it.
   - The test build is a link the user can open on a phone (a published test page now; the real app on GitHub Pages once the UI exists).
   - It must let the user try every new rule or feature in the change, not just show that it loads.
   - Say exactly what to test: a short checklist of things to try and what should happen.
   - If something can't be made playable yet, say so clearly and explain why before asking to commit.
   - Doc-only changes (MD files only) don't need a test build.
6. **Don't invent game rules.** If a rule is unclear or missing, add it to the Open Questions list in `PROJECT.md` and ask the user. Do not guess and build.
7. **The game is called Pubby.** Use that name in code, UI, and docs unless the user changes it.
8. **New version number with every code change pushed (user 2026-11-12: the number itself doesn't matter).** The version is in `package.json` and shows in the app as `MAJOR.MINOR` (home screen and quick rules). Pick the next number yourself (usually the second number up: 2.5 → 2.6); no need to ask. Always tell the user the new version number when asking to push and after pushing, so they know there's a new version to test. Doc-only changes don't change the version.

## Which model does what (user 2026-11-15)

The user keeps **Haiku as the default** to save usage, and switches to **Opus** by hand in the model picker. Claude can't switch models itself, so it must tell the user when to switch.

- **Haiku:** coding from an approved plan, test builds, MD updates, commits and pushes, small fixes, routine questions.
- **Opus:** planning a new feature, phase or rule change; design or architecture decisions; any problem that keeps coming back.

**If you are Haiku**, start your reply with this line (and stop before coding) when any of these happen:

> 🔁 **Switch to Opus** — reason: …

1. The same bug or failing test is still there after **2 fix attempts**, or the user reports the same problem a second time.
2. The user asks for a new feature, phase or rule change that has no approved plan in `PROJECT.md` / `CODE.md` yet.
3. The change touches several systems at once (for example rules engine + network sync + UI) or needs a design choice.
4. You are unsure which approach is right, or the plan is unclear or contradicts itself.

Say in one short line what Opus should look at, then wait. Keep it to one line, no long explanation.

**If you are Opus**, when the plan is approved and written into the MD files (or the stuck problem is fixed), end your reply with:

> ✅ **Switch back to Haiku** — next: …

Name the exact next task (for example "build slice 4 from `CODE.md` 9m") so Haiku can start straight away. If a fresh chat is better (the current one is long), say so.

## What each file is for

| File | Purpose | Update when |
|---|---|---|
| `CLAUDE.md` | These working rules | Rules change (only with user approval) |
| `PROJECT.md` | The game spec: rules, mechanics, scoring, open questions | Any rule or design decision changes |
| `CODE.md` | Technical plan: architecture, stack, conventions, testing | Any technical decision changes |
| `TODO.md` | Task list by phase, with status | Any task starts, finishes, or is added |
| `DEVLOG.md` | Dated log of what happened in each session | Every session, before each commit |

## Session checklist

- [ ] Read `CLAUDE.md`, `PROJECT.md`, `TODO.md`, and the latest `DEVLOG.md` entry.
- [ ] Confirm which tasks are approved before starting them.
- [ ] Before any commit or push: give the user a playable test build with a test checklist, and wait for them to test it.
- [ ] Before any commit or push: update all five MD files, then ask for approval if not already given.
- [ ] Add a `DEVLOG.md` entry for the session.

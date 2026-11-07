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
8. **Bump the version with every code change pushed.** The version is in `package.json` and shows in the app as `MAJOR.MINOR` (home screen and quick rules). Major change (a new phase, a big feature, a rule overhaul): first number up, second back to 0 (1.4 → 2.0). Small change (fixes, tweaks, wording, small rules): second number up (1.0 → 1.1). Say which bump and why when asking to commit; the user has the final say. Doc-only changes don't bump the version.

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

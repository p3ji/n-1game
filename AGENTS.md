# n-1game (N-1 Word Craft) — Agent Guide

> Single source of truth for *how to work on this repo*. Both Claude and Antigravity read this file (`CLAUDE.md` and `GEMINI.md` just point here). Keep it short.

**Brain note (goals, backlog, full context):** [n-1game.md](file:///H:/My%20Drive/Brain2_backup/Projects/n-1game.md)
**GitHub:** https://github.com/p3ji/n-1game

## Run / build / test
- **Install deps:** `npm install` (dependency: `@skedwards88/word_lists`).
- **Run:** open `index.html`, or `python -m http.server 8000` for full PWA/offline behaviour.
- **Regenerate word DB:** `node generate_words.js` (writes `words_data.js`). After any change, **bump the cache version** (e.g. `?v=43`) in `index.html` and `sw.js`.

## Word-database rules (the generator must honour these)
- **Starter words:** 4–7 letters; common, recognisable English (present in ENABLE ∩ commonWords). Shown as the target — **not** itself a valid answer.
- **Subwords (valid answers):** use only letters from the starter word with correct frequency; length 3 → (starter − 1); real English words (ENABLE list as the MW proxy); no proper nouns/abbreviations/acronyms. Target 4–13 subwords per starter.
- **Levels:** L1 starter=4 (min 4), L2=5 (min 5), L3=6 (min 7), L4=7 (min 8); max 13 each.
- **Bonus word:** the longest valid subword for a starter; earns an extra hint.
- Manually curated additions go in the whitelist inside `generate_words.js`.

## Decision Routing (When you update the notes)

When a chat session produces bugs, decisions, or changes, **route them here:**

| What was decided | Write it in AGENTS.md | Write it in Brain2 |
|---|---|---|
| Bug found | → Open Bugs | — |
| New feature / phase added | → Pending Features | → Additional Requirements |
| Fundamental principle changed | — | → Evergreen Requirements + Architecture Notes |
| Operational gotcha / convention | → Conventions & gotchas | — |
| Architecture decision (why X over Y) | — | → Architecture & Design Notes |
| Code changed | (git commit only) | — |

**End-of-session instruction to agents:**  
> "Update the project notes with what we decided today."

## Open Bugs
*(Log bugs here as discovered)*
- *(open)* Glitch 1: "mats" in words_data.js but not in seven_letter_words.xlsx
- *(open)* Glitch 2: Word cap logic for 12+ words per starter
- *(open)* Glitch 3: Timer reset behavior at level 1
- *(open)* Glitch 4: Hint system sync issue

## Pending Features / Decisions
*(Log decisions and new feature requests here)*
- Google Play Store submission preparation (assets, privacy policy, domain verification)

## Notes
- `supabase/` holds backend integration config.

## Do NOT
- Hand-edit `words_data.js` — regenerate it.
- Commit `node_modules/`.

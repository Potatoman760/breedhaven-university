# Breedhaven Dating Sim

An adult, LLM-driven dating sim: Electron, React 19, TypeScript, zod. The player is a rare fertile man at a university of women; scenes are conversations written by an LLM, and everything around them (time, money, courses, relationships, pregnancy, the house) is deterministic game logic.

`README.md` is the full reference for how each system works and where it lives. Read the relevant section before changing a system. This file is the short version: how to work here.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app with hot reload |
| `npm run typecheck` | `tsc --noEmit` over everything, tests and scripts included |
| `npm test` | `vitest run` (about 640 tests, a few seconds) |
| `npx vitest run src/shared/game/housing.test.ts` | One test file |
| `npm run build` | Production build into `out/` |
| `npm run build:win` | Windows build as a zip |

Run `npm run typecheck` and `npm test` after every change and say what they reported. Neither proves a screen looks right: say so when a change is to the interface and has not been seen in the running app.

### Scripts (`scripts/`, run with `npx jiti scripts/<name>.ts`)

| Script | Purpose |
|---|---|
| `build-catalogue.ts` | Lay out the term again after a character is added or changes what she studies or teaches. `--dry` to preview. |
| `prompt-size.ts` | Size of the opening scene prompt per character; `<id> --print` dumps it; `--class <courseId>` shows a lecture's opening instruction. |
| `make-test-save.ts` | Write a late-game save to a slot (`8` by default) for trying the house, births and skills. Needs `--force` to overwrite. |
| `generate-icons.ts` | Paint the emblems shown in place of drawn icons for jobs, places, societies, stalls, weather and Undercroft stops (`npm run icons`, `-- <group or id>`, `--overwrite`, `--dry`). Run it after adding one. |
| `generate-walks.ts` | Draw each love interest's walking profile (hips up, facing right) for the loading screen (`npm run walks`, `-- <ids>`, `--overwrite`, `--dry`). Run it after adding one. |
| `preview-loading.ts` | Open the app in dev on the loading screen alone (`npm run preview:loading`, `-- <id or first name>`; random, and a click shows another, when none is named). |
| `preview-lantern.ts` | Open the app in dev on the Lantern Festival's lantern release alone (`npm run preview:lantern`, `-- <id>` or `-- <id>,<id>` for two; one and then two at random when none is named). |
| `preview-trip.ts` | Open the app in dev on the Saltmere trip's moments alone (`npm run preview:trip`, all in turn; `-- <moment>` or `-- <moment>:<id>,<id>`). |
| `generate-clips.ts`, `generate-births.ts` | Batch media generation through the user's ComfyUI (`npm run clips`, `npm run births`). Long-running. |

## Layout

```
content/default/        The game's content, as JSON. Hand-edited or written by the in-app editor.
  love-interests/*.json   One file per character (love interests and NPCs)
  curriculum.json         Every subject, course, syllabus and course skill
  catalogue.json          Generated: who is in which course and when (never hand-edit)
src/shared/model/       zod schemas. The shape of content and of a save.
src/shared/game/        Pure game logic. No Electron, no React, no I/O. Tests sit beside each file.
src/main/               Electron main: content loading, saves, LLM calls, ComfyUI, IPC handlers (index.ts)
src/preload/            The IPC bridge
src/renderer/src/       React UI. App.tsx owns game state; ui/ holds the screens.
scripts/                One-off and maintenance scripts
```

- Game rules go in `src/shared/game` as pure functions of `(content, state)` returning a new state. The renderer and main only call them.
- Periodic work (settling rent, scheduling births, announcing skills) is an idle `useEffect` in `App.tsx` guarded by a marker in the state, so it runs once however far the clock jumped.
- The content one game sees is derived: `withHousing(personalise(content, name), state)`. Use it wherever content is prepared for a state.
- Anything that changes a number of the game for a while or for good goes through `src/shared/game/modifiers.ts` (`factor`, `bonus`), not a one-off `if`.

## Rules for this project

- **No backwards compatibility.** The game is not public. Never write shims, migrations or fallbacks for old saves, old content or add-ons. Change the format and the content together.
- **Do not commit unless asked.** The working tree always has unrelated uncommitted content changes; leave them alone.
- **Content never spells the player's name.** Write `{player}`; `personalise.test.ts` enforces it.
- **Written content is US English** (codex, syllabus, character files, UI text).
- **Internal ids keep their spelling** (`health-centre`): renaming one breaks references. Change display names, not ids.
- **Regenerate, do not hand-edit, generated files**: `catalogue.json` after any change to a character's `studies` or `teaching`, or to `curriculum.json`'s list of courses. A test fails when it is stale.

## Conventions

- **Comments say why, in plain prose.** Match the density and voice of the file being edited. No comments that restate the code.
- **Reuse the interface's components.** Buttons are `ui/Button.tsx` (`variant`, `size`), never a raw `<button>` for an action. Dialogs are `ui/Dialog.tsx`. A row of labelled figures is `ui/Facts.tsx`, not a row of pills. Confirmations are `useConfirm`.
- **No wordy helper text in the interface.** A label and, where it earns it, a `title` tooltip. The user removes explanatory paragraphs.
- **Prompts are terse.** Text sent to the LLM states the rule and stops: no emphasis phrases, no "never do X" lists where code already enforces it. Check the cost with `prompt-size.ts`.
- **What the LLM writes is not trusted.** Hidden tags in a reply (`[SEX-ACT: …]`, `[LEAVES: …]`, `[STOPS BIRTH CONTROL]`) are parsed in `src/shared/game/scene.ts` and checked against game state in `src/main/index.ts` before anything changes. Names are compared without accents or case (`namesHer`).
- **Tests pin behaviour and shipped content.** `src/shared/game/*.test.ts` use the fixture in `testFixture.ts`; `src/main/content/*.test.ts` load the real `content/default` and pin things like the economy, the catalogue and the skills. When a number in content is retuned on purpose, update the test that pins it.

## Working with the user

- **A question is a question.** When asked why something happens, answer and stop; offer the fix, do not make it.
- **Ask before a product decision** (what a mechanic should do, which characters change), and say plainly which choices were made without being asked.
- **Report what was verified.** "Type-checks and tests pass; not seen in the app" is the usual honest state of a UI change.
- Features are iterated on: build the first version, expect to adjust.

## Gotchas

- **Shell.** Bash here is Git Bash on Windows, and it mangles backslashes, backticks and `$` in anything passed inline: heredocs, `python -c`, `sed` with escapes. Do not put code in the shell command. Write the script to a file in the scratchpad with the Write tool and run the file (`python <path>`, `npx jiti <path>`), or use the Edit tool for a change to the source. The shell is for running things, listing files and one-line commands with no escapes in them.
- **Add-on overrides.** The app reads `%APPDATA%\breedhaven-dating-sim\addons\` over the game's own content. A `catalogue.json` left there silently replaces the one in the repo. Saves are in `...\saves\` (`auto.json`, `slot1.json` … `slot40.json`).
- **Characters in memory are not as in their files.** A file names a subject (`"studies": { "major": "POL", "level": 1 }`); `resolveCurriculum` fills in the subject's name, stats and lab when the pack is read, and the editor writes the short form back.
- **Circular imports in `src/shared/game`.** `modifiers.ts` reads only the model so that anything may import it. Check before importing between `housing`, `agenda`, `sleep`, `outing` and `births`.
- **ComfyUI stores the prompt inside each PNG it makes.** To find out why a generated picture came out as it did, read the `prompt` text chunk of the file instead of guessing.
- **JSON formatting.** Content files are `JSON.stringify(value, null, 2)` with a trailing newline, UTF-8, so scripted rewrites produce small diffs.

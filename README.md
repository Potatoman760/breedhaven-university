# Breedhaven Dating Sim

An AI-driven dating sim built on Electron, React and TypeScript.

## Getting started

```sh
npm install
npm run dev
```

## Scripts

| Script              | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Launch the app with hot reload                |
| `npm run build`     | Build main, preload and renderer into `out/`  |
| `npm start`         | Run the built app                             |
| `npm run typecheck` | Type-check the whole project                  |
| `npm test`          | Run the unit tests                            |

## Layout

- `content/default/` – The game's content as JSON: calendar, traits, locations, activities,
  codex, relationship stages, and one file per love interest. `sprites/` holds character
  artwork, which the app loads through a `content://pack/<path>` URL.
- `src/shared/model/` – zod schemas (and the types inferred from them) for all content and
  for the game state. `validateContentPack` also checks that referenced ids exist.
- `src/shared/game/` – Pure game logic: calendar maths, activities, conditions and effects,
  codex selection, and the character prompt builder.
- `src/main/` – Electron main process. Loads the content pack, owns the window and all AI calls.
- `src/main/ai/` – Client for OpenAI-compatible chat completion endpoints.
- `src/main/settings/` – Settings file storage.
- `src/main/saves/` – Save slot storage.
- `src/preload/` – Context-isolated bridge exposing `window.api` to the renderer.
- `src/renderer/` – React UI. `styles.css` holds the design system (colour and type
  tokens, buttons, translucent "glass" panels, the double-rule frame); `ui/` holds the
  day view, scene view and dialogs. Features the design calls for that don't exist yet
  show a "To be implemented" note.

## Game concepts

- **Time** is one integer: hours since the game began. The calendar config (month names and
  lengths, weekday names, hours per day, named periods, holidays, game length) turns it into
  an in-world date, so fantasy calendars need no code changes.
- **Calendar events** (holidays, festivals, fairs) have a start date, a length in days and
  an optional location. Authored ones live in `calendar.json` and can recur every year;
  the Main LLM can also invent upcoming ones during play, which are stored in the save.
  Characters are told about today's events and those in the next week, and activities can
  require an authored event with an `event` condition.
- **The map** (`map.json`) is an image with a pin per location. It shows which love
  interests their schedules place at each location right now, and going to a location
  costs the map's travel time. Activities tied to a location can only be done there, and
  shared activities only with someone who is at the player's location.
- **The market** (`stalls.json`, `items.json`) sells gifts. Each stall is a tab; each item
  has an icon, a price and tags. A gift can be handed over in any scene: it is loved if one
  of its tags is in the person's `likes`, disliked if one is in their `dislikes`, and the
  affection it earns is set under `gifts` in `relationships.json`. The character is told
  what they were given and how they feel about it.
- **Coursework** (`coursework.json`): each new game draws up its own catalogue: one course
  per love interest who has `studies` (subject, catalogue prefix and year), plus the
  general-education courses listed under `generalEd`. A course has a number such as
  `POL 101`, a title, a professor, a description, one weekly time slot (a weekday and a
  start hour, drawn from `weekdays` and `startHours`) and the love interests taking it.
  The Main LLM is asked twice: once to write the titles, professors and descriptions, and
  once to choose each love interest's courses to suit them (their own subject's course is
  always kept). Without it, wording is plain and timetables are dealt out by rote. The
  player then picks up to `maxCourses` on a week planner: a column per day, a row per
  time slot. While a course meets, everyone taking it is at the Lecture Halls, and
  attending gives intellect and a little affection with each classmate.
- **Activities** take a whole number of hours, can be limited by weekday, period, hour,
  location opening times and requirements, and apply effects when performed.
- **Conditions and effects** are a shared vocabulary used by activity requirements, secrets
  and codex unlocks (`stat`, `money`, `energy`, `meter`, `stage`, `flag`, `event`, `day`).
- **Love interests** carry profile, outfits with sprites per expression, a schedule, and an
  `ai` block (speech pattern, quirks, example dialogue, secrets, per-stage notes).
- **Traits** are a shared library of name + definition, referenced by id.
- **Codex** entries reach the AI only when unlocked and relevant: always-on, tied to the
  current location or character, or mentioned in the recent conversation, within a budget.

## Saves

- The title screen offers **Continue** (the most recently written save), **New Game** and
  **Load**. In game, **Save** and **Load** open the slot list.
- There are six manual slots plus an **autosave**, which is rewritten after every change.
- A save holds the whole game state and any scene still in progress. Saves are JSON files
  in the `saves` folder of Electron's user-data directory, one per slot.
- Saves from a different format version, or damaged files, are shown as unreadable rather
  than hidden. Loading tolerates content changes such as a newly added love interest.

## AI

- **Settings** (the Settings button) hold two OpenAI-compatible endpoints: the **Main LLM**
  and the **NSFW LLM**, each with base URL, API key, model, temperature, max reply tokens
  and extra instructions. They are saved to `settings.json` in Electron's user-data folder,
  with keys encrypted by the OS keychain where available. Keys never reach the renderer.
- **Scenes** start with an activity shared with a love interest. The character ends the
  scene from within the conversation: the prompt tells the LLM to finish its parting line
  with `[END SCENE]` when the player says goodbye or the moment has run its course. The
  tag is stripped, the player presses Continue, and a summary screen shows what changed
  for the player, how the relationship moved, and the memory that was kept.
- **NSFW routing**: scenes go to the Main LLM unless their activity is marked `nsfw`. If
  the Main LLM declines to write (a refusal in its reply, a content filter, or a
  moderation block), the request is retried on the NSFW LLM, which keeps the scene from
  then on.
- **Reply format**: the character prompt (built in `src/shared/game/prompt.ts`) asks for
  visual-novel dialogue: 2 to 4 short lines, one beat per line, under 60 words, mostly
  speech, with at most one action written between asterisks. The text box shows one beat
  at a time and the player clicks Next through them before replying. The prompt also
  carries the date, time, day of term, weather, location, relationship, memories, gifts
  and relevant lore.
- **Tools**: a chat request can carry functions for the LLM to call (OpenAI `tools`), run
  in the main process before the model writes its reply. Tools are defined in
  `src/main/ai/tools.ts`. An endpoint or model that rejects tools is retried without them.
  - `propose_meeting` is for when a character or the player wants to meet later, to study
    or on a date. The LLM names the activity, the place and optionally how soon and what
    time of day; the game picks the first two-hour slot when both are free of classes and
    other plans and the place is open (`src/shared/game/appointments.ts`). The character
    then suggests that time in their own words, and the player gets Accept and Not now.
    Accepting puts the plan on the calendar. When its time comes the love interest is at
    the meeting place, and the day view offers the plan there; keeping it starts a scene
    and earns affection and trust. Characters are told about plans already made.
    The tool's `with` argument brings up to two other love interests along; the slot then
    has to suit everyone, and all of them are at the meeting place when the time comes.
- **Group scenes**: a scene has one lead love interest and up to two companions
  (`companionIds`, three in all, `MAX_SCENE_CAST`). The prompt is the lead's, with a short
  profile of each companion, and the LLM writes everyone's lines, starting each with the
  speaker's first name (`Tink: ...`). The text box puts that name on the nameplate, all
  sprites stand side by side and whoever isn't speaking is dimmed. In a group, everyone
  appears in their default outfit (no outfit, expression or animation tags).
  - **Where they come from**: a shared activity is done with everyone picked in the day
    view's "Here" row. By default that is everyone at the location, up to three; click a
    name to leave them out or bring them along. The first picked leads. Attending a class
    is a scene with up to three love interests who take it: anyone picked, then those the
    player is closest to. A plan made with several people opens a scene with all of them.
  - **Gifts**: with more than one person in the scene the gift dialog has a button per
    person. The prompt says who received what and how it suits them.
  - **Memories**: when the scene ends each love interest gets a memory of their own,
    written from their side by a separate request (`forId` in `buildSummaryPrompt`), and
    the summary screen shows every relationship and every memory.
- **The day view** offers only what is on: a class of the player's that is meeting, a plan
  whose time has come, and anything a calendar event brings. Everything else the player
  types (see "Your own activity"). Clicking someone in the "Here" row starts a line about them.
- **Stats**: strength, dexterity, endurance, intelligence, charisma and wisdom
  (`src/shared/model/stats.ts`), starting at 5. A class raises the one or two stats its
  course teaches (`stats` on a love interest's `studies` and on each `generalEd` entry in
  `coursework.json`; `statGain` points a class, shared between them). An activity the
  player makes up can work on a stat (+1 an hour, for energy) or be rest (energy back);
  the LLM judges which from the wording, and each location lists what it is a good place
  for (`trains` in `locations.json`).
- **Appeal**: each love interest `admires` up to three stats. The average of those in the
  player gives three levels (below 8, 8 and up, 12 and up). The level is told to the
  character with the player's whole stat sheet, makes affection grow faster (a quarter
  more per level, rounded up), and raises the chance they write to him unprompted.
- **Relationship statuses**: stages say how close two people are; a status is what they
  have agreed to be. `relationships.json` lists the `statuses` (each with a name, a
  description, guidance for the character, how many love interests it joins to the player,
  whether they are also with each other (`mutual`), whether it is `exclusive`, the stage
  each must have reached, and for a mutual one how close the love interests must be to
  each other). The game's are: lovers without promises, courting, open courtship, triad
  and open triad. What is in force is kept in the save as `bonds`.
  - **Ties** are how two love interests feel about each other: a number per pair (`ties`
    in the save), named by `tieLevels`, optionally started by `ties` in
    `relationships.json` with a note of their history. Sharing a scene raises each pair's.
  - A character asks for a change with the `propose_relationship` tool
    (`src/main/ai/tools.ts`). The game checks it (`canBond` in `src/shared/game/bonds.ts`):
    if it can't be yet, the character is told why and says so; if it can, the player gets
    Yes and Not now. A promise of exclusivity blocks anything with someone else until it
    is changed with the person it was made to. The tool can also end an arrangement.
  - Each character's prompt says what she and the player are, who else is in it, who else
    he sees when the arrangement means she would know, and how she feels about the other
    love interests. The character panel shows the status and her ties.
- **Courier**: the intercampus courier works like texting. The Courier tile opens a thread
  per love interest; a note gets an answer at once, written by the LLM with a prompt of
  its own (`mode: 'courier'`), and the answer may carry an invitation made with the
  `propose_meeting` tool, to accept onto the calendar or decline. Once a day, from 09:00,
  one love interest may write first with an invitation: the chance is nothing for someone
  with no reason, and grows with appeal and affection (`chanceOfWriting` in
  `src/shared/game/courier.ts`). The last 2,400 characters (about 600 tokens) of the
  exchange are put into the prompt of every scene with that love interest.
- **Your own activity**: the "Something else?" box on the day view takes anything the
  player types ("invite Seraphine and Faye out for dinner"). The Main LLM turns it into an
  outing: a title, an opening line, who is invited (up to three), where, and for how long
  (`src/shared/game/outing.ts`); without an LLM, names and places are read off the words.
  A dialog then confirms it. Someone in class or not around, a closed place, or a plan
  already made stops it, and the dialog says why and offers to wait until everyone is
  ready, or to go now with whoever is free. Waiting looks one day ahead. Going walks the
  player there, spends the time and opens a scene with everyone invited; with nobody
  invited it only passes the time.
- **Weather** is defined under `weather` in `calendar.json`: kinds with a weight and,
  optionally, the months they occur in. Each day's weather is fixed for the day and
  differs between games.
- **Appearance**: during a scene the prompt lists the character's outfits, each outfit's
  sprites, and their animations, with every name and description. The LLM decides when
  each fits and switches with hidden tags at the end of a reply: `[OUTFIT: id]`,
  `[EXPRESSION: name]`, `[ANIMATION: id]` and `[ANIMATION: none]`. An animation is a
  looping video that takes the sprite's place until it is stopped or the character goes
  back to a sprite. There is no NSFW switch on any of this; the descriptions are all the
  LLM has to go on, so write them specifically.
  - A sprite is either a path, `"happy": "sprites/x/happy.png"`, or
    `"happy": { "image": "sprites/x/happy.png", "description": "laughing, head tilted" }`.
  - An animation is
    `{ "id": "...", "name": "...", "description": "...", "video": "animations/....mp4" }`
    in the love interest's `animations` list.
- **Memories**: ending a scene asks the LLM for a one- or two-sentence summary (what they
  did, in order, and what the character remembered most). Only that summary is kept; the
  transcript is discarded. The most recent memories are fed into the character's prompt.
  If the LLM is unavailable, a plain note built from the activity list is saved instead.

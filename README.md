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
| `npm run build:win` | Package Windows as a `.zip` into `dist/` (unzip and run) |
| `npm run build:win:installer` | Package a Windows installer instead |
| `npm run build:mac` | Package a macOS `.dmg` (run on a Mac)         |
| `npm run build:linux` | Package a Linux AppImage and `.tar.gz`      |
| `npm run build:unpack` | Package an unpacked app, without an installer |
| `npm run typecheck` | Type-check the whole project                  |
| `npm test`          | Run the unit tests                            |

To sign and notarize the macOS build, copy `electron-builder.env.example` to
`electron-builder.env` and fill in the Apple credentials. Without that file the build is
left unsigned.

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
- **The map** (`map.json`) has a pin per location, placed over an `image` or, without one,
  on a plain chart with labelled `regions` (the default pack's campus and city). It shows which love
  interests their schedules place at each location right now. Going to a location takes
  no time. Activities tied to a location can only be done there, and
  shared activities only with someone who is at the player's location.
- **The market and the shops** (`stalls.json`, `items.json`) sell gifts. A stall belongs to
  a location: where the player is has stalls, the Market tile reads Shops and opens them;
  anywhere else it walks to the first stall's location, the market. Each stall is a tab; each item
  has an icon, a price and tags. A gift can be handed over in any scene: it is loved if one
  of its tags is in the person's `likes`, disliked if one is in their `dislikes`, and the
  affection it earns is set under `gifts` in `relationships.json`. The character is told
  what they were given and how they feel about it.
- **Coursework** (`coursework.json`): the course catalogue is built ahead of time in the
  editor (Edit game content, Courses) and saved to the add-on folder as `catalogue.json`;
  every new game starts with it, and a game cannot start without one. It is built by rule,
  with no LLM (`buildCatalogue` in `src/shared/game/catalogue.ts`), and the same seed and
  characters always give the same catalogue:
  - **Majors** are every student's `studies`, every teacher's subjects and the
    `generalEd` list. A love interest's major gets `coursesPerMajor` courses, at the years
    its students and teachers need and then the rest of years 1 to 4; a general subject
    gets one. Numbers are the prefix, the year and an ordinal: `ECO 101`, `ECO 401`.
  - **Meetings**: every course has `lecturesPerWeek` lectures of `lectureHours`, on
    different days. A subject marked `practical` also has one lab of `labHours`.
  - **Slots** are given out one meeting at a time, each to the hours between `dayStart`
    and `dayEnd` with the fewest classes already in them, so the week fills before
    anything overlaps. After that classes share hours, but never two of one major, and
    never two that the same love interest teaches.
  - **Professors**: a love interest who teaches a subject gives every course in it. Each
    other major has one professor from the `professors` list, who gives all of its courses.
  - **Classmates**: each student takes her own major's course at her year, then fills up
    with general and first-year courses that do not clash with what she has. A class
    holds at most three love interests, its teacher counted, since attending it is a
    scene with all of them.
  - **Wording** is the one thing the LLM does, and only when asked: "Write titles and
    descriptions" sends the courses in batches of twenty and puts back what comes, by
    course number. Until then titles are plain ("Foundations of Economics").
  The editor shows when the saved catalogue is out of date (a character's subject or year
  has changed since). At the start of term the player picks up to `maxCourses` on a week
  planner, a column per day and a row per hour; two courses whose hours overlap cannot
  both be taken. While a course meets, everyone taking it is at the Lecture Halls, and
  in class (`inClass` in `src/shared/game/map.ts`): not in the day view's "Here" row, not
  to be done anything with or asked out, and not run into by someone dropping in or working
  a shift there. The only way to her then is to attend the same class, which is a scene.
  Attending a meeting lasts until it ends, and is worth `statGain` stat points and costs
  `energy` for each of its hours, so a lab is worth three lectures.
- **Activities** take a whole number of hours, can be limited by weekday, period, hour,
  location opening times and requirements, and apply effects when performed.
- **Conditions and effects** are a shared vocabulary used by activity requirements, secrets
  and codex unlocks (`stat`, `money`, `energy`, `meter`, `stage`, `flag`, `event`, `day`).
- **Love interests** carry profile, outfits with sprites per expression, a schedule, and an
  `ai` block (speech pattern, quirks, example dialogue, secrets).
- **The player** as a new game starts him is `new-game.json`: his default name and bio, money
  and energy, where he wakes on the first day, and optionally `room` (a name, a
  description, the location it is in and a picture), written as a love interest's room is.
  His room is somewhere private a scene can move to (`room-of-player`), shown with its own
  picture. The editor's Player tab edits all of it; a change is kept as `new-game.json` in
  the add-on folder and can be put back as shipped. His stats are not there: the player
  spends a pool of points on them when a game begins. The name and the bio are only what a
  new game offers: the player may change both in the New game dialog, and the game keeps
  what it began with (`state.player.name`, `state.player.bio`). The bio is told to every
  character under "About <name>", with `{player}` in it standing for his name.
- **The player's name** is chosen when a game starts, so no content may spell one out:
  write `{player}` wherever text has to name him ("`{player}`'s best friend from when they
  were children"). The game and every prompt read the content with the name filled in
  (`personalise` in `src/shared/game/personalise.ts`); the editor shows it as written. The
  only name in the content is the default in `new-game.json`, and a test keeps it so.
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

## Content editor and add-ons

**Where the editor writes.** Run from source (`npm run dev`), the game is being written: the
editor changes the base game itself. No add-ons are read, every save goes into
`content/default/` (a character to `love-interests/<id>.json`, a location into
`locations.json`, traits to `traits.json`, the catalogue to `catalogue.json`, the player to
`new-game.json`), and pictures are filed under `content/default/sprites/` and
`content/default/generated/` with no `addons/` prefix on their paths (`loadBase` in
`src/main/content/addons.ts`). Any character or trait can be deleted. Set
`BREEDHAVEN_ADDONS=1` to run from source the way a player has it instead. A packaged game
keeps what the user makes apart, as add-ons laid over the base pack, as described below.
What the game makes while it is played (the selfies on the feed) always goes to the
user's own folder, whichever way it is run.

**Events.** The editor's Events tab lists the calendar's events and holidays in the order
they fall: a name, a description, the month and day, how many days it lasts, where it is,
and whether classes stop for it. "Ask the AI for events" has the Main LLM think of five
more for the setting and adds them, to be read over and changed or deleted like any other.
Run from source they are written into `calendar.json`; in a packaged game they are kept
as `events.json` in the add-on folder and laid over the game's own, where one with the id
of one of the game's own takes its place and only the add-on's can be deleted.

"Edit game content" on the title screen opens the editor. For now it edits love interests
and the trait library.

- **Add-ons** live in an `addons` folder in Electron's user-data folder (the editor has a
  button that opens it): `love-interests/<id>.json`, `traits.json`, and artwork under
  `sprites/<id>/`. They are laid over the game's own content when it loads
  (`src/main/content/addons.ts`). An add-on with a new id is a new character; one with a
  built-in character's id takes her place, and deleting it puts the original back. The
  game's own files are never written to.
- A broken add-on (bad JSON, an under-18 age, a reference to a place or trait that doesn't
  exist) is left out and listed in the editor; it can't stop the game starting.
- **Love interests**: a searchable list, and tabs for Profile (name, age, bio, likes,
  admired stats, studies), Traits, Sprites, Voice (everything that goes to the LLM) and
  Schedule. Saving checks the whole game would still load with the change and says what is
  wrong if not. An id can't be changed once saved, because saved games refer to it.
- **Media**: outfits and their pictures with a name and description each, the default
  outfit, the pregnant flag, the portrait crop, and the NSFW pictures and clips. Adding a picture or video
  copies the chosen file into the character's add-on folder; content paths that start
  with `addons/` are served from there.
- **Traits**: toggle a character's traits, and add, change or remove traits in the shared
  library. A trait someone still has can't be deleted.

## AI

- **Settings** (the Settings button) hold two OpenAI-compatible endpoints: the **Main LLM**
  and the **NSFW LLM**, each with base URL, API key, model, temperature, max reply tokens
  and extra instructions. They are saved to `settings.json` in Electron's user-data folder,
  with keys encrypted by the OS keychain where available. Keys never reach the renderer.
- **Scenes** start with an activity shared with a love interest. The character ends the
  scene from within the conversation: the prompt tells the LLM to finish its parting line
  with `[END SCENE]` when the player says goodbye or the moment has run its course. The
  tag is stripped, the player presses Continue, and a summary screen shows what changed
  for the player, how the relationship moved, and the memory that was kept. Each memory is
  in a text box on that screen: the player can reword it, or clear it so that nothing is
  remembered, and it is kept as it stands when they continue.
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
  - A tool is only used where the model needs the game's answer before it can write:
    `propose_meeting`, `propose_relationship` and `move_scene` in a scene, `reveal_fact`
    and `excuse_shift` by message. Everything a character merely declares is a hidden
    line in the reply instead, read by `parseDirectives` in `src/shared/game/scene.ts` and
    costing no second round trip: `[LEAVES: Name=feeling why]`, `[ATTENDING: event-id]`,
    `[AGREED]` (a plan suggested earlier, agreed to in words) and `[SLEEP]` (the night is
    slept through where they are). What came out about a love interest, and what changed
    between two of them, is asked of the scene's summary when it ends.
  - `propose_meeting` is for when a character or the player wants to meet later, to study
    or on a date. The LLM names the activity, the place and optionally how soon and what
    time of day; the game picks the first two-hour slot when both are free of classes and
    other plans and the place is open (`src/shared/game/appointments.ts`). The character
    then suggests that time in their own words, and the player gets Accept and Not now.
    Accepting puts the plan on the calendar. When its time comes the love interest is at
    the meeting place, and the day view offers the plan there; keeping it starts a scene
    and what she makes of it is settled when the scene is over. Characters are told about plans already made.
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
    is a scene with a love interest who teaches it, who is always there and leads it, and
    the students he sits next to (`classmates`): all of them when the class has two or
    fewer, and otherwise two, the one who likes him most and one of the others at random,
    or two at random when they all like him the same. A plan made with several people opens a scene with all of them.
  - **Gifts**: with more than one person in the scene the gift dialog has a button per
    person. The prompt says who received what and how it suits them.
  - **Memories**: when the scene ends each love interest gets a memory of their own,
    written from their side by a separate request (`forId` in `buildSummaryPrompt`), and
    the summary screen shows every relationship and every memory.
- **The day view** offers only what is on: a class of the player's that is meeting, a plan
  whose time has come, and anything a calendar event brings. Everything else the player
  types (see "Your own activity"). Clicking someone in the "Here" row starts a line about them.
- **Orientation**: `orientation.json` (optional) lays out an induction the player has to
  attend: its `day`, and `steps` in order, each with a name, location, start hour,
  length, opening narration and a `direction` for the LLM. On that day no classes meet
  and the day view offers only the next step. Its purpose is to introduce the love
  interests the player shares no class with, and so would not otherwise run into: only
  they are dealt out, one to a step, so that the player meets people one at a time (a
  step that names its own `castIds` keeps the first of them). Whoever is left over is met
  some other way. A step with nobody to meet just passes the time. The game's has three steps on day 1:
  the Assembly, the Campus Tour and the Hall Supper.
- **Kinds of love interest** (`kind`): a **student** has `studies`, takes the course in her
  major at her year, and has the rest of her timetable dealt out by rule when the catalogue is built; a **teacher**
  has `teaching` (a department, a style such as Magistra, and one or more subjects), each
  subject becoming a course with her as its professor; an **outsider** has neither and
  nothing to do with classes. Only students are given timetables. A teacher is in the
  hall while her course meets, is busy then for plans and invitations, and leads the
  class scene when the player attends. Orientation introduces students only, not
  teachers or outsiders. Left out, the kind is read off which of `studies` and `teaching` is present.
- **NPCs** are people to talk to and work for who are not love interests. They are
  characters like any other, written the same way in the same folder
  (`love-interests/<id>.json`) and told apart by `"kind": "npc"`; only an id, a name,
  an age and an outfit are needed, and everything else has a default. An NPC has a `role`
  and, under `ai`, `knowledge` (what she can tell the player). Once the pack is loaded the
  NPCs are held apart in `content.npcs`, so that everything to do with romance (meters,
  gifts, messages she starts, drama, Bloomr, orientation) has only love interests to look
  at. Changing an NPC's kind is all it takes to make a love interest of her: her look,
  voice, memories, DMs and job all carry over.
  Whoever is at the player's location appears in the day view's "Here" row with a dashed
  outline; clicking one takes an hour and opens a scene. The scene is an ordinary one
  marked `npc`, written with the NPC's voice and knowledge and told to stay out of
  romance; the NPC keeps a memory of it like anyone else. An NPC who is where a scene with
  love interests takes place is also part of it as an extra (up to two): the prompt lists
  them, the LLM writes a line for one when the player speaks to them or their work calls
  for it, and their sprite steps in beside the others while that line is on screen. The game has two: Helga, matron
  of the Cloister Halls, and Bryn, the Tiltyard's armourer.
- **Stats**: strength, dexterity, endurance, intelligence, charisma and wisdom
  (`src/shared/model/stats.ts`), on the usual scale of ability scores (10 is ordinary). A new game
  starts every stat at 8 and gives the player 27 points to raise them with as he likes, up
  to 15: a point buys a point up to 13, and the two above that cost two each. From there they are built by work, up to a cap of 30. Whatever works on a stat (a class,
  a session from the Stats menu, a shift at a job that builds it, an activity) earns
  **training points**, about one an hour, banked until there are enough for the next
  point: two at an ordinary score and two more for each step of its modifier, so 12 points
  from 10 to 14, 60 to 20 and 220 to 30. A day's work on one stat counts in full for the
  first two points, for half for the next two and not at all after, so a stat is built
  over weeks (`trainStat` in `src/shared/game/stats.ts`). Stats never fall. 14 is good, 18
  impressive, 22 exceptional and 26 legendary: what love interests notice and what jobs
  ask for. Each score has a
  modifier, (score - 10) / 2 rounded down, kept for the magic to come. A class raises the one or two stats its
  course teaches (`stats` on a love interest's `studies` and on each `generalEd` entry in
  `coursework.json`; `statGain` points for each hour of class, shared between them). An activity the
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
  each other). The game's are: lovers without promises, courting, open courtship, throuple
  and open throuple. What is in force is kept in the save as `bonds`.
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
- **Pregnancy**: `pregnancy.json` (optional) sets the rules: the `chance` of conceiving,
  `lengthDays`, `recoveryDays` after a birth, `daughterChance`, and the `stages` (each from
  a fraction of the way through, with a description for the character and whether it
  shows). The length is the same for everyone.
  - **Conception by sex-act**: choosing the `creampie` sex-act (`isSeeding` in
    `src/shared/model/loveInterest.ts`) counts as the `[SEEDED]` tag for whoever the sex-act is
    of, whether or not the tag was written.
  - **Conception**: in a scene the LLM writes a hidden `[SEEDED]` tag (`[SEEDED: name]` in
    a group) when sex ends in a way that could leave her with child. The game then throws
    the dice: one throw a day for each woman. If it takes, she knows at once, the next
    reply's prompt tells her so, and the scene's summary says it.
  - **Carrying**: her prompt gives the day, the stage and its description; once it shows,
    the others are told too, and she wears an outfit marked `pregnant` if she has one.
    The character panel and the calendar show the stage and the due date.
  - **Birth** (`src/shared/game/births.ts`): `birthNoticeDays` before she is due (three),
    the game sets the hour of the birth and puts it on his calendar, at `birthLocationId`
    (the Health Centre) for `birthHours`, and she DMs him the time. The hour is the earliest
    stretch of the due day that is free of everything else of his while the place is open;
    failing that the earliest that costs him only a calendar event, then only a shift, then
    a class, then another plan (`birthSlot`). It cannot be called off.
    - **Kept**, it is a scene of its own (`attendBirth`): the child is born as it opens, the
      scene is set in the place's `birthViewId` view (the maternity room) with her
      `birthPicture` for its whole stage if she has one, and its opening beat tells the LLM
      what the moment is. What it does to her feelings is the scene's own summary.
    - **Missed**, the child is born all the same at the end of the hour (`settleBirths`):
      she takes `MISSED_BIRTH` (affection -25, trust -30, desire -15), keeps a **core**
      memory of it and writes to say so.
    The child is recorded in `children` in the save, and her prompt and the others' mention
    it from then on. The `pregnant` condition lets activities, secrets and codex entries
    depend on it. A birth still to come when the calendar ends is told in the epilogue.
  - **Her birth picture**: each love interest has one optional `birthPicture` (the Birth
    slot on the editor's Media tab), drawn at 1920×1080 by the `birth` kind of picture from
    her appearance (`birthPrompt` in `src/shared/comfy.ts`): sitting up in a hospital bed in
    a gown with the child in her arms.
- **Sire housing** (`housing.json`, optional; `src/shared/game/housing.ts`): once a love
  interest he is in any agreed relationship with is carrying his child, the housing
  officer of the Sire Relations Office (an NPC, `officerId`) DMs him the offer of a house,
  which the thread shows with Accept and Decline. Declined, it can still be taken.
  - **The house is put into the content**, not handled beside it. `withHousing(content,
    state)` gives the pack as one game sees it, and is applied wherever content is prepared
    for a state (`App.tsx` and `readBy` in `src/main/index.ts`). Until he lives there the
    house's location and the nanny are not in the pack at all, so no scene can go there and
    nobody has heard of her. Once he does, `newGame.room` is its master bedroom (so sleep,
    home and study in his own room all follow), each love interest who lives there has her
    `room` in it and comes home to it (`residentSchedule`), and each room's view says what
    has been made of it. Everything else reads the content as it always did.
  - **Rent** (`rent`) falls on the first of each month. Short of it, it is carried as
    arrears for `graceDays` and the officer writes; still unpaid, the house is taken back
    (`evict`): everyone goes home, the children go to the creche, and he is back in the
    Halls. There is no second offer.
  - **Rooms** (`rooms`): each has a `role` (`common`, `master`, `nanny` or `suite`), a
    `cost`, whether it `startsBuilt`, what it adds (`beds` for love interests, `cots`,
    `comfort`, `study` toward the own-room study bonus), at most a few `tiers` to fit it out
    further, a rectangle on the `plan` of its floor, and the `viewId` of the house
    location's view that is its picture. The plan on the House screen
    (`src/renderer/src/ui/HousePanel.tsx`) is drawn from those rectangles; there is no plan
    image. A room's picture is generated in the Locations editor like any other view, each
    view having its own `appearance`. Built common rooms are places a scene at home can move
    to (`home-<key>`).
  - **Who lives there**: the nanny (`nannyId`, a love interest who comes with the house),
    and whoever he offers a bedroom to from the plan: a love interest who is carrying his
    child or has borne one, is in a relationship with him, is at `invite.minAffection` or
    more, where a bed is free. She accepts, remembers it as a core memory, and can be asked
    to leave, which she does not forgive and does not come back from.
  - **Babies**: a child whose mother lives in the house lives there too while there is a
    cot, and has a `health` level (`babies.levels`, worst first); any other child is at the
    University's creche and costs nothing. On the first day of each week each child in the
    house costs `babies.weeklyCost`, the one doing worst paid for first. Paid for, it comes
    on a level, as far as the house's comfort allows (`babies.caps`); not paid for, it drops
    a level and its mother's affection and trust fall (`babies.neglect`). At the bottom she
    takes it back to the creche and leaves. No child is ever lost.
  - **Reckoning** (`settleHousehold`) walks every day since it was last done, so a jump of
    several days settles each once. Rent day and the children's week are on the calendar.
  - **The epilogue** has a Home screen, and a mother who lived with him raised the child
    with him.
- **The calendar** opens on the week, laid out by the hour like a diary: the player's
  classes, plans, orientation, events and expected births are blocks where they fall, side
  by side when they overlap. A Month view names up to three things a day; clicking a day
  goes to its week. What each day holds comes from `dayAgenda` in
  `src/shared/game/agenda.ts`.
- **The phone** (the tile that was People) holds the player's apps, down its left edge:
  DMs (his Bloomr conversations, most recent first, with the open thread beside them), Friends
  (a card for everyone he is getting to know, with her handle, what she studies, where
  she is and how things stand, and behind it her record: stage, meters, arrangement,
  pregnancy, memories, and what has been found out about her) and Feed (the Bloomr feed).
  A further app is one entry in `APPS` in `PhonePanel.tsx`. A love interest's `handle`
  is her name on both; left out, one is made from her name.
  - **What there is to know** is drawn from her file (`src/shared/game/facts.ts`): each
    like and dislike, each trait, each stat she is drawn to, what she studies or teaches,
    her age, birthday and room, and each secret. All of it starts unknown.
  - **Finding out**: when a scene ends, each love interest's summary is given the list
    of what the player doesn't yet know of her and names what came out ("do you like
    tea?" "No, coffee"). Those are recorded (`revealed` in the save) and listed on the
    summary screen under "You learned". By message, where there is no summary, the LLM
    has a `reveal_fact` tool for the same. A secret is only on
    the list once its conditions let her share it. A gift she loves or dislikes reveals
    the like or dislike it matched.
- **Bloomr DMs** (`courier` in the code and the save): messaging, inside Bloomr as DMs
  are inside a photo app. There is a thread
  per love interest who has given the player her Bloomr (`contacts` in the save). She gives
  it in a scene by saying or showing her handle, which the game reads in the reply
  (`contactsSaid`): when he asks and she is willing, or unasked
  once she is taken with him (`offersContact` in `src/shared/game/courier.ts`), and failing
  that as they part. Until then she is not in his DMs and never writes first. A message gets
  an answer at once, written by the LLM with a prompt of
  its own (`mode: 'courier'`), and the answer may carry an invitation made with the
  `propose_meeting` tool, to accept onto the calendar or decline. Once a day, from 09:00,
  one love interest may write first with an invitation: the chance is nothing for someone
  with no reason, and grows with appeal and affection (`chanceOfWriting` in
  `src/shared/game/courier.ts`). The last 2,400 characters (about 600 tokens) of the
  exchange are put into the prompt of every scene with that love interest.
- **Bloomr** (`src/shared/game/feed.ts`) is the photo feed: selfies with a caption. It needs
  both the Main LLM (captions) and ComfyUI (pictures) set up; without both there are no
  posts. As each day begins the day is planned by rule (`feedRound`): one to three of the
  love interests whose contact the player has, one or two posts each, at hours of their
  own between 08:00 and 22:00, where each of them will be at that hour, and, four times in
  ten when another love interest will be there too, that friend in the picture. One LLM
  request then writes every caption and a line of what each selfie shows, and each selfie
  is drawn in the background on ComfyUI, one at a time, with the Photo workflow, size and
  framing (`selfiePrompt` in `src/shared/comfy.ts`: her appearance and what she is wearing,
  the friend's, the LLM's line, the place's appearance and the light at that hour). The
  pictures are filed under `generated/photos/<id>/` in the add-on folder. A post is saved
  as soon as its picture arrives but is not on the feed until its hour has passed; one
  whose picture could not be drawn is not made. The feed shows five posts and brings in
  five more each time the reader scrolls to the end. The player can like a post or
  message its author. Her two latest posts that have gone up, and whether he liked them,
  are put into her prompt.
- **Your own activity**: the "Something else?" box on the day view takes anything the
  player types ("invite Seraphine and Faye out for dinner"). The Main LLM turns it into an
  outing: a title, an opening line, who is invited (up to three), where, and for how long
  (`src/shared/game/outing.ts`); without an LLM, names and places are read off the words.
  A dialog then confirms it. Someone in class or not around, a closed place, or a plan
  already made stops it, and the dialog says why and offers to wait until everyone is
  ready, or to go now with whoever is free. Waiting looks one day ahead. Going walks the
  player there, spends the time and opens a scene with everyone invited; with nobody
  invited it only passes the time.
- **Stage effects** are drawn with Phaser 4 on a transparent canvas over the artwork
  (`src/renderer/src/fx/`); everything else is ordinary React. Phaser is loaded the first
  time a stage is shown, and one game instance is kept and moved to whichever screen is up.
  - **Weather**: each kind of weather has an `effect` (`rain`, `storm` with lightning,
    `snow`, `mist`, `wind` with leaves, `motes`, or `none`), drawn over the background and
    behind the characters. A background marked `indoors` in `locations.json` gets none.
  - **Transitions** cover the screen and reveal the new view: a slanted wipe on going
    somewhere else, an iris opening into a scene, a dissolve out of one, and a fade when
    only the time of day has moved on. A transition also ends on a timer, so a covered or
    minimised window can't be left with the cover up.
  - Players whose system asks for reduced motion get neither.
- **The term**: the year has twelve months (364 days, so dates keep their weekday). The
  game is one autumn term of nineteen weeks, from 15 Goldenhay (mid-August) to 25
  Frostveil (late December). The last week is the Winter Break: an event marked
  `noClasses`, during which no course meets. Any event can carry that flag.
- **Weather** is defined under `weather` in `calendar.json`. Each kind has a `chance` per
  month, written as the percentage of days (a temperate pattern: hot dry summers, a wet
  and misty autumn, snow from Frostveil); a kind may instead have a flat `weight` and a
  list of `months`. Each day's weather is fixed for the day and
  differs between games.
- **Place and weather**: every prompt says exactly where the character is (the location,
  the view of it on screen, and whether it is indoors) and puts the weather on her or
  outside the window accordingly. A view or a whole location is marked `indoors` in
  `locations.json`; a view left unmarked follows its location.
- **Moving on, and time passing**: in a scene the LLM has a `move_scene` tool that takes
  the characters and the player somewhere else together. Its one argument is chosen from
  a fixed list: the rooms of the love interests in the scene, then every place that will
  be open on arrival, so the scene can only go somewhere real. The game moves everyone,
  marks what was being done as over (a class, a meal), and
  the next prompt describes the new place. NPC scenes stay put.
- **Time in a scene** is kept by the game. A scene starts with a base: the time its
  opening activity takes (a class's length, an outing's hours), counted before anyone
  speaks. After that the clock moves only when the scene does: `move_scene`
  takes an optional `hours` (whole, up to twelve) for time the characters stayed on
  before leaving: a meal that ran long, an afternoon's study, a night. There is no
  separate tool for passing time. The summary screen shows how long the scene took.
- **Marks and grades** (`grading` in `coursework.json`, `src/shared/game/grades.ts`): every
  course has a hundred points for the player to fill over the term. Sitting a class earns
  them by the hour, so that every class of the term comes to `attendanceShare` (60) of
  them whatever the course's hours; the rest is studied for. The day view's **Study**
  option opens into his courses and then into where: the places in `studyLocationIds`,
  his own room, and the room of any love interest he has met who takes the course. A
  session is two hours for energy and `studyPerHour` points an hour, one more in his own
  room; somewhere public it is a scene with whoever is there, in a classmate's room a scene
  with her, and in his own room no scene. The midterm and the final fall in `midtermWeek`
  and `finalWeek` and each takes the place of the course's last class of that week. Those
  two weeks have no lectures or labs at all: every course meets only in that one slot, for
  the player and for everyone else, and the weeks are left out when an hour of class is
  valued. In the slot itself there is nothing to attend and no scene, and when the hour is over he is graded on the points
  he has, the midterm against the part of the term gone by and the final against the whole.
  `passAt` (0.6) of those is a pass and a D; C, B and A come at seven, eight and nine
  tenths. Grades are kept in the save under `grades`, by course, for later systems to use.
- **Raising a stat**: each location lists what can be done there for a stat (`drills` in
  `locations.json`: a stat, a title and an opening line; edited under Locations). The day
  view's **Stats** option opens into one suggestion for each of the six stats, picked from
  every place that has one for it, preferring those open when he would arrive, and
  changing from hour to hour. Taking one is a two-hour outing that is always two hours of work on that
  stat, for energy. With love interests at the place when he arrives it is a scene: he
  runs into one or two of them, picked at random, and the scene's summary lists what the
  work did. With none there he is alone, whoever works at the place: no scene, and a toast
  says what it did. Studying for a course works the same way. The confirmation says
  first what he would miss by going, a class he is taking or a shift at his job, as it now
  does for anything the player sets out to do. The stats a place has drills for are also
  what it counts as a good place to work on.
- **Jobs** (`jobs.json`, `src/shared/game/jobs.ts`): a job is a place, a boss (an NPC), an
  hourly rate, the stats it asks for and its weekly shifts, 8 to 16 hours of them, which are
  written in the content so that a job is the same in every game. The phone has a Jobs
  board: whoever meets a job's requirements is taken on at once, one job at a time, and
  better-paid jobs ask more. Being taken on puts the boss in his DMs. A shift is clocked
  in for at the place while it is on, like a class, and is a scene: the boss is there, and
  so is any love interest who happens to be at the place. It keeps him until the shift
  ends, costs energy by the hour, and pays when the scene is over. A shift that ends
  without him is a strike, or half of one if he messaged his boss that day before it began
  (she records it with the `excuse_shift` tool); at three he is let go. He may quit at any
  time. A job he has quit or lost will not have him back. Shifts may overlap his classes;
  the board says where they do.
- **The lecture**: a class scene opens with the teacher teaching. The first reply of a
  class is asked for with a prompt of its own (`lessonCue` in `src/shared/game/prompt.ts`):
  five to eight beats, most of them the teacher speaking to the room about the course's
  subject, with a line of narration and perhaps an aside from whoever sits beside the
  player, ending on something he can answer. The teacher speaks under her own name when
  she is a love interest sitting in the scene, and under the course's professor otherwise,
  shown as a name on the text box with no face. After it, replies are their usual length.
- **What is next** (`src/shared/game/upcoming.ts`): the day screen puts the next thing on
  the player's timetable today at the head of what he can do: the soonest of the classes
  he takes, his shift, and the plans he has made (`nextUp`). Taking it skips the hours
  until it starts, puts him at the place, and begins it as if he had turned up on time.
  When he could not go through with it (too tired for the class, say) it is a note with
  the reason and not a button. An examination is not offered: it is sat without him.
- **The epilogue** (`src/shared/game/epilogue.ts`, `EpilogueView.tsx`): when the last day of
  the calendar is over, the day screen gives way to the epilogue, a screen of text at a time
  that fades in over a placeholder backdrop. Nothing in it is written by the LLM. First his
  studies: failing, getting by or excelling, from the final grade in each course he took
  (the final he sat, or what his marks would earn if the year ended first), with the grades
  listed. Then a screen for each arrangement whose status is `committed` in
  `relationships.json` (every one but lovers without promises). Then a screen for each love
  interest who carried his child during the year: the children she bore, and for one still
  to be born, a daughter or a son by `daughterChance`; she was overjoyed if they are
  together or she is at least as fond of him as a friend, and raised the child by herself
  otherwise. A click, Space, Enter or the right arrow goes on; the left arrow goes back.
- **Sleep and ending the day** (`src/shared/game/sleep.ts`): midnight to 06:00 is for
  sleep and nothing else. Nothing the player sets out on may start in those hours or run
  into them (rest aside), and whenever the clock stands in them with no scene open, he
  sleeps until 06:00. **End the day** on the day screen does the same from any hour: it
  lists the classes, shift and plans still to come that he would miss, asks, and then
  skips straight to 06:00 the next morning. Either way he wakes with full energy, at home:
  the place his room is in, or where a new game starts him. What
  was skipped is settled as usual: a missed shift is a strike, a missed exam is graded
  on the points he has.
- **How she feels afterwards** (`src/shared/game/memory.ts`): affection, trust and desire
  are not earned by the hour. When a scene ends, the same request that writes each love
  interest's memory of it asks how the scene changed what she feels for the player: a
  change in each of the three from -10 to 10, and a sentence of why, as one JSON object.
  She is asked to judge as herself, and is given her personality and traits, what she
  admires and whether he has it, where the two of them stand, her last comfort reading,
  whether she walked out, any gifts, and the whole conversation; nothing is owed for
  turning up, and a scene that left no mark is 0. The changes are applied when the scene
  closes and the reason is shown on the summary. Nothing else moves the three but a gift,
  which keeps its own effect: sitting a class together, keeping a plan, an invitation,
  orientation and the activities that are scenes no longer hand out fixed amounts. An NPC
  is asked for a memory only. Without an LLM she comes away a point fonder and no more.
- **Going back a turn**: in a scene the player can look back over the conversation and say
  something else. Stepping back past the first beat of a reply (wheel up or the left arrow
  over the text box) shows the end of the reply before it, where his turn was, with the
  line he said then in the input; further back goes to the turn before that, and the
  wheel down comes forward again. Looking undoes nothing. Only when he sends a line from
  there is everything from that turn on erased: the scene and the game go back to how
  they stood before he spoke (time, place, who is there, what was learned or given) and
  the scene goes on from the new line. Up to thirty turns back can be redone. The turns
  are kept in the save with the scene (`turns`, `src/shared/game/turns.ts`), each as only
  what it changed in the game and the scene and how long the conversation was before it,
  so a scene loaded from a save can be gone back over just the same.
- **What he spent**: nothing in a scene takes the player's money as it happens. When the
  scene ends, a request alongside the memories asks what he himself paid for, from what
  was said ("the drinks are on me"), and what it came to, priced as US dollars would be
  (`buildSpendingPrompt` in `src/shared/game/memory.ts`). It is taken from his money, in dollars, never
  more than he has, and shown on the summary with what it went on. Gifts are left out,
  having been paid for when bought; no answer, or one that cannot be read, costs nothing.
- **Comfort**: every reply carries a hidden line for each love interest in the scene,
  `[COMFORT: 3 a few words why]` (or `[COMFORT: Name=3 ...]` in a group): how much she
  wants to be there, from 5 down to 1, and her reason. It is kept on the scene and given
  back to her in the next prompt, and it is for the LLM alone: nothing in the game shows
  it or acts on it. The prompt tells her to judge it from her nature and what is going on
  (pressure from the player, what he and another woman are doing in front of her, a class
  starting within two hours, which the game tells her about), to let a low reading show,
  and at 1, or two replies at 2, to leave: by ending the scene, or in a group with
  a `[LEAVES: ...]` line while the rest carry on. This is what lets a scene end without the player
  asking.
- **Leaving a scene**: in a scene with more than one love interest the LLM can write
  `[LEAVES: Name=feeling why]`: one or more of them go, and the scene carries on with the rest. It
  is for when the player has turned to one of them and the others would drift off, when
  someone has somewhere to be, or when someone walks out. Someone always stays, and if the
  one leading the scene goes the next takes her place. Whoever leaves is content, hurt or
  angry; how she went is told to her when the scene is summed up, and tells in what she feels afterwards. She is on screen for her parting line and
  gone after it, keeps a memory that stops where she left, and is on the summary screen
  with the rest.
- **Rooms**: a love interest has a `room` (what it is, a description for the LLM, the
  location it is in, and optionally a `background` picture of its own). A scene that
  moves there is told it is private and indoors, and shows the room's picture when there
  is one. Going up to a room from the location it is in takes no time. Rooms are edited
  on the Profile tab of the editor.
- **Appearance**: during a scene the prompt lists the character's outfits, each outfit's
  sprites, and their animations, with every name and description. The LLM decides when
  each fits and switches with hidden tags at the end of a reply: `[OUTFIT: id]`,
  `[EXPRESSION: name]`, `[SEX-ACT: id]` and `[SEX-ACT: none]` (`[POSE: ...]` and `[ANIMATION: ...]` are still read). A sex-act is chosen on top of the face and
  outfit, not in their place, and is drawn as a layer over the background and the sprites. It lasts one reply: the next
  reply takes it down unless it asks for it again. An animation is a
  looping video that takes the sprite's place until it is stopped or the character goes
  back to a sprite. There is no NSFW switch on any of this; the descriptions are all the
  LLM has to go on, so write them specifically.
  - A sprite is either a path, `"happy": "sprites/x/happy.png"`, or
    `"happy": { "image": "sprites/x/happy.png", "description": "laughing, head tilted" }`.
  - An animation is
    `{ "id": "...", "name": "...", "description": "...", "image": "...png", "clip": "...mp4" }`:
    a picture first, and optionally a clip played in its place. The editor calls this
    section NSFW and lays it out as an outfit's faces are, with a slot for each standard
    sex-act (`NSFW_POSES` in `src/shared/model/loveInterest.ts`) and the same Generate and
    "Generate missing" buttons; the pictures are drawn at 1920×1080 with the NSFW picture
    workflow, size and framing set under ComfyUI setup (`nsfwPrompt` in `src/shared/comfy.ts`)
    in the love interest's `animations` list.
- **Memories**: ending a scene asks the LLM for a one- or two-sentence summary (what they
  did, in order, and what the character remembered most). Only that summary is kept; the
  transcript is discarded. The LLM also rates each memory **Core** (a moment that defines
  what they are to each other: a first kiss, a confession, a betrayal), **Normal** or
  **Fleeting**, and the player can change the rating, as well as the wording, on the summary
  screen. A character is told at most eight of her memories in a scene, core first, then
  normal, then fleeting, and the most recent first within each (`selectMemories` in
  `src/shared/game/memory.ts`). A memory saved before levels existed counts as normal.
  If the LLM is unavailable, a plain note built from the activity list is saved instead.

## Outfits and faces

Every love interest has four standard outfits (`STANDARD_OUTFITS`): `default`, `pregnant`,
`nude` and `nude-pregnant`. The pregnant two are worn once a pregnancy shows, in place of
the other two. She may have more besides. Each outfit can be drawn with seven faces
(`EXPRESSIONS`): neutral, happy, sad, angry, surprised, embarrassed, aroused. An outfit's
`sprites` are keyed by face; any other key is a picture of some other kind, shown to the
LLM only if it has a description.

- **In a scene** the LLM must begin every reply with a face for each love interest in it:
  `[EXPRESSION: happy]` alone with one, `[EXPRESSION: Faye=happy]` on a line each in a
  group. A change of clothes is `[OUTFIT: nude]` or `[OUTFIT: Faye=nude]`. The tags are
  taken out before the reply is shown. The lead's look is kept on the scene and the others'
  in `scene.looks`, so everyone on stage is drawn as she was last given. A reply that leaves
  a face out keeps the last one; nothing but the prompt makes the LLM write it.
- **Standing in** (`spriteFor` in `src/shared/game/looks.ts`): a face that has not been drawn
  shows the outfit's neutral one, and an outfit with no pictures borrows from the same state
  of dress not pregnant, then from her usual clothes. So content can be filled in a picture
  at a time.
- **The sprite editor** shows every outfit's seven faces as slots to upload or generate into.
  NPCs keep free-form outfits and are not given faces by the LLM.

## Character editor

"Edit game content" on the title screen opens the editor, whose sides are down a rail on
the left: **Characters**, **Locations** and **Courses**. Characters lists love interests
and NPCs together. A character's **Kind** is one of student, teacher, another love
interest, or NPC; an NPC is shown fewer fields (a role and what she knows, and no traits,
likes, friends, room or secrets). Everyone is saved to the add-on folder as
`love-interests/<id>.json`; one with a built-in character's id takes that character's
place, and deleting the add-on puts the original back.

## Art tool (ComfyUI)

The content editor's **Media** tab can draw a character's sprites on your own ComfyUI.
Pick the character first; then "Generate a picture" on an outfit, or "Generate" on a sprite
to draw it again, opens the art tool on that outfit and expression. It is a tool you call
directly: nothing in a scene ever calls it, and it talks only to the address you give it.

- **The tool** (`src/renderer/src/ui/art/ArtTool.tsx`) is a dialog any editor screen can
  open with a target: a sprite of a character, a background, or a photo. The Media tab
  opens it for sprites, of love interests and NPCs alike, and a love interest's room opens
  it for a background: her room's picture can be uploaded, generated from the room's
  description, or set to one of the views of the place the room is in. Photos have no
  screen that opens the tool yet.
- **ComfyUI setup** (a tab in the tool, and the editor's own ComfyUI side; the game's Settings keep only the server and the game's workflows and models, which a player needs): the server address (with a Test button that names
  the machine that answered) and how long to wait.
- **The workflows** are the game's own, in `content/default/comfy/`, and are run from
  there: nobody points the game at a folder. To add one, export it with ComfyUI's
  *Workflow → Export (API)* into that folder; one saved the ordinary way cannot be run, and
  is listed with that reason. `bundle.json` beside them holds what the game says of each
  (its prefixes, its bindings, what it is the default for) and of each kind of picture and
  clip, and `downloads.json` the models and node packs they call for.
- **Reading a workflow** (`src/main/comfy/graph.ts`): the app follows the graph's wiring from
  the sampler to find where the prompt, negative prompt, width, height and seed are written
  and which node's picture to collect. Each can be repointed by hand under "Where things
  go", or left as the workflow has it.
- **Prefixes**: each workflow has its own prompt prefix and negative prefix (model tokens,
  quality tags, LoRA triggers), put in front of whatever is sent through it.
- **Kinds**: sprite, background and photo each have a default workflow, a size, and framing
  words that close every prompt of that kind ("three-quarter shot from knees up", "plain white
  background"). A prompt is laid out in paragraphs: workflow prefix, body, clothing, framing, face.
- **The prompt** is written from the character's `appearance` and the outfit's
  `description`, which is why those fields hold only what can be drawn. It can be edited
  before sending. Pictures are saved in the add-on folder and never replace one another.
- **Video clips**: a sex-act in the NSFW section that has its picture can have its clip made
  from it ("Generate a clip" under the picture). The picture is uploaded to ComfyUI and
  written into a video workflow as its first frame, and with "Looping video" ticked, as
  its last as well, so the clip goes round without a jump; unticked, the workflow's last
  frame is unplugged and the clip is set to play once when it is put on the sex-act. A workflow is a video workflow when it has somewhere
  to put a first frame (the `first_frame` / `start_image` input of its video node, followed
  back to the node that loads the file); such a one is offered only for clips, and has its
  own "Default for" tick. The prompt is not written from the character, since the picture
  already shows her: it is the one kept for the sex-act (`videoPromptFor` in
  `src/shared/comfy.ts`), edited for every character under ComfyUI setup → Video clips,
  and a sex-act drawn pregnant shares the prompt of the sex-act it is built on. The clip's size
  and length are the workflow's own. The clip is saved beside the picture as an `.mp4`,
  and clips have a time limit of their own, since they take far longer than a picture.
- **Using a picture**: "Use as the sprite" puts it on the outfit under that expression in
  the editor's draft; saving the character keeps it, like any other edit.
- **Locations** (Edit game content, Locations): each of the game's places can be changed
  there: its name, its two texts, opening hours, whether it is indoors or private, what it
  is a good place to work on, and its pictures. `description` is what the LLM is told in a
  scene there (what the place is and what goes on in it); `appearance` is only what can be
  seen, and is sent to the image model and nothing else. A place has views, as a character has
  outfits (the first is shown unless the player picks another), and each view is drawn
  twice, by day and by night, as an outfit is drawn once for each expression; whichever
  has not been drawn shows the other. Each period of the calendar is marked `light: day`
  or `night` (evening and night are dark). Either picture can be uploaded or generated
  from the appearance, and one button draws whichever a view is missing. A changed place is saved to `locations/<id>.json` in the add-on folder and
  laid over the game's own; "Put back the original" removes it. Places cannot be added
  there, since a place has to be on the map to be reached.
- **Cutting out** (`src/main/comfy/backgroundKey.ts`): takes the flat background out from
  behind a sprite, working inward from the edges so white inside the figure is left alone;
  a second mode also clears gaps the art has closed around. The cut-out is a new
  `-cutout.png` and the picture it was made from is deleted. Available on a generated
  picture in the tool, and as "Cut out" on any PNG sprite in the add-on folder.
- Settings about this computer (the address, where the models are, how long to wait) are
  kept in `comfy.json` in the app's user data folder. Settings about a workflow, a kind of
  picture or a clip are the game's, in `content/default/comfy/bundle.json`: with the
  game's own files being edited, the editor writes changes there, and otherwise a player's
  changes go into their `comfy.json`, which holds only what differs from the game's.

## Money

Wages, the rent, a child's keep and the price of every room of the house are balanced
against each other, and `src/main/content/economy.test.ts` pins the balance: any job
keeps the house and one child with care, a strong player can build most of it, and a
whole year at the best wage does not buy the lot. Change a number in `jobs.json` or
`housing.json` and that test says whether the balance still holds.

## Drama

The drama engine (`src/shared/game/drama.ts`, tuned by `content/default/drama.json`) brings the
unexpected into scenes the player starts: an activity with someone, a kept appointment, an
outing. Classes, orientation and talks with NPCs are left alone.

- **Planning**: as the scene begins, every love interest who is not in it is scored for each
  way she could interrupt it. A `confrontation` needs a claim on the player (a promise to see
  only each other counts most, dating with nothing said less, an open arrangement least),
  scaled by how much of a date the scene is, plus her traits (`drama.jealousy` on a trait:
  jealous and obsessive raise it, easygoing and promiscuous lower it), whether she and his
  date are enemies or friends, how much she wants him, and how many others also have a
  claim. A `rival` is an enemy of his date; a `friend` is a friend of hers, likelier if the
  player has not met her. Being at the same place adds to any score. None of this needs a
  date: time spent with anyone, studying or over a drink, can be interrupted.
- **Private places**: a location marked `private` in `locations.json` (the residence halls)
  and any room of someone's own are never interrupted. Nothing is planned for a scene that
  starts there, and someone on her way does not arrive if the scene has moved there since.
  Every other location is public.
- **Chance**: the strongest score plus a quarter of the rest, over `divisor`, capped at
  `maxChance`. A plain date is interrupted now and then, mostly by a friend; juggling
  several lovers who do not know approaches the cap. After any drama there is none for
  `cooldownDays`. The roll is seeded, so the same moment of the same game goes the same way.
- **Firing**: the plan sits on the scene (`scene.drama`). A friend is as likely as not
  (`broughtAlong`) to have simply been brought along, and is then in the scene from its first
  moment. Anyone else arrives after one to three of the player's lines: she joins the scene's company, with a beat whose direction tells the LLM who has
  walked in and why, in the same terms that scored. From there it is an ordinary scene with
  several people in it: expressions, friends and enemies, leaving and its costs, and a
  memory for everyone who was there.
- The engine decides who, as what and when. It keeps no record of who has found out about
  whom and changes no meters itself; what comes of it is the LLM's to play.

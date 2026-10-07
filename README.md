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
- **The map** (`map.json`) has a pin per location, placed over an `image` or, without one,
  on a plain chart with labelled `regions` (the default pack's campus and city). It shows which love
  interests their schedules place at each location right now, and going to a location
  costs the map's travel time. Activities tied to a location can only be done there, and
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
  both be taken. While a course meets, everyone taking it is at the Lecture Halls.
  Attending a meeting lasts until it ends, and is worth `statGain` stat points and costs
  `energy` for each of its hours, so a lab is worth three lectures.
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

## Content editor and add-ons

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
- **Sprites**: outfits and their pictures with a name and description each, the default
  outfit, the pregnant flag, the portrait crop, and animations. Adding a picture or video
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
  - `roll` leaves something to chance: dice in the usual notation (`d6`, `2d6+3`, `d20`,
    `d100`) or a whole number from `min` to `max`. The game does the rolling
    (`src/shared/game/dice.ts`), the model is told the result, and the text box shows the
    roll under the reply. It is not offered in scenes at present: the tool is kept in
    `tools.ts` for card and dice games, wagers and skill checks later.
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
  class scene when the player attends. Orientation introduces students and teachers, not
  outsiders. Left out, the kind is read off which of `studies` and `teaching` is present.
- **NPCs** are people to talk to and work for who are not love interests. They are
  characters like any other, written the same way in the same folder
  (`love-interests/<id>.json`) and told apart by `"kind": "npc"`; only an id, a name,
  an age and an outfit are needed, and everything else has a default. An NPC has a `role`
  and, under `ai`, `knowledge` (what she can tell the player). Once the pack is loaded the
  NPCs are held apart in `content.npcs`, so that everything to do with romance (meters,
  gifts, messages she starts, drama, Bloomr, orientation) has only love interests to look
  at. Changing an NPC's kind is all it takes to make a love interest of her: her look,
  voice, memories, Chats and job all carry over.
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
- **Pregnancy**: `pregnancy.json` (optional) sets the rules: the `chance` of conceiving,
  `lengthDays`, `recoveryDays` after a birth, `daughterChance`, and the `stages` (each from
  a fraction of the way through, with a description for the character and whether it
  shows). A love interest can carry for a different time (`pregnancyDays`).
  - **Conception**: in a scene the LLM writes a hidden `[SEEDED]` tag (`[SEEDED: name]` in
    a group) when sex ends in a way that could leave her with child. The game then throws
    the dice: one throw a day for each woman. If it takes, she knows at once, the next
    reply's prompt tells her so, and the scene's summary says it.
  - **Carrying**: her prompt gives the day, the stage and its description; once it shows,
    the others are told too, and she wears an outfit marked `pregnant` if she has one.
    The character panel and the calendar show the stage and the due date.
  - **Birth**: when the time is up the child is recorded (`children` in the save), the
    day view says so, and she sends word by courier. Her prompt and the others' mention
    the child from then on. The `pregnant` condition lets activities, secrets and codex
    entries depend on it.
- **The calendar** opens on the week, laid out by the hour like a diary: the player's
  classes, plans, orientation, events and expected births are blocks where they fall, side
  by side when they overlap. A Month view names up to three things a day; clicking a day
  goes to its week. What each day holds comes from `dayAgenda` in
  `src/shared/game/agenda.ts`.
- **The phone** (the tile that was People) holds the player's apps, down its left edge:
  Chats (the conversations, most recent first, with the open thread beside them), Friends
  (a card for everyone he is getting to know, with her handle, what she studies, where
  she is and how things stand, and behind it her record: stage, meters, arrangement,
  pregnancy, memories, and what has been found out about her) and Updates (Bloomr).
  A further app is one entry in `APPS` in `PhonePanel.tsx`. A love interest's `handle`
  is her name on both; left out, one is made from her name.
  - **What there is to know** is drawn from her file (`src/shared/game/facts.ts`): each
    like and dislike, each trait, each stat she is drawn to, what she studies or teaches,
    her age, birthday and room, and each secret. All of it starts unknown.
  - **Finding out**: in a scene or a note the LLM has a `reveal_fact` tool listing what
    the player doesn't yet know of the love interests present. When a reply tells or shows
    one ("do you like tea?" "No, coffee"), it names it and the fact is recorded
    (`revealed` in the save), with a "Learned:" line under the reply. A secret is only on
    the list once its conditions let her share it. A gift she loves or dislikes reveals
    the like or dislike it matched.
- **Chats** (`courier` in the code and the save): messaging. There is a thread
  per love interest who has given the player her Chats (`contacts` in the save). She gives
  it in a scene with the `give_contact` tool: when he asks and she is willing, or unasked
  once she is taken with him (`offersContact` in `src/shared/game/courier.ts`), and failing
  that as they part. Until then she is not in Chats and never writes first. A message gets
  an answer at once, written by the LLM with a prompt of
  its own (`mode: 'courier'`), and the answer may carry an invitation made with the
  `propose_meeting` tool, to accept onto the calendar or decline. Once a day, from 09:00,
  one love interest may write first with an invitation: the chance is nothing for someone
  with no reason, and grows with appeal and affection (`chanceOfWriting` in
  `src/shared/game/courier.ts`). The last 2,400 characters (about 600 tokens) of the
  exchange are put into the prompt of every scene with that love interest.
- **Bloomr** (`src/shared/game/feed.ts`) is the feed. Once a day, from 08:00, up to three
  love interests post (always at least one), and the Main LLM writes all of that day's
  posts in one request, each in her voice and about her own day; without it a post only
  says where she is. A post is text, with an optional `image` path that the feed shows
  when present (nothing sets one yet). The player can like a post or message its author.
  Her two latest posts, and whether he liked them, are put into her prompt.
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
  adds the walk to the clock, marks what was being done as over (a class, a meal), and
  the next prompt describes the new place. NPC scenes stay put.
- **Time in a scene** is kept by the game. A scene starts with a base: the time its
  opening activity takes (a class's length, an outing's hours), counted before anyone
  speaks. After that the clock moves only when the scene does: `move_scene` adds the walk,
  and takes an optional `hours` (whole, up to twelve) for time the characters stayed on
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
  and `finalWeek` and each takes the place of the course's last class of that week: there
  is nothing to attend and no scene, and when the hour is over he is graded on the points
  he has, the midterm against the part of the term gone by and the final against the whole.
  `passAt` (0.6) of those is a pass and a D; C, B and A come at seven, eight and nine
  tenths. Grades are kept in the save under `grades`, by course, for later systems to use.
- **Raising a stat**: each location lists what can be done there for a stat (`drills` in
  `locations.json`: a stat, a title and an opening line; edited under Locations). The day
  view's **Stats** option opens into one suggestion for each of the six stats, picked from
  every place that has one for it, preferring those open when he would arrive, and
  changing from hour to hour. Taking one is a two-hour outing that is always two hours of work on that
  stat, for energy, and is a scene with whoever is there when he arrives: love interests
  at the place, or failing them an NPC who works there, or nobody. The confirmation says
  first what he would miss by going, a class he is taking or a shift at his job, as it now
  does for anything the player sets out to do. The stats a place has drills for are also
  what it counts as a good place to work on.
- **Jobs** (`jobs.json`, `src/shared/game/jobs.ts`): a job is a place, a boss (an NPC), an
  hourly rate, the stats it asks for and its weekly shifts, 8 to 20 hours of them, which are
  written in the content so that a job is the same in every game. The phone has a Jobs
  board: whoever meets a job's requirements is taken on at once, one job at a time, and
  better-paid jobs ask more. Being taken on puts the boss in his Chats. A shift is clocked
  in for at the place while it is on, like a class, and is a scene: the boss is there, and
  so is any love interest who happens to be at the place. It keeps him until the shift
  ends, costs energy by the hour, and pays when the scene is over. A shift that ends
  without him is a strike, or half of one if he messaged his boss that day before it began
  (she records it with the `excuse_shift` tool); at three he is let go. He may quit at any
  time. A job he has quit or lost will not have him back. Shifts may overlap his classes;
  the board says where they do.
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
- **Comfort**: every reply carries a hidden line for each love interest in the scene,
  `[COMFORT: 3 a few words why]` (or `[COMFORT: Name=3 ...]` in a group): how much she
  wants to be there, from 5 down to 1, and her reason. It is kept on the scene and given
  back to her in the next prompt, and it is for the LLM alone: nothing in the game shows
  it or acts on it. The prompt tells her to judge it from her nature and what is going on
  (pressure from the player, what he and another woman are doing in front of her, a class
  starting within two hours, which the game tells her about), to let a low reading show,
  and at 1, or two replies at 2, to leave: by ending the scene, or in a group with
  `leave_scene` while the rest carry on. This is what lets a scene end without the player
  asking.
- **Leaving a scene**: in a scene with more than one love interest the LLM has a
  `leave_scene` tool: one or more of them go, and the scene carries on with the rest. It
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
likes, friends, room, secrets or stage notes). Everyone is saved to the add-on folder as
`love-interests/<id>.json`; one with a built-in character's id takes that character's
place, and deleting the add-on puts the original back.

## Art tool (ComfyUI)

The content editor's **Sprites** tab can draw a character's sprites on your own ComfyUI.
Pick the character first; then "Generate a picture" on an outfit, or "Generate" on a sprite
to draw it again, opens the art tool on that outfit and expression. It is a tool you call
directly: nothing in a scene ever calls it, and it talks only to the address you give it.

- **The tool** (`src/renderer/src/ui/art/ArtTool.tsx`) is a dialog any editor screen can
  open with a target: a sprite of a character, a background, or a photo. The Sprites tab
  opens it for sprites, of love interests and NPCs alike, and a love interest's room opens
  it for a background: her room's picture can be uploaded, generated from the room's
  description, or set to one of the views of the place the room is in. Photos have no
  screen that opens the tool yet.
- **ComfyUI setup** (a tab in the tool): the server address (with a Test button that names
  the machine that answered), the folder your workflows are exported to, and how long to
  wait. Workflows must be exported with ComfyUI's *Workflow → Export (API)*; one saved the
  ordinary way cannot be run, and is listed with that reason.
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
- Settings are kept in `comfy.json` in the app's user data folder.

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
  several people in it: expressions, friends and enemies, `leave_scene` and its costs, and a
  memory for everyone who was there.
- The engine decides who, as what and when. It keeps no record of who has found out about
  whom and changes no meters itself; what comes of it is the LLM's to play.

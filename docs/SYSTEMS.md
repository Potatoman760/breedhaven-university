# Breedhaven: how the game works

The reference for every system: what it does, the rules it follows, which content file tunes it and which code runs it.
Read the section for a system before changing it. For what the game is and how to run it, see the [README](../README.md).

- [Layout](#layout)
- [Game concepts](#game-concepts)
- [Saves](#saves)
- [Achievements](#achievements)
- [Content editor and add-ons](#content-editor-and-add-ons)
- [Languages](#languages)
- [AI](#ai)
- [Outfits and faces](#outfits-and-faces)
- [Character editor](#character-editor)
- [Art tool (ComfyUI)](#art-tool-comfyui)
- [Events](#events)
- [Story beats](#story-beats)
- [Cards](#cards)
- [Sound](#sound)
- [Money](#money)
- [Drama](#drama)

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
  day view, scene view and dialogs.

## Game concepts

- **Time** is one integer: hours since the game began. The calendar config (month names and
  lengths, weekday names, hours per day, named periods, holidays, game length) turns it into
  an in-world date, so fantasy calendars need no code changes.
- **Calendar events** (holidays, festivals, fairs) have a start date, a length in days and
  an optional location. Authored ones live in `calendar.json` and can recur every year;
  the Main LLM can also invent upcoming ones during play, which are stored in the save.
  Characters are told about today's events and those in the next week, and activities can
  require an authored event with an `event` condition.
- **The map** (`map.json`) is one painted `image` filling the screen, with a gold medallion pin
  per location at `x`/`y` (percent of the picture) and `regions` as names lettered over it. Faces
  beside a pin show which love interests their schedules place there right now; clicking a pin
  opens its card with Go. Locations with no pin (his house) are listed in a corner. Going to a location takes
  no time. Activities tied to a location can only be done there, and
  shared activities only with someone who is at the player's location.
- **The market and the shops** (`stalls.json`, `items.json`) sell gifts. A stall belongs to
  a location: where the player is has stalls, the Market tile reads Shops and opens them;
  anywhere else it walks to the first stall's location, the market. Each stall is a tab; each item
  has an icon, a price and tags. A gift can be handed over in any scene: it is loved if one
  of its tags is in the person's `likes`, disliked if one is in their `dislikes`, and the
  affection it earns is `gifts` in `relationships.json`, which the default pack leaves out, so the
  schema's defaults hold (`GiftValuesSchema`: loved +6, liked +2, disliked −3). The character is told
  what they were given and how they feel about it.
- **The curriculum** (`curriculum.json`, `src/shared/model/curriculum.ts`) is everything the
  University teaches, written down: its colleges, the subjects in them, and each subject's
  courses, each with its number, title, description, the six topics of its syllabus and the
  one skill it teaches. A course's number (`"number": "132"`, shown as `BUS 132`) is a label
  in the 100s, not a year: there are no levels, and any student may take any course. Nothing
  makes a subject up while a game is played. A character's file names what she studies (`"studies": { "major":
  "POL", "level": 1 }`, the level being her year, background only) or the courses she gives
  (`"subjects": [{ "major": "WOM", "number": "101" }]`), and the rest is filled in from the
  curriculum when the pack is read (`resolveCurriculum`), which also draws out of it the
  general subjects, `content.syllabus` and `content.skills`. The editor offers subjects and
  courses from a list, and saves a character with only the names. A subject is `general`
  when it is open to all and nobody reads it; a single course of a subject that is read can
  be `general` too (the Women's Studies course every student passes through). The game's
  own is edited by hand, like the codex.
- **Subjects of one's own** are made on the editor's **Majors** side: a subject, its code
  (two to four capitals), its college (or a new one), the stats it trains, whether it has a
  lab, and at least two courses (`MAJOR_COURSES`), each with six topics, a question for
  each, and the skill it teaches. "Draft with AI" asks the main LLM for the lot from a
  subject, a college and a few notes (`src/shared/game/draftMajor.ts`); the draft is checked
  and put in the form to be read and changed, and only saving keeps it. A subject made
  this way is kept in the add-on folder's `curriculum.json` (in `content/default/curriculum.json`
  when the game's own files are being edited), is laid over the game's curriculum before any
  character is read, and is offered wherever a subject is. It cannot be deleted while
  anyone reads or teaches it. The game's own subjects are shown and not changed there.
- **Coursework** (`coursework.json`) holds the rules of the timetable, and **the catalogue**
  (`catalogue.json`) is the term laid out: which of the written courses are given, who
  gives each, when each meets and who is in it. It is built by rule, with no LLM
  (`buildCatalogue` in `src/shared/game/catalogue.ts`), the same every time for the same
  seed and characters. It is built again by itself whenever a save in the editor changes
  who studies or teaches what, and when the game starts on add-ons it is out of date for,
  with the seed it had (`rebuildCatalogue` in `src/main/content/addons.ts`); a game already
  under way keeps the classes it started with, and a new character has hers from the next
  new game. It can also be built in the editor (Edit game content, Courses) or with
  `npx jiti scripts/build-catalogue.ts`. On disk it holds only what was worked out (`id`,
  `professor`, `teacherId`, `studentIds`, `meetings`); what a course is called and teaches
  is put back from the curriculum. A `catalogue.json` in the add-on folder is read in place
  of the game's own, and is removed again once the add-ons no longer change the term.
  - **Which courses are given**: every course of a subject a love interest studies, every
    course one teaches, and every general one. The rest are written and dormant
    (`dormantCourses`): they are what a new character can be given. A student sits two
    courses of her subject (`MAJOR_COURSES`), one nobody teaches before one a love interest
    does and the emptiest first, then two electives from any other subject (`ELECTIVES`),
    whatever her year. Every major has at least two courses written for it.
  - **Meetings**: every course has `lecturesPerWeek` lectures of `lectureHours`, on
    different days. A subject marked `practical` also has one lab of `labHours`.
  - **Slots** are given out one meeting at a time, each to the hours between `dayStart`
    and `dayEnd` with the fewest classes already in them, so the week fills before
    anything overlaps. After that classes share hours, but never two of one major, and
    never two that the same love interest teaches.
  - **Professors**: a love interest gives the courses she is down for. Each other subject
    has one professor from the `professors` list.
  - **Classmates**: each student takes her own subject's course and two more that do not
    clash with it: a general course, another subject's first year, or a class a love
    interest teaches. They are given out turn about, a teacher's empty class first, then
    an empty general course, then one where she would have company. A class holds at most
    `maxPerClass` (2) love interests, its teacher counted; those who read its subject sit
    it regardless, up to `maxMajorClass` (3). A course nobody ends up in is not given.
  - **Sections**: a student who finds no room in a course she needs, or no elective that
    fits, has a second section of it opened (`course-pol-101-2`, shown as "POL 101
    (section 2)"), taught by the subject's professor and meeting at hours clear of hers.
    So classes grow with the roster, and there is no limit to how many characters can be
    added to any subject. A section is the same course: its `courseId` names the written
    one, whose syllabus and skill it shares, and nobody, the player included, takes two
    sections of one course.
  The title screen warns when the saved catalogue is out of date (a character's subject or year
  has changed since) and it was not built again. At the start of term the player picks `minCourses` to `playerMaxCourses` (4 to 5; both default to `maxCourses`, the love interests' load) on a week
  planner, a column per day and a row per hour; two courses whose hours overlap cannot
  both be taken. Until the end of day `changeUntilDay` of term (13, the Saturday of week 2,
  pinned in `catalogue.test.ts`) Change classes on the calendar opens the same planner on the
  classes he has (`changeClasses` in `src/shared/game/courses.ts`): only a load in that range with no
  two classes at once is checked, nothing else he has on, and his calendar shows the new week
  as soon as it is saved. What he earned in a course he drops is kept, should he take it back. While a course meets, everyone taking it is at the Lecture Halls, and
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
- **Codex** entries reach the AI only when unlocked and relevant: always-on (only the opening
  world entry is), or mentioned by title or keyword in what has been said in the scene so
  far, within a budget. Where the scene is and who is in it bring nothing in.

## Saves

- The title screen offers **Continue** (the most recently written save), **New Game** and
  **Load**. In game, **Save** and **Load** open the slot list.
- There are forty manual slots, shown eight to a page (`MANUAL_SLOTS`, `SLOTS_PER_PAGE` in
  `src/shared/saves.ts`), plus an **autosave**, which is rewritten after every change. The
  autosave stands at the top of every page and cannot be saved over by hand. The list
  opens on the page of the most recent manual save, and a dot marks each page that has one.
- A save holds the whole game state and any scene still in progress. Saves are JSON files
  in the `saves` folder of Electron's user-data directory, one per slot.
- Saves from a different format version, or damaged files, are shown as unreadable rather
  than hidden. Loading tolerates content changes such as a newly added love interest.

## Achievements

Kept for the install, not for a game: `achievements.json` in the app's user data folder
(`src/main/achievements/store.ts`), each by id with when it was earned. They are listed under
Achievements in the Esc menu and on the title screen (`ui/AchievementsPanel.tsx`), and earning one
puts a gilt card with its icon in the lower right for a few seconds (`ui/AchievementToasts.tsx`). Which there are, and what earns each, is `src/shared/game/achievements.ts`;
their names and descriptions are `game.achievements.<id>` in the strings. An id never changes, since
it is how one is known on disk, and will be how it is known to Steam: the store's `onUnlock` is where
that goes. Most are read off a game as it stands (`earnedInState`, checked whenever the game
changes), so a save that already meets one earns it when it is loaded: Perfection (every meter full
with one love interest), Aced! (an A on every midterm), Legendary (every stat at 26 or more), Conqueror (the Undercroft cleared to its
eighth depth), We live in a society (in any society), Obligatory onsen scene (a part of the Mistmoon
Break attended) and Where's the landlady? (moved into Haven House, which is not bought but offered).
The rest are of something a save does not keep, and are earned as it happens: Light of my life when
a part of the Lantern Festival is attended with someone (`earnedAtEvent`), Heartbreaker when a
breakup is agreed (`earnedByBond`), and, as a scene in which he had sex ends (`earnedInScene`), Oil
and Water (Dinah and Morwenna), Forbidden (Anwen and Elowen), Teach me! (any three professors), Diplomacy (Yelena and Seraphine),
Maid my Day (Zélie) and XXXmas (anyone, during First Frost). BFFs is read off the game: Tamsin pregnant
and in any arrangement with him, and so are the three of the children: Full House (a child in every cot of
Haven House), True Sire (every love interest carrying his child or delivered of one) and Family Matters
(one of them twice). Also read off the game: Genius (an A on every midterm and every final), Slime Ball (Lira the only
one masked at the masquerade), Society Secrets (the second of any society's special meetings been to) and Good Listener
(the interface, day and courses tours each seen through, `TOUR_FLAGS`, with none skipped). Earned as they happen: Have
a Ball when a masked dancer is named right (`earnedByGuess`), I Can Do Magic Too! when a relic is used in a scene
(`earnedByRelic`) and I'm Outta Here when a love interest walks out of one (`earnedByLeaving`).
Those six, BFFs, the three of the children, Slime Ball and Good Listener are hidden, as Steam has it (`HIDDEN_ACHIEVEMENTS`): until earned, the panel names
none of them and only counts them.
Each has two icons in `src/assets/achievements/`, at Steam's size (256 square, JPG): `<id>.jpg`, shown
once it is earned, and `<id>-locked.jpg`, the same in grey, before. Both are uploaded to Steam as
they are; a test fails for an achievement missing either. They were drawn with the comic-book
background workflow on a dark plum ground with a gold border, at 1024 and made smaller.

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

**Events** are handwritten in `calendar.json`, programs and all: the editor has no side for
them, and an add-on folder has no events of its own.

"Edit game content" on the title screen opens the editor, in a built game as from source, so
that a player can add characters and subjects of their own. Its sides are the characters (love
interests and NPCs: profile, traits, media, family, academics), majors, the trait library,
courses, the player's start, locations, jobs, societies and ComfyUI.

- **Add-ons** live in an `addons` folder in Electron's user-data folder (the editor has a
  button that opens it): `love-interests/<id>.json`, `traits.json`, `curriculum.json`
  (subjects of one's own), `catalogue.json` (built for them), and artwork under
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
- **Packs** (`PacksEditor.tsx`, in both builds): a zip of outfits, custom expressions,
  sex-acts, whole characters and majors, chosen character by character, to pass to another
  player, and the way to import one. It holds `pack.json` and the files it names under `files/`
  (`src/shared/packs.ts`, `src/main/content/packs.ts`); the added faces and acts its contents
  are filed under go with it, and a whole character brings all her files, her traits, and any
  major of a player's own she studies or teaches, with its college. A player can pack only
  their own files (those under `addons/`), and as whole characters and majors only those they
  made; from source, everything. Importing shows what it would do first, and then saves each
  thing as the editor would: what a character has that the pack does not name stays, one not in
  the game is passed over, a whole character takes the place of anyone of her id, and a face,
  act, trait or major whose id or code is already there is left as it is. A whole character's
  friends and enemies are kept only where the game has them.
  Nothing in a zip is trusted: only files `pack.json` names are read, they have to be
  pictures or clips, and the game names where they go.
- **Groups** (`GroupsEditor.tsx`, in both builds): two or three love interests together
  (`groups.json`, `src/shared/model/groups.ts`, laid over by the add-on folder's as `looks.json` is),
  each with a slot for every sex-act, standard and added, and a picture and a clip for it made as
  a character's are, the picture asked for with every one of them in it (`groupNsfwPrompt` in
  `src/shared/comfy.ts`), and in the act's group wording in place of its own: `groupDraws`, written
  for each standard act in `NSFW_POSES` and a field of its own for an act added under Expressions
  & acts (left empty, the act's own wording is used). `manShown` (Man on screen, on unless
  unticked; off for `creampie` and `facial`) says whether a group picture has the man in it.
  A group's clip is asked for with the act's group clip prompt (`groupVideoPrompts` in the ComfyUI
  settings, edited under ComfyUI setup → Group clips, `groupVideoPromptFor`), and with the act's own
  clip prompt until one is written. Its files are under `sprites/group-<id>/`. In a scene of exactly a group's
  members, the group's sex-acts are offered to the LLM beside each woman's, and a sex-act asked for
  is shown from the group when it has one (`groupPose` in `src/shared/game/groups.ts`, the scene's
  `animationGroup`), in place of the one woman's; otherwise it is hers, as before. Not while any of
  them is showing a pregnancy (the group is drawn without one) or any will not have sex in the
  scene. It comes down when anyone leaves. Groups have no pregnant row, and do not go in packs.
- **Expressions & acts** (`LooksEditor.tsx`, in both builds): faces and sex-acts added to the
  standard ones, kept in `looks.json` (`content.looks`, `src/shared/model/looks.ts`): in
  `content/default` from source, in the add-on folder otherwise, laid over the game's by id.
  Each has a name, what it shows (told to the LLM) and an image prompt; a sex-act also has
  ticks for a one-reply moment (`isMoment`) and counting as insemination (`isSeeding`), a
  slot in the pregnant row as every standard one has, and a clip prompt beside the standard
  ones in the ComfyUI side. Every character gets a slot for each in her Media tab (`facesOf`,
  `posesOf`). The LLM is offered an added face only for a girl whose outfit has its picture,
  in its own words unless the picture has some (`ownFaces` in `prompt.ts`; in a group, a line
  per girl for the outfit she has on), and an added act only where she has its picture, as
  any act. The standard ones are listed but locked, and an added one can't take a standard
  id or start with `pregnant-`. One a character has a picture for can't be deleted.

## Languages

The game is played in one language at a time, chosen in **Settings** (offered once there is
more than one). It covers the interface, the content, what the LLM is told, and what it is
asked to write. The choice is kept in `settings.json` with the LLM profiles.

- **The game's own text** (every label, message, prompt and tool description the code
  writes) is looked up with `t(key, params)` from `src/shared/i18n`. The English is in
  `src/shared/i18n/en/<namespace>.json` (`core`, `scene`, `llm`, `game`, `comfy`, `editor`,
  `shell`, `screens`, `panels`). A key is its namespace and its name, `scene.intimacy.onControl`,
  and is typed: one that does not exist fails the typecheck. Messages take `{name}`,
  `{n, plural, one {# day} other {# days}}` and `{x, select, a {…} other {…}}`
  (`src/shared/i18n/format.ts`); any other brace is literal, so JSON in a prompt needs no
  escaping. Never call `t()` at module load: the language is set after modules are read.
- **Another language** is a folder beside `content/default/`: `content/<id>/language.json`
  (`{ "name": "Deutsch" }`), `strings/<namespace>.json` with any of the English keys
  translated, and any content file laid out as in `content/default/` (`codex.json`,
  `love-interests/anwen.json`) holding only the text it translates. Content is laid over the
  English entry by entry, by `id` (or a subject's `code`, a course's `number`, a house room's `key`), and by place
  where entries have none; lists of plain values are replaced whole. Ids, numbers and
  fields that name other entries (`locationId`, `traitIds`) are never changed by it
  (`src/main/content/language.ts`). Anything a language leaves out is in English. Messages
  that name an unknown key, or take other values than the English, are reported in the
  console when the language is loaded.
- **What stays English**: hidden tags and anything the game parses back out of a reply,
  tool and JSON property names, image-generation prompts for ComfyUI, and developer errors.
  In another language the LLM is told which one to write in by `core.llm.writeIn`, added
  to every system prompt (empty in English).
- **Saves** keep text as it was written: memories written in one language stay in it.
- **Names in replies.** The LLM is told (`core.llm.writeIn`) to keep characters' names in Latin letters and tags exactly; in case it does not, a language may give each character `aliases`, her name in its own script (the one field a translation may add), which `namesHer` and `namedAt` in `src/shared/game/scene.ts` also accept. A single Chinese character is never searched for inside text. Full-width brackets, colons and equals signs in a reply's tags are put in ASCII as it arrives (`plainTags`, in `src/main/ai/router.ts`), and speaker lines accept a full-width colon. `sexWrittenOf`, which has a reply written again when it writes sex of a woman who will not, reads the code's English words and the language's own (`scene.detect.sexWritten`, words for the acts separated by "|", empty in English).
- **Voice** is recorded in English. A line written ahead is found by its exact words, so a translated one has no recording and plays silent; catch phrases play only in English (`src/main/index.ts`); wordless reactions play in every language.
- **The content editor** saves nothing while the game is in another language: what it
  shows is the translation, and saving would write it over the English.

## AI

- **Settings** (the Settings button) hold two OpenAI-compatible endpoints: the **Main LLM**
  and the **NSFW LLM**, each with base URL, API key, model, temperature, max reply tokens,
  a timeout (two minutes by default; drafting a character or subject waits at least three),
  and under Advanced: how hard a thinking model thinks (sent as `reasoning_effort`, OpenRouter's
  `reasoning`, or a local chat template's `enable_thinking`, by default going by the address),
  the samplers (top P, min P, top K, repetition, frequency and presence penalties, each sent
  only when set), the most requests to send at once (`maxConcurrent`: blank for no limit, 1
  for a provider that takes one at a time; the rest wait their turn in `src/main/ai/queue.ts`,
  first come first served, one line per address), and OpenRouter's provider order, providers
  to avoid and fallbacks (`extraParameters` in `src/main/ai/openai.ts`)
  and extra instructions. They are saved to `settings.json` in Electron's user-data folder,
  with keys encrypted by the OS keychain where available. Keys never reach the renderer.
- **Scenes** start with an activity shared with a love interest. The character ends the
  scene from within the conversation: the prompt tells the LLM to finish its parting line
  with `[END SCENE]` when the player says goodbye or the moment has run its course. Left
  to itself a model never ends one, so once a scene has run past its usual length in the
  player's turns (`SCENE_LENGTHS` in `src/shared/game/windDown.ts`: a class 12, a shift 8, a
  society meeting 10, a date 16, anything else 8) the prompt asks her to find a reason to
  go within a reply or two, naming her class if she has one within two hours. It does not
  while a sex-act is up, while she is at comfort 5, or at a birth. The
  tag is stripped, the player presses Continue, and a summary screen shows what changed
  for the player, how the relationship moved, and the memory that was kept. Each memory is
  in a text box on that screen: the player can reword it, or clear it so that nothing is
  remembered, and it is kept as it stands when they continue.
- **The text box** (`ui/SmartInput.tsx`, `src/shared/game/suggest.ts`) helps as an editor does,
  and offers nothing until he types. The asks open to him now (`sceneSuggestions`) are her
  Bloomr once she is an acquaintance and he has not got it, and each relationship status whose
  `minStage` she has reached and that `canBond` allows (two women together, for a throuple, when
  both are there). As he types, the rest of one he has begun, or of a name (those in the scene
  first, then everyone he has met), shows in grey after the cursor and Tab takes it. A
  word the system spell checker does not know (the game's names, places and handles aside) gets
  a wavy line, and its likeliest fix is offered above the box, also taken with Tab. A line begun
  from a suggestion carries its `cue` to the LLM beside it: what he is asking, and that it can be
  granted (she says her handle, or calls `propose_relationship`). Her answer is still hers.
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
  - **Schedule something**, in a scene's tool menu (`ScheduleDialog.tsx`), is the player's
    own plan, made without the LLM calling anything: what, where, the day, the hour, how long,
    and which of the love interests in the scene. `schedulePlan` in `appointments.ts` checks
    it: when he and all of them are free, the place is open throughout and the hour is civil,
    it is on offer at once, as if they had suggested it, and no LLM is asked. Otherwise the
    nearest time after it that fits is found, his line ("How about...?") goes to them with
    what was in the way and that time to agree to (`prompt.meeting.moved`), and that plan is
    on offer with their answer whatever they say. Either way he accepts it as any other.
- **Group scenes**: a scene has one lead love interest and up to two companions
  (`companionIds`, three in all, `MAX_SCENE_CAST`). The prompt is the lead's, with a short
  profile of each companion, and the LLM writes everyone's lines, starting each with the
  speaker's first name (`Tink: ...`). The text box puts that name on the nameplate, all
  sprites stand side by side and whoever isn't speaking is dimmed. In a group, everyone
  appears in their default outfit (no outfit, expression or animation tags).
  - **Who answers first**: left to itself the LLM keeps them in one order. For each of his
    lines the game picks who answers first (`firstToSpeak` in `src/shared/game/scene.ts`):
    whoever he names in it, the first he names, and otherwise whoever has gone longest
    without leading a reply (read off the first speaker of each, `whoSpoke`); one line in
    four (`UNLED_EVERY`) names nobody, unless he named someone. She is told beside his line
    ("Bea answers first this time.", with the clock note, not kept in the history), and
    every list of them in the prompt begins with her (`firstSpeakerId`): the face and
    comfort tags, the outfit lines and the example line. Not in a class, where the teacher
    leads, nor with an NPC.
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
  some other way. A step's `outfitId` is what everyone in its scene starts in; the Assembly and the
  Campus Tour put Tamsin and Seraphine in their usual clothes, as their cutscenes draw them. A step with nobody to meet just passes the time. The game's has three steps on day 1:
  the Assembly, the Campus Tour and the Hall Supper.
- **Guided tours** (`ui/Tour.tsx`): a character pops up beside one part of the screen after another and says what it
  is for; Skip or Escape ends it. Tamsin shows the course planner the first time it opens (`CoursesView.tsx`), and
  on day 1, once the welcome is over, its speaker shows the day's screen (`ui/InterfaceTour.tsx`): the player opens
  the phone, the map, the bag and the calendar himself when she asks, she shows each (turning to every app of the
  phone), and she ends on Help. Each is shown once a game, kept by a flag in the save.
- **Kinds of love interest** (`kind`): a **student** has `studies`, takes two courses in her
  major, and has the rest of her timetable dealt out by rule when the catalogue is built; a **teacher**
  has `teaching` (a department, a style such as Magistra, and one or more courses), each
  with her as its professor; an **outsider** has neither and
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
  for it, and their sprite steps in beside the others while that line is on screen. The default pack has twenty:
  matrons, shopkeepers, managers and the housing officer, each a file in `love-interests/` marked `npc`.
- **Stats**: strength, dexterity, endurance, intelligence, charisma and wisdom
  (`src/shared/model/stats.ts`), on the usual scale of ability scores (10 is ordinary). A new game
  starts every stat at 8 and gives the player 27 points to raise them with as he likes, up
  to 15: a point buys a point up to 13, and the two above that cost two each. From there they are built by work, up to a cap of 30. Whatever works on a stat (a class,
  a drill from the Stats menu, a shift at a job that builds it, focus) earns
  **training points**, about one an hour (up to three in a drill played well), banked until there are enough for the next
  point: two at an ordinary score and two more for each step of its modifier, so 12 points
  from 10 to 14, 60 to 20 and 220 to 30. A day's work on one stat counts in full for the
  first six points, for half for the next six and not at all after, so a stat is built
  over weeks (`trainStat` in `src/shared/game/stats.ts`). Stats never fall. 14 is good, 18
  impressive, 22 exceptional and 26 legendary: what love interests notice and what jobs
  ask for. Each score has a
  modifier, (score - 10) / 2 rounded down, kept for the magic to come. A class raises the one or two stats its
  course teaches (`stats` on the subject in the curriculum, drawn out as `generalEd` in
  `coursework.json`; `statGain` points for each hour of class, shared between them). An activity the
  player makes up can work on a stat (+1 an hour, for energy) or be rest (energy back);
  the LLM judges which from the wording, and each location lists what it is a good place
  for (`trains` in `locations.json`).
- **Appeal**: each love interest `admires` up to three stats. The average of those in the
  player gives three levels (below 14, 14 and up, 18 and up: `appealLevel` in `src/shared/game/stats.ts`). The level is told to the
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
  - **Whether she will** (`src/shared/game/intimacy.ts`, `intimacy` in
    `relationships.json`): a woman with one of `easyTraitIds` (promiscuous, sex-addict) is
    held to nothing. Any other will not have sex in the first scene she is ever in with
    him, nor until her desire has reached `minDesire` (25), or `reluctantMinDesire` (50)
    with one of `reluctantTraitIds` (prude). It is settled as a scene stands (`sexGate`),
    told to her as a rule, and enforced: while it is shut no sex-act is shown and nothing
    can be conceived, whatever the reply says. In a group it is said of her by name at the
    head of the sex section (`shutLine`), not among the lines written to each. Both say that
    a reply breaking it is rejected, and one is: main runs `sexWrittenOf` over each scene
    reply (a sex-act or `[SEEDED]` tag of hers, or sex in a line she speaks or that names
    her, by a list of English phrases in `scene.ts`), and if it has a woman whose gate is
    shut having sex, asks for the reply again, once, with a note saying who and that she
    refuses; what the first draft's tools did is undone. The second draft is kept whatever
    it says.
  - **Birth control** (`onBirthControl`): a love interest's `birthControl` flag (the
    editor's Family tab; on unless written off) says whether she takes something against
    the Bloom when the game begins. While she does, the chance is `birthControlChance`
    (0.2) in place of `chance` (1). Stopping is hers to decide in a scene: she is told so,
    and writes `[STOPS BIRTH CONTROL]` when she does (`stopBirthControl`), which puts her
    in `offBirthControl` in the save and gives her a core memory of the choice.
  - **Her period** (`periodDay`): every woman has a cycle of `cycleDays` (28) that began on
    a day of her own, settled by the game's seed. For its first `periodDays` (4) she is on
    her period: she is told so, her profile says so, and she cannot conceive. It stops
    while she is carrying.
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
    (the Health Center) for `birthHours`, and she DMs him the time. The hour is the earliest
    stretch of the due day that is free of everything else of his while the place is open;
    failing that the earliest that costs him only a calendar event, then only a shift, then
    a class, then another plan (`birthSlot`). It cannot be called off.
    - **Kept**, it is a scene of its own (`attendBirth`): the child is born as it opens, the
      scene is set in the place's `birthViewId` view (the maternity room) with her
      birth picture in their child's tone for its whole stage if she has one, and its opening beat tells the LLM
      what the moment is. What it does to her feelings is the scene's own summary.
    - **Missed**, the child is born all the same at the end of the hour (`settleBirths`):
      she takes `MISSED_BIRTH` (affection -25, trust -30, desire -15), keeps a **core**
      memory of it and writes to say so.
    The child is a daughter by `daughterChance` (seven in eight) and has a **name**: its
    mother's suggestion (`suggestName`), the next unused one of her `childNames` (the
    editor's Family tab), then of the pack's
    `names` in `pregnancy.json`. While he is in the scene of the birth he can give another
    (`renameNewborn`), which she takes gladly; a birth he missed keeps hers.
    The child is recorded in `children` in the save, and her prompt and the others' mention
    it from then on. The `pregnant` condition lets activities, secrets and codex entries
    depend on it. A birth still to come when the calendar ends is told in the epilogue.
  - **Skin tone**: the player chooses his as a game begins, light, medium or dark (`skinTone` on the player,
    editable in the phone's Profile; every character is told it), and each love interest has hers (`skinTone`,
    the editor's Family tab). A child of theirs is halfway between the two, and where halfway falls between two
    tones, the darker, as dark carries over light (`babyTone` in `src/shared/game/skin.ts`): a light mother's is
    light or medium, a medium or dark mother's medium or dark. A `babyTint` is what a child of her own tone takes
    from her besides (Dinah's pallor, with a light father only); a mother whose trait outweighs any father's has
    every child drawn in one tone (`ownBabyTone`: Grushka's green, Lira's blue), with her tint always.
  - **Her birth pictures**: one for each tone a child of hers can have (`birthPictures`, `babyTonesOf`; the Birth slots on the
    editor's Family tab), drawn at 1920×1080 by the `birth` kind of picture from her appearance and the child's
    tone and tint (`birthPrompt` in `src/shared/comfy.ts`): sitting up in a hospital bed in a gown with the child
    in her arms. `npm run births` draws them (`--tone` for only some).
  - **With the baby**: for each of the same tones, an outfit of her holding a swaddled newborn of it (`babyTone` on
    the outfit, `baby-<tone>`, built on her day clothes by `babyOutfit` in `src/shared/comfy.ts`), drawn neutral and
    shown on the Family tab, not with her outfits. She is shown in it about the house while the household is up,
    with a child of theirs living there, at least Settled, and herself not showing with another (`outfitAtHome` in
    `src/shared/game/homeOutfit.ts`): in the house's views, and as a scene there opens (`dressForHome`). The
    child by itself is one of six in `sprites/babies/`: the three tones, and the pale, green and blue of
    Dinah's, Grushka's and Lira's (`babyPicture`).
  - **Her sex-acts by his tone**: the sex-acts show the player, so each is drawn once for each tone of the man
    (`animations` for light, `tonedAnimations.medium` and `.dark` beside it; the tabs over the NSFW section of the
    Sprites tab, whose pictures are drawn with a line for the man's skin, `nsfwPrompt`). The pack a game reads has
    each woman's sex-acts for the player's tone (`withSkinTone`, `posesForTone`): act by act, the ones drawn for his
    tone where that act has a picture of its own there, the light ones otherwise, and an act comes whole from one
    or the other, so that what then stands in for it pregnant is the same man. A group's sex-acts are kept and shown
    the same way (`tonedAnimations` on the group, the tabs on the Groups editor).
- **Sire housing** (`housing.json`, optional; `src/shared/game/housing.ts`): once a love
  interest he is in any agreed relationship with is carrying his child, the housing
  officer of the Sire Relations Office (an NPC, `officerId`) DMs him the offer of a house,
  which the thread shows with Accept and Decline. Declined, it can still be taken.
  - **The viewing** (`viewing` in `housing.json`, `src/shared/game/viewing.ts`): saying yes
    does not move him in. The officer sets an hour to show him the house (`scheduleViewing`):
    the first stretch from the next day on, in office hours, that is free of everything else
    of his, at `meetLocationId`. It is on his calendar and he has to be there; missed, it is
    simply set again. Kept (`attendViewing`), the officer hands him the keys and the nanny sets out
    how a child does in the house (`viewing.cutscene`, read before the scene): its cot, the weekly
    keep, the five levels of health, and that the house's comfort decides how high they can go. Then
    it is a scene at the house with the nanny, the officer there as its guide (`guideId` on the
    scene), and the house is his as it opens: the Home button is there when the scene ends. A pack
    without `viewing` moves him in on yes.
  - **The house is put into the content**, not handled beside it. `withHousing(content,
    state)` gives the pack as one game sees it, and is applied wherever content is prepared
    for a state (`App.tsx` and `readBy` in `src/main/index.ts`). Until he lives there the
    house's location and the nanny are not in the pack at all, so no scene can go there and
    nobody has heard of her. Once he does, `newGame.room` is its master bedroom (so sleep,
    home and study in his own room all follow), each love interest who lives there has her
    `room` in it and comes home to it (`residentSchedule`), and each room's view says what
    has been made of it. Everything else reads the content as it always did.
  - **Rent** (`rent`) falls on the first of each month, less `rentRelief.perChild` (20)
    for each child of his wherever it lives, to no less than `rentRelief.floor` (60)
    (`monthlyRent`). Short of it, it is carried as
    arrears for `graceDays` and the officer writes; still unpaid, the house is taken back
    (`evict`): everyone goes home, the children go to the creche, and he is back in the
    Halls. There is no second offer.
  - **Rooms** (`rooms`): each has a `role` (`common`, `master`, `nanny` or `suite`), a
    `cost`, whether it `startsBuilt`, what it adds (`beds` for love interests, `cots`,
    `comfort`, `study` toward the own-room study bonus), at most a few `tiers` to fit it out
    further, a rectangle on the `plan` of its floor, and the `viewId` of the house
    location's view that is its picture. The House screen (`src/renderer/src/ui/house/`)
    draws the house from those rectangles as a cutaway (`houseLayout` stacks the floors, each
    as tall as its rooms take): every room is a window onto its own picture, by day or by
    night, dark and locked with its price until built, under a drawn roof. More rooms and
    floors draw themselves; there is no picture of the whole house. A room whose plan is
    `outdoors` (the garden) is not among the front's rooms: it is a square built on against
    the left wall of its floor, as tall as that floor's rooms, and its rectangle is not used. It is put together from
    pieces in `art` (`sprites/house/`): the `roof` over the top floor, a `beam` along each
    floor, the `wall` and `shingles` tiled where no room is, and the stone `footing`. Around
    it is `exterior` (`day`, `night`), or failing that the hearth room blurred. A room's picture is generated
    in the Locations editor like any other view, each view having its own `appearance`. Built common rooms are places a scene at home can move
    to (`home-<key>`).
  - **Who lives there**: the nanny (`nannyId`, a love interest who comes with the house),
    and whoever he offers a bedroom to from its room card: a love interest who is carrying his
    child or has borne one, is in a relationship with him, is at `invite.minAffection` or
    more, where a bed is free. She accepts, remembers it as a core memory, and can be asked
    to leave, which she does not forgive and does not come back from.
  - **Babies**: a child whose mother lives in the house lives there too while there is a
    cot, and has a `health` level (`babies.levels`, worst first); any other child is at the
    University's creche and costs nothing. On the first day of each week each child in the
    house costs `babies.weeklyCost`, the one doing worst paid for first. Paid for, it comes
    on a level, as far as the house's comfort allows (`babies.caps`); not paid for, it drops
    a level and its mother's affection and trust fall (`babies.neglect`). At the bottom she
    takes it back to the creche and leaves. No child is ever lost. The house's sidebar lists each
    child at home with her level, the nanny's word on it (`said` on the level), and the comfort the house
    needs for the next one (`nextHealthStep`). Each child is pictured by itself, swaddled, in the picture for
    its tone (`sprites/babies/<tone>.webp`, or its mother's `babyPicture` where it takes her tint;
    `babySprite` in `src/shared/game/skin.ts`), there and in the Children list; its mother holds it about the
    house only from Settled (`babies.startLevel`) up. Weeks it is kept thriving (`babies.thrivingFrom` or
    better, paid for) are counted on it (`thrivingWeeks`, back to nothing with one it is not); four of them
    earn its mother's thanks, a story beat (see Story beats). Filling every cot earns Full House.
  - **Reckoning** (`settleHousehold`) walks every day since it was last done, so a jump of
    several days settles each once. Rent day and the weekly expenses (the children's keep) are on the calendar.
  - **The epilogue** has a Home screen, with how the children raised there fared, and a mother
    who lived with him raised the child with him.
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
  - **Selfies in DMs**: the camera button beside Send opens two ways to ask a love interest for
    one. **Surprise me** asks as the game does; **Detailed** opens the request the game would
    send (the user part of `buildSelfiePrompt`: the day, where she is, who she is, the DMs of
    late) for the player to change, and what he sends goes in its place (`request` on the IPC
    call); the system part, which says how she answers, is the game's either way. The LLM
    writes her message and what the picture shows (`src/shared/game/selfie.ts`), and it is drawn
    with the photo workflow, in what she has on now and against where she is at this hour. The
    picture stays on the note (`image`). NPCs in his DMs send none.
  - **His profile** is the first app on the rail: his bio, what he added
    about himself and his global memories. It is applied on leaving the page (`editProfile`
    in `src/shared/game/memory.ts`), for another app or by putting the phone away. His name
    is shown there and cannot be changed.
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
- **Bloomr** (`src/shared/game/feed.ts`) is the photo feed: pictures with a caption. It needs
  both the Main LLM (captions) and ComfyUI (pictures) set up; without both there are no
  posts. As each day begins the day is planned by rule (`feedRound`): some of the love
  interests whose contact the player has post, each once at most (`postersToday`: at least
  two, or the one there is, about a quarter of them once there are many, 5 of 20, and up
  to a quarter of the rest more by luck), every post at an hour of its own between 08:00
  and 22:00 so that no two go up together, with where each of them will be at that hour
  and who could be in the picture with her: whoever will be there too, and her friends.
  One LLM request then writes every caption, picks who if anyone is in the picture with
  her from those (`with`), whether its picture is a selfie or a candid (`shot`),
  and a line of what it shows, and each picture is drawn in the background on ComfyUI, one
  at a time, with the Photo workflow, size and framing (`postPrompt` in
  `src/shared/comfy.ts`: one paragraph saying what kind of picture it is, her appearance,
  what she is wearing, the friend's, and the LLM's line, so that she is one subject and is
  drawn once; then the place's appearance and the light at that hour). The
  pictures are filed under `generated/photos/<id>/` in the add-on folder. A post is saved
  as soon as its picture arrives but is not on the feed until its hour has passed; one
  whose picture could not be drawn is not made. The feed shows five posts and brings in
  five more each time the reader scrolls to the end. The player can like a post or
  message its author. Her two latest posts that have gone up, and whether he liked them,
  are put into her prompt.
- **The player's own posts**: "Take a picture" in a scene's way-out menu (beside the send arrow,
  with the leave or end-of-class action and "Say goodbye", which says "Gotta go, goodbye!" and sums
  the scene up at once) has the LLM that writes the scene write a caption and a line of what the
  picture shows from its last lines, and ComfyUI draw it with the Photo workflow: of whoever is in
  the scene with him, as they are dressed in it, never of the player (`scenePhotoPrompt`). It is
  drawn in the background while the scene goes on, and goes on the feed as his, from
  `@2Sire2Serious` (`PLAYER_HANDLE`), at the hour he took it. The same request has each of
  those in it comment on the post in her own voice; the comments go up with it, and one by
  anyone who was not in the scene is dropped (`parseScenePhoto`).
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
- **Syllabus** (`topics` on each course of the curriculum, `src/shared/game/syllabus.ts`):
  the topics a course's classes are on, in order: a title and what is true of it in this
  world. It is lore like the codex, but hidden: it is not in the player's book and no word
  calls it up. The class he sits takes the next topic after the classes he has attended
  (`lessonTopic`), round again at the end; it is given to the teacher in the instruction
  that opens the lecture and kept in the prompt for the rest of that class.
- **Skills** (`skill` on each course of the curriculum, `src/shared/game/skills.ts`): every
  course teaches one thing at so many marks (`at`, 30). He has it while he is taking the
  course and has the marks; nothing is stored but `skillsTold`, so that it is announced
  once. A skill is one of three shapes (`src/shared/model/skill.ts`):
  - a **sight** (`grants`, one of `SKILL_GRANTS`): `contraception` and `cycle` show the
    birth-control and period chips on her phone page (a "?" chip says where it is learnt
    until then; `cycle` is Ward reading's second level, `alsoGrants`; how much desire she
    needs is never shown), `odds` shows his chance of winning on his turn at
    poker (`equity`), `comfort` shows
    each woman's comfort in a scene, and `tastes` finds one like or dislike of hers when a
    scene ends;
  - a **passive** (a modifier, below): always on once learnt;
  - and, besides its first level, a **second** (`upgrade`, at 70 marks): what it says then, and a stronger
    `passive`, a shorter `cooldownDays`, a second sight (`alsoGrants`) or a second modifier
    (`alsoPassive`: Back in bloom's `devoted`, kept by `devotedMothers` between scenes). `skillsLearnt` hands out each skill as he
    has it (`level` 1 or 2), so everything that reads skills gets the second level's numbers; `skillLevel` asks it of
    a sight, for what the second does beyond them (two tastes a scene, a suggested move at poker, comfort kept at 2
    or above). It is told once more as it is reached (`toldOf`, `id@2` in `skillsTold`), and shown in gold with II;
  - an **ability**: something he makes or sets off, then waits `cooldownDays` to do again
    (`canUseAbility`, `useAbility`, `abilityUsed` in the save). He never casts: he brews,
    or readies a thing at the bench and triggers it. Brewing is an ability whose effect
    puts an item in his bag.
- **Modifiers** (`src/shared/model/modifier.ts`, `src/shared/game/modifiers.ts`): one
  vocabulary, `MODIFIER_KINDS`, for every number of the game a course or a potion changes.
  Two things feed it: the passives of the skills he has, and **boons**, which are
  modifiers in force until a time (`boons` in the save; one that has run out is simply
  ignored). Whatever works a number out asks `factor` (what it is multiplied by) or `bonus`
  (what is added): what a scene is worth to her (`feltChange`, in `applyFeelings` and the
  `meter` effect), training (`trainStat`), marks from study and Focus, wages, prices, rent,
  a child's keep, building, gifts, the energy of a class or shift, the desire she needs
  (`desireNeeded`), the chance of a child and how soon after a birth, the comfort of the
  house, and how often a scene is walked in on. A boon set on a woman counts for her alone
  and may carry a line told to her while it lasts.
- **Using things** (`use` on an item, `src/shared/game/market.ts`): an item can be something
  he uses as well as gives, on himself or on a woman he is with (`canUse`, `useItem`). Two
  effects exist for it and for abilities: `boon`, and `item`, which puts things in his bag.
  The **Bag** (`src/renderer/src/ui/Bag.tsx`) is a tile on the day screen and what the Bag
  button opens in a scene: what he carries, what he can make and when each is ready, and
  what is in effect. Used in a scene on a woman, a charm takes hold with her next reply,
  which is the one thing that moves the desire gate inside a scene.
- **Marks and grades** (`grading` in `coursework.json`, `src/shared/game/grades.ts`): every
  course has a hundred points for the player to fill over the term. Sitting a class earns
  them by the hour, so that every class of the term comes to `attendanceShare` (60) of
  them whatever the course's hours; the rest is studied for. The day view's **Study**
  option opens into his courses and then into where: the places in `studyLocationIds`,
  his own room, and the room of any love interest he has met who takes the course. A
  session is two hours, which he may make longer (up to eight), for energy and `studyPerHour`
  points an hour, and one more in his own room however long it is (a drill from the Stats
  menu can be made longer the same way); somewhere public it is a scene with whoever is there, in a classmate's room a scene
  with her, and in his own room no scene. The midterm and the final fall in `midtermWeek`
  and `finalWeek` and each takes the place of the course's last class of that week. Those
  two weeks have no lectures or labs at all: every course meets only in that one slot, for
  the player and for everyone else, and the weeks are left out when an hour of class is
  valued.
- **Examinations** (`src/shared/game/exams.ts`, `ExamDialog.tsx`): an examination is
  something he turns up for, like a class. He is taken to the hall and handed its paper:
  `examQuestions` (3) multiple-choice questions, each on a topic of a class he sat
  (`topicsCovered`; a class missed taught him nothing), the final asking first about what
  the midterm did not. Every topic in `curriculum.json` has one `question` (`ask`,
  `answer`, three `wrong`), and whoever teaches the class is told to say its answer in the
  lecture, so that what is asked is something he heard. Handing it in passes the rest of
  the slot and gives the grade (`gradeFor`): with `passAt` (0.6) of the marks to be had by
  then (the midterm against the part of the term gone by, the final against the whole) a
  C; with `markAt` (0.8) of them a B; a perfect paper (every answer right) lifts either by a letter; and an F
  under a pass, or when its hour goes by without him (`settleExams`). The classes he sat
  are kept in the save by day and hour under `attendance`. Grades are kept under
  `grades`, by course. Every love interest is told when the examinations are next week or
  on, when her own are, and what he got in a course she takes with him or teaches
  (`examNotes`).
- **The Undercroft** (`expedition.json`, `src/shared/model/expedition.ts`,
  `src/shared/game/expedition.ts`, `ExpeditionView.tsx`, `PartyDialog.tsx`): a turn-based
  adventure with no LLM in its fights. From `opensOnDay` the `guideId` character sets an hour
  to show him the way down (`scheduleDescent` in `descent.ts`, at the first free hour from
  06:00, which is before his classes on almost every day, and put down again when he misses it,
  as the house viewing is). While it is due it holds the day, and the day view always offers it
  to go to, even when a class is on at the same hour. Keeping it reads `intro.cutscene`,
  her telling him what is below, its dangers and why it must be him (`attendDescent`), and
  then `BelowTour.tsx`: she has him open the Go below window and points out its parts, then
  puts him in a practice fight (`practiceRun`, a run made in memory on its own state, never
  saved, with no banter) and has him make the first move. From then on **Go down** is
  offered there. He picks a depth he
  has opened and up to `partySize` women who have a `partyRole` in their file, have been
  met, trust him by `trustNeeded`, are free for `hours` (asked as of any outing, with
  `checkOuting`) and are not at a stage of pregnancy missing from `pregnancyPower`. A run
  is kept in the save under `expedition.run` and drawn in place of the day screen, so it
  is there again after loading; its numbers come from the game's seed (`draws` in
  `seed.ts`), counted by `run.rolls`, so the same run plays the same way. A depth is a line
  of stops: a `fight`, a `find`, a `checkpoint` (what has been found is made safe, and
  everyone rests) and its `guardian`. In a fight the party acts in order, him first, and
  then the enemies (`act`, `enemiesAct`). He can Attack (strength), Protect a woman
  (endurance), Empower her next action or Ground a pregnant woman's surge (both for energy),
  or use an item with a `below` entry; each woman has her role's actions (`attack`,
  `weaken`, `shield`, `heal`, `guard`, `taunt`, some on a cooldown; one may hit `all`,
  `stun`, `cleanse` hexes and silences, or be `once` a run), and with them what she is to
  him adds (`herActions`): from `roleMoveStage` (Friend), once she has come back from a run
  won (`wins` in the save, counted by `comeUp`), her role's `friendAction`, and from
  `ultimateStage` (Lover) her own `ultimate`, written in her file, once a run. Her affection
  sets how often she strikes true, her trust adds `footingPerTrust` to her footing, and her
  desire fills her **passion** as she acts (`passionPerAction` at full desire, to
  `passionLimit`), which full makes her next action `passionPower` times as strong.
  Each enemy shows what it will do on the enemies' next turn (`intent`, set by `plan` at the
  start of the party's: a hit at someone, a sweep, a heavy blow, a call for help, a mend, or
  nothing while stunned); a taunt still draws it. The deeper ones fight in more ways
  (`armor` taken off each blow until weakened, a heavy blow every `charges` rounds, `summons`,
  `mends`, `silences` leaving her only her first move), and a guardian turns as it is worn
  down through its `phases`, each changing its ways from then on (`enemyNow`, `intoPhases`).
  A woman carrying is multiplied by `pregnancyPower` for her
  stage and adds to her surge with each thing she does, which at `surgeLimit` breaks loose
  on everyone. The party is drawn with its ordinary sprites, the face chosen by what last
  happened to each (`FightEvent.faces`); an enemy without an `image` is a card with its
  name. Winning at the guardian re-seats the anchor: the first time, its `relic` is his, and
  the next depth opens. A relic is always at work once he turns it on (each starts off; the
  Bag's Relics tab turns it on and off, `relicsOn`): a `Modifier` that `modifiersOf` reads like a learnt
  skill's, or `traitIds` every love interest has while it is on (`relicTraitIds`). Or it is
  used in a scene from the Bag, once a scene (`use`, `src/shared/game/relics.ts`): `unravel`
  undresses everyone, `stillness` stops time for everyone else (no extras, and private),
  `sapphic` draws the women to each other, `minds-eye` has them write what they think, and
  `first-seed` undoes their birth control for the scene. Using one is his turn at once
  ("*secretly uses the …*"), with what it did told to her beside it as a cue (nobody knows
  it was him) and, where it lasts, as a rule of the scene.
  Each depth has a `power` its enemies' footing, blows, mends and those they call up are
  multiplied by (kept on the run as `run.power`), rising from 1 at the top, and a depth with a
  `partyStage` (the last two, Lover) takes only women at that stage with him. An enemy mends
  and calls up others no more than three times a fight, so that any fight can be worn down.
  The balance aims at: the first two depths won by two women who only just trust him, the
  week it opens; the middle ones won some of the time while dating; the last two only by
  lovers, about half the time.
  **Echoes** (`echoes` in `expedition.json`) open past the last depth once every anchor is
  set (`echoesOpen`; the depth past the last in `startRun`): a run put together as he goes
  down (`echoOf`, the same for the same hour) in one of the depths' places, with fights drawn
  from every depth's fights, a find, a rest and one of the guardians, all at `echoes.power`,
  and asking the last depth's stage. It is kept on the run as `run.echo`; `runDepth` is the
  depth a run is in, either way. Won, it sets no anchor and leaves no relic: it counts in
  `expedition.echoes`, and each woman who came is in `expedition.echoed` from then on, which
  opens her outfit `locked: 'echoes'` (`outfitOpen`): a day outfit with every face and a
  pregnant form of its own (`echoes-pregnant`), that is drawn for her days and offered in
  scenes once open. Her
  Friend page in the phone has a switch for it (`setEchoOutfit`, `expedition.echoOutfitOff`):
  off, it is as if she had not earned it for her days. Below, she always goes in it once she
  has earned it, switched off or not (`belowOutfitId`, in the fight and the party dialog).
  Losing keeps only what was banked, empties his energy and costs the trust of whoever
  went down (`comeUp`); each woman who went remembers it, and ties between them grow. A
  course's skill may carry a `below` modifier beside what it teaches (`might`, `footing`,
  `anchoring`, `surge`, `spoils`, `grounding`, `ambush`, `steady`, `insight`).
  `expeditionPolicy.ts` plays a run without a player, for the tests that pin the balance
  (`src/main/content/expedition.test.ts`).
- **Raising a stat**: each location lists what can be done there for a stat (`drills` in
  `locations.json`: a stat, a title and an opening line; edited under Locations). The day
  view's **Stats** option opens into one drill for each of the six stats. Each stat has its
  game at one place, the one that suits it: strength at Ironroot, dexterity and intelligence
  at the Foundry, endurance by the river, wisdom in the chapel and charisma on the Great Court
  steps. Those places are always open, so every drill can be had at any hour he is awake. Taking one is an outing of two hours or more, for energy, done
  alone whoever is there: it is never a scene. When he gets there the hours are spent and
  the drill waits in the save (`drill`) on its game (`src/shared/game/minigames.ts`,
  `MiniGameView.tsx`), one for each stat: a power meter for strength, tracing a wire for
  dexterity, a run along a side-scrolling river path for endurance, seen through his eyes
  (tapping holds his pace level with the trainer, `pacerId` in `minigames.json`, Grushka, who
  runs at the pace to hold; slower and she pulls ahead, harder and she drops back), turning tiles of a ward circuit for
  intelligence, repeating the order a row of coloured candles flared in for wisdom (one
  longer each round, over at a wrong candle), and reading strangers' faces for charisma
  (each face is happy, bored, sad or annoyed, and is answered with a compliment, a joke,
  comfort or space before her patience runs out). Each scores 0 to 1 and the drill trains `hours × (1 + 2 × score)`
  points (`DRILL_PER_HOUR`): skipping the game is a score of 0, the same as an hour of focus.
  A game is harder the higher the stat, and a timed one runs from 20 seconds to 30 at the cap
  (`roundSeconds`). What the games are drawn with, and the strangers' faces in each mood, are in
  `minigames.json`; `npm run icons -- pieces faces runners scenery` paints them, each stranger
  from her own seed so that her four faces are the same woman, and the pacer from her own
  character file (her appearance and usual clothes), in one running frame that the game bobs and
  sways, gliding to where she should be rather than jumping. Nothing typed raises a stat: a typed outing only rests him
  or does nothing for him. Studying for a course is an outing as before. The confirmation says
  first what he would miss by going, a class he is taking or a shift at his job, as it now
  does for anything the player sets out to do.
- **Jobs** (`jobs.json`, `src/shared/game/jobs.ts`): a job is a place, a boss (an NPC), an
  hourly rate, the stats it asks for and its weekly shifts, 8 to 16 hours of them, which are
  written in the content so that a job is the same in every game. The phone has a Jobs
  board: whoever meets a job's requirements is taken on at once, one job at a time, and
  better-paid jobs ask more. Being taken on puts the boss in his DMs. A shift is clocked
  in for at the place while it is on, like a class, and is a scene: the boss is there, and
  so is any love interest who happens to be at the place. It keeps him until the shift
  ends, costs energy by the hour, and pays when the scene is over. Being better than the
  job asks pays more (`payBonus`): `bonusPerPoint` (4%) on top of the rate for each point
  he has over its requirements, across every stat it names, up to `bonusCap` (40%). A job
  that asks nothing pays no bonus. A shift that ends
  without him is a strike, or half of one if he messaged his boss that day before it began
  (she records it with the `excuse_shift` tool); at three he is let go. He may quit at any
  time. A job he has quit or lost will not have him back. The game's own jobs keep
  clear of the teaching day: shifts are on weekday evenings, after the last class, and on the
  two days no classes meet (`economy.test.ts` pins it). An add-on's may overlap his classes;
  the board says where they do.
- **Societies** (`societies.json`, `src/shared/game/societies.ts`): student clubs, each meeting
  once a week for an hour (`hours`) at a place of its own after classes, with up to `maxMembers`
  (2) students in it, and perhaps a teacher who sponsors it (`sponsorId`), who comes to its meetings and stands at its
  fair table but is not a member. Only students belong, and every student belongs to at least one
  (`societies.test.ts` pins both, and that each meets after `coursework.dayEnd` somewhere
  open). Nothing meets, and none can be joined, until their fair (`fairId`, the Societies
  Fair) begins; at the fair the day view offers its tables, and after it he joins or leaves
  them on the phone's Societies app, up to `maxJoined` (3) at once and never two that meet
  in the same hour. A meeting can clash with a shift. While one meets its members are at
  its place (`locationOf`, after classes and before work), it is on his calendar and is
  the next thing on his day like a class, and going is a scene with whichever of them are
  there, which trains its `stats` (`statGain` an hour, shared between them) for `energy`.
  Each meeting he goes to has a topic of its own, the next in its `syllabus`, counted by his
  own meetings (`nextMeeting`), so he misses none by missing a week. His third and tenth are
  `adultEvents`: a written setup (`intro`, a cutscene) and then a group scene with everyone of
  it who is there, sponsor included, marked `uninhibited`, so that the sex gate is open to all
  of them (`sexGate`'s last argument), and `nsfw`. Its `direction` tells the LLM the situation.
  A night can hold someone to her own wishes (`reserved`) unless he has been to bed with her
  before, when she is free too and the night is told the way written for that (`ifIntimate`):
  `eventGate` works out which, and the scene's `uninhibited` lists who is free.
  Her societies, and whether he is in them, are in her profile for the LLM. The editor's
  Societies side writes the file, from source only, as Jobs does.
- **The Societies Fair** (`fair` in `societies.json`, `src/shared/game/fair.ts`, `ui/FairView.tsx`): while its tables are
  out (the event's hours on each of its days) every student stands at a table of hers, taking turns by half-day when
  she belongs to two, and a few `visitors` wander it; they are at the fair on the map. Its first day holds his day as
  orientation does (`fairDue`) until he has been. The fair is a screen laid out as the town map is, over the Great
  Court's view whose id is the fair's (also its backdrop while it is on): a panel per table with who is at it now, Join,
  and Talk, an hour's scene at the table. Saying hello is free: `hellos` holds, per booth (a society's id or a visitor's),
  a written exchange for each company that stands at it (`boothHello` picks the one for whoever is there), read as a
  cutscene. It counts as meeting them, each keeps a fleeting memory of a first meeting, and a booth's hello is said
  once by each who stands at it; a test checks every company at a table during the fair has one. Stopping at a table the first time gives its
  `gift`. Once he has stopped at both `rivalry` tables (Bloomist and Freewill) their scene is read, once.
- **The lecture**: a class scene opens with the teacher teaching. The first reply of a
  class is asked for with a prompt of its own (`lessonCue` in `src/shared/game/prompt.ts`):
  five to eight beats, most of them the teacher speaking to the room about the course's
  subject, with a line of narration and perhaps an aside from whoever sits beside the
  player, ending on something he can answer. The teacher speaks under her own name when
  she is a love interest sitting in the scene, and under the course's professor otherwise,
  shown as a name on the text box with no face. After it, replies are their usual length.
- **Focus** (`src/shared/game/focus.ts`): under the Here bar on the day screen he picks one
  stat, or one course he is taking, as his focus (`focus` in the save). When he skips ahead
  to the next thing on his timetable, the hours that go by are spent on it
  (`spendOnFocus`), for no energy: a stat at a training point an hour, what a drill whose
  game is skipped gives; a course at `FOCUS_SHARE` (half) of what the same hours of study
  would earn. A toast says what came of it as the next thing begins.
- **What is next** (`src/shared/game/upcoming.ts`): the day screen puts the next thing on
  the player's timetable today at the head of what he can do: the soonest of the classes
  he takes, his shift, and the plans he has made (`nextUp`). Taking it skips the hours
  until it starts, puts him at the place, and begins it as if he had turned up on time.
  When he could not go through with it (too tired for the class, say) it is a note with
  the reason and not a button. An examination is offered the same way, and opens its paper.
- **The epilogue** (`src/shared/game/epilogue.ts`, `EpilogueView.tsx`): when the last day of
  the calendar is over, the day screen gives way to the epilogue, a screen of text at a time
  that fades in over a placeholder backdrop. Nothing in it is written by the LLM. First his
  studies: failing, getting by or excelling, from the final grade in each course he took
  (the final he sat, or what his marks and attendance would earn if the year ended first), with the grades
  listed. Then his legacy, the run's real goal: how many children he fathered and by how many
  women, a line for each mother. Then a screen for each love interest who carried his child
  during the year: the children she bore, and for one still to be born, a daughter or a son by
  `daughterChance`; she was overjoyed if they are together or she is at least as fond of him as a
  friend, and raised the child by herself otherwise. Then a screen for each arrangement whose
  status is `committed` in `relationships.json` (every one but lovers without promises). Then the
  house, if he was let one: who shared it, and how the children raised there were doing. Then the
  Undercroft, always: every anchor set and he saved the University, and rumors of his heroism
  spread; any short of that, and the monsters below overflowed onto the campus.
  A click, Space, Enter or the right arrow goes on; the left arrow goes back.
- **Sleep and ending the day** (`src/shared/game/sleep.ts`): midnight to 06:00 is for
  sleep and nothing else. Nothing the player sets out on may start in those hours or run
  into them (rest aside), and whenever the clock stands in them with no scene open, he
  sleeps until 06:00. **End the day** on the day screen does the same from any hour: it
  lists the classes, shift and plans still to come that he would miss, asks, and then
  skips straight to 06:00 the next morning. Either way he wakes with full energy, at home:
  the place his room is in, or where a new game starts him. What
  was skipped is settled as usual: a missed shift is a strike, a missed exam is failed.
- **How she feels afterwards** (`src/shared/game/memory.ts`): affection, trust and desire
  are not earned by the hour. When a scene ends, the same request that writes each love
  interest's memory of it asks how the scene changed what she feels for the player: a
  a sentence of why, then a word for the change in each of the three (`much less` through
  `unchanged` to `much more`), as one JSON object. The words are worth what
  `relationships.json`'s `sceneChange` says (-8 to 8), so pacing is tuned there and not in
  the prompt. She is asked to judge as herself, and is given her personality and traits,
  what she admires and whether he has it, where the two of them stand, her last comfort
  reading, whether she walked out, any gifts, and the whole conversation; nothing is owed
  for turning up, and a scene that left no mark is `unchanged`. The changes are applied when the scene
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
  screen. A character is told at most **Memories recalled in a scene** of her memories (a
  setting on the LLM tab, `memoryRecall` in the settings, eight by default; one for both LLMs,
  since the prompt is written before it is known which answers), core first, then
  normal, then fleeting, and the most recent first within each (`selectMemories` in
  `src/shared/game/memory.ts`). A memory saved before levels existed counts as normal.
  If the LLM is unavailable, a plain note built from the activity list is saved instead, and
  Retry on the summary screen asks again for those notes alone. It changes their wording and
  level only: what the scene did to how she feels was settled as it ended.
- **Global memories** (`globalMemories` in the save): what the player says everyone knows,
  about himself or about a big event. Nothing writes one but him: **Add global memory** at the
  bottom of the summary screen, or his profile on the phone. They have the same levels and go
  through `selectMemories` under the same **Memories recalled in a scene** limit, counted
  separately from a character's own. `buildCharacterPrompt` tells them to every character, NPCs
  included, in scenes and DMs.

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
likes, friends, room or secrets). A new character starts from a few words the Main LLM
writes her whole profile from (`src/shared/game/draftCharacter.ts`), from nothing, or from a
SillyTavern card, the PNG or its JSON (`src/shared/game/sillyCard.ts`). A card is imported as it
is (her name, its example chats, its lorebook as what she knows, its description and
scenario as her backstory, its personality, and any age of 18 or over it states; never its
picture) or with the rest written by the LLM, which is given the card to bring
her into the setting; what the card has as it is is put over what the LLM wrote. `{{char}}`
becomes her name and `{{user}}` becomes `{player}`. The Profile tab has her birthday, whether she knows him
already when a game starts (`startsAt`, with her three meters), what she knows, and when
each secret is told (`revealWhen`, the same conditions an activity's requirements use). On
the Media tab an outfit can be her usual one, worn only where an event puts her in it
(`oneOff`), or named for an event's outfit ("Worn for", from `eventOutfits` in
`src/shared/game/events.ts`: those a calendar event's, a getaway's or a story beat's part puts her in). Those
outfits of hers, with their pregnant forms, are kept under a folded **Event outfits** section below her own (not her
usual clothes, nor a day outfit), and its buttons add one the game has that she lacks, with its pregnant form, ready
to draw: the bathrobe the springs trip starts her in, the swimsuit the coast's beach does (`EVENT_OUTFITS` in
`SpritesTab.tsx`). Both are drawn neutral only. An outfit ticked **Day outfit** (`day`) lasts
the day; any other (nude, the bathrobe) lasts only the scene, and her usual clothes always
last the day. As each day begins everyone is dressed (`dressForDay` in
`src/shared/game/pregnancy.ts`, an idle effect in `App.tsx`): in the `outfitId` of an orientation
step or event part of that day she is cast in, when it is a day outfit she has (`dayOutfitsPlanned` in
`dayDress.ts`, so that she is already in what its cutscene draws her in); else in the outfit named for an
event that day if she has one; otherwise one of her day outfits drawn at random (the same for
the same day of the same game), kept in the save as `dayOutfits` until the next day. A day
outfit she changes into in a scene she keeps on after it (`keepDayOutfits`, as the scene is
summed up); one for the scene alone comes off with it. Everything that shows her outside a
scene goes through `wornOutfit`, which reads this. Her room has a picture by day and one by
night (`room.images`; either shows when the other is missing), or uses a view of the
place it is in (`room.viewId`). Everyone is saved to the add-on folder as
`love-interests/<id>.json`; one with a built-in character's id takes that character's
place, and deleting the add-on puts the original back. Such a file saved by an older version
is brought up to date as it is loaded (`upToDate` in `addons.ts`): every outfit the game's
character has that the file lacks is added after its own, and every field the file leaves out
is hers; what the file says is kept, and the file is not written. A love interest of the
player's own is given each of the game's outfits she lacks as it loads (`GAME_OUTFITS` in
`src/shared/game/gameOutfits.ts`: bathrobe, swimsuit, ao dai, sarong, sari, festival whites
and the adventurer's outfit of the echoes, each with its pregnant form), with no pictures:
slots for the player to draw. One of these with no pictures is not yet hers (`drawn`): it is
not drawn for her day nor offered to the LLM, and where a part asks for it she goes as she
is. The Sprites tab's Event outfits offers to add any of them she does not have.

## Art tool (ComfyUI)

The content editor's **Media** tab can draw a character's sprites on your own ComfyUI.
Pick the character first; then "Generate a picture" on an outfit, or "Generate" on a sprite
to draw it again, opens the art tool on that outfit and expression. It is a tool you call
directly: nothing in a scene ever calls it, and it talks only to the address you give it.

- **The tool** (`src/renderer/src/ui/art/ArtTool.tsx`) is a dialog any editor screen can
  open with a target: a sprite of a character, a background, or a photo. The Media tab
  opens it for sprites, of love interests and NPCs alike, and a love interest's room opens
  it for a background: her room's pictures, by day and by night, can be uploaded or
  generated from the room's description, or the room set to one of the views of the place
  it is in. Photos have no
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
  and a sex-act drawn pregnant shares the prompt of the sex-act it is built on. The game ships
  a clip workflow for each kind of graphics card (`minimax h3 eros RTX.json`, the default, and
  `minimax h3 eros AMD.json`, which differ only in their upscaler). "Video workflow" under
  ComfyUI setup, in Settings as in the art tool, picks this computer's; it is kept in
  `comfy.json` (`videoWorkflow`), never in the game's `bundle.json`, and the models and nodes
  checked for are only those of the one chosen. The clip's size
  and length are the workflow's own. The clip is saved beside the picture as an `.mp4`,
  and clips have a time limit of their own, since they take far longer than a picture.
  A sex-act of her own has no prompt in the settings: an edited prompt can be kept on the
  pose ("Keep this prompt", `clipPrompt`), for that pose of hers only. "Make missing clips"
  on the NSFW side makes one, one after another, for every sex-act with a picture and no
  clip, as the tool would with nothing changed (`clipRequest` in `ui/art/ClipForm.tsx`).
- **Cutting out**: a sprite's flat background is made transparent from the border inward
  and, unless "edges only" is ticked, in the gaps the art closes around as well (inside a
  loop of hair, between an arm and the body); edges only keeps a gap that is meant.
- **Using a picture**: "Use as the sprite" puts it on the outfit under that expression in
  the editor's draft; saving the character keeps it, like any other edit.
- **Locations** (Edit game content, Locations): each of the game's places can be changed
  there: its name, its two texts, opening hours, whether it is indoors or private, the drill
  played there, and its pictures. `description` is what the LLM is told in a
  scene there (what the place is and what goes on in it); `appearance` is only what can be
  seen, and is sent to the image model and nothing else. A place has views, as a character has
  outfits (the first is shown unless the player picks another), and each view is drawn
  twice, by day and by night, as an outfit is drawn once for each expression; whichever
  has not been drawn shows the other. Each period of the calendar is marked `light: day`
  or `night` (evening and night are dark). Either picture can be uploaded or generated
  from the appearance, and one button draws whichever a view is missing. A changed place is saved to `locations/<id>.json` in the add-on folder and
  laid over the game's own; "Put back the original" removes it. Places cannot be added
  there, since a place has to be on the map to be reached.
- **Transparent sprites**: a character's sprites and her walking picture come back from ComfyUI
  with no background. Their default, `krea2 comic book sprite.json`, is the comic-book workflow
  with BiRefNet (comfyui-rmbg, in `downloads.json`) taking the background away before it is
  saved. Every other kind of picture names `krea2 comic book.json` in `bundle.json`. BiRefNet
  judges by region, and keeps white the frame walls in, such as the gap between two legs that run
  off the bottom edge; so as each sprite or walking picture is filed, the card it left is taken out
  (`clearLeftCard` in `src/main/comfy/backgroundKey.ts`, run by `withoutLeftCard` in
  `src/main/comfy/png.ts`): a fill from the card still on the frame's edge, through card only,
  that gives a soft edge to what it clears and leaves BiRefNet's own edges alone. A picture with no
  card left is filed as it came, and the workflow ComfyUI writes into the PNG is kept. The editor
  has no cutting out of its own. The item, icon, below and walk scripts still draw on a white
  card with that one (`onCard` in `scripts/lib/pictures.ts`) and key it out themselves
  (`cutOut`, with `src/main/comfy/backgroundKey.ts`), working inward from the edges so white
  inside the figure is left alone.
- Settings about this computer (the address, where the models are, how long to wait) are
  kept in `comfy.json` in the app's user data folder. Settings about a workflow, a kind of
  picture or a clip are the game's, in `content/default/comfy/bundle.json`: with the
  game's own files being edited, the editor writes changes there, and otherwise a player's
  changes go into their `comfy.json`, which holds only what differs from the game's.

## Events

An event in `calendar.json` is talked about by everyone while it is coming up, and one with a place and hours can be
gone to as an outing. Two things make one more than that:

- **The day and the hours.** An event's days are the whole of each day it is on; its hours (`startHour`, `hours`), or
  the hours of its program's parts, are when something happens at it. Places and people are dressed for the whole
  day; scenes, and where those who said they would come are (`eventKeeping`), follow the hours. A holiday with a
  dinner is an event with no hours of its own and the dinner in its program, as the Feast of First Frost is.
- **A dressed place.** A view of a location whose `id` is the event's id, or whose `name` is the event's name, is shown
  there while the event is on, by day and by night (`backgroundFor`). Its `description` tells the characters what the
  place looks like dressed. The Commons has one for the Feast of First Frost (`first-frost`).
- **Dressed people.** A character with an outfit whose `id` is the event's id wears it from morning to night while it
  is on (`dressForDay`), unless a scene has put her in a day outfit since. Dorrit has one for First Frost. A cutscene can
  also name its speaker's outfit (`outfitId`), and change anyone's as it goes: a line `[OUTFIT: Tamsin=nude]` or
  `[EXPRESSION: Maren=aroused]` (no name: the speaker's) is not read, and changes her from the next line on
  (`cutsceneBeats` in `src/shared/game/cutscene.ts`). A society's night hands the scene after it the looks it left
  everyone in.
- **A program** (`program`, `src/shared/game/eventParts.ts`): scripted parts of the event, each on one of its days
  (`day`, from 1) at an hour, for some hours, at the event's place or its own. While a part is to come or under way it
  is a card on the day's screen; going takes him there at its hour, plays its `cutscene` if it has one (written lines
  by one speaker, read as the welcome is, `ui/IntroView.tsx`), and then opens a scene with its `description` as the
  narration and its `direction` told to the LLM. Who is in it: `castIds` if it names them; else whoever said she would
  be at the event (`[ATTENDING]`, which an event with a program can be said yes to whether or not it keeps hours of its
  own); else, up to `castSize`, the love interests he has met and is closest to. A part
  marked `required` holds the day until it is attended or over, as orientation does. Each is gone to once
  (`partsAttended` in the save). An event with a part on today is offered by its part, not as an outing as well.
  A part can be a **date** (`date`: `most`, `gain`, `loss`), as the Lantern Festival's is: going, he picks one to
  `most` of the women he has met (`ui/DateDialog.tsx`), who are its cast and gain `gain` of affection, trust and
  desire; every woman with a claim on him he leaves out (in a relationship with him, slept with him, or `jealous`)
  loses `loss` of each (`passedOver`). Let go by unattended, it costs every one of them the same once its hours are
  past (`settleMissedDates`, an idle effect, `date-missed:` in `flags`).
  A part can play an `animation` as it begins: `lanterns` (`ui/LanternRelease.tsx`) has those in it, standing in their
  happy sprites, say a few lines in comic balloons (asked of the LLM as it opens, `buildLanternPrompt` in
  `src/shared/game/lanternLines.ts`, the Undercroft's banter reader), then let lanterns go at the pond while the view
  follows them up the sky (`npm run preview:lantern -- <who>`, with sample lines).
- **Trips** (`src/shared/game/trips.ts`): a trip away over a break, booked at a part of an event before it (`booking`:
  the trip's event, `most` along, `price` a head, him included, and the `minStage` she must be at to say yes). That
  part's lines are read (his own thoughts, as `*narration*`), then the booking screen in the phone's frame
  (`ui/TripBooking.tsx`); not going is a choice. The trip's own event has parts marked `onTrip`, which are only for one
  who booked it (`trips` in the save), with those he booked as their cast. While it is on he is away, and it plays as one
  scene after another with no day screen between: the next part today is gone to at once, and one tomorrow after a
  night slept where he is, with the morning's turn (`nextTripPart`, an idle effect). He sleeps where
  he is (`tripUnderway`), his job's shifts on those days are not his to work (`awayOnDay`), and once its last part is
  done he is taken home (`comeHome`, an idle effect). Each part can play `animations` before its scene
  (`ui/TripMoment.tsx`): the drive there and home (a few LLM lines in balloons, `buildMomentPrompt` in
  `src/shared/game/momentLines.ts`, told which trip by its event's id, `summary` for what the place is) and an
  opening of its own per outing. The Mistmoon Break at Saltmere Springs is the calendar's one: booked on 27
  Harvestwane, then six outings over four days (`npm run preview:trip`).
- **Weekend getaways** (`getaways.json`, `src/shared/model/getaway.ts`, `src/shared/game/getaways.ts`): trips he books
  himself from the phone's **Trips** app (`ui/TripsApp.tsx`), which also lists every trip he has coming, the Break's
  among them, with who is going and its group chat. A getaway is a template: its place, its `days` from the weekday it
  `startsOn`, the days of the year it can begin between (`from`, `until`), `most` along, `price` a head and `minStage`
  (Friend for both there are), its listing, and its program. The weekends it can be booked for are those after today,
  inside its window, all of it before the term ends, with nothing else on any day of it (`getawayDays`). Booked, it
  becomes an event of the save's own on those days (`getawayEvent`, id `<getaway>@<day>`, every part `onTrip`) and is
  booked as the Break is (`bookTrip`), so from then on it plays as a trip. Its `gain` (affection, trust, desire) goes
  to each woman along as its first part begins, before the first scene, as given whatever he has learnt or taken
  (`setOff` in `eventParts.ts`); nobody left at home minds. It rises with the price, less for each dollar the dearer
  the trip, and leans on what the trip is about: desire at the beach and the atoll, affection at the lake. `getaways.json` holds them under `trips`, and beside them the `notice`: a DM sent once, from its hour on its day of term (`tellOfGetaways`, an idle effect, marked `getaways-told`), which in the default pack is Tamsin, the Sunday after class changes close, telling him to look in his phone and hinting she would come. The default pack's are a weekend at
  Brightshore on the coast (the beach in swimsuits, the boardwalk at night, a sunrise swim) and camping at Fernhollow
  (the trail, the campfire, dawn at the lake), and a cruise on Jadewater Bay (Dating, $250 a head: the deck among the karst
  islands, the night in the private cabin, the sea cave), an escape to Coralmere Atoll (Dating, $250: the reef in
  swimsuits, the overwater bungalow and the sandbar in sarongs, each woman's worn her own way) and a weekend at Saffron
  Lake (Dating, $200: the boat at sunset and the palace rooftop in saris, the festival of colors in festival whites).
  The last three are flown to (`travel: 'airship'` on the getaway and its
  event): their travel there and home is the airship going by in the sky (`VEHICLES` in `TripMoment.tsx`, its heads in
  its round portholes, the sky its `road`), and the lines asked on the way are aboard it. Each opening with a moment of its own over a looping clip of its view
  (`TripMoment.tsx`, its effects kept over the clip for these: gulls, the lights coming on, glints on the water, motes
  in the pines, sparks off the fire, mist on the lake).
- **Masked balls** (`src/shared/game/masquerade.ts`): a part with `masquerade` is its dances, one after another
  through its hours. The women he has met who are closest to him (affection, trust and desire together) and in no
  arrangement with him come to him in turn, as many as there are `masks`, in a shuffled order, each in one of them; too
  few, and the `standInId` makes up the numbers as she is (Lira, who wears nothing anyway), or comes alone. A mask is a
  gown, a mask and a shimmering updo drawn once for anyone: in it she has its sprites and sex-acts, everyone's height,
  and its name in the interface until he names her (`inMasks`, in the renderer and in `src/main`), while the LLM plays
  her as herself and is told to keep her secret. A dance ends with no summary and moves nobody's feelings, which
  would give her away (`endDance` in `App.tsx`). After the last dance he picks one of them and names her
  (`ui/MasqueradeGuess.tsx`): wrongly, and she loses `loss` of affection; rightly, and a scene follows at the
  `privateViewId` with her in her mask, uninhibited, for its sex-acts. The Masquerade Ball in the Grand Ballroom (an
  `eventOnly` place, off the map, as Saltmere is) is the one there is, on 20 Emberfall.
- **Story beats** are events marked `secret`, usually with a `year` so they happen once: they are left off the
  calendar and out of everything the characters are told beforehand, and their program still plays, usually as one
  `required` part with a fixed `castIds`. A part can set the view its scene is in (`viewId`), and what everyone in it starts in (`outfitId`, a pregnant woman in its pregnant form). A step of orientation can
  open on a cutscene too, and name everyone in it (`castIds`, every student named is kept): the Assembly opens on Tamsin
  finding him, and the end of the Campus Tour on the Queen's arrival, where Seraphine first meets him with Tamsin there.
  On orientation day nobody can have been met yet, so a first meeting written there is always the first.
- **Cutscenes** (`IntroSchema`): each place in one says who stands on the stage (`castIds`, the speaker alone when left
  out, nobody for a picture that has them in it already); a line that starts with a name ("Seraphine: ...") is hers,
  any other the speaker's, and one in asterisks is narration.
- The load check refuses a part on a day the event does not have, a place or cast that does not exist, and a cutscene
  by nobody or at a view a place does not have.

## Story beats

`story.json` (`src/shared/model/story.ts`, `content.story`) holds scenes written for one love interest, by her id,
one for each stage of what she and the player are that has one (`stage`): a cutscene she speaks, and the
`direction` the scene after it runs on, so that each woman has an arc of her own and not only the common prompt. A
beat says where it is (`locationId`, a `viewId`, or `inHerRoom`), when (`startHour`, `hours`, and a `weekday`
when it has to be one), what she wears (`outfitId`), what she writes to ask him to come (`invitation`), what going
does (`effects` on her meters, `stopsBirthControl`), and for Lover two more tellings: one for when he has already
been to bed with her (`ifIntimate`, as a society's night has), and one for when she has already stopped taking
anything against the Bloom in this game (`offBirthControl` in the save), or is already carrying his child
(`ifUnprotected`: the same moment as a confession only, with nothing said of either; it comes first). One who never
took it, as Dinah, Lira and Lola never did, is not "already off" it: for her only a pregnancy brings that telling. Each beat is one ask, had once: reaching the stage sends her invitation
and puts a card on his calendar, marked as hers and not an ordinary plan; going reads the cutscene and opens the
scene with her alone; missed, it is gone. The default pack has a beat at Friend, Dating and Lover for every love
interest (Tamsin starts a friend, so has no Friend beat), fifty-nine of the stages, each at a place of hers: Seraphine's
warding lesson is at Aether and Anwen's night ride at the Ridge Road, two places off the map that exist for these
(`eventOnly`). At Lover most stop taking anything against the Bloom; Daphne, Elowen, Tink and Yulia do not, and
Dinah, Lira and Lola never took it. The load check holds a beat to a stage, place, view, outfit and weekday there
are, and to cutscenes spoken by her; `src/main/content/story.test.ts` pins the pack's, and that the unprotected
telling says nothing of birth control or a child. The lines are written with nano-gpt (see `CLAUDE.md`), not by
hand.

One more beat is not of a stage: `thriving`, her thanks for their child kept thriving in his house for
`THRIVING_WEEKS` (four) weeks running (`thrivingWeeks` on the child, see The house), in its nursery at six in the
evening. It is asked whenever it is earned, ahead of whatever stage she is at, and once; its lines are written
with `{child}`, `{they}`, `{them}` and `{their}`, filled with the child's name and pronouns as it is read
(`aboutChild`). Every love interest has one, eighty beats in all.

Delivery (`src/shared/game/story.ts`): from 09:00, an idle effect in `App.tsx` sends the next invitation there is
(`sendStoryInvitation`): from the first love interest whose Bloomr he has and whose next beat's stage she has reached,
in her order, so that one skipped by a leap of affection still comes first. It is her `invitation` as a note from her,
with the beat as its plan (`story` on the proposal, the stage), for the beat's hour on the first day from now they are
both free (its weekday where it has one, two weeks ahead at most); the beat is flagged as asked (`story:<id>:<stage>`)
as it is sent, so declined, lapsed, cancelled or stood up, it never comes again. Only one is out at a time. It is
marked as hers wherever it shows: the accept panel in the DM has a beating heart in a gold ring and a rose-and-gold
frame, the day's card for it a gold edge and a heart in its chip, the calendar entry gold with a heart
(`story` on the agenda item). Keeping it (`attendStory`) reads the telling it is for (unprotected, intimate, or its
own), applies its `effects` and, in a telling where she says so, `stopsBirthControl`, and opens the scene with her
alone on that telling's direction, in her room where it is held, in its outfit and view.

The same marking is given to the other offers that are more than a plan (`planMark` in `appointments.ts`): the
Office's offer of the house and the viewing it sets, with a house in moss, and the guide's note setting the way down
below (`offer: 'below'` on the note, which shows the plan with it while it is on the calendar), with a sword in
dark stone. Only the heart beats.

## Cards

Fixed-limit Texas hold 'em at the Honeyed Bee (`content/default/poker.json`, `src/shared/game/poker.ts`,
`ui/PokerView.tsx`). A featured button on the day's screen there opens the table while the place is open and he has
at least the cap on a hand (`canPlayPoker`).

- **Stakes**: blinds of `smallBlind`/`bigBlind` ($1/$2), bets of `smallBet` before the turn and `bigBet` from it
  ($2/$4), at most `maxBets` bets and raises a street (3), and nobody puts more than `handCap` ($10) into a hand. Since
  everyone still in has matched the same amount before each street, a call never goes over the cap and there are no
  side pots.
- **Who sits**: him, up to `maxLoveInterests` (4, so every seat) of the love interests who are there, those he has
  met first, and regulars from `regulars` in any of the `seats` (5) left over. Each regular has a `style` (`tight`, `aggressive`, `bluff`); a love interest's is
  her own, made from her id (`styleOf`).
- **How they play** (`decide`): her chance of winning against everyone still in, found by dealing the rest out 160
  times (`equity`), against what calling costs and the pot. Only her own cards and the board go into it.
- **Money** is settled at the end of each hand (`settlePokerHand`), and getting up takes `hours` (1) off the clock if
  he played a hand (`leaveTable`). Escape does nothing at the table, so a hand cannot be walked away from.

## Sound

`content/default/sounds.json` says what the game sounds like, and swapping a sound is editing it: point an entry's
`file` at another file under `content/default/sounds/`, and set its `volume` (0 to 1) and `credit`.

- **Cues** (`cues`, the list is `CUES` in `src/shared/model/sound.ts`): `click` for any button pressed anywhere,
  `open` and `close` for dialogs, `notice` for a toast, and the rest read off the game state as it changes
  (`soundCues` in `src/shared/game/sound.ts`): `message` (a DM from her), `coins` (money changed), `door` (arriving
  somewhere indoors), `skill`, `bond`, `pregnancy` and `birth`. Only the weightiest cue of one change is played, and a
  notice that comes with an event is not heard over it.
- **Ambience** (`ambience`, loops by an id of their own) and **places** (location id to an ambience by `day`, and
  by `night` if it differs): the loop for where he is fades in as he arrives and changes with the dark
  (`ambienceAt`). A place left out is silent.
- **Her voice** (`reactions` on a love interest, a sound's name to a file under `sounds/voices/<id>/`): a few
  wordless sounds each (giggle, sigh, sigh-content, gasp, huff, surprised, yawn, aww, satisfied), designed and
  recorded on ElevenLabs by `scripts/generate-voice.ts` (each voice's id in `sounds/voices/voices.json`, the key in
  `.env`). Her scene prompt lists hers, and a reply may write `[REACTS: giggle]`, or `[REACTS: Faye=giggle]` in a
  group, one a reply; `parseDirectives` hides it, main keeps the first one named that the one named has, and the
  renderer plays it on the effects volume as the reply comes in (`playVoices`). The test checks every love interest
  has the same set and every file is there.
- **Lines written ahead, voiced** (`lines` in `sounds.json`, by `lineKey` in `src/shared/game/voice.ts`): the tours
  (interface, day, courses, Undercroft), orientation's welcome and cutscenes, the Societies Fair's hellos and
  rivalry, the house's handing over, each one's first line, and every telling of every story beat are recorded in
  their speakers' voices by `scripts/voice-lines.ts`, which builds each line as the game shows it, so the key is the
  speaker and the words with his name as `{player}`. What is said leaves out narration and his name (`spokenOf`). Each
  is kept in a folder of what it is part of: `sounds/voices/<speaker>/<folder>/line-<key>.ogg`, the folder a tour
  (`interface-tour`), `orientation`, `societies-fair`, `house-handover`, `first-line`, or a story beat
  (`friend-beat`, `lover-beat`, `thriving-beat`). The tour and the cutscene player read each line aloud as it comes up
  (`playLine`), one at a time; a line rewritten is silent until the script is run again, which also drops recordings
  of lines no longer written. A thriving beat's lines that name the child are filled in as read: their recordings say "our baby" for the name,
  and are found by the line as written (`writtenLines`, `setWrittenLines`).
- **Her catch phrases** (`catchphrases` on a love interest, a phrase to the file of her saying it, `phrase-<slug>.ogg`
  beside her sounds): heard when a line she speaks says one, set off as a word of address is ("Sit down, darling."),
  not in narration nor as a word in passing (`catchphraseIn` in `src/shared/game/scene.ts`, found in main). One a
  reply, after her sound if she made one. Add a phrase to her file with an empty file and to her `verbalQuirks`, and
  `generate-voice.ts <id>` records it (`SAY` in the script for one said some way of its own); the test fails for one
  unrecorded or missing from her quirks.
- **Weather** (`weather`, a loop by weather id): played under the place's own loop, on the ambience volume, at a
  third of it indoors (`weatherSoundAt`, `setWeather`). A kind left out is silent: clear, overcast, mist, snow and heat are.
- **The Undercroft** (`fight`, by the kind of a fight effect): each effect is heard as it lands (`playFight` from
  `BelowFx`), one of its sounds at random where it has several; `victory`, `defeat` and `descend` are cues, played
  by `ExpeditionView` as a fight is won, the run is lost, and each depth is gone down to.
- **The epilogue** has music of its own (`music.epilogue`, generated on ElevenLabs): played once through on the music
  volume as the epilogue opens, in place of the place's loop, with a fade baked into its last six seconds, and faded out
  if he leaves before it ends.
- **Dawn**: `dawn` plays under the night wheel after sleeping, crickets crossfaded into a bell and birdsong, with `stamp` over it as the kiss lands.
- **Scenes**: `sent` as his line goes, `reply` as hers comes back; an achievement's card comes in with `achievement`.
- **Volumes** for effects, ambience and the title music are the Sound tab of Settings, kept on the computer.
- Most cues are generated on ElevenLabs as one set by `scripts/generate-cues.ts` (its prompts; takes go to
  `out/cue-takes/` to listen to, and `--use cue=take` puts one in, trimmed and brought to a peak of -3 dB); the
  phone's and the stamp are still CC0 (Freesound). The older ambience is CC0 (Freesound); newer ambience is
  generated as 30-second loops by `scripts/generate-ambience.ts`, which holds each loop's prompt and the places
  that play it, and writes both into `sounds.json`. All are credited in each entry's `credit`.
  `src/main/content/sounds.test.ts` fails if a cue has no sound, a file is missing or a sound is uncredited.

## Money

Wages, the rent, a child's keep and the price of every room of the house are balanced
against each other, and `src/main/content/economy.test.ts` pins the balance: any job
keeps the house and one child with care, a strong player can build most of it, and one
whose stats have earned him half the pay bonus at a good job can finish the whole house by
the end of the year with four children in it, which the rate alone does not. Change a number in `jobs.json` or
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

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import {
  CalendarEventSchema,
  CatalogueSchema,
  DEFAULT_VIEW,
  LocationSchema,
  LoveInterestSchema,
  NewGameSchema,
  STANDARD_OUTFITS,
  TraitSchema,
  validateContentPack,
  type CalendarEvent,
  type ContentPack,
  type Location,
  type LoveInterest,
  type Trait
} from '../../shared/model'
import { ADDON_PREFIX, isSafeId, type ContentOrigin, type EditorInfo } from '../../shared/editor'
import { readPack } from './loader'

const LOVE_INTERESTS = 'love-interests'
const LOCATIONS = 'locations'
const LOCATIONS_FILE = 'locations.json'
const TRAITS_FILE = 'traits.json'
const CATALOGUE_FILE = 'catalogue.json'
const NEW_GAME_FILE = 'new-game.json'
const EVENTS_FILE = 'events.json'
const CALENDAR_FILE = 'calendar.json'
const SPRITES = 'sprites'

interface WithId {
  id: string
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** The add-on folder's character files of one kind, as raw JSON by file name. Unreadable ones are reported, not thrown. */
function readAddonFiles(addonDir: string, folder: string, issues: string[]): { file: string; raw: unknown }[] {
  const dir = join(addonDir, folder)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .flatMap((file) => {
      try {
        return [{ file, raw: readJsonFile(join(dir, file)) }]
      } catch (error) {
        issues.push(`${file}: ${(error as Error).message}`)
        return []
      }
    })
}

function readAddonTraits(addonDir: string, issues: string[]): unknown[] {
  const path = join(addonDir, TRAITS_FILE)
  if (!existsSync(path)) return []
  try {
    const raw = readJsonFile(path)
    if (!Array.isArray(raw)) throw new Error('expected a list of traits')
    return raw
  } catch (error) {
    issues.push(`${TRAITS_FILE}: ${(error as Error).message}`)
    return []
  }
}

/** Lays add-on entries over the base ones: same id replaces, new id is added at the end. */
function overlay<T extends WithId>(base: T[], added: T[]): T[] {
  const merged = base.map((entry) => added.find((a) => a.id === entry.id) ?? entry)
  return [...merged, ...added.filter((a) => !base.some((entry) => entry.id === a.id))]
}

function origins(base: WithId[], added: WithId[]): Record<string, ContentOrigin> {
  const result: Record<string, ContentOrigin> = Object.fromEntries(base.map((entry) => [entry.id, 'base']))
  for (const entry of added) result[entry.id] = base.some((b) => b.id === entry.id) ? 'override' : 'addon'
  return result
}

export interface LoadedContent {
  content: ContentPack
  info: EditorInfo
}

/**
 * Loads the game's content with the user's add-ons laid over it. The base pack has to be
 * valid. An add-on that isn't (bad JSON, a missing field, a reference to something that
 * doesn't exist) is left out and reported, so one bad file can't stop the game starting.
 */
export function loadWithAddons(packDir: string, addonDir: string): LoadedContent {
  const base = readPack(packDir) as { loveInterests: unknown[]; traits: unknown; locations: unknown[] }
  validateContentPack(base)
  const baseTraits = (Array.isArray(base.traits) ? base.traits : []) as Trait[]
  const baseLoveInterests = base.loveInterests as LoveInterest[]
  const baseLocations = base.locations as Location[]
  const issues: string[] = []

  const traits: Trait[] = []
  for (const raw of readAddonTraits(addonDir, issues)) {
    const parsed = TraitSchema.safeParse(raw)
    if (parsed.success && isSafeId(parsed.data.id)) traits.push(parsed.data)
    else issues.push(`${TRAITS_FILE}: a trait was left out (${parsed.success ? 'its id is not usable' : parsed.error.issues[0]?.message})`)
  }

  // A location file changes one of the game's own places: what is said of it, and its pictures. It cannot add one,
  // since a place has to be on the map to be reached.
  const acceptedLocations: Location[] = []
  for (const { file, raw } of readAddonFiles(addonDir, LOCATIONS, issues)) {
    try {
      const id = (raw as Partial<WithId>).id
      if (!baseLocations.some((location) => location.id === id)) throw new Error('there is no such location in the game')
      validateContentPack({ ...base, locations: overlay(baseLocations, [...acceptedLocations, raw as Location]) })
      acceptedLocations.push(raw as Location)
    } catch (error) {
      issues.push(`${LOCATIONS}/${file} was left out: ${(error as Error).message}`)
    }
  }

  // An add-on event joins the calendar, or takes the place of one of the game's own with its id.
  const baseCalendar = (base as unknown as { calendar: { events?: CalendarEvent[] } }).calendar
  const baseEvents = baseCalendar.events ?? []
  const acceptedEvents: CalendarEvent[] = []
  const calendarWith = (events: CalendarEvent[]) => ({ ...baseCalendar, events: overlay(baseEvents, events) })
  for (const event of addonEvents(addonDir)) {
    try {
      validateContentPack({ ...base, locations: overlay(baseLocations, acceptedLocations), calendar: calendarWith([...acceptedEvents, event]) })
      acceptedEvents.push(event)
    } catch (error) {
      issues.push(`${EVENTS_FILE}: ${event.name || event.id} was left out: ${(error as Error).message}`)
    }
  }

  // Each character, love interest or NPC, is tried on its own against everything accepted so far.
  const accepted: LoveInterest[] = []
  const pack = (loveInterests: unknown[]) => ({
    ...base,
    calendar: calendarWith(acceptedEvents),
    locations: overlay(baseLocations, acceptedLocations),
    traits: overlay(baseTraits, traits),
    loveInterests: overlay(baseLoveInterests, loveInterests as LoveInterest[])
  })
  for (const { file, raw } of readAddonFiles(addonDir, LOVE_INTERESTS, issues)) {
    try {
      const id = (raw as Partial<WithId>).id
      if (typeof id !== 'string' || !isSafeId(id)) throw new Error('its id is missing or not usable')
      validateContentPack(pack([...accepted, raw]))
      accepted.push(raw as LoveInterest)
    } catch (error) {
      issues.push(`${file} was left out: ${(error as Error).message}`)
    }
  }

  // The course catalogue built in the editor. One that can't be read is as good as none: it is built again there.
  let catalogue: unknown
  if (existsSync(join(addonDir, CATALOGUE_FILE))) {
    try {
      catalogue = CatalogueSchema.parse(readJsonFile(join(addonDir, CATALOGUE_FILE)))
    } catch (error) {
      issues.push(`${CATALOGUE_FILE} was left out: ${(error as Error).message}`)
    }
  }

  // The player a new game starts with, as changed in the editor. One the game would not load with is left out.
  let newGame: unknown
  if (existsSync(join(addonDir, NEW_GAME_FILE))) {
    try {
      const read = readJsonFile(join(addonDir, NEW_GAME_FILE))
      validateContentPack({ ...pack(accepted), newGame: read })
      newGame = read
    } catch (error) {
      issues.push(`${NEW_GAME_FILE} was left out: ${(error as Error).message}`)
    }
  }
  const playerChanged = newGame !== undefined

  let content: ContentPack
  try {
    content = validateContentPack({ ...pack(accepted), ...(catalogue !== undefined && { catalogue }), ...(newGame !== undefined && { newGame }) })
  } catch (error) {
    // The add-on traits broke something in the base pack (a trait a character uses, say). Go without add-ons.
    issues.push(`Add-ons were left out: ${(error as Error).message}`)
    return { content: validateContentPack(base), info: { addonDir, issues, loveInterests: origins(baseLoveInterests, []), traits: origins(baseTraits, []), locations: origins(baseLocations, []), events: origins(baseEvents, []), playerChanged: false, base: false, assetPrefix: ADDON_PREFIX } }
  }
  return {
    content,
    info: { addonDir, issues, loveInterests: origins(baseLoveInterests, accepted), traits: origins(baseTraits, traits), locations: origins(baseLocations, acceptedLocations), events: origins(baseEvents, acceptedEvents), playerChanged, base: false, assetPrefix: ADDON_PREFIX }
  }
}

/**
 * Loads the game's own content for editing in place: no add-ons are read, and what the
 * editor saves is written into the pack. This is how the game runs from its source, where
 * every change is a change to the base game. The "add-on folder" the editor is given is
 * the pack itself, whose files are laid out the same way; every character and trait can be
 * deleted, as one made in the editor can.
 */
export function loadBase(packDir: string): LoadedContent {
  const raw = readPack(packDir) as { loveInterests: WithId[]; traits: unknown; locations: WithId[] }
  const content = validateContentPack(raw)
  const all = (entries: WithId[], origin: ContentOrigin) => Object.fromEntries(entries.map((entry) => [entry.id, origin]))
  return {
    content,
    info: {
      addonDir: packDir,
      issues: [],
      loveInterests: all(raw.loveInterests, 'addon'),
      traits: all((Array.isArray(raw.traits) ? raw.traits : []) as WithId[], 'addon'),
      locations: all(raw.locations, 'base'),
      events: all(content.calendar.events, 'addon'),
      playerChanged: false,
      base: true,
      assetPrefix: ''
    }
  }
}

/** Writes the player a new game starts with to the add-on folder, after checking the game would still load with him. */
export function savePlayer(addonDir: string, content: ContentPack, raw: unknown): string[] {
  const parsed = NewGameSchema.safeParse(raw)
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.') || 'player'}: ${issue.message}`)
  const newGame = parsed.data
  if (newGame.player.name.trim() === '') return ['He needs a name to start with.']
  if (newGame.room && newGame.room.name.trim() === '') return ['Say what his room is, in a few words.']
  try {
    validateContentPack({ ...content, newGame })
  } catch (error) {
    return (error as { issues?: string[] }).issues ?? [(error as Error).message]
  }
  mkdirSync(addonDir, { recursive: true })
  writeFileSync(join(addonDir, NEW_GAME_FILE), `${JSON.stringify(newGame, null, 2)}\n`)
  return []
}

/** Removes the changed player, which puts him back as the game shipped him. */
export function resetPlayer(addonDir: string): string[] {
  const path = join(addonDir, NEW_GAME_FILE)
  if (!existsSync(path)) return ['The player has not been changed.']
  rmSync(path)
  return []
}

/** The add-on folder's events, those of them that can be read as events. */
function addonEvents(addonDir: string): CalendarEvent[] {
  const path = join(addonDir, EVENTS_FILE)
  if (!existsSync(path)) return []
  try {
    const raw = readJsonFile(path)
    return (Array.isArray(raw) ? raw : []).flatMap((entry) => {
      const parsed = CalendarEventSchema.safeParse(entry)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return []
  }
}

/**
 * Adds an event or holiday to the calendar, or changes one, after checking the game would
 * still load with it. As an add-on it goes in the add-on folder's own list, and one with the
 * id of an event of the game's own takes its place; with `base`, the game's own calendar is
 * what is written.
 */
export function saveEvent(addonDir: string, content: ContentPack, raw: unknown, base = false): string[] {
  const parsed = CalendarEventSchema.safeParse(raw)
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.') || 'event'}: ${issue.message}`)
  // What the editor makes is written, not thought up in the middle of a game, and comes round every year.
  const event: CalendarEvent = { ...parsed.data, generated: false, year: undefined }
  if (!isSafeId(event.id)) return ['The id may only have lower-case letters, digits and hyphens, and must start with a letter or digit.']
  if (event.name.trim() === '') return ['A name is needed.']
  try {
    validateContentPack({ ...content, calendar: { ...content.calendar, events: overlay(content.calendar.events, [event]) } })
  } catch (error) {
    return (error as { issues?: string[] }).issues ?? [(error as Error).message]
  }
  if (base) {
    const file = join(addonDir, CALENDAR_FILE)
    const calendar = readJsonFile(file) as { events?: CalendarEvent[] }
    writeFileSync(file, `${JSON.stringify({ ...calendar, events: overlay(calendar.events ?? [], [event]) }, null, 2)}\n`)
    return []
  }
  mkdirSync(addonDir, { recursive: true })
  writeFileSync(join(addonDir, EVENTS_FILE), `${JSON.stringify(overlay(addonEvents(addonDir), [event]), null, 2)}\n`)
  return []
}

/** Takes an event off the calendar: one of the add-on's, or with `base` any of the game's own. */
export function deleteEvent(addonDir: string, id: string, base = false): string[] {
  if (base) {
    const file = join(addonDir, CALENDAR_FILE)
    const calendar = readJsonFile(file) as { events?: CalendarEvent[] }
    if (!(calendar.events ?? []).some((event) => event.id === id)) return ['There is no such event.']
    writeFileSync(file, `${JSON.stringify({ ...calendar, events: (calendar.events ?? []).filter((event) => event.id !== id) }, null, 2)}\n`)
    return []
  }
  const mine = addonEvents(addonDir)
  if (!mine.some((event) => event.id === id)) return ['That event is not an add-on.']
  writeFileSync(join(addonDir, EVENTS_FILE), `${JSON.stringify(mine.filter((event) => event.id !== id), null, 2)}\n`)
  return []
}

/** Writes the course catalogue every new game starts with. */
export function saveCatalogue(addonDir: string, raw: unknown): string[] {
  const parsed = CatalogueSchema.safeParse(raw)
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.') || 'catalogue'}: ${issue.message}`)
  if (parsed.data.courses.length === 0) return ['There are no courses in it.']
  mkdirSync(addonDir, { recursive: true })
  writeFileSync(join(addonDir, CATALOGUE_FILE), `${JSON.stringify(parsed.data, null, 2)}\n`)
  return []
}

/** Every character in the content, love interests and NPCs together, as they are written. */
function everyone(content: ContentPack): LoveInterest[] {
  return [...content.loveInterests, ...content.npcs]
}

/** Why the content would not be valid with these characters in it, if it wouldn't. */
function problemsWith(content: ContentPack, characters: unknown[], traits: unknown[]): string[] {
  try {
    validateContentPack({ ...content, loveInterests: characters, npcs: [], traits })
    return []
  } catch (error) {
    const found = (error as { issues?: string[] }).issues
    return found ?? [(error as Error).message]
  }
}

/**
 * Writes a character, love interest or NPC, to the add-on folder, after checking the game
 * would still load with it. One with the id of a built-in character takes that character's
 * place, whatever kind either is: saving an NPC as a love interest is how she becomes one.
 */
export function saveLoveInterest(addonDir: string, content: ContentPack, raw: unknown): string[] {
  const parsed = LoveInterestSchema.safeParse(raw)
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.') || 'love interest'}: ${issue.message}`)
  // Every love interest has the four standard outfits; any she was sent without are added, empty. An NPC has only what she is given.
  const li =
    parsed.data.kind === 'npc'
      ? parsed.data
      : {
          ...parsed.data,
          outfits: [
            ...STANDARD_OUTFITS.map((standard) => parsed.data.outfits.find((o) => o.id === standard.id) ?? { ...standard, sprites: {} }),
            ...parsed.data.outfits.filter((o) => !STANDARD_OUTFITS.some((standard) => standard.id === o.id))
          ]
        }
  if (!isSafeId(li.id)) return ['The id may only have lower-case letters, digits and hyphens, and must start with a letter or digit.']
  if (li.name.trim() === '') return ['A name is needed.']
  const problems = problemsWith(content, overlay(everyone(content), [li]), content.traits)
  if (problems.length > 0) return problems
  mkdirSync(join(addonDir, LOVE_INTERESTS), { recursive: true })
  writeFileSync(join(addonDir, LOVE_INTERESTS, `${li.id}.json`), `${JSON.stringify(li, null, 2)}\n`)
  return []
}

/** Removes a love interest's add-on file: an add-on character is gone, a changed built-in one is as it shipped. */
export function deleteLoveInterest(addonDir: string, id: string): string[] {
  if (!isSafeId(id)) return ['That is not a usable id.']
  const path = join(addonDir, LOVE_INTERESTS, `${id}.json`)
  if (!existsSync(path)) return ['There is no add-on file for that character.']
  rmSync(path)
  return []
}

/**
 * Writes a changed location to the add-on folder, after checking the game would still load
 * with it. It takes the place of the game's own location of that id; there is no adding one.
 */
export function saveLocation(addonDir: string, content: ContentPack, raw: unknown, base = false): string[] {
  const parsed = LocationSchema.safeParse(raw)
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.') || 'location'}: ${issue.message}`)
  const given = parsed.data
  // Every place has its default view, and it comes first.
  const location = {
    ...given,
    backgrounds: [given.backgrounds.find((view) => view.id === DEFAULT_VIEW.id) ?? { ...DEFAULT_VIEW, images: {} }, ...given.backgrounds.filter((view) => view.id !== DEFAULT_VIEW.id)]
  }
  if (!isSafeId(location.id) || !content.locations.some((l) => l.id === location.id)) return ['There is no such location in the game.']
  if (location.name.trim() === '') return ['A name is needed.']
  const ids = location.backgrounds.map((view) => view.id)
  if (ids.some((id, i) => !isSafeId(id) || ids.indexOf(id) !== i)) return ['Every view needs an id of its own, in lower-case letters, digits and hyphens.']
  try {
    validateContentPack({ ...content, locations: overlay(content.locations, [location]) })
  } catch (error) {
    return (error as { issues?: string[] }).issues ?? [(error as Error).message]
  }
  if (base) {
    // The game's own places are one list in one file: this one takes its place in it.
    const file = join(addonDir, LOCATIONS_FILE)
    const all = readJsonFile(file) as WithId[]
    writeFileSync(file, `${JSON.stringify(all.map((entry) => (entry.id === location.id ? location : entry)), null, 2)}\n`)
    return []
  }
  mkdirSync(join(addonDir, LOCATIONS), { recursive: true })
  writeFileSync(join(addonDir, LOCATIONS, `${location.id}.json`), `${JSON.stringify(location, null, 2)}\n`)
  return []
}

/** Removes a location's add-on file, which puts it back as it shipped. */
export function deleteLocation(addonDir: string, id: string): string[] {
  if (!isSafeId(id)) return ['That is not a usable id.']
  const path = join(addonDir, LOCATIONS, `${id}.json`)
  if (!existsSync(path)) return ['That location has not been changed.']
  rmSync(path)
  return []
}

function writeTraits(addonDir: string, traits: Trait[]): void {
  mkdirSync(addonDir, { recursive: true })
  writeFileSync(join(addonDir, TRAITS_FILE), `${JSON.stringify(traits, null, 2)}\n`)
}

function addonTraits(addonDir: string): Trait[] {
  return readAddonTraits(addonDir, []).flatMap((raw) => {
    const parsed = TraitSchema.safeParse(raw)
    return parsed.success ? [parsed.data] : []
  })
}

/** Adds a trait to the add-on library, or changes one. One with a built-in trait's id takes its place. */
export function saveTrait(addonDir: string, raw: unknown): string[] {
  const parsed = TraitSchema.safeParse(raw)
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.') || 'trait'}: ${issue.message}`)
  const trait = parsed.data
  if (!isSafeId(trait.id)) return ['The id may only have lower-case letters, digits and hyphens, and must start with a letter or digit.']
  if (trait.name.trim() === '') return ['A name is needed.']
  writeTraits(addonDir, overlay(addonTraits(addonDir), [trait]))
  return []
}

/** Removes a trait from the add-on library, unless a character would be left with a trait that no longer exists. */
export function deleteTrait(addonDir: string, content: ContentPack, baseTraitIds: string[], id: string): string[] {
  const mine = addonTraits(addonDir)
  if (!mine.some((trait) => trait.id === id)) return ['That trait is not an add-on.']
  if (!baseTraitIds.includes(id)) {
    const users = content.loveInterests.filter((li) => li.traitIds.includes(id)).map((li) => li.name)
    if (users.length > 0) return [`${users.join(', ')} ${users.length > 1 ? 'have' : 'has'} this trait. Take it off them first.`]
  }
  writeTraits(addonDir, mine.filter((trait) => trait.id !== id))
  return []
}

/**
 * Copies a picture or video into a love interest's add-on folder and returns the path to
 * write in the content, which the game serves from there.
 */
export function importAsset(addonDir: string, loveInterestId: string, sourcePath: string, prefix: string = ADDON_PREFIX): string {
  if (!isSafeId(loveInterestId)) throw new Error('Give the character a usable id first.')
  const dir = join(addonDir, SPRITES, loveInterestId)
  mkdirSync(dir, { recursive: true })
  const ext = extname(sourcePath).toLowerCase()
  const stem = basename(sourcePath, extname(sourcePath)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image'
  // Never overwrite: another sprite may still be using the file of that name.
  let name = `${stem}${ext}`
  for (let n = 2; existsSync(join(dir, name)); n++) name = `${stem}-${n}${ext}`
  copyFileSync(sourcePath, join(dir, name))
  return `${prefix}${SPRITES}/${loveInterestId}/${name}`
}

/**
 * Deletes the pictures and videos in a character's add-on folders that she no longer
 * uses: a sprite that was replaced, the original a cut-out was made from, a generated
 * picture that was never chosen. Returns the names of what went. Called once she has been
 * saved, so that what is on disk is what her file names.
 */
export function removeUnusedAssets(
  addonDir: string,
  who: Pick<LoveInterest, 'id' | 'outfits' | 'animations'> & { room?: { background?: string } },
  prefix: string = ADDON_PREFIX
): string[] {
  if (!isSafeId(who.id)) return []
  const used = new Set(
    [
      ...who.outfits.flatMap((outfit) => Object.values(outfit.sprites).map((sprite) => sprite.image)),
      ...who.animations.flatMap((animation) => [animation.image, animation.clip].filter((file): file is string => file !== undefined)),
      who.room?.background
    ].filter((path): path is string => typeof path === 'string')
  )
  const removed: string[] = []
  // Where her own files are kept: what she imported or had drawn, and the backgrounds drawn for her room.
  for (const folder of [`${SPRITES}/${who.id}`, `generated/backgrounds/${who.id}`]) {
    const dir = join(addonDir, folder)
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || used.has(`${prefix}${folder}/${entry.name}`)) continue
      try {
        rmSync(join(dir, entry.name))
        removed.push(entry.name)
      } catch {
        // A file that can't be deleted is untidy, not a failed save.
      }
    }
  }
  return removed
}

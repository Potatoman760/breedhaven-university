import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { z } from 'zod'
import {
  CatalogueSchema,
  CurriculumSchema,
  DEFAULT_VIEW,
  LocationSchema,
  LoveInterestSchema,
  MAJOR_COURSES,
  MajorSchema,
  NewGameSchema,
  STANDARD_OUTFITS,
  TraitSchema,
  JobSchema,
  SocietySchema,
  kindOf,
  poseMedia,
  validateContentPack,
  type Job,
  type Society,
  type SocietiesFair,
  type ContentPack,
  type Curriculum,
  type Location,
  type LoveInterest,
  type Major,
  type Trait
} from '../../shared/model'
import { ADDON_PREFIX, isSafeId, type ContentOrigin, type EditorInfo } from '../../shared/editor'
import { readPack } from './loader'
import { t } from '../../shared/i18n'
import { catalogueBasis, catalogueIsStale, catalogueOf, writtenCatalogue } from '../../shared/game/catalogue'

const LOVE_INTERESTS = 'love-interests'
const LOCATIONS = 'locations'
const LOCATIONS_FILE = 'locations.json'
const TRAITS_FILE = 'traits.json'
const CATALOGUE_FILE = 'catalogue.json'
const CURRICULUM_FILE = 'curriculum.json'
const NEW_GAME_FILE = 'new-game.json'
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
        issues.push(t('editor.addons.issue', { path: file, message: (error as Error).message }))
        return []
      }
    })
}

function readAddonTraits(addonDir: string, issues: string[]): unknown[] {
  const path = join(addonDir, TRAITS_FILE)
  if (!existsSync(path)) return []
  try {
    const raw = readJsonFile(path)
    if (!Array.isArray(raw)) throw new Error(t('editor.addons.notTraitList'))
    return raw
  } catch (error) {
    issues.push(t('editor.addons.issue', { path: TRAITS_FILE, message: (error as Error).message }))
    return []
  }
}

/** Lays add-on entries over the base ones: same id replaces, new id is added at the end. */
function overlay<T extends WithId>(base: T[], added: T[]): T[] {
  const merged = base.map((entry) => added.find((a) => a.id === entry.id) ?? entry)
  return [...merged, ...added.filter((a) => !base.some((entry) => entry.id === a.id))]
}

type College = Curriculum['colleges'][number]
/** Subjects are told apart by their code, as everything else by its id. */
const majorsOver = (base: Major[], added: Major[]): Major[] => {
  const merged = base.map((major) => added.find((one) => one.code === major.code) ?? major)
  return [...merged, ...added.filter((one) => !base.some((major) => major.code === one.code))]
}

/** The subjects made in the editor, as their file has them: colleges of their own, and majors. */
function readAddonCurriculum(addonDir: string, issues: string[]): { colleges: unknown[]; majors: unknown[] } {
  const path = join(addonDir, CURRICULUM_FILE)
  if (!existsSync(path)) return { colleges: [], majors: [] }
  try {
    const raw = readJsonFile(path) as { colleges?: unknown; majors?: unknown }
    return { colleges: Array.isArray(raw.colleges) ? raw.colleges : [], majors: Array.isArray(raw.majors) ? raw.majors : [] }
  } catch (error) {
    issues.push(t('editor.addons.issue', { path: CURRICULUM_FILE, message: (error as Error).message }))
    return { colleges: [], majors: [] }
  }
}

/**
 * Why a subject made in the editor can't be one: it has to be a subject someone reads, with a code like the game's own,
 * enough courses for her two of them, and something each of them teaches. The rest is checked with the whole game.
 */
export function majorProblems(major: Major): string[] {
  const problems: string[] = []
  if (!/^[A-Z]{2,4}$/.test(major.code)) problems.push(t('editor.addons.majorCode'))
  if (major.subject.trim() === '') problems.push(t('editor.addons.majorName'))
  if (major.general) problems.push(t('editor.addons.majorGeneral'))
  if (major.courses.length < MAJOR_COURSES) problems.push(t('editor.addons.majorCourses', { count: MAJOR_COURSES }))
  for (const course of major.courses) {
    if (course.title.trim() === '') problems.push(t('editor.addons.courseTitle', { code: major.code, number: course.number }))
    if (!course.skill) problems.push(t('editor.addons.courseSkill', { code: major.code, number: course.number }))
    for (const topic of course.topics) if (!topic.question) problems.push(t('editor.addons.topicQuestion', { code: major.code, number: course.number, topic: topic.title }))
  }
  return problems
}

/**
 * Adds a subject to the University, or changes one made in the editor, after checking the game would still load with
 * it: with a college of its own if it names one that is new. In the game's own files (`base`) the curriculum itself
 * is what is written, laid out the same way.
 */
export function saveMajor(addonDir: string, content: ContentPack, raw: unknown): string[] {
  const parsed = z.object({ major: MajorSchema, college: z.object({ id: z.string(), name: z.string() }).optional() }).safeParse(raw)
  if (!parsed.success) return parsed.error.issues.map((issue) => t('editor.addons.issue', { path: issue.path.join('.') || t('editor.addons.whatSubject'), message: issue.message }))
  if (!content.curriculum) return [t('editor.addons.noCurriculum')]
  const { major, college } = parsed.data
  const problems = majorProblems(major)
  if (college && (!isSafeId(college.id) || college.name.trim() === '')) problems.push(t('editor.addons.collegeName'))
  if (problems.length > 0) return problems
  const file = readAddonCurriculum(addonDir, [])
  const colleges = college ? overlay(file.colleges as College[], [college]) : (file.colleges as College[])
  const majors = majorsOver(file.majors as Major[], [major])
  try {
    validateContentPack({ ...content, curriculum: { colleges: overlay(content.curriculum.colleges, colleges), majors: majorsOver(content.curriculum.majors, majors) } })
  } catch (error) {
    return (error as { issues?: string[] }).issues ?? [(error as Error).message]
  }
  mkdirSync(addonDir, { recursive: true })
  writeFileSync(join(addonDir, CURRICULUM_FILE), `${JSON.stringify({ colleges, majors }, null, 2)}\n`)
  return []
}

/** Takes away a subject made in the editor. Not while anyone reads it or teaches it: she would have no subject. */
export function deleteMajor(addonDir: string, content: ContentPack, code: string): string[] {
  const file = readAddonCurriculum(addonDir, [])
  const majors = file.majors as Major[]
  if (!majors.some((major) => major.code === code)) return [t('editor.addons.majorNotAddon')]
  const users = content.loveInterests.filter((li) => li.studies?.code === code || li.teaching?.subjects.some((subject) => subject.code === code))
  if (users.length > 0) return [t('editor.addons.majorInUse', { names: users.map((li) => li.name.split(' ')[0]).join(', '), count: users.length })]
  writeFileSync(join(addonDir, CURRICULUM_FILE), `${JSON.stringify({ colleges: file.colleges, majors: majors.filter((major) => major.code !== code) }, null, 2)}\n`)
  return []
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
 * doesn't exist) is left out and reported, so one bad file can't stop the game starting. The game's own content is
 * read in the language whose folder is given; the add-ons are as their maker wrote them.
 */
export function loadWithAddons(packDir: string, addonDir: string, languageDir?: string): LoadedContent {
  const base = readPack(packDir, languageDir) as { loveInterests: unknown[]; traits: unknown; locations: unknown[] }
  validateContentPack(base)
  const baseTraits = (Array.isArray(base.traits) ? base.traits : []) as Trait[]
  const baseLoveInterests = base.loveInterests as LoveInterest[]
  const baseLocations = base.locations as Location[]
  const issues: string[] = []

  const traits: Trait[] = []
  for (const raw of readAddonTraits(addonDir, issues)) {
    const parsed = TraitSchema.safeParse(raw)
    if (parsed.success && isSafeId(parsed.data.id)) traits.push(parsed.data)
    else issues.push(t('editor.addons.traitLeftOut', { file: TRAITS_FILE, why: parsed.success ? t('editor.addons.idNotUsable') : parsed.error.issues[0]?.message }))
  }

  // A location file changes one of the game's own places: what is said of it, and its pictures. It cannot add one,
  // since a place has to be on the map to be reached.
  const acceptedLocations: Location[] = []
  for (const { file, raw } of readAddonFiles(addonDir, LOCATIONS, issues)) {
    try {
      const id = (raw as Partial<WithId>).id
      if (!baseLocations.some((location) => location.id === id)) throw new Error(t('editor.addons.noSuchLocationLeftOut'))
      validateContentPack({ ...base, locations: overlay(baseLocations, [...acceptedLocations, raw as Location]) })
      acceptedLocations.push(raw as Location)
    } catch (error) {
      issues.push(t('editor.addons.fileLeftOut', { file: `${LOCATIONS}/${file}`, message: (error as Error).message }))
    }
  }

  // Subjects made in the editor join the University's before anyone is checked, since a student may read one. Each is
  // tried on its own, as a character is.
  const baseCurriculum = CurriculumSchema.safeParse((base as { curriculum?: unknown }).curriculum)
  const baseMajors = baseCurriculum.success ? baseCurriculum.data.majors.map((major) => ({ id: major.code })) : []
  const addonCurriculum = readAddonCurriculum(addonDir, issues)
  const colleges = addonCurriculum.colleges.flatMap((raw) => {
    const parsed = z.object({ id: z.string(), name: z.string() }).safeParse(raw)
    if (parsed.success && isSafeId(parsed.data.id)) return [parsed.data]
    issues.push(t('editor.addons.collegeLeftOut', { file: CURRICULUM_FILE }))
    return []
  })
  const acceptedMajors: Major[] = []
  const curriculumOf = (majors: Major[]) =>
    baseCurriculum.success ? { curriculum: { colleges: overlay(baseCurriculum.data.colleges, colleges), majors: majorsOver(baseCurriculum.data.majors, majors) } } : {}
  for (const raw of baseCurriculum.success ? addonCurriculum.majors : []) {
    const parsed = MajorSchema.safeParse(raw)
    const code = (raw as { code?: unknown } | null)?.code
    try {
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? t('editor.addons.notASubject'))
      const problems = majorProblems(parsed.data)
      if (problems.length > 0) throw new Error(problems[0])
      validateContentPack({ ...base, ...curriculumOf([...acceptedMajors, parsed.data]) })
      acceptedMajors.push(parsed.data)
    } catch (error) {
      issues.push(t('editor.addons.majorLeftOut', { file: CURRICULUM_FILE, what: typeof code === 'string' ? code : t('editor.addons.aSubject'), message: (error as Error).message }))
    }
  }

  // Each character, love interest or NPC, is tried on its own against everything accepted so far.
  const accepted: LoveInterest[] = []
  const pack = (loveInterests: unknown[]) => ({
    ...base,
    ...curriculumOf(acceptedMajors),
    locations: overlay(baseLocations, acceptedLocations),
    traits: overlay(baseTraits, traits),
    loveInterests: overlay(baseLoveInterests, loveInterests as LoveInterest[])
  })
  for (const { file, raw } of readAddonFiles(addonDir, LOVE_INTERESTS, issues)) {
    try {
      const id = (raw as Partial<WithId>).id
      if (typeof id !== 'string' || !isSafeId(id)) throw new Error(t('editor.addons.idMissing'))
      validateContentPack(pack([...accepted, raw]))
      accepted.push(raw as LoveInterest)
    } catch (error) {
      issues.push(t('editor.addons.fileLeftOut', { file, message: (error as Error).message }))
    }
  }

  // The course catalogue built in the editor. One that can't be read is as good as none: it is built again there.
  let catalogue: unknown
  if (existsSync(join(addonDir, CATALOGUE_FILE))) {
    try {
      // It is checked with the pack it belongs to: on its own it says only who is in what and when.
      const read = readJsonFile(join(addonDir, CATALOGUE_FILE))
      validateContentPack({ ...pack(accepted), catalogue: read })
      catalogue = read
    } catch (error) {
      issues.push(t('editor.addons.fileLeftOut', { file: CATALOGUE_FILE, message: (error as Error).message }))
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
      issues.push(t('editor.addons.fileLeftOut', { file: NEW_GAME_FILE, message: (error as Error).message }))
    }
  }
  const playerChanged = newGame !== undefined

  let content: ContentPack
  try {
    content = validateContentPack({ ...pack(accepted), ...(catalogue !== undefined && { catalogue }), ...(newGame !== undefined && { newGame }) })
  } catch (error) {
    // The add-on traits broke something in the base pack (a trait a character uses, say). Go without add-ons.
    issues.push(t('editor.addons.allLeftOut', { message: (error as Error).message }))
    return { content: validateContentPack(base), info: { addonDir, issues, loveInterests: origins(baseLoveInterests, []), traits: origins(baseTraits, []), locations: origins(baseLocations, []), majors: origins(baseMajors, []), playerChanged: false, base: false, assetPrefix: ADDON_PREFIX } }
  }
  return {
    content,
    info: {
      addonDir,
      issues,
      loveInterests: origins(baseLoveInterests, accepted),
      traits: origins(baseTraits, traits),
      locations: origins(baseLocations, acceptedLocations),
      majors: origins(baseMajors, acceptedMajors.map((major) => ({ id: major.code }))),
      playerChanged,
      base: false,
      assetPrefix: ADDON_PREFIX
    }
  }
}

/**
 * Loads the game's own content for editing in place: no add-ons are read, and what the
 * editor saves is written into the pack. This is how the game runs from its source, where
 * every change is a change to the base game. The "add-on folder" the editor is given is
 * the pack itself, whose files are laid out the same way; every character and trait can be
 * deleted, as one made in the editor can. Read in another language, it is there to be played, not changed.
 */
export function loadBase(packDir: string, languageDir?: string): LoadedContent {
  const raw = readPack(packDir, languageDir) as { loveInterests: WithId[]; traits: unknown; locations: WithId[] }
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
      // Every subject is the game's own to change here, as every character is.
      majors: all((content.curriculum?.majors ?? []).map((major) => ({ id: major.code })), 'addon'),
      playerChanged: false,
      base: true,
      assetPrefix: ''
    }
  }
}

/** Writes the player a new game starts with to the add-on folder, after checking the game would still load with him. */
export function savePlayer(addonDir: string, content: ContentPack, raw: unknown): string[] {
  const parsed = NewGameSchema.safeParse(raw)
  if (!parsed.success) return parsed.error.issues.map((issue) => t('editor.addons.issue', { path: issue.path.join('.') || t('editor.addons.whatPlayer'), message: issue.message }))
  const newGame = parsed.data
  if (newGame.player.name.trim() === '') return [t('editor.addons.playerName')]
  if (newGame.room && newGame.room.name.trim() === '') return [t('editor.addons.roomName')]
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
  if (!existsSync(path)) return [t('editor.addons.playerNotChanged')]
  rmSync(path)
  return []
}



const JOBS_FILE = 'jobs.json'

/**
 * Adds a job to the game, or changes one, after checking the game would still load with it. Jobs are the game's own:
 * they are written to its own file, and can only be edited when it is run from source.
 */
export function saveJob(packDir: string, content: ContentPack, raw: unknown): string[] {
  const parsed = JobSchema.safeParse(raw)
  if (!parsed.success) return parsed.error.issues.map((issue) => t('editor.addons.issue', { path: issue.path.join('.') || t('editor.addons.whatJob'), message: issue.message }))
  const job = parsed.data
  if (!isSafeId(job.id)) return [t('editor.addons.badId')]
  if (job.title.trim() === '') return [t('editor.addons.titleNeeded')]
  if (!content.locations.some((l) => l.id === job.locationId)) return [t('editor.addons.jobLocation')]
  if (![...content.npcs, ...content.loveInterests].some((c) => c.id === job.bossId)) return [t('editor.addons.jobBoss')]
  const file = join(packDir, JOBS_FILE)
  const config = (existsSync(file) ? readJsonFile(file) : {}) as { jobs?: Job[] }
  const jobs = overlay(config.jobs ?? [], [job])
  try {
    validateContentPack({ ...content, jobs: { ...content.jobs, jobs } })
  } catch (error) {
    return (error as { issues?: string[] }).issues ?? [(error as Error).message]
  }
  writeFileSync(file, `${JSON.stringify({ ...config, jobs }, null, 2)}\n`)
  return []
}

/** Takes a job out of the game. */
export function deleteJob(packDir: string, id: string): string[] {
  const file = join(packDir, JOBS_FILE)
  const config = (existsSync(file) ? readJsonFile(file) : {}) as { jobs?: Job[] }
  if (!(config.jobs ?? []).some((job) => job.id === id)) return [t('editor.addons.noSuchJob')]
  writeFileSync(file, `${JSON.stringify({ ...config, jobs: (config.jobs ?? []).filter((job) => job.id !== id) }, null, 2)}\n`)
  return []
}

const SOCIETIES_FILE = 'societies.json'

/**
 * Adds a society to the game, or changes one, after checking the game would still load with it. Societies are the game's
 * own, as jobs are: written to its own file, and edited only when it is run from source.
 */
export function saveSociety(packDir: string, content: ContentPack, raw: unknown): string[] {
  const parsed = SocietySchema.safeParse(raw)
  if (!parsed.success) return parsed.error.issues.map((issue) => t('editor.addons.issue', { path: issue.path.join('.') || t('editor.addons.whatSociety'), message: issue.message }))
  const society = parsed.data
  if (!isSafeId(society.id)) return [t('editor.addons.badId')]
  if (society.name.trim() === '') return [t('editor.addons.nameNeeded')]
  if (!content.locations.some((l) => l.id === society.locationId)) return [t('editor.addons.societyLocation')]
  const notStudents = society.memberIds.filter((id) => {
    const li = content.loveInterests.find((one) => one.id === id)
    return !li || kindOf(li) !== 'student'
  })
  if (notStudents.length > 0) return [t('editor.addons.societyMembers')]
  const sponsor = content.loveInterests.find((one) => one.id === society.sponsorId)
  if (society.sponsorId && (!sponsor || kindOf(sponsor) !== 'teacher')) return [t('editor.addons.societySponsor')]
  const file = join(packDir, SOCIETIES_FILE)
  const config = (existsSync(file) ? readJsonFile(file) : {}) as { fairId?: string; societies?: Society[]; fair?: SocietiesFair }
  const societies = overlay(config.societies ?? [], [society])
  try {
    // Checked as the file will be: with its own fair, if it has one, and not the one loaded.
    validateContentPack({ ...content, societies: { ...content.societies!, ...config, fair: config.fair, societies } })
  } catch (error) {
    return (error as { issues?: string[] }).issues ?? [(error as Error).message]
  }
  writeFileSync(file, `${JSON.stringify({ ...config, societies }, null, 2)}\n`)
  return []
}

/** Takes a society out of the game. */
export function deleteSociety(packDir: string, id: string): string[] {
  const file = join(packDir, SOCIETIES_FILE)
  const config = (existsSync(file) ? readJsonFile(file) : {}) as { societies?: Society[]; fair?: SocietiesFair }
  if (!(config.societies ?? []).some((society) => society.id === id)) return [t('editor.addons.noSuchSociety')]
  // Its table at the fair goes with it.
  const fair = config.fair && { ...config.fair, tables: config.fair.tables.filter((table) => table.societyId !== id) }
  writeFileSync(file, `${JSON.stringify({ ...config, ...(fair && { fair }), societies: (config.societies ?? []).filter((society) => society.id !== id) }, null, 2)}\n`)
  return []
}

/** Writes the course catalogue every new game starts with. */
export function saveCatalogue(addonDir: string, raw: unknown): string[] {
  const parsed = CatalogueSchema.safeParse(raw)
  if (!parsed.success) return parsed.error.issues.map((issue) => t('editor.addons.issue', { path: issue.path.join('.') || t('editor.addons.whatCatalogue'), message: issue.message }))
  if (parsed.data.courses.length === 0) return [t('editor.addons.catalogueEmpty')]
  mkdirSync(addonDir, { recursive: true })
  // Only what was worked out is kept: what each course is called and teaches is the curriculum's.
  writeFileSync(join(addonDir, CATALOGUE_FILE), `${JSON.stringify(writtenCatalogue(parsed.data), null, 2)}\n`)
  return []
}

/**
 * Lays the term out again when the people or the courses it was built for have changed, so that a character saved in
 * the editor has her classes in the next new game without anyone building it by hand. It is built from the seed the
 * old one was, so that nobody else's week changes for no reason but chance. Where the add-ons no longer change who is
 * at the University, the add-on catalogue is taken away instead and the game's own is used. Says whether it changed
 * anything.
 */
export function rebuildCatalogue(packDir: string, addonDir: string, content: ContentPack, base: boolean): boolean {
  if (!content.coursework || !content.curriculum) return false
  if (content.catalogue && !catalogueIsStale(content)) return false
  const addonFile = join(addonDir, CATALOGUE_FILE)
  if (!base) {
    const shipped = join(packDir, CATALOGUE_FILE)
    const shippedBasis = existsSync(shipped) ? (readJsonFile(shipped) as { basis?: unknown }).basis : undefined
    if (shippedBasis === catalogueBasis(content)) {
      if (!existsSync(addonFile)) return false
      rmSync(addonFile)
      return true
    }
  }
  return saveCatalogue(addonDir, catalogueOf(content, content.catalogue?.seed ?? 1)).length === 0
}

/**
 * A character as her file has her: what she studies or teaches by the subject's name in the curriculum, and nothing
 * of what that subject is. A pack with no curriculum keeps what was written.
 */
function asWritten(content: ContentPack, li: LoveInterest): unknown {
  if (!content.curriculum) return li
  return {
    ...li,
    ...(li.studies && { studies: { major: li.studies.code, level: li.studies.level } }),
    ...(li.teaching && { teaching: { ...li.teaching, subjects: li.teaching.subjects.map((subject) => ({ major: subject.code, number: subject.number })) } })
  }
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
  if (!parsed.success) return parsed.error.issues.map((issue) => t('editor.addons.issue', { path: issue.path.join('.') || t('editor.addons.whatLoveInterest'), message: issue.message }))
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
  if (!isSafeId(li.id)) return [t('editor.addons.badId')]
  if (li.name.trim() === '') return [t('editor.addons.nameNeeded')]
  const problems = problemsWith(content, overlay(everyone(content), [li]), content.traits)
  if (problems.length > 0) return problems
  mkdirSync(join(addonDir, LOVE_INTERESTS), { recursive: true })
  writeFileSync(join(addonDir, LOVE_INTERESTS, `${li.id}.json`), `${JSON.stringify(asWritten(content, li), null, 2)}\n`)
  return []
}

/** Removes a love interest's add-on file: an add-on character is gone, a changed built-in one is as it shipped. */
export function deleteLoveInterest(addonDir: string, id: string): string[] {
  if (!isSafeId(id)) return [t('editor.addons.unusableId')]
  const path = join(addonDir, LOVE_INTERESTS, `${id}.json`)
  if (!existsSync(path)) return [t('editor.addons.noCharacterFile')]
  rmSync(path)
  return []
}

/**
 * Writes a changed location to the add-on folder, after checking the game would still load
 * with it. It takes the place of the game's own location of that id; there is no adding one.
 */
export function saveLocation(addonDir: string, content: ContentPack, raw: unknown, base = false): string[] {
  const parsed = LocationSchema.safeParse(raw)
  if (!parsed.success) return parsed.error.issues.map((issue) => t('editor.addons.issue', { path: issue.path.join('.') || t('editor.addons.whatLocation'), message: issue.message }))
  const given = parsed.data
  // Every place has its default view, and it comes first.
  const location = {
    ...given,
    backgrounds: [given.backgrounds.find((view) => view.id === DEFAULT_VIEW.id) ?? { ...DEFAULT_VIEW, images: {} }, ...given.backgrounds.filter((view) => view.id !== DEFAULT_VIEW.id)]
  }
  if (!isSafeId(location.id) || !content.locations.some((l) => l.id === location.id)) return [t('editor.addons.noSuchLocation')]
  if (location.name.trim() === '') return [t('editor.addons.nameNeeded')]
  const ids = location.backgrounds.map((view) => view.id)
  if (ids.some((id, i) => !isSafeId(id) || ids.indexOf(id) !== i)) return [t('editor.addons.viewIds')]
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
  if (!isSafeId(id)) return [t('editor.addons.unusableId')]
  const path = join(addonDir, LOCATIONS, `${id}.json`)
  if (!existsSync(path)) return [t('editor.addons.locationNotChanged')]
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
  if (!parsed.success) return parsed.error.issues.map((issue) => t('editor.addons.issue', { path: issue.path.join('.') || t('editor.addons.whatTrait'), message: issue.message }))
  const trait = parsed.data
  if (!isSafeId(trait.id)) return [t('editor.addons.badId')]
  if (trait.name.trim() === '') return [t('editor.addons.nameNeeded')]
  writeTraits(addonDir, overlay(addonTraits(addonDir), [trait]))
  return []
}

/** Removes a trait from the add-on library, unless a character would be left with a trait that no longer exists. */
export function deleteTrait(addonDir: string, content: ContentPack, baseTraitIds: string[], id: string): string[] {
  const mine = addonTraits(addonDir)
  if (!mine.some((trait) => trait.id === id)) return [t('editor.addons.traitNotAddon')]
  if (!baseTraitIds.includes(id)) {
    const users = content.loveInterests.filter((li) => li.traitIds.includes(id)).map((li) => li.name)
    if (users.length > 0) return [t('editor.addons.traitInUse', { names: users.join(', '), count: users.length })]
  }
  writeTraits(addonDir, mine.filter((trait) => trait.id !== id))
  return []
}

/**
 * Copies a picture or video into a love interest's add-on folder and returns the path to
 * write in the content, which the game serves from there.
 */
export function importAsset(addonDir: string, loveInterestId: string, sourcePath: string, prefix: string = ADDON_PREFIX): string {
  if (!isSafeId(loveInterestId)) throw new Error(t('editor.addons.assetNeedsId'))
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
  who: Pick<LoveInterest, 'id' | 'outfits' | 'animations'> & { room?: { images?: Partial<Record<string, string>> }; birthPicture?: string; walkSprite?: string },
  prefix: string = ADDON_PREFIX
): string[] {
  if (!isSafeId(who.id)) return []
  const used = new Set(
    [
      ...who.outfits.flatMap((outfit) => Object.values(outfit.sprites).map((sprite) => sprite.image)),
      ...who.animations.flatMap(poseMedia),
      ...Object.values(who.room?.images ?? {}),
      who.birthPicture,
      who.walkSprite
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

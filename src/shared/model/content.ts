import { z } from 'zod'
import { DramaConfigSchema } from './drama'
import { ExpeditionConfigSchema, HIM } from './expedition'
import { HousingConfigSchema } from './housing'
import { SyllabusSchema } from './syllabus'
import { CurriculumSchema, resolveCurriculum } from './curriculum'
import { SkillSchema } from './skill'
import { SocietiesConfigSchema } from './society'
import { ActivitySchema } from './activity'
import { CalendarConfigSchema } from './calendar'
import { CodexEntrySchema } from './codex'
import type { Condition, Effect } from './condition'
import { CatalogueSchema, CourseworkConfigSchema } from './course'
import { ItemSchema, StallSchema } from './item'
import { JobsConfigSchema } from './job'
import { LocationSchema } from './location'
import { LoveInterestSchema, kindOf } from './loveInterest'
import { MapSchema } from './map'
import { NpcSchema, type Npc } from './npc'
import { OrientationSchema, type Intro } from './orientation'
import { PokerConfigSchema } from './poker'
import { PregnancyConfigSchema } from './pregnancy'
import { RelationshipConfigSchema } from './relationship'
import { SoundsSchema } from './sound'
import { NewGameSchema } from './state'
import { TraitSchema } from './trait'

/** All authored game content, as loaded from a content pack directory. */
export const ContentPackSchema = z.object({
  calendar: CalendarConfigSchema,
  relationships: RelationshipConfigSchema,
  traits: z.array(TraitSchema),
  locations: z.array(LocationSchema),
  activities: z.array(ActivitySchema),
  codex: z.array(CodexEntrySchema),
  /**
   * The love interests. In a pack as it is written this holds every character, NPCs among
   * them; once checked, the NPCs have been moved to `npcs`, so that everything to do with
   * romance has only to look here.
   */
  loveInterests: z.array(LoveInterestSchema),
  /** The characters of the kind `npc`: people to talk to and work for who are not love interests. */
  npcs: z.array(NpcSchema).default([]),
  newGame: NewGameSchema,
  coursework: CourseworkConfigSchema.optional(),
  /** Lines shown under the logo while a scene loads, one at a time. An empty one is never shown. */
  tips: z.array(z.string()).default([]),
  /** The course catalogue built in the editor. A pack with coursework needs one before a game can start. */
  catalogue: CatalogueSchema.optional(),
  /** Everything the University teaches, written down. The general subjects, the syllabuses and the skills below are drawn from it when the pack is read. */
  curriculum: CurriculumSchema.optional(),
  /** What each course teaches, class by class: told to its teacher and shown to nobody. */
  syllabus: SyllabusSchema.default([]),
  /** What he can learn to do by getting on in a course. */
  skills: z.array(SkillSchema).default([]),
  orientation: OrientationSchema.optional(),
  /** The jobs the player can hold, and the rules for them. Without it there are none. */
  jobs: JobsConfigSchema.optional(),
  /** The student societies, and the rules for joining them. Without it there are none. */
  societies: SocietiesConfigSchema.optional(),
  pregnancy: PregnancyConfigSchema.optional(),
  /** The house a Sire is let, and what it is to keep one. Without it there is none. */
  housing: HousingConfigSchema.optional(),
  /** The Undercroft, and the rules of going below. Without it there is nothing under the University. */
  expedition: ExpeditionConfigSchema.optional(),
  /** What the drama engine weighs things with. Without it, nobody turns up uninvited. */
  drama: DramaConfigSchema.optional(),
  items: z.array(ItemSchema).default([]),
  stalls: z.array(StallSchema).default([]),
  /** Cards for money, at one place. Without it there is no game. */
  poker: PokerConfigSchema.optional(),
  /** What the game sounds like: the files played for its cues, and the loops behind each place. */
  sounds: SoundsSchema.prefault({}),
  /** Without a map the player can't travel, so every activity must be at the starting location. */
  map: MapSchema.optional()
})
export type ContentPack = z.infer<typeof ContentPackSchema>

export class ContentError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid content pack:\n${issues.map((i) => `  - ${i}`).join('\n')}`)
    this.name = 'ContentError'
  }
}

/** Parses raw content and checks that every id it references exists. Throws ContentError. */
export function validateContentPack(raw: unknown): ContentPack {
  // What the curriculum has written is laid over the rest first: a character names her subject, and it is filled in from there.
  const parsed = ContentPackSchema.safeParse(resolveCurriculum(raw))
  if (!parsed.success) {
    throw new ContentError(
      parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`)
    )
  }
  // Characters are written together and told apart by their kind.
  const everyone = [...parsed.data.loveInterests, ...parsed.data.npcs]
  const data: ContentPack = {
    ...parsed.data,
    loveInterests: everyone.filter((character) => character.kind !== 'npc'),
    npcs: everyone.filter((character): character is Npc => character.kind === 'npc')
  }
  const issues = checkReferences(data)
  if (issues.length > 0) throw new ContentError(issues)
  return data
}

function checkReferences(pack: ContentPack): string[] {
  const issues: string[] = []
  const { calendar } = pack

  const idSet = (items: { id: string }[], label: string): Set<string> => {
    const seen = new Set<string>()
    for (const item of items) {
      if (seen.has(item.id)) issues.push(`${label}: duplicate id "${item.id}"`)
      seen.add(item.id)
    }
    return seen
  }
  const need = (set: Set<string>, id: string, where: string, what: string): void => {
    if (!set.has(id)) issues.push(`${where}: unknown ${what} "${id}"`)
  }

  idSet(calendar.months, 'calendar.months')
  const periods = idSet(calendar.periods, 'calendar.periods')
  const weekdays = new Set(calendar.weekdays)
  const stages = idSet(pack.relationships.stages, 'relationships.stages')
  idSet(pack.relationships.statuses, 'relationships.statuses')
  pack.relationships.statuses.forEach((status, i) => {
    if (status.minStage) need(stages, status.minStage, `relationships.statuses[${i}].minStage`, 'relationship stage')
  })
  const traits = idSet(pack.traits, 'traits')
  const locations = idSet(pack.locations, 'locations')
  const codex = idSet(pack.codex, 'codex')
  const loveInterests = idSet(pack.loveInterests, 'loveInterests')
  idSet(pack.activities, 'activities')
  const events = idSet(calendar.events, 'calendar.events')

  const checkMonthDay = (monthId: string, day: number, where: string): void => {
    const month = calendar.months.find((m) => m.id === monthId)
    if (!month) issues.push(`${where}: unknown month "${monthId}"`)
    else if (day > month.days) issues.push(`${where}: ${month.name} has only ${month.days} days`)
  }
  const checkHour = (hour: number | undefined, where: string): void => {
    if (hour !== undefined && hour >= calendar.hoursPerDay) {
      issues.push(`${where}: hour ${hour} is outside a ${calendar.hoursPerDay}-hour day`)
    }
  }
  const checkWhen = (
    when: { weekdays?: string[]; periods?: string[] },
    where: string
  ): void => {
    for (const w of when.weekdays ?? []) need(weekdays, w, where, 'weekday')
    for (const p of when.periods ?? []) need(periods, p, where, 'period')
  }
  const checkRule = (rule: Condition | Effect, where: string): void => {
    if ('loveInterestId' in rule && rule.loveInterestId !== undefined) {
      need(loveInterests, rule.loveInterestId, where, 'love interest')
    }
    if (rule.type === 'stage') need(stages, rule.min, where, 'relationship stage')
    if (rule.type === 'unlockCodex') need(codex, rule.entryId, where, 'codex entry')
    if (rule.type === 'event') need(events, rule.eventId, where, 'calendar event')
  }

  checkMonthDay(calendar.start.month, calendar.start.day, 'calendar.start')
  checkHour(calendar.start.hour, 'calendar.start')
  if (calendar.startWeekday >= calendar.weekdays.length) {
    issues.push('calendar.startWeekday: index is past the end of weekdays')
  }
  for (const p of calendar.periods) checkHour(p.startHour, `calendar.periods.${p.id}`)
  idSet(calendar.weather, 'calendar.weather')
  const monthIds = new Set(calendar.months.map((m) => m.id))
  for (const w of calendar.weather) {
    for (const m of w.months ?? []) need(monthIds, m, `calendar.weather.${w.id}`, 'month')
    for (const m of Object.keys(w.chance ?? {})) need(monthIds, m, `calendar.weather.${w.id}.chance`, 'month')
  }
  // Written lines read with nothing to answer: who says them has to be someone, and where, somewhere with that view.
  const checkCutscene = (intro: Intro, where: string): void => {
    const speaker = [...pack.npcs, ...pack.loveInterests].find((character) => character.id === intro.speakerId)
    if (!speaker) issues.push(`${where}.speakerId: unknown character "${intro.speakerId}"`)
    else if (intro.outfitId !== undefined && !speaker.outfits.some((outfit) => outfit.id === intro.outfitId)) issues.push(`${where}.outfitId: "${speaker.id}" has no outfit "${intro.outfitId}"`)
    intro.scenes.forEach((scene, i) => {
      for (const id of scene.castIds ?? []) if (![...pack.npcs, ...pack.loveInterests].some((character) => character.id === id)) issues.push(`${where}.scenes[${i}].castIds: unknown character "${id}"`)
      const place = pack.locations.find((l) => l.id === scene.locationId)
      if (!place) issues.push(`${where}.scenes[${i}]: unknown location "${scene.locationId}"`)
      else if (scene.backgroundId !== undefined && !place.backgrounds.some((view) => view.id === scene.backgroundId)) issues.push(`${where}.scenes[${i}]: "${place.id}" has no view "${scene.backgroundId}"`)
    })
  }

  for (const e of calendar.events) {
    checkMonthDay(e.month, e.day, `calendar.events.${e.id}`)
    if (e.locationId !== undefined) {
      need(locations, e.locationId, `calendar.events.${e.id}`, 'location')
    }
    idSet(e.program, `calendar.events.${e.id}.program`)
    for (const part of e.program) {
      const where = `calendar.events.${e.id}.program.${part.id}`
      if (part.day > e.durationDays) issues.push(`${where}: day ${part.day} is after the event is over`)
      checkHour(part.startHour, where)
      if (part.locationId !== undefined) need(locations, part.locationId, where, 'location')
      else if (e.locationId === undefined) issues.push(`${where}: needs a place, since the event has none`)
      const partPlace = pack.locations.find((l) => l.id === (part.locationId ?? e.locationId))
      if (part.viewId !== undefined && partPlace && !partPlace.backgrounds.some((view) => view.id === part.viewId)) issues.push(`${where}.viewId: "${partPlace.id}" has no view "${part.viewId}"`)
      for (const id of part.castIds ?? []) if (!pack.loveInterests.some((li) => li.id === id)) issues.push(`${where}: unknown love interest "${id}"`)
      if (part.cutscene) checkCutscene(part.cutscene, `${where}.cutscene`)
    }
  }

  for (const l of pack.locations) {
    idSet(l.backgrounds, `locations.${l.id}.backgrounds`)
    checkHour(l.open?.fromHour, `locations.${l.id}.open`)
    checkHour(l.open?.toHour, `locations.${l.id}.open`)
  }

  for (const a of pack.activities) {
    const where = `activities.${a.id}`
    if (a.locationId !== undefined) need(locations, a.locationId, where, 'location')
    checkWhen(a.availability, `${where}.availability`)
    checkHour(a.availability.earliestHour, `${where}.availability`)
    checkHour(a.availability.latestHour, `${where}.availability`)
    for (const r of a.requirements) checkRule(r, `${where}.requirements`)
    for (const e of a.effects) checkRule(e, `${where}.effects`)
  }

  for (const c of pack.codex) {
    const where = `codex.${c.id}`
    for (const id of c.relatedLocationIds) need(locations, id, where, 'location')
    for (const id of c.relatedCharacterIds) need(loveInterests, id, where, 'love interest')
    for (const r of c.unlockWhen) checkRule(r, `${where}.unlockWhen`)
  }

  for (const li of pack.loveInterests) {
    const where = `loveInterests.${li.id}`
    for (const id of li.traitIds) need(traits, id, where, 'trait')
    const outfits = idSet(li.outfits, `${where}.outfits`)
    need(outfits, li.defaultOutfitId, where, 'outfit')
    idSet(li.animations, `${where}.animations`)
    for (const id of [...li.friends, ...li.enemies]) {
      if (id === li.id || !pack.loveInterests.some((other) => other.id === id)) issues.push(`${where}: "${id}" among her friends or enemies is not another love interest`)
    }
    if (li.kind === 'student' && !li.studies) issues.push(`${where}: a student needs "studies"`)
    if (li.kind === 'teacher' && !li.teaching) issues.push(`${where}: a teacher needs "teaching"`)
    if (li.birthday) checkMonthDay(li.birthday.month, li.birthday.day, `${where}.birthday`)
    for (const s of li.schedule) {
      need(locations, s.locationId, `${where}.schedule`, 'location')
      checkWhen(s, `${where}.schedule`)
    }
    if (li.room) need(locations, li.room.locationId, `${where}.room`, 'location')
    for (const secret of li.ai.secrets) {
      for (const r of secret.revealWhen) checkRule(r, `${where}.ai.secrets`)
    }
  }

  idSet(pack.npcs, 'npcs')
  for (const npc of pack.npcs) {
    const where = `npcs.${npc.id}`
    if (loveInterests.has(npc.id)) issues.push(`${where}: a love interest already has this id`)
    const outfits = idSet(npc.outfits, `${where}.outfits`)
    need(outfits, npc.defaultOutfitId, where, 'outfit')
    for (const s of npc.schedule) {
      need(locations, s.locationId, `${where}.schedule`, 'location')
      checkWhen(s, `${where}.schedule`)
    }
  }

  for (const pin of pack.map?.pins ?? []) need(locations, pin.locationId, 'map.pins', 'location')

  if (pack.orientation?.intro) checkCutscene(pack.orientation.intro, 'orientation.intro')
  pack.orientation?.steps.forEach((step, i) => step.cutscene && checkCutscene(step.cutscene, `orientation.steps[${i}].cutscene`))
  pack.orientation?.steps.forEach((step, i) => {
    need(locations, step.locationId, `orientation.steps[${i}]`, 'location')
    checkHour(step.startHour, `orientation.steps[${i}].startHour`)
  })
  if (pack.societies) {
    const { societies } = pack
    need(events, societies.fairId, 'societies.fairId', 'calendar event')
    idSet(societies.societies, 'societies')
    for (const society of societies.societies) {
      const where = `societies (${society.id})`
      need(locations, society.locationId, where, 'location')
      need(weekdays, society.weekday, where, 'weekday')
      checkHour(society.startHour + societies.hours - 1, where)
      // A society is a students' club, and as small as a class, so that a meeting is time with the few in it.
      for (const id of society.memberIds) {
        need(loveInterests, id, where, 'love interest')
        const li = pack.loveInterests.find((one) => one.id === id)
        if (li && kindOf(li) !== 'student') issues.push(`${where}: ${li.name} is not a student`)
      }
      if (new Set(society.memberIds).size !== society.memberIds.length) issues.push(`${where}: a member is listed twice`)
      if (new Set(society.adultEvents.map((event) => event.meeting)).size !== society.adultEvents.length) issues.push(`${where}: two events are set for the same meeting`)
      society.adultEvents.forEach((event, i) => {
        checkCutscene(event.intro, `${where}.adultEvents[${i}].intro`)
        for (const held of event.reserved) {
          need(loveInterests, held.loveInterestId, `${where}.adultEvents[${i}].reserved`, 'love interest')
          if (held.ifIntimate) checkCutscene(held.ifIntimate.intro, `${where}.adultEvents[${i}].reserved (${held.loveInterestId})`)
        }
      })
      if (society.sponsorId) {
        need(loveInterests, society.sponsorId, where, 'love interest')
        const sponsor = pack.loveInterests.find((one) => one.id === society.sponsorId)
        if (sponsor && kindOf(sponsor) !== 'teacher') issues.push(`${where}: its sponsor, ${sponsor.name}, is not a teacher`)
      }
      if (society.memberIds.length > societies.maxMembers) issues.push(`${where}: ${society.memberIds.length} members, and a society holds ${societies.maxMembers}`)
    }
    if (societies.fair) {
      const { fair } = societies
      const known = new Set(societies.societies.map((society) => society.id))
      const items = new Set(pack.items.map((item) => item.id))
      const people = new Set([...pack.loveInterests, ...pack.npcs].map((one) => one.id))
      for (const table of fair.tables) {
        need(known, table.societyId, 'societies.fair.tables', 'society')
        if (table.gift) need(items, table.gift, `societies.fair.tables (${table.societyId})`, 'item')
      }
      for (const visitor of fair.visitors) need(people, visitor.id, 'societies.fair.visitors', 'character')
      const booths = new Set([...known, ...fair.visitors.map((visitor) => visitor.id)])
      for (const [booth, hellos] of Object.entries(fair.hellos)) {
        need(booths, booth, 'societies.fair.hellos', 'booth')
        for (const hello of hellos) for (const id of hello.cast) need(people, id, `societies.fair.hellos (${booth})`, 'character')
      }
      for (const id of fair.rivalry?.societyIds ?? []) need(known, id, 'societies.fair.rivalry', 'society')
      if (fair.rivalry) checkCutscene(fair.rivalry.intro, 'societies.fair.rivalry.intro')
    }
  }
  if (pack.coursework) {
    need(locations, pack.coursework.locationId, 'coursework', 'location')
    checkWhen({ weekdays: pack.coursework.weekdays }, 'coursework')
    for (const id of pack.coursework.grading.studyLocationIds) need(locations, id, 'coursework.grading.studyLocationIds', 'location')
    // The teaching day has to fit in the day, and hold the longest class.
    checkHour(pack.coursework.dayStart, 'coursework.dayStart')
    checkHour(pack.coursework.dayEnd - 1, 'coursework.dayEnd')
    if (pack.coursework.dayEnd - pack.coursework.dayStart < Math.max(pack.coursework.lectureHours, pack.coursework.labHours)) {
      issues.push('coursework: the teaching day is shorter than a class')
    }
    for (const entry of pack.syllabus) {
      // Written with its course in a curriculum, a syllabus cannot be for a course there is not; some of those courses are simply not given this term.
      if (!pack.curriculum && pack.catalogue && !pack.catalogue.courses.some((course) => course.id === entry.courseId)) issues.push(`syllabus: unknown course "${entry.courseId}"`)
    }
    for (const skill of pack.skills) {
      if (!pack.curriculum && pack.catalogue && !pack.catalogue.courses.some((course) => course.code === skill.code)) issues.push(`skills (${skill.id}): no course of the subject "${skill.code}" teaches it`)
    }
    // A class is time with the love interests in it: one with none is an empty hour, and one with too many is a crowd.
    for (const course of pack.catalogue?.courses ?? []) {
      const inClass = course.studentIds.length + (course.teacherId ? 1 : 0)
      // Those who read the subject sit its course whoever else is there; the cap is on the ones passing through.
      const reading = course.studentIds.filter((id) => pack.loveInterests.find((li) => li.id === id)?.studies?.code === course.code).length
      const most = reading > 0 ? Math.max(pack.coursework.maxPerClass, pack.coursework.maxMajorClass) : pack.coursework.maxPerClass
      if (inClass === 0) issues.push(`catalogue (${course.number}): no love interest takes or teaches it`)
      if (inClass > most) issues.push(`catalogue (${course.number}): ${inClass} love interests are in it, and a class holds ${most}`)
    }
    // Nobody makes a subject up: what a character studies or teaches is one the curriculum has written.
    if (pack.curriculum) {
      const majors = pack.curriculum.majors
      idSet(majors.map((major) => ({ id: major.code })), 'curriculum.majors')
      for (const major of majors) {
        if (!pack.curriculum.colleges.some((college) => college.id === major.college)) issues.push(`curriculum (${major.code}): unknown college "${major.college}"`)
        if (new Set(major.courses.map((course) => course.number)).size !== major.courses.length) issues.push(`curriculum (${major.code}): two courses share a number`)
        if (major.general && major.courses.length !== 1) issues.push(`curriculum (${major.code}): a general subject has one course`)
      }
      for (const character of [...pack.loveInterests, ...pack.npcs]) {
        const read = character.studies
        if (read && !majors.some((major) => major.code === read.code && !major.general)) issues.push(`${character.id}: studies "${read.code}", which is not a subject the curriculum has`)
        for (const taught of character.teaching?.subjects ?? []) {
          if (!majors.some((major) => major.code === taught.code && major.courses.some((course) => course.number === taught.number))) {
            issues.push(`${character.id}: teaches ${taught.code} ${taught.number}, which the curriculum has not written`)
          }
        }
      }
    }
  }

  const jobIds = new Set<string>()
  pack.jobs?.jobs.forEach((job, i) => {
    const at = `jobs[${i}] (${job.id})`
    if (jobIds.has(job.id)) issues.push(`${at}: duplicate id`)
    jobIds.add(job.id)
    need(locations, job.locationId, at, 'location')
    // The boss is usually an NPC; one who has been made a love interest keeps her job.
    if (![...pack.npcs, ...pack.loveInterests].some((character) => character.id === job.bossId)) issues.push(`${at}: unknown character "${job.bossId}"`)
    job.shifts.forEach((shift, n) => {
      checkWhen({ weekdays: [shift.weekday] }, `${at}.shifts[${n}]`)
      checkHour(shift.startHour, `${at}.shifts[${n}].startHour`)
      // A shift is over on the day it starts.
      checkHour(shift.startHour + shift.hours - 1, `${at}.shifts[${n}]`)
    })
  })

  const items = idSet(pack.items, 'items')
  idSet(pack.stalls, 'stalls')
  for (const stall of pack.stalls) {
    need(locations, stall.locationId, `stalls.${stall.id}`, 'location')
    for (const id of stall.itemIds) need(items, id, `stalls.${stall.id}`, 'item')
  }
  // What is made has to be something there is: a thing a skill or another thing puts in his bag.
  const made = (effects: Effect[], where: string): void => {
    for (const effect of effects) if (effect.type === 'item') need(items, effect.itemId, where, 'item')
  }
  for (const item of pack.items) made(item.use?.effects ?? [], `items.${item.id}`)
  for (const skill of pack.skills) {
    made(skill.ability?.effects ?? [], `skills.${skill.id}`)
  }

  if (pack.poker) {
    need(locations, pack.poker.locationId, 'poker.locationId', 'location')
    idSet(pack.poker.regulars, 'poker.regulars')
    if (pack.poker.smallBlind > pack.poker.bigBlind || pack.poker.bigBlind > pack.poker.handCap) issues.push('poker: the blinds must rise and fit under the cap on a hand')
  }

  const ambience = new Set(Object.keys(pack.sounds.ambience))
  for (const [locationId, place] of Object.entries(pack.sounds.places)) {
    need(locations, locationId, `sounds.places.${locationId}`, 'location')
    need(ambience, place.day, `sounds.places.${locationId}.day`, 'ambience')
    if (place.night !== undefined) need(ambience, place.night, `sounds.places.${locationId}.night`, 'ambience')
  }

  if (pack.pregnancy) {
    const place = pack.locations.find((l) => l.id === pack.pregnancy?.birthLocationId)
    if (!place) issues.push(`pregnancy.birthLocationId: unknown location "${pack.pregnancy.birthLocationId}"`)
    else if (pack.pregnancy.birthViewId !== undefined && !place.backgrounds.some((view) => view.id === pack.pregnancy?.birthViewId)) {
      issues.push(`pregnancy.birthViewId: "${place.id}" has no view "${pack.pregnancy.birthViewId}"`)
    }
  }

  const housing = pack.housing
  if (housing) {
    const house = pack.locations.find((l) => l.id === housing.locationId)
    if (!house) issues.push(`housing.locationId: unknown location "${housing.locationId}"`)
    if (![...pack.npcs, ...pack.loveInterests].some((character) => character.id === housing.officerId)) issues.push(`housing.officerId: unknown character "${housing.officerId}"`)
    need(loveInterests, housing.nannyId, 'housing.nannyId', 'love interest')
    if (housing.viewing && !pack.locations.some((l) => l.id === housing.viewing?.meetLocationId)) issues.push(`housing.viewing.meetLocationId: unknown location "${housing.viewing.meetLocationId}"`)
    if (housing.viewing && !pack.npcs.some((npc) => npc.id === housing.officerId)) issues.push('housing.viewing: the officer who shows the house must be an NPC')
    if (housing.viewing) checkCutscene(housing.viewing.cutscene, 'housing.viewing.cutscene')
    idSet(housing.rooms.map((room) => ({ id: room.key })), 'housing.rooms')
    for (const role of ['master', 'nanny'] as const) {
      if (housing.rooms.filter((room) => room.role === role).length !== 1) issues.push(`housing.rooms: there must be exactly one room of the role "${role}"`)
    }
    housing.rooms.forEach((room) => {
      const at = `housing.rooms (${room.key})`
      if (house && !house.backgrounds.some((view) => view.id === room.viewId)) issues.push(`${at}: "${house.id}" has no view "${room.viewId}"`)
      if (room.plan.floor >= housing.floors.length) issues.push(`${at}: there is no floor ${room.plan.floor}`)
      if (room.plan.x + room.plan.w > housing.grid.columns || room.plan.y + room.plan.h > housing.grid.rows) issues.push(`${at}: its plan runs off the grid`)
    })
    housing.homePeriods.forEach((period) => need(periods, period, 'housing.homePeriods', 'period'))
    const levels = housing.babies.levels.length
    if (housing.babies.startLevel >= levels) issues.push('housing.babies.startLevel: there is no such level')
    if (housing.babies.thrivingFrom >= levels) issues.push('housing.babies.thrivingFrom: there is no such level')
    housing.babies.caps.forEach((cap, i) => {
      if (cap.level >= levels) issues.push(`housing.babies.caps[${i}]: there is no level ${cap.level}`)
    })
  }

  const below = pack.expedition
  if (below) {
    need(locations, below.entryLocationId, 'expedition.entryLocationId', 'location')
    if (below.guideId) need(loveInterests, below.guideId, 'expedition.guideId', 'love interest')
    if (below.intro) checkCutscene(below.intro.cutscene, 'expedition.intro.cutscene')
    if (loveInterests.has(HIM)) issues.push(`expedition: no character may have the id "${HIM}"`)
    const roles = idSet(below.roles, 'expedition.roles')
    below.roles.forEach((role) => idSet(role.actions, `expedition.roles (${role.id})`))
    const enemies = idSet(below.enemies, 'expedition.enemies')
    idSet(below.depths.map((depth) => depth.relic), 'expedition relics')
    below.depths.forEach((depth, i) => {
      const at = `expedition.depths[${i}]`
      if (depth.nodes.at(-1)?.kind !== 'guardian') issues.push(`${at}: its last stop must be its guardian`)
      depth.nodes.forEach((node) => {
        node.enemyIds.forEach((id) => need(enemies, id, at, 'enemy'))
        if ((node.kind === 'fight' || node.kind === 'guardian') && node.enemyIds.length === 0) issues.push(`${at}: a fight with nothing to fight`)
        Object.keys(node.finds.items).forEach((id) => need(items, id, at, 'item'))
      })
    })
    for (const li of pack.loveInterests) if (li.partyRole && !roles.has(li.partyRole)) issues.push(`loveInterests.${li.id}: the role "${li.partyRole}" is not one the expedition has`)
    const stages = new Set((pack.pregnancy?.stages ?? []).map((stage) => stage.id))
    Object.keys(below.pregnancyPower).forEach((id) => need(stages, id, 'expedition.pregnancyPower', 'stage of pregnancy'))
  }

  need(locations, pack.newGame.locationId, 'newGame', 'location')
  if (pack.newGame.room) need(locations, pack.newGame.room.locationId, 'newGame.room', 'location')

  return issues
}

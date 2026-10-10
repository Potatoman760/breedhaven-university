import { z } from 'zod'
import { DramaConfigSchema } from './drama'
import { ActivitySchema } from './activity'
import { CalendarConfigSchema } from './calendar'
import { CodexEntrySchema } from './codex'
import type { Condition, Effect } from './condition'
import { CatalogueSchema, CourseworkConfigSchema } from './course'
import { ItemSchema, StallSchema } from './item'
import { JobsConfigSchema } from './job'
import { LocationSchema } from './location'
import { LoveInterestSchema } from './loveInterest'
import { MapSchema } from './map'
import { NpcSchema, type Npc } from './npc'
import { OrientationSchema } from './orientation'
import { PregnancyConfigSchema } from './pregnancy'
import { RelationshipConfigSchema } from './relationship'
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
  orientation: OrientationSchema.optional(),
  /** The jobs the player can hold, and the rules for them. Without it there are none. */
  jobs: JobsConfigSchema.optional(),
  pregnancy: PregnancyConfigSchema.optional(),
  /** What the drama engine weighs things with. Without it, nobody turns up uninvited. */
  drama: DramaConfigSchema.optional(),
  items: z.array(ItemSchema).default([]),
  stalls: z.array(StallSchema).default([]),
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
  const parsed = ContentPackSchema.safeParse(raw)
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
  for (const e of calendar.events) {
    checkMonthDay(e.month, e.day, `calendar.events.${e.id}`)
    if (e.locationId !== undefined) {
      need(locations, e.locationId, `calendar.events.${e.id}`, 'location')
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

  pack.orientation?.steps.forEach((step, i) => {
    need(locations, step.locationId, `orientation.steps[${i}]`, 'location')
    checkHour(step.startHour, `orientation.steps[${i}].startHour`)
  })
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

  need(locations, pack.newGame.locationId, 'newGame', 'location')
  if (pack.newGame.room) need(locations, pack.newGame.room.locationId, 'newGame.room', 'location')

  return issues
}

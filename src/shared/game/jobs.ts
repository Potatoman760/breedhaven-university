import { MAX_SCENE_CAST, pronounWords, STATS, type ContentPack, type Employment, type GameState, type Job, type LoveInterest, type Scene, type Shift } from '../model'
import type { PerformCheck } from './activities'
import { timeOn } from './agenda'
import { isGameOver, toDate } from './calendar'
import { addNote, giveContact } from './courier'
import { approachableAt } from './map'
import { sceneBaseline } from './scene'
import { statOf, trainStat } from './stats'
import { factor } from './modifiers'

const clock = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

export function jobOf(content: ContentPack, id: string | undefined): Job | undefined {
  return content.jobs?.jobs.find((job) => job.id === id)
}

/** The job the player holds, if he holds one. */
export function currentJob(content: ContentPack, state: GameState): Job | undefined {
  return jobOf(content, state.job?.jobId)
}

/** Whoever gives a job: an NPC, or a love interest who was one. */
export function bossOf(content: ContentPack, job: Job): LoveInterest | undefined {
  return [...content.npcs, ...content.loveInterests].find((character) => character.id === job.bossId)
}

export function hoursPerWeek(job: Job): number {
  return job.shifts.reduce((sum, shift) => sum + shift.hours, 0)
}

/** "Solday 16:00-20:00" */
export function describeShift(shift: Shift): string {
  return `${shift.weekday} ${clock(shift.startHour)}-${clock(shift.startHour + shift.hours)}`
}

/** How a shift on a given day of the game is told apart from every other. */
export function shiftKey(dayIndex: number, shift: Pick<Shift, 'startHour'>): string {
  return `${dayIndex}:${shift.startHour}`
}

/** What a job asks that the player does not have, each as a line. Empty when he qualifies. */
export function unmetRequirements(state: GameState, job: Job): string[] {
  return STATS.flatMap((stat) => {
    const needed = job.requirements[stat]
    return needed !== undefined && statOf(state, stat) < needed ? [`${stat} ${needed} (you have ${statOf(state, stat)})`] : []
  })
}

/** Whether the player can be taken on: he qualifies, has no job already, and has not left this one before. */
export function canApply(content: ContentPack, state: GameState, jobId: string): PerformCheck {
  const job = jobOf(content, jobId)
  if (!job) return { ok: false, reasons: ['No such job'] }
  const reasons: string[] = []
  if (state.formerJobs.includes(jobId)) reasons.push('They will not have you back')
  const held = currentJob(content, state)
  if (held) reasons.push(held.id === jobId ? 'You already work here' : `You already have a job: ${held.title}`)
  const unmet = unmetRequirements(state, job)
  if (unmet.length > 0) reasons.push(`Needs ${unmet.join(', ')}`)
  return { ok: reasons.length === 0, reasons }
}

/** The shifts of a job that overlap a class the player is taking, each as a line. */
export function shiftClashes(state: GameState, job: Job): string[] {
  const mine = state.courses.filter((course) => state.enrolment?.includes(course.id))
  return job.shifts.flatMap((shift) =>
    mine
      .filter((course) => course.meetings.some((m) => m.weekday === shift.weekday && m.startHour < shift.startHour + shift.hours && shift.startHour < m.startHour + m.hours))
      .map((course) => `${describeShift(shift)} clashes with ${course.number}`)
  )
}

/**
 * Takes the job. Whoever qualifies is taken on at once: his boss goes into his DMs and
 * writes to say when he starts.
 */
export function applyForJob(content: ContentPack, state: GameState, jobId: string): GameState {
  const check = canApply(content, state, jobId)
  if (!check.ok) throw new Error(`Cannot take "${jobId}": ${check.reasons.join('; ')}`)
  const job = jobOf(content, jobId)!
  const employment: Employment = { jobId, hiredAt: state.time, strikes: 0, settledTo: state.time, worked: [], excused: [] }
  const hired = giveContact({ ...state, job: employment }, job.bossId)
  const place = content.locations.find((l) => l.id === job.locationId)?.name ?? job.locationId
  return addNote(hired, job.bossId, {
    from: 'them',
    text: `You've got the job: ${job.title} at ${place}. Your shifts are ${job.shifts.map(describeShift).join(', ')}. If you can't make one, tell me that day before it starts.`,
    read: false
  })
}

/** Leaves the job. It is his to do at any time, and they will not take him back. */
export function quitJob(content: ContentPack, state: GameState): GameState {
  const job = currentJob(content, state)
  if (!job || !state.job) return state
  return { ...state, job: null, formerJobs: [...state.formerJobs, job.id] }
}

/** The game time at which a shift on a given day begins. */
function shiftStart(content: ContentPack, dayIndex: number, shift: Shift): number {
  return timeOn(content, dayIndex, shift.startHour)
}

/** A job's shifts on a given day of the game. */
function shiftsOn(content: ContentPack, job: Job, dayIndex: number): Shift[] {
  const morning = timeOn(content, dayIndex, content.calendar.start.hour)
  if (morning < 0 || isGameOver(content.calendar, morning)) return []
  const { weekday } = toDate(content.calendar, morning)
  return job.shifts.filter((shift) => shift.weekday === weekday)
}

/** The shift of his that is under way and that he has not yet clocked in for, if one is. */
export function shiftNow(content: ContentPack, state: GameState): { job: Job; shift: Shift; key: string } | undefined {
  const job = currentJob(content, state)
  if (!job || !state.job) return undefined
  const { dayIndex, hour } = toDate(content.calendar, state.time)
  for (const shift of shiftsOn(content, job, dayIndex)) {
    const key = shiftKey(dayIndex, shift)
    if (hour < shift.startHour || hour >= shift.startHour + shift.hours) continue
    if (shiftStart(content, dayIndex, shift) < state.job.hiredAt || state.job.worked.includes(key)) continue
    return { job, shift, key }
  }
  return undefined
}

/** The shift of his still to come today, if there is one: the one he can still tell his boss he will miss. */
export function shiftLaterToday(content: ContentPack, state: GameState): { job: Job; shift: Shift; key: string } | undefined {
  const job = currentJob(content, state)
  if (!job || !state.job) return undefined
  const { dayIndex, hour } = toDate(content.calendar, state.time)
  const shift = shiftsOn(content, job, dayIndex).find((s) => s.startHour > hour && !state.job!.excused.includes(shiftKey(dayIndex, s)))
  return shift && { job, shift, key: shiftKey(dayIndex, shift) }
}

export function canWork(content: ContentPack, state: GameState): PerformCheck {
  const now = shiftNow(content, state)
  if (!now || !content.jobs) return { ok: false, reasons: ['You have no shift now'] }
  const reasons: string[] = []
  if (state.locationId !== now.job.locationId) {
    const where = content.locations.find((l) => l.id === now.job.locationId)
    reasons.push(`Go to ${where?.name ?? now.job.locationId} first`)
  }
  return { ok: reasons.length === 0, reasons }
}

/**
 * Clocks in for the shift that is under way. It is a scene: his boss is there, and so is
 * any love interest who happens to be at the place, and what he makes of it is up to him.
 * He is kept until the shift ends, arriving late or not, and it costs him energy by the
 * hour. The pay comes when the scene is over.
 */
export function startShift(content: ContentPack, state: GameState): { state: GameState; scene: Scene } {
  const check = canWork(content, state)
  if (!check.ok) throw new Error(`Cannot work now: ${check.reasons.join('; ')}`)
  const { job, shift, key } = shiftNow(content, state)!
  const config = content.jobs!
  const boss = bossOf(content, job)
  const place = content.locations.find((l) => l.id === job.locationId)
  const { hour } = toDate(content.calendar, state.time)
  const left = shift.startHour + shift.hours - hour
  // Whoever is here now, and not in class, is here for his shift: found before the clock is run on.
  const [lead, ...others] = approachableAt(content, state, job.locationId).slice(0, MAX_SCENE_CAST)
  const companionIds = others.map((li) => li.id)
  const leadId = lead?.id ?? job.bossId
  const bossName = boss?.name ?? 'the boss'
  const she = pronounWords(boss?.pronouns).subject
  const direction =
    `This is ${state.player.name}'s shift at work: he is ${job.title.toLowerCase()} at ${place?.name ?? job.locationId}, from ${clock(shift.startHour)} to ` +
    `${clock(shift.startHour + shift.hours)}. ${job.description} ${bossName} is his boss and is here running the place: ${she} gives him things to do, ` +
    `notices if he slacks, and can be spoken to at any time. He is on the clock, so the work goes on around whatever is said: customers, errands, things to carry and clean. ` +
    // A boss who is a love interest is at work like any boss, and is in the scene as herself.
    (!lead || (lead.id === job.bossId && others.length === 0)
      ? `Nobody else he knows is here. Keep it to the work and to what the two of you say over it.`
      : `Whoever of you is not his boss is here as herself, not as staff: she happens to be at the place while he works, and may keep him company, distract him or wait for his break.`)
  // The work is work on a stat, like a class or a workout.
  const trained = job.trains ? trainStat(content, state, job.trains, left) : state
  const after: GameState = {
    ...trained,
    time: state.time + left,
    player: { ...trained.player, energy: Math.max(0, state.player.energy - Math.round(config.energyPerHour * left * factor(content, state, 'effort'))) },
    job: { ...state.job!, worked: [...state.job!.worked, key] }
  }
  return {
    state: after,
    scene: {
      loveInterestId: leadId,
      companionIds,
      npc: lead === undefined,
      nsfw: false,
      beats: [
        {
          activityName: `A shift as ${job.title.toLowerCase()}`,
          locationName: place?.name,
          description: `You clock in. ${bossName} looks up: there is plenty to do.`,
          direction
        }
      ],
      messages: [],
      gifts: [],
      conceived: [],
      departed: [],
      shift: { jobId: job.id, key, hours: left },
      baseline: sceneBaseline(state, leadId, companionIds)
    }
  }
}

/**
 * How much more than its rate a job pays him, as a fraction: so much for each point he has over what it asks, in every
 * stat it asks for, up to the most the rules allow. A job that asks nothing of him pays nobody more.
 */
export function payBonus(content: ContentPack, state: Pick<GameState, 'player'>, job: Job): number {
  const config = content.jobs
  if (!config) return 0
  const over = Object.entries(job.requirements).reduce((sum, [stat, needed]) => sum + Math.max(0, (state.player.stats[stat] ?? 0) - (needed ?? 0)), 0)
  // Rounded to a whole percent, so that what is shown is what is paid.
  return Math.round(Math.min(config.bonusCap, over * config.bonusPerPoint) * 100) / 100
}

/**
 * What a shift scene pays when it ends: the hours he was there for, at the job's rate, and more on top for what he
 * has over what the job asks. Nothing for any other scene.
 */
export function shiftPay(content: ContentPack, state: GameState, scene: Pick<Scene, 'shift'>): number {
  const job = jobOf(content, scene.shift?.jobId)
  return job && scene.shift ? Math.round(job.hourlyRate * scene.shift.hours * (1 + payBonus(content, state, job)) * factor(content, state, 'wages')) : 0
}

/** Pays the player for the shift a scene was. */
export function payShift(content: ContentPack, state: GameState, scene: Pick<Scene, 'shift'>): GameState {
  const pay = shiftPay(content, state, scene)
  return pay === 0 ? state : { ...state, player: { ...state.player, money: state.player.money + pay } }
}

/** Records that he has told his boss he cannot make a shift. It still counts against him, but for less. */
export function excuseShift(state: GameState, key: string): GameState {
  if (!state.job || state.job.excused.includes(key)) return state
  return { ...state, job: { ...state.job, excused: [...state.job.excused, key] } }
}

/**
 * Counts up the shifts that have ended since the last time: one he did not clock in for
 * is a strike against him, or part of one if he had told his boss that day. His boss
 * writes to say so, and at the last strike he is let go and will not be had back.
 */
export function settleShifts(content: ContentPack, state: GameState): GameState {
  const job = currentJob(content, state)
  const config = content.jobs
  if (!job || !state.job || !config || state.time <= state.job.settledTo) return state
  const employment = state.job
  const from = toDate(content.calendar, Math.max(0, employment.settledTo)).dayIndex
  const to = toDate(content.calendar, state.time).dayIndex
  let strikes = employment.strikes
  let next: GameState = state
  for (let dayIndex = from; dayIndex <= to; dayIndex++) {
    for (const shift of shiftsOn(content, job, dayIndex)) {
      const begins = shiftStart(content, dayIndex, shift)
      const ends = begins + shift.hours
      // Only what has ended since the last count, and was his to work.
      if (ends <= employment.settledTo || ends > state.time || begins < employment.hiredAt) continue
      const key = shiftKey(dayIndex, shift)
      if (employment.worked.includes(key)) continue
      const excused = employment.excused.includes(key)
      strikes += excused ? config.excusedStrike : config.missedStrike
      const fired = strikes >= config.strikes
      next = addNote(next, job.bossId, {
        from: 'them',
        text: fired
          ? `You missed ${describeShift(shift)}. That's ${strikes} strikes. Don't come back: you're done here.`
          : excused
            ? `Covered your ${describeShift(shift)} shift. Thanks for telling me, but it still counts for half: you're on ${strikes} of ${config.strikes}.`
            : `You missed your ${describeShift(shift)} shift without a word. That's ${strikes} of ${config.strikes} strikes.`,
        read: false
      })
      if (fired) return { ...next, job: null, formerJobs: [...next.formerJobs, job.id] }
    }
  }
  // Only this week's keys are worth keeping.
  const recent = (keys: string[]) => keys.filter((key) => Number(key.split(':')[0]) >= to - 7)
  return { ...next, job: { ...employment, strikes, settledTo: state.time, worked: recent(employment.worked), excused: recent(employment.excused) } }
}

/** What the player's boss knows of him as her employee, for when she speaks or writes to him. Empty for anyone else. */
export function jobFacts(content: ContentPack, state: GameState, npcId: string): string[] {
  const job = currentJob(content, state)
  const config = content.jobs
  if (!job || !state.job || !config || job.bossId !== npcId) {
    const former = content.jobs?.jobs.find((j) => j.bossId === npcId && state.formerJobs.includes(j.id))
    return former ? [`${state.player.name} used to work for you as ${former.title.toLowerCase()} and no longer does. You will not take him back.`] : []
  }
  const today = shiftLaterToday(content, state)
  const { dayIndex } = toDate(content.calendar, state.time)
  const told = shiftsOn(content, job, dayIndex).find((shift) => state.job!.excused.includes(shiftKey(dayIndex, shift)))
  return [
    `${state.player.name} works for you as ${job.title.toLowerCase()}, paid $${job.hourlyRate} an hour${payBonus(content, state, job) > 0 ? `, and ${Math.round(payBonus(content, state, job) * 100)}% over that because he is better at it than the job asks` : ''}. His shifts are ${job.shifts.map(describeShift).join(', ')}.`,
    `He has ${state.job.strikes} of ${config.strikes} strikes. A shift missed without a word is a full strike, and one he warned you of that day is half. At ${config.strikes} he is out.`,
    today ? `He has a shift today at ${clock(today.shift.startHour)} that has not started yet.` : told ? `He has already told you he will miss today's ${clock(told.startHour)} shift.` : 'He has no shift still to come today.'
  ]
}

/** One hour of one day in a week laid side by side with a job: what he already has on then, and whether the job has a shift then. */
export interface WeekHour {
  /** What he already does in that hour: the number of a class he takes, or the job he holds. */
  mine?: string
  /** The job being looked at has a shift then. */
  shift: boolean
}

/**
 * A job's shifts laid over the player's week as it stands: the classes he takes and the
 * shifts of any other job he holds. Where a shift falls on something of his, the two
 * clash. The hours run from the first thing in the week to the last.
 */
export function weekAgainst(content: ContentPack, state: GameState, job: Job): { days: string[]; hours: number[]; at: (day: string, hour: number) => WeekHour; clashes: number } {
  const days = content.calendar.weekdays
  const held = currentJob(content, state)
  const mine = [
    ...state.courses
      .filter((course) => state.enrolment?.includes(course.id))
      .flatMap((course) => course.meetings.map((m) => ({ weekday: m.weekday, startHour: m.startHour, hours: m.hours, label: course.number }))),
    ...(held && held.id !== job.id ? held.shifts.map((shift) => ({ ...shift, label: held.title })) : [])
  ]
  const spans = [...mine, ...job.shifts]
  const from = Math.min(content.coursework?.dayStart ?? 8, ...spans.map((s) => s.startHour))
  const until = Math.max(content.coursework?.dayEnd ?? 18, ...spans.map((s) => s.startHour + s.hours))
  const during = (span: { weekday: string; startHour: number; hours: number }, day: string, hour: number) => span.weekday === day && hour >= span.startHour && hour < span.startHour + span.hours
  const at = (day: string, hour: number): WeekHour => ({
    mine: mine.find((span) => during(span, day, hour))?.label,
    shift: job.shifts.some((shift) => during(shift, day, hour))
  })
  const hours = Array.from({ length: until - from }, (_, i) => from + i)
  // A clash is counted once for each shift that falls on something of his, however many hours of it do.
  const clashes = job.shifts.filter((shift) => mine.some((span) => span.weekday === shift.weekday && span.startHour < shift.startHour + shift.hours && shift.startHour < span.startHour + span.hours)).length
  return { days, hours, at, clashes }
}

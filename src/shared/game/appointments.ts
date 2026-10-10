import { MAX_SCENE_CAST, type Appointment, type ContentPack, type Course, type GameState, type Proposal } from '../model'
import type { PerformCheck } from './activities'
import { formatDate, formatTime, isGameOver, toDate } from './calendar'
import { courseMembers, meetingNow } from './courses'
import { firstNames } from './scene'
import { isOpen } from './schedule'

// Plans are made for these hours of the day, and no further ahead than this.
const EARLIEST_HOUR = 8
const LATEST_END_HOUR = 22
const SEARCH_DAYS = 14
// How long a planned meeting lasts.
const MEETING_HOURS = 2

/** "Windsday, 4 Bloomtide, Year 412 at 13:00" */
export function describeWhen(content: ContentPack, time: number): string {
  const date = toDate(content.calendar, time)
  return `${formatDate(date)} at ${formatTime(date)}`
}

function overlaps(a: { time: number; hours: number }, time: number, hours: number): boolean {
  return a.time < time + hours && time < a.time + a.hours
}

/** Whether any of the courses has a class during the given hours. */
function inClass(content: ContentPack, state: GameState, courses: Course[], time: number, hours: number): boolean {
  for (let t = time; t < time + hours; t++) {
    // Asked of the timetable itself, so that days without classes are free.
    const then = { ...state, time: t }
    if (courses.some((course) => meetingNow(content, then, course) !== undefined)) return true
  }
  return false
}

/** Everyone a plan is with: whoever suggested it, then the others. */
export function attendees(plan: Pick<Proposal, 'loveInterestId' | 'companionIds'>): string[] {
  return [plan.loveInterestId, ...plan.companionIds]
}

/** Whether the player and every one of the love interests are free of classes and other plans for those hours. */
export function allFree(
  content: ContentPack,
  state: GameState,
  loveInterestIds: string[],
  time: number,
  hours: number
): boolean {
  const mine = state.courses.filter((c) => state.enrolment?.includes(c.id))
  const theirs = state.courses.filter((c) => courseMembers(c).some((id) => loveInterestIds.includes(id)))
  return (
    !inClass(content, state, [...mine, ...theirs], time, hours) &&
    // Every plan is with the player, so any plan at that time is a clash.
    !state.appointments.some((a) => overlaps(a, time, hours))
  )
}

export interface MeetingRequest {
  /** What the two would do, in a few words. */
  activity: string
  /** A location id. */
  place: string
  /** How soon: "today", "tomorrow", "later this week", "the weekend" or "next week". */
  earliest?: string
  /** A day of the week by name, when only that day will do. */
  weekday?: string
  /** A period name or id, e.g. "afternoon". */
  timeOfDay?: string
  /** Ids of other love interests to bring along, up to two. */
  with?: string[]
}

/** The others asked along who exist, without the proposer or repeats, up to the scene limit. */
function companionsOf(content: ContentPack, loveInterestId: string, request: MeetingRequest): string[] {
  const known = (request.with ?? [])
    .map((asked) => content.loveInterests.find((li) => li.id.toLowerCase() === asked.trim().toLowerCase())?.id)
    .filter((id): id is string => id !== undefined && id !== loveInterestId)
  return [...new Set(known)].slice(0, MAX_SCENE_CAST - 1)
}

/**
 * Finds the first time the player, a love interest and anyone else asked along can meet: all free, the place
 * open throughout, at a civil hour, and matching any preference for how soon and what
 * time of day. Returns undefined if nothing fits in the next two weeks.
 */
export function findMeetingTime(
  content: ContentPack,
  state: GameState,
  loveInterestId: string,
  request: MeetingRequest
): number | undefined {
  const { calendar } = content
  const location = content.locations.find((l) => l.id === request.place)
  if (!location) return undefined

  const today = toDate(calendar, state.time).dayIndex
  const wanted = request.earliest?.toLowerCase() ?? ''
  const classDays = content.coursework?.weekdays ?? []
  const weekend = wanted.includes('weekend')
  // "Next week" is from the day the next week begins, whatever day of this one it is.
  const week = calendar.weekdays.length
  const untilNextWeek = week - ((((calendar.startWeekday + today) % week) + week) % week)
  const minDay = today + (wanted.includes('next week') ? untilNextWeek : wanted.includes('tomorrow') ? 1 : wanted.includes('later') ? 2 : weekend ? 1 : 0)
  // A day of the week asked for by name: only that day will do.
  const onDay = calendar.weekdays.find((name) => name.toLowerCase() === request.weekday?.trim().toLowerCase())
  const period = request.timeOfDay?.toLowerCase()
  const everyone = [loveInterestId, ...companionsOf(content, loveInterestId, request)]

  for (let time = state.time + 1; time <= state.time + SEARCH_DAYS * calendar.hoursPerDay; time++) {
    if (isGameOver(calendar, time)) return undefined
    const date = toDate(calendar, time)
    if (date.dayIndex < minDay) continue
    if (weekend && classDays.includes(date.weekday)) continue
    if (onDay && date.weekday !== onDay) continue
    const latestEnd = Math.min(LATEST_END_HOUR, calendar.hoursPerDay)
    if (date.hour < EARLIEST_HOUR || date.hour + MEETING_HOURS > latestEnd) continue
    if (period && date.period.id.toLowerCase() !== period && date.period.name.toLowerCase() !== period) continue
    if (!isOpen(location, date.hour) || !isOpen(location, date.hour + MEETING_HOURS - 1)) continue
    if (!allFree(content, state, everyone, time, MEETING_HOURS)) continue
    return time
  }
  return undefined
}

/**
 * The scheduling tool the LLM calls when a character wants to meet the player later.
 * It picks the time; the character then suggests it in their own words. Returns what to
 * tell the LLM, and the proposal for the player to accept if a time was found.
 */
export function proposeMeeting(
  content: ContentPack,
  state: GameState,
  loveInterestId: string,
  request: MeetingRequest
): { proposal?: Proposal; message: string } {
  const location = content.locations.find((l) => l.id === request.place)
  if (!location) {
    const known = content.locations.map((l) => l.id).join(', ')
    return { message: `There is no place called "${request.place}". Choose one of: ${known}.` }
  }
  const companionIds = companionsOf(content, loveInterestId, request)
  const unknown = (request.with ?? []).filter(
    (asked) => !content.loveInterests.some((li) => li.id.toLowerCase() === asked.trim().toLowerCase())
  )
  if (unknown.length > 0) {
    const known = content.loveInterests.filter((li) => li.id !== loveInterestId).map((li) => li.id)
    return { message: `Nobody is called "${unknown.join('", "')}". Choose from: ${known.join(', ')}.` }
  }
  const group = companionIds.length > 0
  const time = findMeetingTime(content, state, loveInterestId, request)
  if (time === undefined) {
    return {
      message:
        `No time could be found in the next two weeks when ${group ? 'all of you are' : 'you are both'} free and ${location.name} is open. ` +
        `Say that you can't find a time, and suggest trying another place or time of day${group ? ', or fewer people' : ''}.`
    }
  }
  const title = request.activity.trim() || 'Meet up'
  // How far off it is, said outright, so that a time found for today is not spoken of as next week.
  const inDays = toDate(content.calendar, time).dayIndex - toDate(content.calendar, state.time).dayIndex
  const off = inDays === 0 ? 'today' : inDays === 1 ? 'tomorrow' : `${inDays} days from now`
  return {
    proposal: { loveInterestId, companionIds, title, time, hours: MEETING_HOURS, locationId: location.id },
    message:
      (group
        ? `You, ${state.player.name}, ${firstNames(content, companionIds)} are all free on ${describeWhen(content, time)}, which is ${off}, at ${location.name}. `
        : `You are both free on ${describeWhen(content, time)}, which is ${off}, at ${location.name}. `) +
      `Suggest exactly that day, time and place to ${state.player.name}, in character, and ask whether it suits. ` +
      `Do not name any other time, and do not call it next week or another day if it is not: if this is sooner or later than you meant, call the tool again with "earliest" or "weekday" set. ` +
      ` ${state.player.name} will accept or decline.`
  }
}

/** Puts an accepted proposal on the calendar. */
export function acceptProposal(state: GameState, proposal: Proposal): GameState {
  let n = 1
  while (state.appointments.some((a) => a.id === `plan-${n}`)) n++
  const appointments = [...state.appointments, { ...proposal, id: `plan-${n}` }]
  return { ...state, appointments: appointments.sort((a, b) => a.time - b.time) }
}

/** Plans that haven't finished yet, soonest first. */
export function upcomingAppointments(state: GameState): Appointment[] {
  return state.appointments.filter((a) => a.time + a.hours > state.time).sort((a, b) => a.time - b.time)
}

/** Plans whose time is now. */
export function appointmentsNow(state: GameState): Appointment[] {
  return state.appointments.filter((a) => a.time <= state.time && state.time < a.time + a.hours)
}

export function canKeep(content: ContentPack, state: GameState, appointmentId: string): PerformCheck {
  const appointment = state.appointments.find((a) => a.id === appointmentId)
  if (!appointment) return { ok: false, reasons: ['No such plan'] }
  const reasons: string[] = []
  if (!appointmentsNow(state).includes(appointment)) reasons.push('It is not time yet')
  if (state.locationId !== appointment.locationId) {
    const where = content.locations.find((l) => l.id === appointment.locationId)
    reasons.push(`Go to ${where?.name ?? appointment.locationId} first`)
  }
  return { ok: reasons.length === 0, reasons }
}

/**
 * Turns up for a plan: it comes off the calendar, everyone there thinks better of the
 * player for keeping their word, and the clock moves to the end of the meeting.
 */
export function keepAppointment(
  content: ContentPack,
  state: GameState,
  appointmentId: string
): { state: GameState; appointment: Appointment } {
  const check = canKeep(content, state, appointmentId)
  if (!check.ok) throw new Error(`Cannot keep "${appointmentId}": ${check.reasons.join('; ')}`)
  const appointment = state.appointments.find((a) => a.id === appointmentId)!
  // What keeping it is worth to whoever turned up is settled by the scene itself.
  const after = state
  return {
    appointment,
    state: {
      ...after,
      time: appointment.time + appointment.hours,
      appointments: after.appointments.filter((a) => a.id !== appointmentId)
    }
  }
}

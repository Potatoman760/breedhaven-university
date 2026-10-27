import type { ContentPack, GameState } from '../model'
import { attendees } from './appointments'
import { toDate } from './calendar'
import { meetingNow } from './courses'
import { eventGoers, eventsOn } from './events'
import { examOn } from './grades'
import { householdCost, isHouseholdDay, rentOn } from './housing'
import { firstNames } from './scene'
import { joinedSocieties, societyMeetingNow } from './societies'
import { awayOnDay } from './trips'
import { t } from '../i18n'

/** One thing on a day of the calendar. */
export interface AgendaItem {
  kind: 'class' | 'society' | 'work' | 'plan' | 'event' | 'orientation' | 'birth' | 'rent' | 'household'
  /** Unique within the day. */
  id: string
  title: string
  /** A second line: who with, where, who teaches. */
  detail?: string
  /** The hour of the day it begins. Left out for something that takes the whole day. */
  startHour?: number
  hours?: number
  /** What it is, at length, for when it is looked at: an event's description. */
  description?: string
}

/** One hour of the day a plan is suggested for: what of his is then, and whether the plan is. */
export interface PlanHour {
  hour: number
  /** What he has on at that hour, if anything. */
  mine?: string
  /** Whether what he has then holds him: an event is shown, but going to one is up to him. */
  holds: boolean
  plan: boolean
}

// What of his day a plan cannot share an hour with.
const HOLDING: AgendaItem['kind'][] = ['class', 'society', 'work', 'plan', 'orientation', 'birth']

/**
 * A suggested plan laid over the day it falls on, hour by hour, for him to see before he says yes: what he has then, and
 * what of it the plan would fall on. The hours run from his day's usual start to its end, widened to take in whatever
 * is on it and the plan itself.
 */
export function dayAgainst(content: ContentPack, state: GameState, plan: { time: number; hours: number }): { allDay: AgendaItem[]; hours: PlanHour[]; clashes: string[] } {
  const { dayIndex, hour: start } = toDate(content.calendar, plan.time)
  const agenda = dayAgenda(content, state, dayIndex)
  const timed = agenda.filter((item) => item.startHour !== undefined)
  const end = start + plan.hours
  const from = Math.min(content.coursework?.dayStart ?? 8, start, ...timed.map((item) => item.startHour!))
  const until = Math.max(content.coursework?.dayEnd ?? 18, end, ...timed.map((item) => item.startHour! + (item.hours ?? 1)))
  const at = (hour: number) => timed.find((item) => hour >= item.startHour! && hour < item.startHour! + (item.hours ?? 1))
  const hours = Array.from({ length: until - from }, (_, i): PlanHour => {
    const hour = from + i
    const item = at(hour)
    return { hour, mine: item?.title, holds: item !== undefined && HOLDING.includes(item.kind), plan: hour >= start && hour < end }
  })
  // Each thing it falls on is named once, however many of its hours it does.
  const clashes = timed.filter((item) => HOLDING.includes(item.kind) && item.startHour! < end && start < item.startHour! + (item.hours ?? 1)).map((item) => item.title)
  return { allDay: agenda.filter((item) => item.startHour === undefined), hours, clashes }
}

/** The game time at a given hour of a given day of the game, where day 0 is the day it starts. */
export function timeOn(content: ContentPack, dayIndex: number, hour: number): number {
  const { calendar } = content
  return dayIndex * calendar.hoursPerDay + (hour - calendar.start.hour)
}

/**
 * Everything on one day of the calendar: events, expected births and what the house costs across
 * the top, then orientation, the player's own classes and their plans by the hour, in order. The
 * day is counted from the start of the game and may fall outside it, where only the
 * calendar's own events are known.
 */
export function dayAgenda(content: ContentPack, state: GameState, dayIndex: number): AgendaItem[] {
  const { calendar } = content
  const inGame = dayIndex >= 0 && dayIndex < calendar.lengthDays
  // Events are asked for at the hour the game starts each day, which every day has.
  const morning = timeOn(content, dayIndex, calendar.start.hour)
  const whole: AgendaItem[] = eventsOn(content, state, Math.max(morning, 0))
    .filter((event) => !event.secret)
    .filter(() => morning >= 0)
    // An event with hours of its own is drawn at them, with where it is; a holiday is the whole day.
    .map((event) => ({
      kind: 'event' as const,
      id: `event-${event.id}`,
      title: event.name,
      detail: content.locations.find((l) => l.id === event.locationId)?.name,
      // Who has said she will be there is part of what there is to read of it.
      description: [event.description, eventGoers(state, event.id).length > 0 && t('game.agenda.goers', { names: firstNames(content, eventGoers(state, event.id)), count: eventGoers(state, event.id).length })].filter(Boolean).join(' '),
      startHour: event.startHour,
      hours: event.startHour === undefined ? undefined : (event.hours ?? 1)
    }))

  for (const [motherId, pregnancy] of Object.entries(state.pregnancies)) {
    // Once the hour of the birth is set it is on the day at that hour; until then, she is only known to be due.
    if (toDate(calendar, pregnancy.dueAt).dayIndex === dayIndex && !state.appointments.some((plan) => plan.kind === 'birth' && plan.loveInterestId === motherId)) {
      whole.push({ kind: 'birth', id: `birth-${motherId}`, title: t('game.agenda.due', { name: firstNames(content, [motherId]) }) })
    }
  }
  // What the house will cost him, on the days it does: only days still to come, since what is past is in its ledger.
  if (dayIndex >= toDate(calendar, state.time).dayIndex) {
    const rent = rentOn(content, state, dayIndex)
    if (rent > 0) whole.push({ kind: 'rent', id: 'rent', title: t('game.agenda.rent', { amount: rent }), detail: content.housing?.name })
    const keep = householdCost(content, state)
    if (keep > 0 && isHouseholdDay(content, dayIndex)) whole.push({ kind: 'household', id: 'household', title: t('game.agenda.household', { amount: keep }), detail: content.housing?.name })
  }
  if (!inGame) return whole.filter((item) => item.startHour === undefined)

  const timed: AgendaItem[] = whole.filter((item) => item.startHour !== undefined)
  if (content.orientation && content.orientation.day - 1 === dayIndex) {
    for (const step of content.orientation.steps) {
      const place = content.locations.find((l) => l.id === step.locationId)?.name
      timed.push({ kind: 'orientation', id: `orientation-${step.id}`, title: step.name, detail: place, startHour: step.startHour, hours: step.hours })
    }
  }
  for (const course of state.courses.filter((c) => state.enrolment?.includes(c.id))) {
    for (const meeting of course.meetings) {
      // Asked of the timetable itself, so that holidays and breaks are left clear.
      const then = { ...state, time: timeOn(content, dayIndex, meeting.startHour) }
      if (then.time < 0 || meetingNow(content, then, course) !== meeting) continue
      const exam = examOn(content, course, dayIndex, meeting.startHour)
      timed.push({
        kind: 'class',
        id: `class-${course.id}`,
        // The last class of the examination weeks is the examination.
        title: exam ? t(exam.kind === 'midterm' ? 'game.agenda.midterm' : 'game.agenda.final', { course: `${course.number} ${course.title}` }) : `${course.number} ${course.title}`,
        detail: course.professor,
        startHour: meeting.startHour,
        hours: meeting.hours
      })
    }
  }
  for (const society of joinedSocieties(content, state)) {
    const then = { ...state, time: timeOn(content, dayIndex, society.startHour) }
    if (then.time < 0 || !societyMeetingNow(content, then, society)) continue
    const place = content.locations.find((l) => l.id === society.locationId)?.name
    timed.push({ kind: 'society', id: `society-${society.id}`, title: society.name, detail: place, description: society.description, startHour: society.startHour, hours: content.societies!.hours })
  }
  const job = content.jobs?.jobs.find((j) => j.id === state.job?.jobId)
  // Away on a trip he booked, his shifts are not his to work.
  if (job && state.job && !awayOnDay(content, state, dayIndex)) {
    const { weekday } = toDate(calendar, morning)
    const place = content.locations.find((l) => l.id === job.locationId)?.name
    for (const shift of job.shifts) {
      if (shift.weekday !== weekday || timeOn(content, dayIndex, shift.startHour) < state.job.hiredAt) continue
      timed.push({ kind: 'work', id: `work-${shift.startHour}`, title: t('game.agenda.shift', { job: job.title }), detail: place, startHour: shift.startHour, hours: shift.hours })
    }
  }
  for (const plan of state.appointments) {
    const date = toDate(calendar, plan.time)
    if (date.dayIndex !== dayIndex) continue
    const place = content.locations.find((l) => l.id === plan.locationId)?.name
    timed.push({
      kind: plan.kind === 'birth' ? 'birth' : 'plan',
      id: `plan-${plan.id}`,
      title: plan.kind === 'birth' ? t('game.agenda.givesBirth', { name: firstNames(content, [plan.loveInterestId]) }) : plan.kind === 'viewing' || plan.kind === 'below' ? plan.title : t('game.agenda.planWith', { plan: plan.title, names: firstNames(content, attendees(plan)) }),
      detail: place,
      startHour: date.hour,
      hours: plan.hours
    })
  }
  return [...whole.filter((item) => item.startHour === undefined), ...timed.sort((a, b) => (a.startHour ?? 0) - (b.startHour ?? 0))]
}

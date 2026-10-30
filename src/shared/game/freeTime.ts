import type { ContentPack, GameState } from '../model'
import { dayAgainst, dayAgenda, timeOn } from './agenda'
import { toDate } from './calendar'
import { courseMembers, meetingNow } from './courses'
import { eventDay, eventsOn } from './events'
import { isOrientationDay } from './orientation'
import { firstNames } from './scene'
import { societyMeetingNow, societyPeople } from './societies'
import { awayOnDay } from './trips'
import { t } from '../i18n'

// What on his calendar he is held to, by the calendar's kind: an event he may or may not go to is not among them.
const HELD: Record<string, (title: string, detail: string | undefined) => string> = {
  class: (title) => t('game.freeTime.class', { title }),
  society: (title) => t('game.freeTime.society', { society: title.replace(/^the /, '') }),
  work: (_title, detail) => t('game.freeTime.work', { at: Boolean(detail), place: detail }),
  plan: (title) => t('game.freeTime.plan', { title }),
  birth: (title) => title,
  orientation: (title) => t('game.freeTime.orientation', { title })
}

/**
 * What keeps the player, or any of the love interests named, from meeting for these hours, each in a few words:
 * whatever his calendar holds him to (his classes, his societies, his shifts, his plans), a day he is away or one
 * orientation fills, a part of an event he must go to, and their own classes and society meetings. Nothing when all are free.
 */
export function busyWith(content: ContentPack, state: GameState, loveInterestIds: string[], time: number, hours: number): string[] {
  const { calendar } = content
  const { dayIndex, hour } = toDate(calendar, time)
  const end = hour + hours
  const overlaps = (start: number, length: number) => start < end && hour < start + length
  if (isOrientationDay(content, state, time)) return [t('game.freeTime.orientationDay')]
  if (awayOnDay(content, state, dayIndex)) return [t('game.freeTime.away')]

  const reasons: string[] = []
  for (const item of dayAgenda(content, state, dayIndex)) {
    const said = HELD[item.kind]
    if (said && item.startHour !== undefined && overlaps(item.startHour, item.hours ?? 1)) reasons.push(said(item.title, item.detail))
  }
  for (const event of eventsOn(content, state, time)) {
    for (const part of event.program) {
      if (!part.required || part.day !== eventDay(content, event, time) || !overlaps(part.startHour, part.hours)) continue
      if (part.onTrip && state.trips[event.id] === undefined) continue
      reasons.push(t('game.freeTime.event', { event: event.name, part: part.name }))
    }
  }

  // Theirs, asked of the timetable hour by hour, so that a holiday or a break leaves them clear.
  for (let i = 0; i < hours; i++) reasons.push(...theirsAt(content, state, loveInterestIds, time + i))
  return [...new Set(reasons)]
}

/** What any of the love interests named has on at one hour: her classes and her society meetings. */
function theirsAt(content: ContentPack, state: GameState, loveInterestIds: string[], time: number): string[] {
  const then = { ...state, time }
  return loveInterestIds.flatMap((id) => {
    const name = firstNames(content, [id])
    return [
      ...state.courses.filter((c) => courseMembers(c).includes(id) && meetingNow(content, then, c) !== undefined).map((course) => t('game.freeTime.herClass', { name, course: course.number })),
      ...(content.societies?.societies ?? []).filter((s) => societyPeople(s).includes(id) && societyMeetingNow(content, then, s)).map((society) => t('game.freeTime.herSociety', { name, society: society.name.replace(/^the /, '') }))
    ]
  })
}

/**
 * A plan laid over his day (`dayAgainst`), with what those it is with have on laid over it too: an hour one of them is
 * held is held, and what holds her is said in it beside anything of his.
 */
export function dayAgainstWith(content: ContentPack, state: GameState, plan: { time: number; hours: number }, loveInterestIds: string[]): ReturnType<typeof dayAgainst> {
  const day = dayAgainst(content, state, plan)
  const { dayIndex } = toDate(content.calendar, plan.time)
  const hours = day.hours.map((at) => {
    const theirs = theirsAt(content, state, loveInterestIds, timeOn(content, dayIndex, at.hour))
    if (theirs.length === 0) return at
    return { ...at, mine: [at.mine, ...theirs].filter(Boolean).join(' · '), holds: true }
  })
  const theirClashes = day.hours.filter((at) => at.plan).flatMap((at) => theirsAt(content, state, loveInterestIds, timeOn(content, dayIndex, at.hour)))
  return { ...day, hours, clashes: [...new Set([...day.clashes, ...theirClashes])] }
}

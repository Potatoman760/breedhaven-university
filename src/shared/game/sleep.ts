import type { ContentPack, GameState } from '../model'
import { toDate } from './calendar'
import { describeWhen } from './appointments'
import { outingMisses } from './outing'

/**
 * The hours kept for sleep: from midnight until he wakes. Nothing else happens in them.
 * Whenever the clock stands in them and he is not in the middle of something, he sleeps.
 */
export const SLEEP_HOURS = { from: 0, until: 6 } as const

/** Whether it is the middle of the night: the hours in which he can only be asleep. */
export function isSleepTime(content: ContentPack, state: GameState): boolean {
  const { hour } = toDate(content.calendar, state.time)
  return hour >= SLEEP_HOURS.from && hour < SLEEP_HOURS.until
}

/** The game time at which he next wakes: this morning if it is already past midnight, and tomorrow's otherwise. */
export function wakeTime(content: ContentPack, state: GameState): number {
  const { hour } = toDate(content.calendar, state.time)
  const untilMorning = hour < SLEEP_HOURS.until ? SLEEP_HOURS.until - hour : content.calendar.hoursPerDay - hour + SLEEP_HOURS.until
  return state.time + untilMorning
}

/**
 * Sleeps until morning, from whatever hour it is: the rest of the day is let go, and he
 * wakes rested, at home. Wherever the night found him, he sleeps in his own bed. This is
 * both what the small hours do to him and how he ends a day early.
 */
export function sleep(content: ContentPack, state: GameState): GameState {
  return { ...state, time: wakeTime(content, state), locationId: homeOf(content), player: { ...state.player, energy: state.player.maxEnergy } }
}

/** Where the player lives: the place his own room is in, or without one, where a new game starts him. */
export function homeOf(content: ContentPack): string {
  return content.newGame.room?.locationId ?? content.newGame.locationId
}

/**
 * What ending the day now would let go: classes he is taking and shifts at his job that
 * are still to come before he wakes, and plans he has made for those hours. Each as a line.
 */
export function dayMisses(content: ContentPack, state: GameState): string[] {
  const hours = wakeTime(content, state) - state.time
  const lessons = outingMisses(content, state, { title: '', description: '', withIds: [], locationId: state.locationId, hours })
  const plans = state.appointments
    .filter((plan) => plan.time + plan.hours > state.time && plan.time < state.time + hours)
    .map((plan) => `${plan.title}, ${describeWhen(content, plan.time)}`)
  return [...lessons, ...plans]
}

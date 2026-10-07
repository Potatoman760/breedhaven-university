import { STATS, type ContentPack, type GameState, type LoveInterest, type Stat } from '../model'
import { toDate } from './calendar'

// Stats are ability scores: 8 to 15 at the start, 10 or 11 for anyone, and up to 30 with a term's work.
// These are where one stops being ordinary, and then stops being merely good.
const GOOD = 14
const IMPRESSIVE = 18
const EXCEPTIONAL = 22
const LEGENDARY = 26

/** As high as a stat goes. */
export const STAT_CAP = 30
// A day's training of one stat: this many points count in full, the next few for half, and the rest not at all.
const FULL_A_DAY = 2
const HALF_A_DAY = 2
// How much more a pleased love interest's affection grows, per level of appeal.
const APPEAL_BONUS = 0.25

export function statOf(state: GameState, stat: string): number {
  return state.player.stats[stat] ?? 0
}

/** A stat's value in a word, for prompts: ordinary, good, impressive, exceptional or legendary. */
export function describeStat(value: number): string {
  return value >= LEGENDARY ? 'legendary' : value >= EXCEPTIONAL ? 'exceptional' : value >= IMPRESSIVE ? 'impressive' : value >= GOOD ? 'good' : 'ordinary'
}

/** How the player measures up in the things a love interest admires: the average of those stats. */
export function appeal(state: GameState, li: Pick<LoveInterest, 'admires'>): number {
  if (li.admires.length === 0) return 0
  return li.admires.reduce((sum, stat) => sum + statOf(state, stat), 0) / li.admires.length
}

/** 0: nothing about the player has caught their eye. 1: they have noticed. 2: they are taken with him. */
export function appealLevel(state: GameState, li: Pick<LoveInterest, 'admires'>): 0 | 1 | 2 {
  const value = appeal(state, li)
  return value >= IMPRESSIVE ? 2 : value >= GOOD ? 1 : 0
}

/** Affection won from someone who likes what they see grows faster. Losses are not softened. */
export function affectionGain(content: ContentPack, state: GameState, loveInterestId: string, amount: number): number {
  const li = content.loveInterests.find((c) => c.id === loveInterestId)
  if (!li || amount <= 0) return amount
  return Math.ceil(amount * (1 + APPEAL_BONUS * appealLevel(state, li)))
}

/**
 * Told to a character: what it is about the player that draws her, worked out here so that
 * she is given the conclusion and not his numbers. Only the things she admires in which he
 * is better than ordinary are named; when there are none, nothing is said at all.
 */
export function describeAppeal(state: GameState, li: Pick<LoveInterest, 'admires'>): string[] {
  const { name } = state.player
  const drawn = li.admires.filter((stat) => statOf(state, stat) >= GOOD).map((stat) => `${describeStat(statOf(state, stat))} ${stat}`)
  if (drawn.length === 0) return []
  const felt = [
    '',
    ' You are a little warmer for it, more curious, and slower to end a conversation.',
    ' It makes him hard for you to ignore: you flirt more readily, make time for him, and find reasons to see him again.'
  ][appealLevel(state, li)]
  return [`You are drawn to ${name}'s ${drawn.join(' and ')}.${felt}`]
}

/**
 * How the player's stats are settled at the start of a game: every stat begins at the
 * lowest score, and he has a pool of points to raise them with as he likes. A point buys a
 * point up to 13; the two above that cost two each, so that being very good at something
 * is paid for somewhere else. These are the usual numbers of a point-buy.
 */
export const POINT_BUY = { pool: 27, min: 8, max: 15 } as const

/** What it costs to hold a score: nothing at 8, a point for each one up to 13, and two for each of 14 and 15. */
export function pointCost(score: number): number {
  const held = Math.max(POINT_BUY.min, Math.min(POINT_BUY.max, Math.round(score)))
  return held - POINT_BUY.min + Math.max(0, held - 13)
}

/** The stats a new character starts from before any points are spent: all of them at the lowest. */
export function startingStats(): Record<Stat, number> {
  return Object.fromEntries(STATS.map((stat) => [stat, POINT_BUY.min])) as Record<Stat, number>
}

/** How many points a set of stats has used. */
export function pointsSpent(stats: Record<string, number>): number {
  return STATS.reduce((sum, stat) => sum + pointCost(stats[stat] ?? POINT_BUY.min), 0)
}

/** How many of the pool are still to spend. */
export function pointsLeft(stats: Record<string, number>): number {
  return POINT_BUY.pool - pointsSpent(stats)
}

/**
 * The stats with one of them a step higher or lower, or as they were when that cannot be
 * done: it would pass the lowest or highest score, or cost more points than are left.
 */
export function adjustStat(stats: Record<Stat, number>, stat: Stat, by: 1 | -1): Record<Stat, number> {
  const next = { ...stats, [stat]: stats[stat] + by }
  if (next[stat] < POINT_BUY.min || next[stat] > POINT_BUY.max || pointsLeft(next) < 0) return stats
  return next
}

/** What a score adds to a roll made with it: nothing at 10 or 11, one more for every two above, one less for every two below. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/** A modifier as it is written: "+2", "+0", "-1". */
export function describeModifier(score: number): string {
  const modifier = abilityModifier(score)
  return modifier >= 0 ? `+${modifier}` : `${modifier}`
}

/**
 * What the next point of a stat costs in training points: two at an ordinary score, and two
 * more for every step of its modifier, so that the better he is at something the longer
 * the next point takes. Nothing can be bought past the cap.
 */
export function statCost(score: number): number {
  return Math.max(1, 2 + 2 * abilityModifier(score))
}

/** How far he is toward the next point of a stat: what he has banked, and what it takes. */
export function trainingToward(state: GameState, stat: string): { banked: number; needed: number } {
  return { banked: state.training[stat] ?? 0, needed: statCost(statOf(state, stat)) }
}

/** How much of a day's training counts, by how much has been done: all of the first of it, half of the next, none after. */
function counted(points: number): number {
  return Math.min(points, FULL_A_DAY) + 0.5 * Math.max(0, Math.min(points - FULL_A_DAY, HALF_A_DAY))
}

/**
 * Works on a stat. Whatever raises a stat (a class, a workout, a shift, an hour with a
 * book) does it through this: the work earns training points, about one an hour, which
 * are banked until there are enough for the next point of the score. A day's work on one
 * stat counts for less the more of it there is, so a stat is built over weeks and not in
 * an afternoon; and a score never passes the cap.
 */
export function trainStat(content: ContentPack, state: GameState, stat: string, points: number): GameState {
  if (points <= 0) return state
  const day = toDate(content.calendar, state.time).dayIndex
  const today = state.trainedOn.day === day ? state.trainedOn.points : {}
  const already = today[stat] ?? 0
  const earned = counted(already + points) - counted(already)
  let score = statOf(state, stat)
  let banked = (state.training[stat] ?? 0) + earned
  while (score < STAT_CAP && banked >= statCost(score)) {
    banked -= statCost(score)
    score += 1
  }
  // At the cap there is nothing left to save toward.
  if (score >= STAT_CAP) banked = 0
  return {
    ...state,
    player: { ...state.player, stats: { ...state.player.stats, [stat]: score } },
    training: { ...state.training, [stat]: Math.round(banked * 100) / 100 },
    trainedOn: { day, points: { ...today, [stat]: already + points } }
  }
}

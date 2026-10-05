import { STATS, type ContentPack, type GameState, type LoveInterest, type Stat } from '../model'

// Where a stat stops being ordinary. The player starts below the first of these.
const GOOD = 8
const IMPRESSIVE = 12
const EXCEPTIONAL = 16
// How much more a pleased love interest's affection grows, per level of appeal.
const APPEAL_BONUS = 0.25

export function statOf(state: GameState, stat: string): number {
  return state.player.stats[stat] ?? 0
}

/** A stat's value in a word, for prompts: ordinary, good, impressive or exceptional. */
export function describeStat(value: number): string {
  return value >= EXCEPTIONAL ? 'exceptional' : value >= IMPRESSIVE ? 'impressive' : value >= GOOD ? 'good' : 'ordinary'
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

/** Told to a character: what the player is like, and how that sits with what they admire. */
export function describeAppeal(state: GameState, li: LoveInterest): string[] {
  const { name } = state.player
  const sheet = STATS.map((stat: Stat) => `${stat} ${describeStat(statOf(state, stat))} (${statOf(state, stat)})`).join(', ')
  const lines = [`What anyone can see of ${name}: ${sheet}.`]
  if (li.admires.length === 0) return lines
  const felt = [
    `So far nothing about ${name} has caught your eye that way. Be no warmer than the relationship warrants.`,
    `${name} has your notice for it: you are a little warmer, more curious, and slower to end a conversation.`,
    `${name} is hard for you to ignore because of it: you flirt more readily, make time for him, and find reasons to see him again.`
  ][appealLevel(state, li)]
  return [...lines, `You are drawn to ${li.admires.join(' and ')} in a man. ${felt}`]
}

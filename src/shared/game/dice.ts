// Enough for anything a scene could want, and small enough that a bad request can't run away.
const MAX_DICE = 20
const MAX_SIDES = 1000

export interface Roll {
  /** What was asked for, tidied: "2d6+3", "d20", "30-100". */
  label: string
  /** Each die as it fell. A range is a single roll. */
  rolls: number[]
  /** Added to the dice. Zero for none. */
  modifier: number
  total: number
}

/** A whole number from `min` to `max`, both included, from a source of numbers in [0, 1). */
function between(min: number, max: number, random: () => number): number {
  return min + Math.floor(random() * (max - min + 1))
}

/**
 * Rolls dice written the usual way: "d6", "2d6", "d20+5", "3d8-2", "d100". Throws with a
 * message fit to show the LLM when the notation can't be read or asks for too much.
 */
export function rollDice(notation: string, random: () => number = Math.random): Roll {
  const match = /^\s*(\d*)\s*d\s*(\d+|%)\s*(?:([+-])\s*(\d+))?\s*$/i.exec(notation)
  if (!match) throw new Error(`"${notation}" is not dice. Write it like d6, 2d6, d20+5 or d100.`)
  const count = match[1] === '' ? 1 : Number(match[1])
  const sides = match[2] === '%' ? 100 : Number(match[2])
  const modifier = match[3] ? Number(match[4]) * (match[3] === '-' ? -1 : 1) : 0
  if (count < 1 || count > MAX_DICE) throw new Error(`Roll between 1 and ${MAX_DICE} dice at a time.`)
  if (sides < 2 || sides > MAX_SIDES) throw new Error(`A die has between 2 and ${MAX_SIDES} sides.`)

  const rolls = Array.from({ length: count }, () => between(1, sides, random))
  const sign = modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`
  return {
    label: `${count === 1 ? '' : count}d${sides}${sign}`,
    rolls,
    modifier,
    total: rolls.reduce((sum, n) => sum + n, 0) + modifier
  }
}

/** Picks a whole number in a range, both ends included. The ends may be given either way round. */
export function rollRange(a: number, b: number, random: () => number = Math.random): Roll {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('A range needs two numbers, like 30 and 100.')
  const min = Math.ceil(Math.min(a, b))
  const max = Math.floor(Math.max(a, b))
  if (min > max) throw new Error('There is no whole number in that range.')
  const total = between(min, max, random)
  return { label: `${min}-${max}`, rolls: [total], modifier: 0, total }
}

/** "2d6+3: 4 + 5 + 3 = 12", "d20: 17", "30-100: 64" */
export function describeRoll(roll: Roll): string {
  const parts = [...roll.rolls.map(String), ...(roll.modifier !== 0 ? [String(Math.abs(roll.modifier))] : [])]
  if (parts.length === 1) return `${roll.label}: ${roll.total}`
  const sum = roll.rolls.join(' + ') + (roll.modifier === 0 ? '' : roll.modifier > 0 ? ` + ${roll.modifier}` : ` - ${-roll.modifier}`)
  return `${roll.label}: ${sum} = ${roll.total}`
}

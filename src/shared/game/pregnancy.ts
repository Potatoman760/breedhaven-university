import type { Child, ContentPack, GameState, LoveInterest, Outfit, Pregnancy, PregnancyStage } from '../model'
import { toDate } from './calendar'
import { onBirthControl } from './intimacy'
import { factor, inForce } from './modifiers'
import { seedOf } from './seed'

/** A repeatable number in [0, 1) for one love interest on one day of one game, by purpose. */
function roll(seed: number, dayIndex: number, index: number, salt: number): number {
  let x = (seed ^ Math.imul(dayIndex + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x7f4a7c15) ^ Math.imul(salt, 0x165667b1)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000
}

export function pregnancyOf(state: GameState, loveInterestId: string): Pregnancy | undefined {
  return state.pregnancies[loveInterestId]
}

export function childrenOf(state: GameState, loveInterestId: string): Child[] {
  return state.children.filter((child) => child.motherId === loveInterestId)
}

/** How far along a pregnancy is, from 0 at conception to 1 when due. */
export function pregnancyProgress(pregnancy: Pregnancy, time: number): number {
  const length = Math.max(1, pregnancy.dueAt - pregnancy.conceivedAt)
  return Math.min(1, Math.max(0, (time - pregnancy.conceivedAt) / length))
}

/** The stage a love interest's pregnancy has reached, if she is pregnant. */
export function pregnancyStage(content: ContentPack, state: GameState, loveInterestId: string): PregnancyStage | undefined {
  const pregnancy = pregnancyOf(state, loveInterestId)
  if (!pregnancy || !content.pregnancy) return undefined
  const progress = pregnancyProgress(pregnancy, state.time)
  return [...content.pregnancy.stages].sort((a, b) => a.from - b.from).filter((stage) => stage.from <= progress).at(-1)
}

/** Whole days until the birth, counting today as none. */
export function daysUntilDue(content: ContentPack, state: GameState, loveInterestId: string): number | undefined {
  const pregnancy = pregnancyOf(state, loveInterestId)
  if (!pregnancy) return undefined
  return Math.max(0, Math.ceil((pregnancy.dueAt - state.time) / content.calendar.hoursPerDay))
}

/**
 * Which day of her period she is on, from 1, or nothing when she is not. Every woman has a cycle of the same length
 * that began on a day of her own, settled when the game begins; it stops while she is carrying.
 */
export function periodDay(content: ContentPack, state: GameState, loveInterestId: string): number | undefined {
  const config = content.pregnancy
  const known = content.loveInterests.some((li) => li.id === loveInterestId)
  if (!config || config.periodDays < 1 || !known || pregnancyOf(state, loveInterestId)) return undefined
  const began = Math.floor(roll(state.weatherSeed, 0, seedOf(loveInterestId), 4) * config.cycleDays)
  const day = (toDate(content.calendar, state.time).dayIndex + began) % config.cycleDays
  return day < Math.min(config.periodDays, config.cycleDays) ? day + 1 : undefined
}

/** Whether she could conceive now: not already carrying, not on her period, and recovered from her last birth. */
export function canConceive(content: ContentPack, state: GameState, loveInterestId: string): boolean {
  const config = content.pregnancy
  if (!config || pregnancyOf(state, loveInterestId) || !state.relationships[loveInterestId]) return false
  if (periodDay(content, state, loveInterestId) !== undefined) return false
  const last = Math.max(-Infinity, ...childrenOf(state, loveInterestId).map((child) => child.bornAt))
  // Sooner after a birth for a household that knows how a mother is looked after.
  return state.time - last >= config.recoveryDays * factor(content, state, 'recovery', { loveInterestId }) * content.calendar.hoursPerDay
}

/**
 * What comes of the player and a love interest having sex. Each day is one throw of the
 * dice for each of them, however many times it happens that day, so the answer is the
 * same until tomorrow. Returns the state, changed only if she has conceived.
 */
export function conceive(content: ContentPack, state: GameState, loveInterestId: string): GameState {
  const config = content.pregnancy
  const index = seedOf(loveInterestId)
  if (!config || !content.loveInterests.some((li) => li.id === loveInterestId) || !canConceive(content, state, loveInterestId)) return state
  const { dayIndex } = toDate(content.calendar, state.time)
  // What she takes against it counts for less with a man who knows his own assay, and not at all while something of his has undone it.
  const about = { loveInterestId }
  const guarded = onBirthControl(content, state, loveInterestId) && !inForce(content, state, 'unguarded', about)
  const chance = guarded ? Math.min(config.chance, config.birthControlChance * factor(content, state, 'fertility', about)) : config.chance
  if (roll(state.weatherSeed, dayIndex, index, 1) >= chance) return state
  const days = config.lengthDays
  return {
    ...state,
    pregnancies: {
      ...state.pregnancies,
      [loveInterestId]: { conceivedAt: state.time, dueAt: state.time + days * content.calendar.hoursPerDay }
    }
  }
}

// What a child is called when nobody has written a name for it anywhere.
const SPARE_NAMES = { daughters: ['Hope', 'Wren', 'Ada', 'Lark', 'Elsie', 'Nell'], sons: ['Rowan', 'Alder', 'Tobin', 'Bram'] }

/**
 * The name a mother gives a child: one of her own for a daughter or a son, by the roll, that no child of his has yet.
 * When hers are all taken, or she has none, one of the pack's; and when those are too, one of a few kept here.
 */
export function suggestName(content: ContentPack, state: Pick<GameState, 'children'>, motherId: string, daughter: boolean, chance: number): string {
  const which = daughter ? 'daughters' : 'sons'
  const taken = new Set(state.children.map((child) => child.name.toLowerCase()))
  const pools = [content.loveInterests.find((li) => li.id === motherId)?.childNames[which] ?? [], content.pregnancy?.names[which] ?? [], SPARE_NAMES[which]]
  for (const pool of pools) {
    const free = pool.filter((name) => name.trim() !== '' && !taken.has(name.toLowerCase()))
    if (free.length > 0) return free[Math.min(free.length - 1, Math.floor(chance * free.length))]
  }
  // Every name there is has been given: a second child may share one.
  const last = pools[2]
  return last[Math.min(last.length - 1, Math.floor(chance * last.length))]
}

/** Gives a child another name. It is known by its mother and the hour it was born. Nothing changes for an empty name. */
export function nameChild(state: GameState, motherId: string, bornAt: number, name: string): GameState {
  const chosen = name.trim().replace(/\s+/g, ' ').slice(0, MAX_CHILD_NAME)
  if (chosen === '') return state
  return { ...state, children: state.children.map((child) => (child.motherId === motherId && child.bornAt === bornAt ? { ...child, name: chosen } : child)) }
}
export const MAX_CHILD_NAME = 24

/** "Colette", "Colette and Rémy", "Colette, Rémy and Anaïs". */
export function namesOf(children: Pick<Child, 'name'>[]): string {
  const names = children.map((child) => child.name)
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * Brings one pregnancy to its end at a given time: the child is recorded as born then, and its mother is no longer
 * carrying. The state is unchanged, and there is no child, when she was not.
 */
export function deliverChild(content: ContentPack, state: GameState, motherId: string, at: number): { state: GameState; child?: Child } {
  if (!state.pregnancies[motherId]) return { state }
  const index = seedOf(motherId)
  const { dayIndex } = toDate(content.calendar, at)
  const daughter = roll(state.weatherSeed, dayIndex, index, 2) < (content.pregnancy?.daughterChance ?? 0.5)
  const child: Child = { motherId, bornAt: at, daughter, name: suggestName(content, state, motherId, daughter, roll(state.weatherSeed, dayIndex, index, 3)) }
  const { [motherId]: _born, ...pregnancies } = state.pregnancies
  return { state: { ...state, pregnancies, children: [...state.children, child] }, child }
}

/**
 * What she is wearing: the outfit chosen for her, or her usual clothes when none has been,
 * in the form that fits her now. From her second trimester, when she shows, that is the
 * pregnant one (`pregnant` for her clothes, `nude-pregnant` undressed); before then, and
 * after the birth, the ordinary one.
 */
export function wornOutfit(content: ContentPack, state: GameState, li: LoveInterest, chosenId?: string): Outfit | undefined {
  const has = (id: string) => li.outfits.find((o) => o.id === id)
  const chosen = (chosenId !== undefined ? has(chosenId) : undefined) ?? has(li.defaultOutfitId)
  if (!chosen) return undefined
  const showing = pregnancyStage(content, state, li.id)?.showing === true
  if (chosen.pregnant === showing) return chosen
  // An outfit and its pregnant form are parent and child: the pregnant one names the other as its parent.
  if (showing) return pregnantForm(li, chosen) ?? chosen
  return ordinaryOutfit(li, chosen)
}

/**
 * The pregnant form of an ordinary outfit: the pregnant outfit that has it for its parent. One with none of its own
 * borrows the nearest: that of the outfit it is itself built on, and failing that her pregnant nude if it is a state
 * of undress, or her pregnant clothes.
 */
export function pregnantForm(li: Pick<LoveInterest, 'outfits'>, outfit: Outfit): Outfit | undefined {
  const childOf = (id: string) => li.outfits.find((o) => o.pregnant && o.inherits === id)
  const seen = new Set<string>()
  for (let at: Outfit | undefined = outfit; at && !seen.has(at.id); at = li.outfits.find((o) => o.id === at?.inherits)) {
    seen.add(at.id)
    const form = childOf(at.id)
    if (form) return form
  }
  const standard = (id: string) => li.outfits.find((o) => o.id === id && o.pregnant)
  return standard(/nude/.test(outfit.id) ? 'nude-pregnant' : 'pregnant') ?? li.outfits.find((o) => o.pregnant)
}

/**
 * The outfits that can be asked for, whether or not she is with child: her ordinary ones. Being pregnant is the game's
 * to draw and nobody's to choose: `wornOutfit` gives whatever is asked for in its pregnant form once she shows.
 */
export function wearableOutfits(li: Pick<LoveInterest, 'outfits'>): Outfit[] {
  const ordinary = li.outfits.filter((o) => !o.pregnant)
  return ordinary.length > 0 ? ordinary : li.outfits
}

/** The ordinary outfit a pregnant one is the form of: its parent. An ordinary one is itself. */
export function ordinaryOutfit(li: Pick<LoveInterest, 'outfits' | 'defaultOutfitId'>, outfit: Outfit): Outfit {
  if (!outfit.pregnant) return outfit
  const has = (id: string | undefined) => li.outfits.find((o) => o.id === id && !o.pregnant)
  // Its parent, where it names one; otherwise her nude for a state of undress, and her usual clothes for anything else.
  return has(outfit.inherits) ?? has(/nude/.test(outfit.id) ? 'nude' : li.defaultOutfitId) ?? li.outfits.find((o) => !o.pregnant) ?? outfit
}

/** "a daughter", "two daughters and a son" */
export function describeChildren(children: Child[]): string {
  const count = (n: number, one: string, many: string) => (n === 0 ? '' : n === 1 ? `a ${one}` : `${n} ${many}`)
  const daughters = children.filter((c) => c.daughter).length
  return [count(daughters, 'daughter', 'daughters'), count(children.length - daughters, 'son', 'sons')].filter(Boolean).join(' and ')
}

/**
 * Told to a character: her own pregnancy and children by the player, and what she can
 * see or would have heard of the others'.
 */
export function describePregnancy(content: ContentPack, state: GameState, loveInterestId: string): string[] {
  if (!content.pregnancy) return []
  const { name } = state.player
  const hoursPerDay = content.calendar.hoursPerDay
  const lines: string[] = []
  const mine = pregnancyOf(state, loveInterestId)
  const stage = pregnancyStage(content, state, loveInterestId)

  if (mine && stage) {
    const day = Math.floor((state.time - mine.conceivedAt) / hoursPerDay) + 1
    const length = Math.round((mine.dueAt - mine.conceivedAt) / hoursPerDay)
    lines.push(
      day === 1 && state.time - mine.conceivedAt < hoursPerDay
        ? `Today the Bloom locked in: you felt it take, and you know you are carrying ${name}'s child. ` +
            `If this has only just happened, it changes the moment; say so in your own way.`
        : `You are carrying ${name}'s child: day ${day} of about ${length}, ${stage.name}. ${name} knows.`
    )
    if (stage.description) lines.push(stage.description)
    const left = daysUntilDue(content, state, loveInterestId) ?? 0
    lines.push(left <= 1 ? 'The child could come any hour now.' : `The child is due in about ${left} days.`)
  }
  const bleeding = periodDay(content, state, loveInterestId)
  if (bleeding !== undefined) {
    lines.push(
      `You are on your period: day ${bleeding} of ${content.pregnancy.periodDays}. You know it and feel it, as you do each month, and it colours your mood and what you are up for in your own way. ` +
        `You cannot conceive while it lasts, and you know that too. Mention it only when it comes up naturally.`
    )
  }
  const born = childrenOf(state, loveInterestId)
  if (born.length > 0) {
    const newest = Math.max(...born.map((c) => c.bornAt))
    const ago = Math.floor((state.time - newest) / hoursPerDay)
    lines.push(
      `You have borne ${name} ${describeChildren(born)}, ${born.length === 1 ? 'whose name is' : 'whose names are'} ${namesOf(born)}` +
        `${born.length === 1 ? `, born ${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`}` : `, the youngest ${ago} days ago`}. ` +
        whereChildrenAre(content, state, loveInterestId, born)
    )
  }

  // What anyone can see, or would have heard: a belly that shows, a child born.
  for (const other of content.loveInterests) {
    if (other.id === loveInterestId) continue
    const first = other.name.split(' ')[0]
    const theirs = childrenOf(state, other.id)
    if (pregnancyStage(content, state, other.id)?.showing) {
      lines.push(`${first} is visibly pregnant, and the whole University knows the child is ${name}'s.`)
    }
    if (theirs.length > 0) lines.push(`${first} has borne ${name} ${describeChildren(theirs)}, ${namesOf(theirs)}.`)
  }
  return lines
}

/**
 * Told to a mother: where her children are and how they do. One who lives in his house is at home with her, minded by
 * the nanny, and as well or as poorly as the house has kept it; any other is at the University's creche.
 */
function whereChildrenAre(content: ContentPack, state: GameState, motherId: string, born: Child[]): string {
  const creche = "nursed and minded at the University's creche while you study, and never far from your thoughts"
  const housing = content.housing
  const home = born.filter((child) => child.health !== undefined)
  if (!housing || home.length === 0) return `${born.length === 1 ? 'The child is' : 'They are'} ${creche}.`
  const nanny = content.loveInterests.find((li) => li.id === housing.nannyId)?.name.split(' ')[0]
  // One child is "her" or "him"; more are "them".
  const them = home.length === 1 ? (home[0].daughter ? 'her' : 'him') : 'them'
  const minded = motherId === housing.nannyId || !nanny ? `and you mind ${them} yourself` : `where ${nanny}, the nanny, minds ${them} when you cannot`
  const worst = Math.min(...home.map((child) => child.health ?? 0))
  const level = housing.babies.levels[Math.min(worst, housing.babies.levels.length - 1)]
  const away = born.length - home.length
  return (
    `${home.length === born.length ? (born.length === 1 ? 'The child lives' : 'They live') : `${home.length} of them live${home.length === 1 ? 's' : ''}`} with you at ${housing.name}, ${state.player.name}'s house, ${minded}. ` +
    `${level ? `${level.name}: ${level.description}` : ''}` +
    `${away > 0 ? ` The other${away === 1 ? ' is' : 's are'} ${creche}, for want of a cot.` : ''}`
  ).trim()
}

import type { ContentPack, GameState, PokerConfig, PokerStyle } from '../model'
import { toDate } from './calendar'
import { approachableAt } from './map'
import { isOpen } from './schedule'
import { draws, seedOf } from './seed'
import type { PerformCheck } from './activities'
import { t, type MessageKey, type Params } from '../i18n'

// ---- cards

/** A card is a number from 0 to 51: its rank is the number mod 13, two up to ace, and its suit the number divided by 13. */
export type Card = number
export const rankOf = (card: Card): number => card % 13
export const suitOf = (card: Card): number => Math.floor(card / 13)

const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣']

/** How a card is written: its rank and the symbol of its suit. */
export function cardLabel(card: Card): { rank: string; suit: string; red: boolean } {
  return { rank: RANK_LABELS[rankOf(card)], suit: SUIT_SYMBOLS[suitOf(card)], red: suitOf(card) === 1 || suitOf(card) === 2 }
}

const word = (rank: number) => t('game.poker.rank', { rank })
const plural = (rank: number) => t('game.poker.ranks', { rank })

// A hand's name is only looked up when it is read: the odds are worked out by valuing thousands of hands nobody sees.
const valued = (score: number[], key: MessageKey, params?: () => Params): HandValue => ({
  score,
  get name() {
    return t(key, params?.())
  }
})

// ---- what a hand is worth

/** What the best five of some cards come to: a score to compare, highest first, and its name. */
export interface HandValue {
  score: number[]
  name: string
}

/** The highest card of a straight among these ranks, or -1 when there is none. An ace also plays low, under the two. */
function straightHigh(ranks: Set<number>): number {
  for (let high = 12; high >= 4; high--) {
    if ([0, 1, 2, 3, 4].every((step) => ranks.has(high - step))) return high
  }
  return [12, 0, 1, 2, 3].every((rank) => ranks.has(rank)) ? 3 : -1
}

/** The best five-card hand that can be made of up to seven cards. */
export function evaluate(cards: Card[]): HandValue {
  const suited = [0, 1, 2, 3].map((suit) => cards.filter((card) => suitOf(card) === suit).map(rankOf).sort((a, b) => b - a))
  const flush = suited.find((ranks) => ranks.length >= 5)
  if (flush) {
    const high = straightHigh(new Set(flush))
    if (high >= 0) return high === 12 ? valued([8, high], 'game.poker.hand.royalFlush') : valued([8, high], 'game.poker.hand.straightFlush', () => ({ high: word(high) }))
  }
  const counts = new Array<number>(13).fill(0)
  for (const card of cards) counts[rankOf(card)]++
  // Ranks by how many of each there are, then by how high they are.
  const groups = counts
    .map((count, rank) => ({ rank, count }))
    .filter((group) => group.count > 0)
    .sort((a, b) => b.count - a.count || b.rank - a.rank)
  const kickers = (but: number[], take: number) =>
    counts
      .map((count, rank) => (count > 0 && !but.includes(rank) ? rank : -1))
      .filter((rank) => rank >= 0)
      .sort((a, b) => b - a)
      .slice(0, take)

  if (groups[0].count === 4) {
    const quad = groups[0].rank
    return valued([7, quad, ...kickers([quad], 1)], 'game.poker.hand.four', () => ({ ranks: plural(quad) }))
  }
  const trips = groups.filter((group) => group.count === 3).map((group) => group.rank)
  const pairs = groups.filter((group) => group.count === 2).map((group) => group.rank)
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const top = trips[0]
    const under = Math.max(trips[1] ?? -1, pairs[0] ?? -1)
    return valued([6, top, under], 'game.poker.hand.fullHouse', () => ({ top: plural(top), under: plural(under) }))
  }
  if (flush) return valued([5, ...flush.slice(0, 5)], 'game.poker.hand.flush', () => ({ high: word(flush[0]) }))
  const straight = straightHigh(new Set(cards.map(rankOf)))
  if (straight >= 0) return valued([4, straight], 'game.poker.hand.straight', () => ({ high: word(straight) }))
  if (trips.length > 0) return valued([3, trips[0], ...kickers([trips[0]], 2)], 'game.poker.hand.three', () => ({ ranks: plural(trips[0]) }))
  if (pairs.length >= 2) {
    const [high, low] = pairs
    return valued([2, high, low, ...kickers([high, low], 1)], 'game.poker.hand.twoPair', () => ({ high: plural(high), low: plural(low) }))
  }
  if (pairs.length === 1) return valued([1, pairs[0], ...kickers([pairs[0]], 3)], 'game.poker.hand.pair', () => ({ ranks: plural(pairs[0]) }))
  const high = kickers([], 5)
  return valued([0, ...high], 'game.poker.hand.high', () => ({ high: word(high[0]) }))
}

/** Which of two scores is better: above zero for the first. */
export function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? -1) - (b[i] ?? -1)
    if (diff !== 0) return diff
  }
  return 0
}

// ---- the table

export const STREETS = ['preflop', 'flop', 'turn', 'river'] as const
export type Street = (typeof STREETS)[number]
export type PokerMove = 'fold' | 'check' | 'call' | 'raise'
export type PokerRules = Pick<PokerConfig, 'smallBlind' | 'bigBlind' | 'smallBet' | 'bigBet' | 'maxBets' | 'handCap'>

/** The seat he sits in is always this one. */
export const YOU = 'you'

export interface PokerPlayer {
  id: string
  name: string
  style: PokerStyle
}

export interface PokerSeat extends PokerPlayer {
  hole: Card[]
  /** What she has put in this hand, and this street. */
  committed: number
  streetBet: number
  folded: boolean
  /** Whether she has acted since the last bet. */
  acted: boolean
  /** What she did last, to show by her seat. */
  last?: string
}

export interface PokerHand {
  seats: PokerSeat[]
  dealer: number
  deck: Card[]
  board: Card[]
  street: Street
  toAct: number
  /** What has to be matched this street, and how many bets and raises have been made on it, the big blind counting as one. */
  currentBet: number
  bets: number
  /** Once the hand is over: what each won, by seat id, the hand each showed at a showdown, and who took the pot. */
  outcome?: { won: Record<string, number>; shown: Record<string, string>; winners: string[] }
}

/** The players dealt into a hand, shuffled with the seed: the deck is the same for the same seed. */
export function dealHand(rules: PokerRules, players: PokerPlayer[], dealer: number, seed: number): PokerHand {
  const random = draws(seed)
  const deck = Array.from({ length: 52 }, (_, i) => i)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const seats: PokerSeat[] = players.map((player) => ({ ...player, hole: [deck.pop()!, deck.pop()!], committed: 0, streetBet: 0, folded: false, acted: false }))
  const n = seats.length
  // Heads up, the dealer posts the small blind.
  const small = n === 2 ? dealer : (dealer + 1) % n
  const big = (small + 1) % n
  const post = (index: number, amount: number, label: MessageKey) => {
    seats[index] = { ...seats[index], committed: amount, streetBet: amount, last: t(label, { amount }) }
  }
  post(small, rules.smallBlind, 'game.poker.smallBlind')
  post(big, rules.bigBlind, 'game.poker.bigBlind')
  return { seats, dealer, deck, board: [], street: 'preflop', toAct: (big + 1) % n, currentBet: rules.bigBlind, bets: 1 }
}

/** The bet of a street: the small one before the turn, the big one from it. */
export function betSize(rules: PokerRules, street: Street): number {
  return street === 'preflop' || street === 'flop' ? rules.smallBet : rules.bigBet
}

/** All that has gone into the pot. */
export function potOf(hand: PokerHand): number {
  return hand.seats.reduce((sum, seat) => sum + seat.committed, 0)
}

/** What the one to act can do: what calling costs, and whether a bet or raise is open and what it costs. */
export function options(hand: PokerHand, rules: PokerRules): { toCall: number; canRaise: boolean; raiseCost: number; raiseLabel: 'Bet' | 'Raise' } {
  const seat = hand.seats[hand.toAct]
  const toCall = hand.currentBet - seat.streetBet
  const raiseCost = toCall + betSize(rules, hand.street)
  // Nobody puts more than the cap into a hand. Everyone still in has put in the same before this street, so a call never goes over it.
  const canRaise = hand.bets < rules.maxBets && seat.committed + raiseCost <= rules.handCap
  return { toCall, canRaise, raiseCost, raiseLabel: hand.currentBet === 0 ? 'Bet' : 'Raise' }
}

const stillIn = (hand: PokerHand) => hand.seats.filter((seat) => !seat.folded)

/** The next seat round from this one that is still in the hand. */
function nextIn(seats: PokerSeat[], from: number): number {
  for (let step = 1; step <= seats.length; step++) {
    const index = (from + step) % seats.length
    if (!seats[index].folded) return index
  }
  return from
}

/** The one to act does what is asked: a check that cannot be made is a call, and a raise that cannot be made is a call too. */
export function playMove(hand: PokerHand, rules: PokerRules, move: PokerMove): PokerHand {
  if (hand.outcome) return hand
  const { toCall, canRaise, raiseCost, raiseLabel } = options(hand, rules)
  const seats = hand.seats.map((seat) => ({ ...seat }))
  const seat = seats[hand.toAct]
  let { currentBet, bets } = hand
  const pay = (amount: number) => {
    seat.committed += amount
    seat.streetBet += amount
  }
  if (move === 'fold' && toCall > 0) {
    seat.folded = true
    seat.last = t('game.poker.folds')
  } else if (move === 'raise' && canRaise) {
    pay(raiseCost)
    currentBet = seat.streetBet
    bets += 1
    seat.last = t(raiseLabel === 'Bet' ? 'game.poker.bets' : 'game.poker.raisesTo', { amount: currentBet })
    // A bet or raise is answered by everyone else still in.
    for (const other of seats) if (other !== seat) other.acted = false
  } else {
    pay(toCall)
    seat.last = toCall > 0 ? t('game.poker.calls', { amount: toCall }) : t('game.poker.checks')
  }
  seat.acted = true
  const next: PokerHand = { ...hand, seats, currentBet, bets }

  const left = stillIn(next)
  if (left.length === 1) return settle(next, [left[0].id], false)
  const roundDone = left.every((one) => one.acted && one.streetBet === currentBet)
  if (!roundDone) return { ...next, toAct: nextIn(seats, hand.toAct) }
  if (hand.street === 'river') return showdown(next)
  return nextStreet(next)
}

function nextStreet(hand: PokerHand): PokerHand {
  const street = STREETS[STREETS.indexOf(hand.street) + 1]
  const deck = [...hand.deck]
  // Off the top of the deck, one at a time, as the hole cards were.
  const board = [...hand.board]
  for (let dealt = street === 'flop' ? 3 : 1; dealt > 0; dealt--) board.push(deck.pop()!)
  const seats = hand.seats.map((seat) => ({ ...seat, streetBet: 0, acted: false, last: seat.folded ? seat.last : undefined }))
  return { ...hand, seats, deck, board, street, currentBet: 0, bets: 0, toAct: nextIn(seats, hand.dealer) }
}

function showdown(hand: PokerHand): PokerHand {
  const values = stillIn(hand).map((seat) => ({ seat, value: evaluate([...seat.hole, ...hand.board]) }))
  const best = values.reduce((top, one) => (compareScores(one.value.score, top.value.score) > 0 ? one : top)).value.score
  const winners = values.filter((one) => compareScores(one.value.score, best) === 0).map((one) => one.seat.id)
  return settle(hand, winners, true, Object.fromEntries(values.map((one) => [one.seat.id, one.value.name])))
}

/** The pot to whoever won it, shared between those who tie, an odd dollar going to the first of them round from the dealer. */
function settle(hand: PokerHand, winners: string[], shown: boolean, names: Record<string, string> = {}): PokerHand {
  const pot = potOf(hand)
  const share = Math.floor(pot / winners.length)
  const order = hand.seats.map((_, step) => hand.seats[(hand.dealer + 1 + step) % hand.seats.length].id).filter((id) => winners.includes(id))
  const won = Object.fromEntries(order.map((id, i) => [id, share + (i === 0 ? pot - share * winners.length : 0)]))
  return { ...hand, toAct: -1, outcome: { won, shown: shown ? names : {}, winners: order } }
}

/** What a hand came to for one player: what she won less what she put in. */
export function netFor(hand: PokerHand, id: string): number {
  const seat = hand.seats.find((one) => one.id === id)
  return (hand.outcome?.won[id] ?? 0) - (seat?.committed ?? 0)
}

// ---- how the others play

/** How often her hand wins against this many others with what is still to come, worked out by dealing it out many times. */
export function equity(hole: Card[], board: Card[], opponents: number, random: () => number, trials = 160): number {
  const known = new Set([...hole, ...board])
  const rest = Array.from({ length: 52 }, (_, i) => i).filter((card) => !known.has(card))
  let total = 0
  for (let trial = 0; trial < trials; trial++) {
    const deck = [...rest]
    const draw = () => deck.splice(Math.floor(random() * deck.length), 1)[0]
    const theirs = Array.from({ length: opponents }, () => [draw(), draw()])
    const full = [...board]
    while (full.length < 5) full.push(draw())
    const mine = evaluate([...hole, ...full]).score
    let tied = 0
    let beaten = false
    for (const hand of theirs) {
      const diff = compareScores(evaluate([...hand, ...full]).score, mine)
      if (diff > 0) beaten = true
      else if (diff === 0) tied++
    }
    if (!beaten) total += 1 / (tied + 1)
  }
  return total / trials
}

/**
 * What a player at the table does, from how good her hand is against however many are still in, what it costs her to
 * go on, and how she plays. Nothing she cannot see goes into it: her own cards and the board.
 */
export function decide(hand: PokerHand, rules: PokerRules, random: () => number): PokerMove {
  const seat = hand.seats[hand.toAct]
  const { toCall, canRaise } = options(hand, rules)
  const opponents = stillIn(hand).length - 1
  const chance = equity(seat.hole, hand.board, opponents, random)
  // How her hand stands against an even share of the pot: 1 is an average hand at this table.
  const strength = chance * (opponents + 1)
  const { tight, aggressive, bluff } = seat.style
  // With nothing to call she bets a good hand to make the others pay to see more; facing a bet she raises only a strong one.
  const opening = toCall === 0
  const bluffing = opening && hand.street !== 'preflop' && random() < bluff
  if (canRaise && (strength > (opening ? 1.25 : 1.6) - aggressive * 0.4 || (bluffing && strength > 0.4))) return 'raise'
  if (opening) return 'check'
  // She goes on with what the pot pays for, as long as it is not hopeless, or with anything better than her share.
  const odds = toCall / (potOf(hand) + toCall)
  if ((chance >= odds * (0.8 + tight * 0.6) && strength >= 0.6 + tight * 0.4) || strength >= 1 + tight * 0.5) return 'call'
  return 'fold'
}

/** A love interest's way of playing, her own and the same every time. */
export function styleOf(id: string): PokerStyle {
  const random = draws(seedOf(`poker:${id}`))
  return { tight: 0.2 + random() * 0.6, aggressive: 0.2 + random() * 0.6, bluff: 0.05 + random() * 0.2 }
}

// ---- sitting down

/** Whether he can sit in for a hand here and now: the game is played here, the place is open, and he can cover the cap. */
export function canPlayPoker(content: ContentPack, state: GameState): PerformCheck {
  const config = content.poker
  if (!config || state.locationId !== config.locationId) return { ok: false, reasons: [t('game.poker.noGame')] }
  const place = content.locations.find((l) => l.id === config.locationId)
  const reasons: string[] = []
  if (place && !isOpen(place, toDate(content.calendar, state.time).hour)) reasons.push(t('game.activities.closed', { place: place.name }))
  if (state.player.money < config.handCap) reasons.push(t('game.poker.needCap', { cap: config.handCap }))
  return { ok: reasons.length === 0, reasons }
}

/**
 * Who sits at the table: him, the love interests who are here up to the limit, those he has met first, and regulars,
 * chosen by the seed, in any seats left.
 */
export function seatPlayers(content: ContentPack, state: GameState, seed: number): PokerPlayer[] {
  const config = content.poker
  if (!config) return []
  const women = approachableAt(content, state, config.locationId)
    .sort((a, b) => Number(state.met.includes(b.id)) - Number(state.met.includes(a.id)))
    .slice(0, Math.min(config.maxLoveInterests, config.seats - 1))
    .map((li) => ({ id: li.id, name: li.name.split(' ')[0], style: styleOf(li.id) }))
  const random = draws(seed)
  const regulars = [...config.regulars].sort(() => random() - 0.5).slice(0, config.seats - 1 - women.length)
  return [{ id: YOU, name: state.player.name, style: { tight: 0.5, aggressive: 0.5, bluff: 0 } }, ...women, ...regulars.map(({ id, name, style }) => ({ id, name, style }))]
}

/** What a hand came to, in his pocket. */
export function settlePokerHand(state: GameState, hand: PokerHand): GameState {
  const net = netFor(hand, YOU)
  return net === 0 ? state : { ...state, player: { ...state.player, money: state.player.money + net } }
}

/** He gets up from the table: a sitting in which he played takes its time off the clock. */
export function leaveTable(content: ContentPack, state: GameState, handsPlayed: number): GameState {
  return content.poker && handsPlayed > 0 ? { ...state, time: state.time + content.poker.hours } : state
}

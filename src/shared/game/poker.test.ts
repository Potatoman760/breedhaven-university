import { describe, expect, it } from 'vitest'
import { validateContentPack, type ContentPack } from '../model'
import { draws } from './seed'
import {
  canPlayPoker,
  compareScores,
  dealHand,
  decide,
  evaluate,
  leaveTable,
  netFor,
  options,
  playMove,
  potOf,
  seatPlayers,
  settlePokerHand,
  YOU,
  type Card,
  type PokerHand,
  type PokerPlayer,
  type PokerRules
} from './poker'
import { createInitialState } from './state'
import { rawFixture } from './testFixture'

// Cards written as people write them: 'As' is the ace of spades, 'Th' the ten of hearts.
const card = (written: string): Card => '23456789TJQKA'.indexOf(written[0]) + 'shdc'.indexOf(written[1]) * 13
const cards = (written: string) => written.split(' ').map(card)

const rules: PokerRules = { smallBlind: 1, bigBlind: 2, smallBet: 2, bigBet: 4, maxBets: 3, handCap: 10 }
const style = { tight: 0.5, aggressive: 0.5, bluff: 0 }
const players: PokerPlayer[] = ['you', 'ana', 'bea'].map((id) => ({ id, name: id, style }))

describe('what a hand is worth', () => {
  it('names and ranks every kind of hand', () => {
    expect(evaluate(cards('As Ks Qs Js Ts 2h 3d')).name).toBe('Royal flush')
    expect(evaluate(cards('9h 8h 7h 6h 5h Ac Ad')).name).toBe('Straight flush, Nine high')
    expect(evaluate(cards('7s 7h 7d 7c Ks 2h 3d')).name).toBe('Four Sevens')
    expect(evaluate(cards('6s 6h 6d Kc Ks 2h 3d')).name).toBe('Sixes full of Kings')
    expect(evaluate(cards('2s 9s Js 4s Ks 2h 3d')).name).toBe('Flush, King high')
    expect(evaluate(cards('As 2h 3d 4c 5s 9h Kd')).name).toBe('Straight, Five high')
    expect(evaluate(cards('Qs Qh Qd 4c 5s 9h Kd')).name).toBe('Three Queens')
    expect(evaluate(cards('Qs Qh 4d 4c 5s 9h Kd')).name).toBe('Two pair, Queens and Fours')
    expect(evaluate(cards('Ts Th 4d 3c 5s 9h Kd')).name).toBe('Pair of Tens')
    expect(evaluate(cards('Ts 2h 4d 7c 5s 9h Kd')).name).toBe('King high')
  })

  it('compares kickers, and plays the best five of seven', () => {
    const better = evaluate(cards('As Ah Kd 7c 5s 3h 2d')).score
    const worse = evaluate(cards('Ad Ac Qd 7h 5c 3s 2c')).score
    expect(compareScores(better, worse)).toBeGreaterThan(0)
    // Two trips make a full house of the higher over the lower.
    expect(evaluate(cards('9s 9h 9d 4c 4s 4h Kd')).name).toBe('Nines full of Fours')
    // A wheel is the lowest straight.
    expect(compareScores(evaluate(cards('6s 2h 3d 4c 5s Jh Kd')).score, evaluate(cards('As 2h 3d 4c 5s Jh Kd')).score)).toBeGreaterThan(0)
  })
})

/** A hand with every seat's cards and the board set, for tests that need to know who wins. */
function rigged(holes: string[], board: string): PokerHand {
  const hand = dealHand(rules, players, 0, 1)
  const deck = cards(board).reverse()
  return { ...hand, seats: hand.seats.map((seat, i) => ({ ...seat, hole: cards(holes[i]) })), deck }
}

describe('a hand at the table', () => {
  it('posts the blinds left of the dealer and starts with the player after the big blind', () => {
    const hand = dealHand(rules, players, 0, 7)
    expect(hand.seats.map((seat) => seat.committed)).toEqual([0, 1, 2])
    expect(hand.toAct).toBe(0)
    expect(options(hand, rules)).toMatchObject({ toCall: 2, canRaise: true, raiseCost: 4, raiseLabel: 'Raise' })
    // The same seed deals the same cards.
    expect(dealHand(rules, players, 0, 7).seats[0].hole).toEqual(hand.seats[0].hole)
  })

  it('gives the pot to the last one in when everyone else folds', () => {
    let hand = dealHand(rules, players, 0, 3)
    hand = playMove(hand, rules, 'fold')
    hand = playMove(hand, rules, 'fold')
    expect(hand.outcome?.winners).toEqual(['bea'])
    expect(netFor(hand, 'bea')).toBe(1)
    expect(netFor(hand, 'ana')).toBe(-1)
    expect(netFor(hand, YOU)).toBe(0)
  })

  it('goes street by street when everyone calls and checks, and shows down at the end', () => {
    let hand = rigged(['As Ad', 'Kc Kd', '7h 2s'], 'Ah 9c 4d 8s 3h')
    // Pre-flop: he calls, the small blind calls, the big blind checks its option.
    for (const move of ['call', 'call', 'check'] as const) hand = playMove(hand, rules, move)
    expect(hand.street).toBe('flop')
    expect(hand.board).toEqual(cards('Ah 9c 4d'))
    // The first to act after the flop is the first still in left of the dealer.
    expect(hand.toAct).toBe(1)
    for (let street = 0; street < 3; street++) for (let i = 0; i < 3; i++) hand = playMove(hand, rules, 'check')
    expect(hand.outcome?.winners).toEqual([YOU])
    expect(hand.outcome?.shown[YOU]).toBe('Three Aces')
    expect(potOf(hand)).toBe(6)
    expect(netFor(hand, YOU)).toBe(4)
  })

  it('splits a tied pot, the odd dollar to the first winner left of the dealer', () => {
    let hand = rigged(['2c 3c', '2d 3d', '7h 8s'], 'As Ks Qs Js Ts')
    // The board is a royal flush, which everyone plays: the pot of 7 is shared three ways.
    hand = playMove(hand, rules, 'raise')
    for (const move of ['call', 'call'] as const) hand = playMove(hand, rules, move)
    for (let i = 0; i < 9; i++) hand = playMove(hand, rules, 'check')
    expect(potOf(hand)).toBe(12)
    expect(hand.outcome?.won).toEqual({ ana: 4, bea: 4, you: 4 })
  })

  it('never lets anyone put more than the cap into a hand, and stops raising at the most bets a street allows', () => {
    let hand = dealHand(rules, players, 0, 9)
    // Raise, re-raise: three bets with the big blind, and that is the most a street takes.
    hand = playMove(hand, rules, 'raise')
    hand = playMove(hand, rules, 'raise')
    expect(options(hand, rules).canRaise).toBe(false)
    hand = playMove(hand, rules, 'raise')
    expect(hand.seats[2].last).toBe('Calls $4')
    hand = playMove(hand, rules, 'call')
    expect(hand.street).toBe('flop')
    // $6 in each; a $2 bet on the flop is open, and its raise to $4 would take the raiser to $10.
    hand = playMove(hand, rules, 'raise')
    hand = playMove(hand, rules, 'raise')
    expect(hand.seats.map((seat) => seat.committed)).toEqual([6, 8, 10])
    expect(options(hand, rules).canRaise).toBe(false)
    hand = playMove(hand, rules, 'call')
    hand = playMove(hand, rules, 'call')
    expect(hand.seats.every((seat) => seat.committed === 10)).toBe(true)
    // At the cap, the turn and river can only be checked.
    expect(options(hand, rules).canRaise).toBe(false)
  })
})

describe('how the others play', () => {
  it('raises the best hand there is and folds the worst to a raise, with the same cards giving the same answer', () => {
    const strong = rigged(['7h 2s', 'As Ad', 'Kc Kd'], '')
    // Ana, second to act, holds aces; he folds and she is first to decide on the flop with three aces.
    const toAces = { ...playMove(strong, rules, 'fold'), board: cards('Ah 9c 4d') }
    expect(decide(toAces, rules, draws(1))).toBe('raise')
    // He raises with aces; Ana, in the small blind with seven-two offsuit, folds to it.
    const weak = playMove(rigged(['As Ad', '7h 2s', 'Kc Kd'], ''), rules, 'raise')
    expect(weak.toAct).toBe(1)
    expect(decide(weak, rules, draws(2))).toBe('fold')
    expect(decide(toAces, rules, draws(1))).toBe(decide(toAces, rules, draws(1)))
  })
})

describe('sitting down at the table', () => {
  const raw = rawFixture()
  const content: ContentPack = validateContentPack({
    ...raw,
    poker: {
      locationId: 'shop',
      name: 'Cards',
      smallBlind: 1,
      bigBlind: 2,
      smallBet: 2,
      bigBet: 4,
      handCap: 10,
      seats: 4,
      regulars: [{ id: 'reg-a', name: 'Moll' }, { id: 'reg-b', name: 'Tobin' }, { id: 'reg-c', name: 'Hesk' }, { id: 'reg-d', name: 'Wynn' }]
    }
  })
  const start = createInitialState(content)
  const atTable = { ...start, locationId: 'shop', player: { ...start.player, money: 25 } }

  it('needs the place to be the game, open, and enough money to cover the cap', () => {
    expect(canPlayPoker(content, start).ok).toBe(false)
    expect(canPlayPoker(content, atTable)).toEqual({ ok: true, reasons: [] })
    expect(canPlayPoker(content, { ...atTable, player: { ...atTable.player, money: 9 } }).reasons).toEqual(['You need $10 to sit in'])
    // The shop shuts at 15:00, nine hours after the game starts.
    expect(canPlayPoker(content, { ...atTable, time: 9 }).reasons).toEqual(['the Shop is closed'])
  })

  it('seats him first and fills the table with regulars', () => {
    const seated = seatPlayers(content, atTable, 5)
    expect(seated).toHaveLength(4)
    expect(seated[0].id).toBe(YOU)
    expect(new Set(seated.map((one) => one.id)).size).toBe(4)
  })

  it('settles each hand in his pocket, and takes the sitting off the clock only if he played', () => {
    let hand = dealHand(rules, players, 0, 3)
    // He raises and both blinds fold: he wins their $3.
    hand = playMove(playMove(hand, rules, 'raise'), rules, 'fold')
    hand = playMove(hand, rules, 'fold')
    expect(settlePokerHand(atTable, hand).player.money).toBe(atTable.player.money + 3)
    expect(leaveTable(content, atTable, 0)).toBe(atTable)
    expect(leaveTable(content, atTable, 4).time).toBe(atTable.time + 1)
  })
})

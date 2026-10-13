import { describe, expect, it } from 'vitest'
import { validateContentPack, type ContentPack, type GameState } from '../model'
import { dayAgenda } from './agenda'
import { courierThread, hasContact } from './courier'
import { buildEpilogue } from './epilogue'
import {
  answerHousingOffer,
  askToLeave,
  babiesAtHome,
  buildRoom,
  canBuild,
  canInvite,
  describeHousehold,
  goToRoom,
  healthCap,
  houseTotals,
  housingFacts,
  housingOfferDue,
  invite,
  nextRentDay,
  payArrears,
  placeBabies,
  rentOn,
  sendHousingOffer,
  settleHousehold,
  monthlyRent,
  withHousing
} from './housing'
import { scheduledLocationId } from './schedule'
import { moveState, playerRoom, sceneDestinations, PLAYER_ROOM } from './sceneMoves'
import { homeOf, sleep } from './sleep'
import { createInitialState } from './state'
import { rawFixture } from './testFixture'
import { toDate } from './calendar'

// The fixture's odd calendar: a 20-hour day, a three-day week, and months of three and two days. The game starts on
// the second of the month, so day 2 and day 4 of the game are firsts of a month (rent), and day 2 and day 5 begin a
// week (the children's keep). The house has a little of everything, at prices small enough to count on fingers.
const raw = rawFixture()
const person = (id: string, name: string, more: Record<string, unknown> = {}) => ({ ...raw.loveInterests[0], id, name, ...more })
const written: ContentPack = validateContentPack({
  ...raw,
  locations: [
    ...raw.locations,
    {
      id: 'house',
      name: 'the House',
      private: true,
      indoors: true,
      backgrounds: ['default', 'master', 'nanny', 'suite', 'nursery', 'study'].map((id) => ({ id, name: id }))
    }
  ],
  loveInterests: [
    ...raw.loveInterests,
    person('bea', 'Bea Stone', { schedule: [{ periods: ['day'], locationId: 'shop' }], room: { name: 'a loft', locationId: 'shop' } }),
    person('una', 'Una Clerk', { kind: 'npc', schedule: [] }),
    person('zed', 'Zed Minder', { schedule: [{ locationId: 'house' }], room: { name: 'her room', locationId: 'house', viewId: 'nanny' } })
  ],
  coursework: { weekdays: ['Two'], locationId: 'shop' },
  housing: {
    locationId: 'house',
    name: 'Quince House',
    officerId: 'una',
    nannyId: 'zed',
    rent: 10,
    graceDays: 2,
    homePeriods: ['night'],
    invite: { minAffection: 30 },
    babies: {
      weeklyCost: 4,
      startLevel: 2,
      levels: [{ name: 'Poorly' }, { name: 'Fretful' }, { name: 'Settled' }, { name: 'Thriving' }, { name: 'Blooming' }],
      caps: [{ comfort: 0, level: 2 }, { comfort: 4, level: 3 }, { comfort: 8, level: 4 }],
      thrivingFrom: 3,
      thriving: { affection: 1, trust: 1 },
      neglect: { affection: -6, trust: -8 }
    },
    feelings: { movedIn: { affection: 5, trust: 8 }, askedToLeave: { affection: -8, trust: -12 }, leftOverNeglect: { affection: -12, trust: -15 }, evicted: { affection: -10, trust: -15 } },
    texts: { offer: 'The offer of {house} at {rent}.', welcome: 'Welcome to {house}.', nannyHello: 'Hello.', arrears: 'You owe {amount} by {date}.', paid: 'Received {amount}.', evicted: '{house} is taken back.' },
    floors: ['Ground', 'Upper'],
    grid: { columns: 4, rows: 4 },
    rooms: [
      { key: 'hearth', name: 'The hearth room', role: 'common', viewId: 'default', startsBuilt: true, plan: { floor: 0, x: 0, y: 0, w: 2, h: 2 } },
      { key: 'nanny', name: "The nanny's room", role: 'nanny', viewId: 'nanny', startsBuilt: true, plan: { floor: 0, x: 2, y: 0, w: 2, h: 2 } },
      { key: 'nursery', name: 'The nursery', description: 'Cots.', role: 'common', viewId: 'nursery', cost: 8, cots: 2, comfort: 4, plan: { floor: 0, x: 0, y: 2, w: 2, h: 2 }, tiers: [{ name: 'The night nursery', description: 'A stove of its own.', cost: 6, cots: 1, comfort: 4 }] },
      { key: 'study', name: 'The study', role: 'common', viewId: 'study', cost: 3, study: 1, plan: { floor: 0, x: 2, y: 2, w: 2, h: 2 } },
      { key: 'master', name: 'The master bedroom', description: 'A wide bed.', role: 'master', viewId: 'master', startsBuilt: true, beds: 1, cots: 1, plan: { floor: 1, x: 0, y: 0, w: 2, h: 2 } },
      { key: 'suite', name: 'The west bedroom', role: 'suite', viewId: 'suite', cost: 5, beds: 1, plan: { floor: 1, x: 2, y: 0, w: 2, h: 2 } }
    ]
  }
})
const start = createInitialState(written)
const at = (state: GameState, day: number, hour = 6): GameState => ({ ...state, time: day * 20 + (hour - 6) })
const rich = (state: GameState, money: number): GameState => ({ ...state, player: { ...state.player, money } })
const withChild = (state: GameState, motherId: string): GameState => ({ ...state, children: [...state.children, { motherId, bornAt: 0, daughter: true, name: 'Ada' }] })
const bonded = (state: GameState, id: string, affection = 50): GameState => ({
  ...state,
  bonds: [...state.bonds, { statusId: 'casual', memberIds: [id], since: 0 }],
  relationships: { ...state.relationships, [id]: { affection, trust: 50, desire: 0 } }
})
/** The pack as a game sees it. */
const seen = (state: GameState) => withHousing(written, state)
const expecting: GameState = { ...bonded(start, 'ana'), pregnancies: { ana: { conceivedAt: 0, dueAt: 9999 } } }
/** He has taken the house, on day 0. */
const moved = (() => {
  const offered = sendHousingOffer(seen(expecting), expecting)
  return answerHousingOffer(seen(offered), offered, 0, true)
})()

describe('before he has a house', () => {
  it('there is none: nowhere to go, and nobody has heard of the nanny', () => {
    const pack = seen(start)
    expect(pack.locations.map((l) => l.id)).toEqual(['home', 'shop'])
    expect(pack.loveInterests.map((li) => li.id)).toEqual(['ana', 'bea'])
    expect(homeOf(pack)).toBe('home')
    // The same pack for the same state of affairs, so that nothing is worked out twice.
    expect(seen({ ...start, time: 5 })).toBe(pack)
    // What was written is left as it was, and the game still has a place for her feelings.
    expect(written.locations.some((l) => l.id === 'house')).toBe(true)
    expect(start.relationships['zed']).toEqual({ affection: 0, trust: 0, desire: 0 })
    expect(sceneDestinations(pack, start, { loveInterestId: 'ana', companionIds: [], npc: false }).map((d) => d.id)).not.toContain('house')
  })

  it('is offered once someone he is in a relationship with is carrying his child, and only once', () => {
    expect(housingOfferDue(seen(start), start)).toBe(false)
    // Carrying his child, but nothing agreed between them.
    expect(housingOfferDue(seen(start), { ...start, pregnancies: expecting.pregnancies })).toBe(false)
    // Something agreed, but no child.
    expect(housingOfferDue(seen(start), bonded(start, 'ana'))).toBe(false)
    expect(housingOfferDue(seen(expecting), expecting)).toBe(true)

    const offered = sendHousingOffer(seen(expecting), expecting)
    expect(offered.housing.status).toBe('offered')
    expect(hasContact(offered, 'una')).toBe(true)
    expect(courierThread(offered, 'una')).toMatchObject([{ from: 'them', text: 'The offer of Quince House at $10.', offer: 'housing', read: false }])
    expect(housingOfferDue(seen(offered), offered)).toBe(false)
    expect(sendHousingOffer(seen(offered), offered)).toBe(offered)
    expect(housingFacts(seen(offered), offered, 'una')[0]).toContain('he has not answered yet')
    expect(housingFacts(seen(offered), offered, 'ana')).toEqual([])
  })

  it('can be turned down, and taken after all', () => {
    const offered = sendHousingOffer(seen(expecting), expecting)
    const declined = answerHousingOffer(seen(offered), offered, 0, false)
    expect(declined.housing.status).toBe('declined')
    expect(courierThread(declined, 'una')[0].answer).toBe('declined')
    const taken = answerHousingOffer(seen(declined), declined, 0, true)
    expect(taken.housing.status).toBe('resident')
    expect(courierThread(taken, 'una')[0].answer).toBe('accepted')
  })
})

describe('moving in', () => {
  it('makes the house his home in every way the content knows', () => {
    expect(moved.housing).toMatchObject({ status: 'resident', movedInAt: 0, formerHomeId: 'home', rooms: { hearth: 1, nanny: 1, master: 1 }, residents: {} })
    const pack = seen(moved)
    expect(pack.locations.map((l) => l.id)).toContain('house')
    expect(homeOf(pack)).toBe('house')
    expect(pack.newGame.room).toEqual({ name: 'the master bedroom at Quince House', description: 'A wide bed.', locationId: 'house', viewId: 'master' })
    // He sleeps there, in his own room.
    expect(sleep(pack, at(moved, 0, 20))).toMatchObject({ locationId: 'house', inOwnRoom: true })
    expect(playerRoom(pack, { roomOf: PLAYER_ROOM })?.locationId).toBe('house')
    // The nanny comes with it: met, in his messages, and living in her own room there.
    expect(moved.met).toContain('zed')
    expect(courierThread(moved, 'zed')[0].text).toBe('Hello.')
    expect(pack.loveInterests.find((li) => li.id === 'zed')?.room).toMatchObject({ locationId: 'house', viewId: 'nanny' })
    expect(courierThread(moved, 'una').at(-1)?.text).toBe('Welcome to Quince House.')
    expect(describeHousehold(pack, moved, 'zed')[0]).toContain('You are the live-in nanny at Quince House')
    expect(describeHousehold(pack, moved, 'ana')[0]).toContain('Pat no longer lives in the halls')
  })

  it('is built out room by room, with his own money', () => {
    const pack = seen(moved)
    expect(houseTotals(pack.housing!, moved)).toEqual({ beds: 1, cots: 1, comfort: 0, study: 0 })
    expect(canBuild(pack, moved, 'nursery')).toEqual({ ok: false, reasons: ['You need $8'] })
    const built = buildRoom(pack, rich(moved, 20), 'nursery')
    expect(built.player.money).toBe(12)
    expect(built.housing.rooms['nursery']).toBe(1)
    expect(houseTotals(pack.housing!, built)).toEqual({ beds: 1, cots: 3, comfort: 4, study: 0 })
    // Fitted out further, once, and then there is no more to do to it.
    const fitted = buildRoom(seen(built), built, 'nursery')
    expect(fitted.player.money).toBe(6)
    expect(houseTotals(pack.housing!, fitted)).toEqual({ beds: 1, cots: 4, comfort: 8, study: 0 })
    expect(healthCap(pack, fitted)).toBe(4)
    expect(canBuild(seen(fitted), fitted, 'nursery')).toEqual({ ok: false, reasons: ['There is nothing more to do to it'] })
    expect(fitted.housing.ledger.map((line) => line.amount)).toEqual([0, -8, -6])
    // What a room has been made into is said of it wherever the room is described.
    expect(seen(fitted).locations.find((l) => l.id === 'house')?.backgrounds.find((view) => view.id === 'nursery')?.description).toBe('Cots. A stove of its own.')
    // A study makes study at home worth more.
    const studied = buildRoom(pack, rich(moved, 20), 'study')
    expect(seen(studied).coursework!.grading.ownRoomBonus).toBe(pack.coursework!.grading.ownRoomBonus + 1)
  })

  it('has rooms a scene at home can go through to, and he is in the one he went to', () => {
    const built = { ...buildRoom(seen(moved), rich(moved, 20), 'nursery'), locationId: 'house' }
    const pack = seen(built)
    const scene = { loveInterestId: 'zed', companionIds: [], npc: false }
    const there = sceneDestinations(pack, built, scene).filter((d) => d.houseRoom !== undefined)
    // Rooms that are built and anyone's to sit in, but not the one he is in already, nor a bedroom, nor one unbuilt.
    expect(there.map((d) => d.id)).toEqual(['home-nursery'])
    expect(moveState(built, there[0]).housing.room).toBe('nursery')
    expect(sceneDestinations(pack, moveState(built, there[0]), scene).filter((d) => d.houseRoom).map((d) => d.id)).toEqual(['home-hearth'])
    expect(goToRoom(pack, built, 'master')).toMatchObject({ inOwnRoom: true, housing: { room: 'master' } })
    expect(goToRoom(pack, built, 'study')).toBe(built)
  })
})

describe('who lives there', () => {
  it('is whoever he asks, of the mothers of his children he is in a relationship with', () => {
    const pack = seen(moved)
    expect(canInvite(pack, moved, 'ana', 'master')).toEqual({ ok: true, reasons: [] })
    // Bea is nothing to him yet.
    expect(canInvite(pack, moved, 'bea', 'master').reasons).toEqual(['The house is for the mothers of your children', 'You and Bea are not in a relationship', 'Bea does not know you well enough'])
    expect(canInvite(pack, moved, 'zed', 'master')).toEqual({ ok: false, reasons: ['She lives here already'] })
    expect(canInvite(pack, moved, 'ana', 'suite').reasons).toEqual(['That is not a bedroom she could have'])
    expect(canInvite(pack, moved, 'ana', 'hearth').reasons).toEqual(['That is not a bedroom she could have'])

    const home = invite(pack, moved, 'ana', 'master')
    expect(home.housing.residents).toEqual({ ana: 'master' })
    expect(home.relationships['ana']).toEqual({ affection: 55, trust: 58, desire: 0 })
    expect(home.memories['ana'].at(-1)).toMatchObject({ level: 'core' })
    expect(home.memories['ana'].at(-1)?.summary).toContain('moved into the master bedroom')
    // The bed is taken now.
    expect(canInvite(seen(home), bonded(withChild(home, 'bea'), 'bea'), 'bea', 'master').reasons).toEqual(['The master bedroom has no room for her'])
    // Her room is in the house, and she comes home to it at night whatever her old habits.
    const lives = seen(home).loveInterests.find((li) => li.id === 'ana')!
    expect(lives.room).toMatchObject({ locationId: 'house', viewId: 'master' })
    expect(scheduledLocationId(lives, toDate(written.calendar, 0))).toBe('shop')
    expect(scheduledLocationId(lives, toDate(written.calendar, 12))).toBe('house')
    expect(describeHousehold(seen(home), home, 'ana')[0]).toContain('You live with Pat at Quince House')
  })

  it('brings her children home with her while there are cots, oldest first', () => {
    const two = withChild(withChild(moved, 'ana'), 'ana')
    const home = invite(seen(two), two, 'ana', 'master')
    // One bassinet in his room: the elder is at home, and the other waits at the creche for a cot.
    expect(home.children.map((child) => child.health)).toEqual([2, undefined])
    const built = buildRoom(seen(home), rich(home, 8), 'nursery')
    expect(built.children.map((child) => child.health)).toEqual([2, 2])
    expect(placeBabies(seen(built), built)).toBe(built)
    // A child whose mother does not live there stays at the creche however many cots stand empty.
    expect(placeBabies(seen(built), withChild(built, 'bea')).children.at(-1)?.health).toBeUndefined()
  })

  it('can be asked to leave, and does not come back', () => {
    const home = invite(seen(moved), withChild(moved, 'ana'), 'ana', 'master')
    const gone = askToLeave(seen(home), home, 'ana')
    expect(gone.housing.residents).toEqual({})
    expect(gone.housing.left).toEqual(['ana'])
    expect(gone.children[0].health).toBeUndefined()
    expect(gone.relationships['ana']).toEqual({ affection: 47, trust: 46, desire: 0 })
    expect(canInvite(seen(gone), gone, 'ana', 'master').reasons).toEqual(['Ana has left, and will not come back'])
    expect(seen(gone).loveInterests.find((li) => li.id === 'ana')?.room).toBeUndefined()
  })
})

describe('what the house costs', () => {
  const home = invite(seen(moved), withChild(moved, 'ana'), 'ana', 'master')
  const settle = (state: GameState) => settleHousehold(seen(state), state)

  it('is rent on the first of the month and nothing between', () => {
    const pack = seen(moved)
    expect([0, 1, 2, 3, 4, 5, 6].filter((day) => rentOn(pack, moved, day) > 0)).toEqual([2, 4])
    expect(nextRentDay(pack, moved)).toBe(2)
    expect(rentOn(seen(start), start, 2)).toBe(0)
    // It is on the calendar on the day it falls.
    expect(dayAgenda(pack, moved, 2).filter((item) => item.kind === 'rent')).toEqual([{ kind: 'rent', id: 'rent', title: 'Rent due: $10', detail: 'Quince House' }])

    expect(settle(at(rich(moved, 30), 1)).state.player.money).toBe(30)
    const paid = settle(at(rich(moved, 30), 2))
    expect(paid.state.player.money).toBe(20)
    expect(paid.notices).toEqual(['Rent paid: $10.'])
    // However far the clock has jumped, each day is reckoned once.
    expect(settle(paid.state)).toEqual({ state: paid.state, notices: [] })
    expect(settle(at(rich(moved, 30), 6)).state.player.money).toBe(10)
  })

  it('is taken back when rent he owes is not found in the days of grace', () => {
    const short = settle(at(moved, 2))
    expect(short.state.housing).toMatchObject({ status: 'resident', arrears: 10, arrearsSince: 2 })
    expect(courierThread(short.state, 'una').at(-1)?.text).toBe('You owe $10 by Three, 1 A, Year 2.')
    // Found in time, the file is in order again.
    const found = payArrears(seen(short.state), rich(short.state, 15))
    expect(found.player.money).toBe(5)
    expect(found.housing).toMatchObject({ arrears: 0, arrearsSince: undefined })
    expect(settle(at(found, 4)).state.housing.status).toBe('resident')

    // Not found: on the day the grace runs out everyone goes home, and so does he.
    const household = settle(at({ ...home, locationId: 'house' }, 2)).state
    const out = settle(at(household, 4))
    expect(out.notices[0]).toContain('Quince House has been taken back')
    expect(out.state.housing).toMatchObject({ status: 'evicted', residents: {}, arrears: 0, left: ['ana'] })
    expect(out.state.locationId).toBe('home')
    expect(out.state.children.every((child) => child.health === undefined)).toBe(true)
    expect(out.state.memories['ana'].at(-1)?.summary).toContain('lost Quince House for want of the rent')
    const pack = seen(out.state)
    expect(homeOf(pack)).toBe('home')
    expect(pack.locations.some((l) => l.id === 'house')).toBe(false)
    // The nanny, once met, is still someone he knows.
    expect(pack.loveInterests.some((li) => li.id === 'zed')).toBe(true)
    expect(housingFacts(pack, out.state, 'una')[0]).toContain('held Quince House and lost it')
    expect(buildEpilogue(pack, at(out.state, 7)).find((screen) => screen.kind === 'home')?.text).toContain('could not keep it')
  })

  it('is the keep of each child in the house, every week', () => {
    expect(babiesAtHome(home)).toHaveLength(1)
    // Kept, a child comes on, but only as far as the house can take it: with no comfort, no further than settled.
    const kept = settle(at(rich(home, 20), 2))
    expect(kept.state.player.money).toBe(6)
    expect(kept.state.children[0].health).toBe(2)
    expect(kept.notices).toEqual(['Rent paid: $10.', "The children's week is paid: $4."])
    // With a nursery, it thrives, and its mother is glad of it.
    const nursery = buildRoom(seen(home), rich(home, 30), 'nursery')
    const thriving = settle(at(nursery, 2))
    expect(thriving.state.children[0].health).toBe(3)
    expect(thriving.state.relationships['ana'].affection).toBe(home.relationships['ana'].affection + 1)
  })

  it('comes down with each child of his, wherever it lives, to no less than the Office lets a house for', () => {
    const relieved: ContentPack = { ...written, housing: { ...written.housing!, rentRelief: { perChild: 3, floor: 2 } } }
    const cheaper = (state: GameState) => withHousing(relieved, state)
    expect(monthlyRent(seen(moved), withChild(moved, 'ana'))).toBe(10)
    expect(monthlyRent(cheaper(moved), moved)).toBe(10)
    expect(monthlyRent(cheaper(home), home)).toBe(7)
    const four = [1, 2, 3].reduce((state) => withChild(state, 'ana'), home)
    expect(monthlyRent(cheaper(four), four)).toBe(2)
    // It is what is asked on the day, and what the calendar says.
    expect(rentOn(cheaper(home), home, 2)).toBe(7)
    expect(dayAgenda(cheaper(home), home, 2).find((item) => item.kind === 'rent')?.title).toBe('Rent due: $7')
    expect(settleHousehold(cheaper(home), at(rich(home, 20), 2)).notices[0]).toBe('Rent paid: $7.')
  })

  it('goes badly for a child he does not keep, until its mother takes it away', () => {
    // Day 2 is a rent day as well: he can find neither.
    const once = settle(at(home, 2)).state
    expect(once.children[0].health).toBe(1)
    expect(once.relationships['ana']).toEqual({ affection: home.relationships['ana'].affection - 6, trust: home.relationships['ana'].trust - 8, desire: 0 })
    expect(once.housing.residents).toEqual({ ana: 'master' })

    // The rent found, but another week unkept: the child is at the bottom, and she goes.
    const twice = settle(at(payArrears(seen(once), rich(once, 10)), 5))
    expect(twice.state.player.money).toBe(0)
    expect(twice.state.housing.residents).toEqual({})
    expect(twice.state.housing.left).toEqual(['ana'])
    // No child is ever lost: it is at the creche.
    expect(twice.state.children).toHaveLength(1)
    expect(twice.state.children[0].health).toBeUndefined()
    expect(twice.notices.at(-1)).toBe('Ana has taken her child back to the creche and left the house.')
    expect(twice.state.memories['ana'].at(-1)).toMatchObject({ level: 'core' })
  })

  it('pays first for the child doing worst when he cannot pay for them all', () => {
    const two: GameState = { ...home, children: [{ motherId: 'ana', bornAt: 0, daughter: true, name: 'Ada', health: 2 }, { motherId: 'ana', bornAt: 1, daughter: false, name: 'Bram', health: 1 }] }
    // Money for the rent and one child.
    const week = settle(at(rich(two, 14), 2)).state
    expect(week.player.money).toBe(0)
    expect(week.children.map((child) => child.health)).toEqual([1, 2])
  })

  it('is told at the end of the year', () => {
    const screens = buildEpilogue(seen(home), at(home, 7))
    expect(screens.find((screen) => screen.kind === 'home')).toMatchObject({ text: 'You kept Quince House, and Ana made her home there with you.', loveInterestIds: ['ana'] })
    expect(screens.find((screen) => screen.kind === 'child')?.text).toContain('the two of you raised them together at Quince House')
  })
})

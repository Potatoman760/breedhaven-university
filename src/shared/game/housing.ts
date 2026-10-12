import type { CalendarConfig, Child, ContentPack, GameState, HouseRoom, HouseholdFeeling, HousingConfig, HousingState, LoveInterest, Room, ScheduleEntry } from '../model'
import type { PerformCheck } from './activities'
import { bondOf } from './bonds'
import { formatDate, isGameOver, toDate } from './calendar'
import { addNote, courierThread, giveContact } from './courier'
import { addMemory, applyFeelings } from './memory'
import { childrenOf, pregnancyOf } from './pregnancy'

/**
 * Sire housing. The Sire Relations Office lets him a house once someone he is with is carrying his child. He pays
 * rent on it, builds it out room by room, and the mothers of his children can come to live there. The children who
 * live in it cost money each week, and are well or poorly according to whether he found it.
 *
 * Nothing else in the game knows about any of this. Where he lives, where a love interest lives and where she is of an
 * evening are all read from the content, so the house is put into the content: `withHousing` gives the pack as one
 * game sees it, and everything that asks where home is gets the right answer without having been told there are two.
 */

// How many lines of the house's accounts are kept.
const LEDGER_LINES = 40
// From here the nanny has taken to him, and the house is the better looked after for it.
const NANNY_WARMS_AT = 30

/** The tier a room has reached in this game: 0 when it is not built. */
export function builtTier(state: Pick<GameState, 'housing'>, key: string): number {
  return state.housing.rooms[key] ?? 0
}

export function roomOf(config: HousingConfig, key: string | undefined): HouseRoom | undefined {
  return config.rooms.find((room) => room.key === key)
}

/** Whether he lives in the house now. */
export function isResident(content: ContentPack, state: Pick<GameState, 'housing'>): boolean {
  return content.housing !== undefined && state.housing.status === 'resident'
}

/** What one room adds to the house as it stands: itself, and each fitting-out it has had. Nothing unbuilt. */
function roomEffects(room: HouseRoom, tier: number): { beds: number; cots: number; comfort: number; study: number } {
  const total = { beds: 0, cots: 0, comfort: 0, study: 0 }
  if (tier < 1) return total
  for (const part of [room, ...room.tiers.slice(0, tier - 1)]) {
    total.beds += part.beds
    total.cots += part.cots
    total.comfort += part.comfort
    total.study += part.study
  }
  return total
}

/** What the whole house comes to: beds for love interests, cots, comfort, and what it adds to study at home. */
export function houseTotals(config: HousingConfig, state: Pick<GameState, 'housing'>): { beds: number; cots: number; comfort: number; study: number } {
  const total = { beds: 0, cots: 0, comfort: 0, study: 0 }
  for (const room of config.rooms) {
    const adds = roomEffects(room, builtTier(state, room.key))
    total.beds += adds.beds
    total.cots += adds.cots
    total.comfort += adds.comfort
    total.study += adds.study
  }
  return total
}

/** Everyone who lives in the house beside him: the love interests he has taken in, and the nanny. */
export function householdIds(config: HousingConfig, state: Pick<GameState, 'housing'>): string[] {
  if (state.housing.status !== 'resident') return []
  return [...Object.keys(state.housing.residents), config.nannyId]
}

/** The children who live in the house. */
export function babiesAtHome(state: Pick<GameState, 'children'>): Child[] {
  return state.children.filter((child) => child.health !== undefined)
}

/** How many more love interests a bedroom can take. */
export function freeBeds(config: HousingConfig, state: Pick<GameState, 'housing'>, key: string): number {
  const room = roomOf(config, key)
  if (!room) return 0
  const taken = Object.values(state.housing.residents).filter((roomKey) => roomKey === key).length
  return Math.max(0, roomEffects(room, builtTier(state, key)).beds - taken)
}

export function freeCots(config: HousingConfig, state: Pick<GameState, 'housing' | 'children'>): number {
  return Math.max(0, houseTotals(config, state).cots - babiesAtHome(state).length)
}

/** The comfort of the house as its babies feel it: what is built, and a nanny who has taken to him. */
export function houseComfort(config: HousingConfig, state: Pick<GameState, 'housing' | 'relationships'>): number {
  return houseTotals(config, state).comfort + ((state.relationships[config.nannyId]?.affection ?? 0) >= NANNY_WARMS_AT ? 1 : 0)
}

/** The best a baby can do in the house as it stands. */
export function healthCap(config: HousingConfig, state: Pick<GameState, 'housing' | 'relationships'>): number {
  const comfort = houseComfort(config, state)
  const met = [...config.babies.caps].sort((a, b) => a.comfort - b.comfort).filter((cap) => cap.comfort <= comfort)
  return Math.min(config.babies.levels.length - 1, met.at(-1)?.level ?? config.babies.startLevel)
}

/** The view of the house he is looking at, while he is at home: the room he is in. */
export function homeViewId(content: ContentPack, state: Pick<GameState, 'housing' | 'locationId'>): string | undefined {
  const config = content.housing
  if (!config || !isResident(content, state) || state.locationId !== config.locationId) return undefined
  return roomOf(config, state.housing.room)?.viewId
}

// ---- the house as the content has it

const made = new WeakMap<ContentPack, Map<string, ContentPack>>()

/** A room of the house as a room someone lives in. */
function asRoom(config: HousingConfig, room: HouseRoom): Room {
  return { name: `${room.name.toLowerCase()} at ${config.name}`, description: room.description, locationId: config.locationId, viewId: room.viewId }
}

/**
 * Where a love interest who lives in the house is over the week: at home whenever the house keeps her there, at home
 * wherever her old habits had her in her old room of a night, at home when she has nothing else on, and otherwise as
 * she always was.
 */
export function residentSchedule(calendar: CalendarConfig, li: Pick<LoveInterest, 'schedule' | 'room'>, houseId: string, homePeriods: string[]): ScheduleEntry[] {
  const dark = (id: string) => calendar.periods.find((period) => period.id === id)?.light === 'night'
  const old = li.room?.locationId
  const moved = li.schedule.map((entry) => (entry.locationId === old && (entry.periods === undefined || entry.periods.some(dark)) ? { ...entry, locationId: houseId } : entry))
  return [...(homePeriods.length > 0 ? [{ periods: homePeriods, locationId: houseId }] : []), ...moved, { locationId: houseId }]
}

/**
 * The content as one game has it, with the house in it or out of it.
 *
 * Until he lives there, there is no house: it is not a place a scene can go or a plan be made for, and the nanny who
 * comes with it has not been heard of. Once he does, it is his home in every sense the content knows: his room is its
 * master bedroom, a love interest who has moved in has her room there and comes home to it, and each of its rooms says
 * what has been made of it.
 */
export function withHousing(content: ContentPack, state: Pick<GameState, 'housing'>): ContentPack {
  const config = content.housing
  if (!config) return content
  const { housing } = state
  const key = JSON.stringify([housing.status, housing.movedInAt !== undefined, Object.entries(housing.rooms).sort(), Object.entries(housing.residents).sort()])
  let byKey = made.get(content)
  if (!byKey) made.set(content, (byKey = new Map()))
  let pack = byKey.get(key)
  if (!pack) byKey.set(key, (pack = housing.status === 'resident' ? lived(content, config, state) : shut(content, config, housing)))
  return pack
}

/** The pack with the house shut: not there to be gone to, and nobody living in it. */
function shut(content: ContentPack, config: HousingConfig, housing: HousingState): ContentPack {
  const away = (li: LoveInterest): LoveInterest => ({
    ...li,
    room: li.room?.locationId === config.locationId ? undefined : li.room,
    schedule: li.schedule.filter((entry) => entry.locationId !== config.locationId)
  })
  return {
    ...content,
    locations: content.locations.filter((l) => l.id !== config.locationId),
    map: content.map && { ...content.map, pins: content.map.pins.filter((pin) => pin.locationId !== config.locationId) },
    // The nanny is someone he knows from the day he moved in, and still is if the house is taken from him.
    loveInterests: content.loveInterests.filter((li) => li.id !== config.nannyId || housing.movedInAt !== undefined).map(away)
  }
}

/** The pack with him living in the house. */
function lived(content: ContentPack, config: HousingConfig, state: Pick<GameState, 'housing'>): ContentPack {
  const master = config.rooms.find((room) => room.role === 'master')
  const nannyRoom = config.rooms.find((room) => room.role === 'nanny')
  const study = houseTotals(config, state).study
  return {
    ...content,
    newGame: { ...content.newGame, locationId: config.locationId, room: master ? asRoom(config, master) : content.newGame.room },
    coursework: content.coursework && { ...content.coursework, grading: { ...content.coursework.grading, ownRoomBonus: content.coursework.grading.ownRoomBonus + study } },
    locations: content.locations.map((location) =>
      location.id !== config.locationId
        ? location
        : {
            ...location,
            backgrounds: location.backgrounds.map((view) => {
              const room = config.rooms.find((r) => r.viewId === view.id)
              const tier = room ? builtTier(state, room.key) : 0
              if (!room || tier < 1) return view
              // What the room is, and what has since been made of it.
              return { ...view, description: [room.description, ...room.tiers.slice(0, tier - 1).map((t) => t.description)].filter(Boolean).join(' ') }
            })
          }
    ),
    loveInterests: content.loveInterests.map((li) => {
      if (li.id === config.nannyId) return nannyRoom ? { ...li, room: asRoom(config, nannyRoom) } : li
      const room = roomOf(config, state.housing.residents[li.id])
      if (!room) return li
      return { ...li, room: asRoom(config, room), schedule: residentSchedule(content.calendar, li, config.locationId, config.homePeriods) }
    })
  }
}

// ---- the offer, and moving in

/** A message of the house's, with its particulars written in. */
function fill(config: HousingConfig, text: string, more: Record<string, string> = {}): string {
  const values: Record<string, string> = { house: config.name, rent: `$${config.rent}`, ...more }
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole)
}

/** Whether it is time the Office wrote to him: someone he is in a relationship with is carrying his child, and it has not written yet. */
export function housingOfferDue(content: ContentPack, state: GameState): boolean {
  if (!content.housing || state.housing.status !== 'none') return false
  return Object.keys(state.pregnancies).some((id) => pregnancyOf(state, id) !== undefined && bondOf(state, id) !== undefined)
}

/** The officer writes to him with the offer of the house. */
export function sendHousingOffer(content: ContentPack, state: GameState): GameState {
  const config = content.housing
  if (!config || !housingOfferDue(content, state)) return state
  const offered: GameState = { ...state, housing: { ...state.housing, status: 'offered' } }
  return addNote(giveContact(offered, config.officerId), config.officerId, { from: 'them', text: fill(config, config.texts.offer), offer: 'housing', read: false })
}

/** Whether the offer can still be taken up: it has been made, and he has neither moved in nor lost the house. */
export function canTakeHouse(content: ContentPack, state: Pick<GameState, 'housing'>): boolean {
  return content.housing !== undefined && (state.housing.status === 'offered' || state.housing.status === 'declined')
}

/** Answers the offer in the given note of the officer's thread. Declined, it can be taken after all. */
export function answerHousingOffer(content: ContentPack, state: GameState, noteIndex: number, accept: boolean): GameState {
  const config = content.housing
  if (!config || !canTakeHouse(content, state)) return state
  const thread = courierThread(state, config.officerId)
  if (thread[noteIndex]?.offer !== 'housing') return state
  const answer = accept ? ('accepted' as const) : ('declined' as const)
  const answered: GameState = { ...state, courier: { ...state.courier, [config.officerId]: thread.map((note, i) => (i === noteIndex ? { ...note, answer } : note)) } }
  return accept ? moveIn(content, answered) : { ...answered, housing: { ...answered.housing, status: 'declined' } }
}

/**
 * He takes the house. The rooms it comes with are his from this hour, his old room is no longer where he lives, and
 * the nanny who comes with it writes to say she is there. The first rent falls on the next first of the month.
 */
export function moveIn(content: ContentPack, state: GameState): GameState {
  const config = content.housing
  if (!config || !canTakeHouse(content, state)) return state
  const rooms = Object.fromEntries(config.rooms.filter((room) => room.startsBuilt).map((room) => [room.key, 1]))
  let next: GameState = {
    ...state,
    met: state.met.includes(config.nannyId) ? state.met : [...state.met, config.nannyId],
    housing: {
      ...state.housing,
      status: 'resident',
      movedInAt: state.time,
      // Read before the house is his home: this is still the pack with the house shut.
      formerHomeId: content.newGame.room?.locationId ?? content.newGame.locationId,
      rooms,
      residents: {},
      room: undefined,
      settledTo: state.time,
      arrears: 0,
      arrearsSince: undefined,
      ledger: [{ time: state.time, text: `Moved into ${config.name}`, amount: 0 }]
    }
  }
  next = addNote(giveContact(next, config.officerId), config.officerId, { from: 'them', text: fill(config, config.texts.welcome), read: false })
  next = addNote(giveContact(next, config.nannyId), config.nannyId, { from: 'them', text: fill(config, config.texts.nannyHello), read: false })
  return placeBabies(content, next)
}

// ---- rooms

function ledger(state: GameState, text: string, amount: number): GameState {
  return { ...state, housing: { ...state.housing, ledger: [...state.housing.ledger, { time: state.time, text, amount }].slice(-LEDGER_LINES) } }
}

/** What building a room, or fitting it out further, would be: what it is called and what it costs. Nothing when there is no more to do to it. */
export function nextWork(config: HousingConfig, state: Pick<GameState, 'housing'>, key: string): { name: string; description: string; cost: number; upgrade: boolean } | undefined {
  const room = roomOf(config, key)
  if (!room) return undefined
  const tier = builtTier(state, key)
  if (tier < 1) return { name: room.name, description: room.description, cost: room.cost, upgrade: false }
  const more = room.tiers[tier - 1]
  return more && { name: more.name, description: more.description, cost: more.cost, upgrade: true }
}

export function canBuild(content: ContentPack, state: GameState, key: string): PerformCheck {
  const config = content.housing
  if (!config || !isResident(content, state)) return { ok: false, reasons: ['You do not live there'] }
  const work = nextWork(config, state, key)
  if (!work) return { ok: false, reasons: ['There is nothing more to do to it'] }
  return state.player.money >= work.cost ? { ok: true, reasons: [] } : { ok: false, reasons: [`You need $${work.cost}`] }
}

/** Builds a room, or fits out one that is built. The money is spent, and any child waiting for a cot is brought home. */
export function buildRoom(content: ContentPack, state: GameState, key: string): GameState {
  const config = content.housing
  if (!config || !canBuild(content, state, key).ok) return state
  const work = nextWork(config, state, key)!
  const built: GameState = {
    ...state,
    player: { ...state.player, money: state.player.money - work.cost },
    housing: { ...state.housing, rooms: { ...state.housing.rooms, [key]: builtTier(state, key) + 1 } }
  }
  return placeBabies(content, ledger(built, work.upgrade ? `${work.name} (${roomOf(config, key)?.name})` : `Built: ${work.name}`, -work.cost))
}

/** Goes home: he is at the house, in the room one comes into. */
export function goHome(content: ContentPack, state: GameState): GameState {
  const config = content.housing
  if (!config || !isResident(content, state)) return state
  return { ...state, locationId: config.locationId, inOwnRoom: false, housing: { ...state.housing, room: undefined } }
}

/** Goes to a room of the house that is built. His own bedroom is his own room, as it is anywhere else. */
export function goToRoom(content: ContentPack, state: GameState, key: string): GameState {
  const config = content.housing
  const room = config && roomOf(config, key)
  if (!config || !room || !isResident(content, state) || builtTier(state, key) < 1) return state
  return { ...state, locationId: config.locationId, inOwnRoom: room.role === 'master', housing: { ...state.housing, room: key } }
}

// ---- who lives there

/** Brings home every child of the household that has no place yet, oldest first, for as long as there are cots. */
export function placeBabies(content: ContentPack, state: GameState): GameState {
  const config = content.housing
  if (!config || !isResident(content, state)) return state
  const household = householdIds(config, state)
  let free = freeCots(config, state)
  let changed = false
  const children = state.children.map((child) => {
    if (free < 1 || child.health !== undefined || !household.includes(child.motherId)) return child
    free--
    changed = true
    return { ...child, health: config.babies.startLevel }
  })
  return changed ? { ...state, children } : state
}

/** Whether she is someone the house is for: carrying his child, or the mother of one. */
function isMother(state: GameState, id: string): boolean {
  return pregnancyOf(state, id) !== undefined || childrenOf(state, id).length > 0
}

export function canInvite(content: ContentPack, state: GameState, loveInterestId: string, roomKey: string): PerformCheck {
  const config = content.housing
  if (!config || !isResident(content, state)) return { ok: false, reasons: ['You do not live there'] }
  const li = content.loveInterests.find((c) => c.id === loveInterestId)
  const first = li?.name.split(' ')[0] ?? 'She'
  if (!li || loveInterestId === config.nannyId) return { ok: false, reasons: ['She lives here already'] }
  if (state.housing.residents[loveInterestId] !== undefined) return { ok: false, reasons: [`${first} lives here already`] }
  if (state.housing.left.includes(loveInterestId)) return { ok: false, reasons: [`${first} has left, and will not come back`] }
  const reasons: string[] = []
  if (!isMother(state, loveInterestId)) reasons.push(`The house is for the mothers of your children`)
  if (bondOf(state, loveInterestId) === undefined) reasons.push(`You and ${first} are not in a relationship`)
  if ((state.relationships[loveInterestId]?.affection ?? 0) < config.invite.minAffection) reasons.push(`${first} does not know you well enough`)
  const room = roomOf(config, roomKey)
  if (!room || builtTier(state, roomKey) < 1 || (room.role !== 'suite' && room.role !== 'master')) reasons.push('That is not a bedroom she could have')
  else if (freeBeds(config, state, roomKey) < 1) reasons.push(`${room.name} has no room for her`)
  return { ok: reasons.length === 0, reasons }
}

/** Those he could ask to live in a room right now. */
export function invitable(content: ContentPack, state: GameState, roomKey: string): LoveInterest[] {
  return content.loveInterests.filter((li) => canInvite(content, state, li.id, roomKey).ok)
}

const feel = (change: HouseholdFeeling, reason: string) => ({ ...change, desire: 0, reason })

/** She comes to live in the house, in the room he offered her, and her children with her where there are cots. */
export function invite(content: ContentPack, state: GameState, loveInterestId: string, roomKey: string): GameState {
  const config = content.housing
  if (!config || !canInvite(content, state, loveInterestId, roomKey).ok) return state
  const room = roomOf(config, roomKey)!
  let next: GameState = { ...state, housing: { ...state.housing, residents: { ...state.housing.residents, [loveInterestId]: roomKey } } }
  next = applyFeelings(content, next, loveInterestId, feel(config.feelings.movedIn, 'He asked her to live with him.'))
  next = addMemory(next, loveInterestId, `${state.player.name} asked you to come and live with him at ${config.name}, and you moved into ${room.name.toLowerCase()}. It is your home now.`, 'core')
  next = addNote(giveContact(next, loveInterestId), loveInterestId, { from: 'them', text: `I've brought my things over. ${room.name}, then. I still can't quite believe it. Thank you.`, read: false })
  return placeBabies(content, ledger(next, `${content.loveInterests.find((li) => li.id === loveInterestId)?.name.split(' ')[0] ?? 'She'} moved into ${room.name.toLowerCase()}`, 0))
}

export type LeavingWhy = 'asked' | 'neglect' | 'evicted'

/**
 * She leaves the house and takes her children with her, back to the creche. She will not come back. Why she went
 * decides how she feels about it and what she remembers.
 */
export function leaveHouse(content: ContentPack, state: GameState, loveInterestId: string, why: LeavingWhy): GameState {
  const config = content.housing
  if (!config || state.housing.residents[loveInterestId] === undefined) return state
  const first = content.loveInterests.find((li) => li.id === loveInterestId)?.name.split(' ')[0] ?? 'She'
  const { [loveInterestId]: _room, ...residents } = state.housing.residents
  let next: GameState = {
    ...state,
    children: state.children.map((child) => (child.motherId === loveInterestId ? { ...child, health: undefined } : child)),
    housing: { ...state.housing, residents, left: [...state.housing.left, loveInterestId] }
  }
  const told = {
    asked: { change: config.feelings.askedToLeave, reason: 'He asked her to leave his house.', memory: `${state.player.name} asked you to leave ${config.name}, and you went back to your own room.`, note: 'I have taken my things. I did not think you would ask me to go.' },
    neglect: {
      change: config.feelings.leftOverNeglect,
      reason: 'Her child went without in his house.',
      memory: `Your child went without at ${config.name}: ${state.player.name} did not find the money week after week. You took the child back to the creche and left his house.`,
      note: 'I have taken the baby back to the creche, and I have gone with it. I could not watch that any longer.'
    },
    evicted: { change: config.feelings.evicted, reason: 'The house was taken back and she had to go.', memory: `${state.player.name} lost ${config.name} for want of the rent, and you had to pack and go back to your own room.`, note: 'They gave us the afternoon to pack. I am back in my old room.' }
  }[why]
  next = applyFeelings(content, next, loveInterestId, feel(told.change, told.reason))
  next = addMemory(next, loveInterestId, told.memory, 'core')
  next = addNote(giveContact(next, loveInterestId), loveInterestId, { from: 'them', text: told.note, read: false })
  return ledger(next, `${first} left the house`, 0)
}

export function askToLeave(content: ContentPack, state: GameState, loveInterestId: string): GameState {
  return leaveHouse(content, state, loveInterestId, 'asked')
}

// ---- money

/** The game time at which a day of the game begins, as the calendar counts days. */
const startOf = (calendar: CalendarConfig, dayIndex: number): number => dayIndex * calendar.hoursPerDay

/** What is owed in rent on a given day of the game: something on the first of a month while he lives there, and nothing otherwise. */
export function rentOn(content: ContentPack, state: Pick<GameState, 'housing'>, dayIndex: number): number {
  const config = content.housing
  if (!config || !isResident(content, state) || dayIndex < 0 || dayIndex >= content.calendar.lengthDays) return 0
  return toDate(content.calendar, startOf(content.calendar, dayIndex)).day === 1 ? config.rent : 0
}

/** The next day rent falls due, counting from tomorrow, if one is left in the game. */
export function nextRentDay(content: ContentPack, state: Pick<GameState, 'housing' | 'time'>): number | undefined {
  const today = toDate(content.calendar, state.time).dayIndex
  for (let day = today + 1; day < content.calendar.lengthDays; day++) if (rentOn(content, state, day) > 0) return day
  return undefined
}

/** What the children in the house cost him each week. */
export function householdCost(content: ContentPack, state: Pick<GameState, 'housing' | 'children'>): number {
  const config = content.housing
  return config && isResident(content, state) ? babiesAtHome(state).length * config.babies.weeklyCost : 0
}

/** Whether a day of the game is the day the household's week is reckoned: the first day of the week. */
export function isHouseholdDay(content: ContentPack, dayIndex: number): boolean {
  return toDate(content.calendar, startOf(content.calendar, dayIndex)).weekdayIndex === 0
}

/** The day by which rent he owes has to be found. */
export function arrearsDeadline(content: ContentPack, state: Pick<GameState, 'housing'>): number | undefined {
  const config = content.housing
  return config && state.housing.arrears > 0 && state.housing.arrearsSince !== undefined ? state.housing.arrearsSince + config.graceDays : undefined
}

/** Pays off rent he owes, when he has it. The officer writes to say the file is in order. */
export function payArrears(content: ContentPack, state: GameState): GameState {
  const config = content.housing
  const owed = state.housing.arrears
  if (!config || !isResident(content, state) || owed < 1 || state.player.money < owed) return state
  const paid: GameState = { ...state, player: { ...state.player, money: state.player.money - owed }, housing: { ...state.housing, arrears: 0, arrearsSince: undefined } }
  return addNote(ledger(paid, 'Rent owed, paid', -owed), config.officerId, { from: 'them', text: fill(config, config.texts.paid, { amount: `$${owed}` }), read: false })
}

/**
 * The house is taken back. Everyone who lived there goes home, the children to the creche; anything arranged to
 * happen there is off; and he is back where he lived before.
 */
export function evict(content: ContentPack, state: GameState): GameState {
  const config = content.housing
  if (!config || !isResident(content, state)) return state
  let next = state
  for (const id of Object.keys(state.housing.residents)) next = leaveHouse(content, next, id, 'evicted')
  const home = next.housing.formerHomeId
  next = {
    ...next,
    // The nanny's own child, if she has one, goes with the house.
    children: next.children.map((child) => (child.health === undefined ? child : { ...child, health: undefined })),
    appointments: next.appointments.filter((plan) => plan.locationId !== config.locationId),
    locationId: next.locationId === config.locationId && home ? home : next.locationId,
    inOwnRoom: next.locationId === config.locationId ? false : next.inOwnRoom,
    housing: { ...next.housing, status: 'evicted', residents: {}, room: undefined, arrears: 0, arrearsSince: undefined }
  }
  return addNote(ledger(next, `${config.name} was taken back`, 0), config.officerId, { from: 'them', text: fill(config, config.texts.evicted), read: false })
}

/**
 * Reckons up the house for every day that has gone by since it was last done: rent on the first of the month, the
 * children's keep on the first day of the week, and the house taken back when rent he owed was not found in time.
 * Each day is reckoned once however far the clock has jumped. `notices` are what he ought to be told of it.
 */
export function settleHousehold(content: ContentPack, state: GameState): { state: GameState; notices: string[] } {
  const config = content.housing
  if (!config || !isResident(content, state)) return { state, notices: [] }
  const { calendar } = content
  const from = toDate(calendar, state.housing.settledTo).dayIndex
  const today = Math.min(toDate(calendar, state.time).dayIndex, calendar.lengthDays - 1)
  if (today <= from || isGameOver(calendar, state.housing.settledTo)) return { state, notices: [] }
  const notices: string[] = []
  let next = state
  for (let day = from + 1; day <= today && next.housing.status === 'resident'; day++) {
    const deadline = arrearsDeadline(content, next)
    if (deadline !== undefined && day >= deadline) {
      next = evict(content, next)
      notices.push(`The rent was not found in time: ${config.name} has been taken back.`)
      break
    }
    const rent = rentOn(content, next, day)
    if (rent > 0) {
      if (next.player.money >= rent) {
        next = ledger({ ...next, player: { ...next.player, money: next.player.money - rent } }, 'Rent', -rent)
        notices.push(`Rent paid: $${rent}.`)
      } else {
        next = { ...next, housing: { ...next.housing, arrears: next.housing.arrears + rent, arrearsSince: next.housing.arrearsSince ?? day } }
        const by = formatDate(toDate(calendar, startOf(calendar, (next.housing.arrearsSince ?? day) + config.graceDays)))
        next = addNote(ledger(next, 'Rent not paid', 0), config.officerId, { from: 'them', text: fill(config, config.texts.arrears, { amount: `$${next.housing.arrears}`, date: by }), read: false })
        notices.push(`You could not pay the rent of $${rent}. It has to be found by ${by}.`)
      }
    }
    if (isHouseholdDay(content, day)) {
      const week = settleWeek(content, config, next)
      next = week.state
      notices.push(...week.notices)
    }
  }
  return { state: { ...next, housing: { ...next.housing, settledTo: state.time } }, notices }
}

/**
 * One week of the children's keep. Each child in the house is paid for if he has the money, the one doing worst
 * first: paid for, it does a little better, up to what the house allows; not paid for, it does worse and its mother
 * thinks the less of him. A child that has sunk to the bottom is taken away by its mother, who goes with it.
 */
function settleWeek(content: ContentPack, config: HousingConfig, state: GameState): { state: GameState; notices: string[] } {
  const at = state.children.map((child, index) => ({ child, index })).filter(({ child }) => child.health !== undefined)
  if (at.length === 0) return { state, notices: [] }
  const cap = healthCap(config, state)
  const cost = config.babies.weeklyCost
  const health = new Map<number, number>()
  const unpaid = new Set<string>()
  let money = state.player.money
  let paid = 0
  for (const { child, index } of [...at].sort((a, b) => (a.child.health ?? 0) - (b.child.health ?? 0) || a.index - b.index)) {
    const now = child.health ?? 0
    if (money >= cost) {
      money -= cost
      paid++
      // Kept, it comes on a level, as far as the house can take it; one already doing better than that is left as it is.
      health.set(index, Math.max(now, Math.min(cap, now + 1)))
    } else {
      health.set(index, Math.max(0, now - 1))
      unpaid.add(child.motherId)
    }
  }
  let next: GameState = {
    ...state,
    player: { ...state.player, money },
    children: state.children.map((child, index) => (health.has(index) ? { ...child, health: health.get(index) } : child))
  }
  next = ledger(next, `The children's week: ${paid} of ${at.length} kept`, -paid * cost)
  const notices = [paid === at.length ? `The children's week is paid: $${paid * cost}.` : `You could only pay for ${paid} of ${at.length} children this week.`]

  for (const motherId of unpaid) next = applyFeelings(content, next, motherId, feel(config.babies.neglect, 'Her child went without this week.'))
  // A mother whose children were all kept and are doing well is glad of it.
  for (const motherId of new Set(at.map(({ child }) => child.motherId))) {
    const hers = next.children.filter((child) => child.motherId === motherId && child.health !== undefined)
    if (!unpaid.has(motherId) && hers.every((child) => (child.health ?? 0) >= config.babies.thrivingFrom)) {
      next = applyFeelings(content, next, motherId, feel(config.babies.thriving, 'Her child is thriving in his house.'))
    }
  }
  // A child at the bottom is taken out of the house. Its mother goes with it, unless she is the nanny, whose post this is.
  for (const motherId of new Set(next.children.filter((child) => child.health === 0).map((child) => child.motherId))) {
    const first = content.loveInterests.find((li) => li.id === motherId)?.name.split(' ')[0] ?? 'She'
    if (next.housing.residents[motherId] !== undefined) {
      next = leaveHouse(content, next, motherId, 'neglect')
      notices.push(`${first} has taken her child back to the creche and left the house.`)
    } else {
      next = { ...next, children: next.children.map((child) => (child.motherId === motherId ? { ...child, health: undefined } : child)) }
      next = applyFeelings(content, next, motherId, feel(config.feelings.leftOverNeglect, 'Her child went without in his house.'))
      notices.push(`${first} has taken her child to the creche.`)
    }
  }
  return { state: next, notices }
}

// ---- what the characters are told

/** How a child is doing, in the house's own words. */
export function healthName(config: HousingConfig, health: number): string {
  return config.babies.levels[Math.min(health, config.babies.levels.length - 1)]?.name ?? ''
}

/**
 * Told to a love interest about the house: to one who lives in it, where her room is, who else is there and how the
 * rent stands; to anyone else who knows him, that he lives there now and with whom.
 */
export function describeHousehold(content: ContentPack, state: GameState, loveInterestId: string): string[] {
  const config = content.housing
  if (!config || !isResident(content, state)) return []
  const { name } = state.player
  const firstOf = (id: string) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id
  const list = (ids: string[]) => ids.map(firstOf).join(', ').replace(/, ([^,]*)$/, ' and $1')
  const residents = Object.keys(state.housing.residents)
  const nanny = firstOf(config.nannyId)
  const lines: string[] = []
  const mine = roomOf(config, state.housing.residents[loveInterestId])
  if (loveInterestId === config.nannyId) {
    lines.push(`You are the live-in nanny at ${config.name}, the house the Sire Relations Office lets to ${name}. You are employed by the Office, not by him, and you have your own room there.`)
    lines.push(residents.length > 0 ? `${list(residents)} live${residents.length === 1 ? 's' : ''} there too, at his asking.` : `Nobody else lives there yet but the two of you.`)
    const babies = babiesAtHome(state)
    lines.push(
      babies.length > 0
        ? `You mind ${babies.length === 1 ? 'the one child' : `the ${babies.length} children`} of the house: ${babies.map((child) => `${firstOf(child.motherId)}'s ${child.daughter ? 'daughter' : 'son'} (${healthName(config, child.health ?? 0).toLowerCase()})`).join('; ')}.`
        : 'There is no child in the house yet for you to mind.'
    )
  } else if (mine) {
    const others = residents.filter((id) => id !== loveInterestId)
    lines.push(`You live with ${name} at ${config.name}, the house the Sire Relations Office lets him: you moved in at his asking, and ${mine.name.toLowerCase()} is yours.`)
    lines.push(`${others.length > 0 ? `${list(others)} live${others.length === 1 ? 's' : ''} there as well. ` : ''}${nanny} is the live-in nanny, employed by the Office.`)
  } else {
    lines.push(`${name} no longer lives in the halls: the Sire Relations Office has let him ${config.name}, a family house off campus${residents.length > 0 ? `, and ${list(residents)} live${residents.length === 1 ? 's' : ''} there with him` : ''}. A nanny, ${nanny}, lives in.`)
  }
  const deadline = arrearsDeadline(content, state)
  if (deadline !== undefined && (mine || loveInterestId === config.nannyId)) {
    lines.push(`${name} owes $${state.housing.arrears} in rent, and the house will be taken back if it is not found by ${formatDate(toDate(content.calendar, startOf(content.calendar, deadline)))}. Everyone in the house knows it.`)
  }
  return lines
}

/** Told to the housing officer: how his file stands. Nothing for anyone else. */
export function housingFacts(content: ContentPack, state: GameState, characterId: string): string[] {
  const config = content.housing
  if (!config || characterId !== config.officerId) return []
  const { name } = state.player
  const { housing } = state
  const terms = `The terms: ${config.name}, a secure family house with a live-in nanny employed by the Office; rent of $${config.rent} on the first of each month, which is the subsidised rate; ${config.graceDays} days' grace on rent not paid, and then the house is taken back. He may build onto it and fit it out at his own cost, and may take in the mothers of his children.`
  if (housing.status === 'none') return []
  if (housing.status === 'offered') return [`You have written to ${name} offering him Sire housing, and he has not answered yet. ${terms}`]
  if (housing.status === 'declined') return [`You offered ${name} Sire housing and he declined. The offer stands if he changes his mind. ${terms}`]
  if (housing.status === 'evicted') return [`${name} held ${config.name} and lost it: the rent went unpaid past the days of grace and the Office took the house back. That cannot be undone, and there will not be another.`]
  const residents = Object.keys(housing.residents).map((id) => content.loveInterests.find((li) => li.id === id)?.name ?? id)
  const deadline = arrearsDeadline(content, state)
  return [
    `${name} is a tenant of the Office at ${config.name}. ${terms}`,
    residents.length > 0 ? `Living there with him: ${residents.join(', ')}.` : 'He lives there alone but for the nanny.',
    deadline !== undefined
      ? `He owes $${housing.arrears} in rent, to be found by ${formatDate(toDate(content.calendar, startOf(content.calendar, deadline)))}, or the house is taken back.`
      : 'His rent is paid up.'
  ]
}

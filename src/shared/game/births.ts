import type { Appointment, Child, ContentPack, GameState, Scene } from '../model'
import { dayAgenda, timeOn, type AgendaItem } from './agenda'
import { describeWhen, keepAppointment } from './appointments'
import { isGameOver, toDate } from './calendar'
import { addNote, giveContact } from './courier'
import { placeBabies } from './housing'
import { addMemory, applyFeelings } from './memory'
import { deliverChild, nameChild } from './pregnancy'
import { sceneBaseline } from './scene'
import { isOpen } from './schedule'

/**
 * The birth of a child. It is not something that happens to him while he is elsewhere: a few days before her time the
 * Health Center gives her an hour, it goes on his calendar, and he is there for it or he is not. The child comes either
 * way. What differs is what she makes of him afterwards.
 */

// What not being there costs him with her. Far more than a plan stood up: it is the one thing she asked of him.
export const MISSED_BIRTH = { affection: -25, trust: -30, desire: -15 } as const

// How much each thing in the way of a birth is worth leaving clear, least first: he may miss a fair for it sooner than a shift, and a shift sooner than a class.
const IN_THE_WAY: Record<AgendaItem['kind'], number> = { event: 1, rent: 0, household: 0, society: 1, work: 2, class: 3, orientation: 3, plan: 4, birth: 5 }
// Nobody is brought to bed before the day has begun.
const EARLIEST_HOUR = 6

const childWord = (child: Pick<Child, 'daughter'>) => (child.daughter ? 'daughter' : 'son')

/** The hour set for a mother's child to be born, once there is one. */
export function birthAppointment(state: Pick<GameState, 'appointments'>, motherId: string): Appointment | undefined {
  return state.appointments.find((plan) => plan.kind === 'birth' && plan.loveInterestId === motherId)
}

/**
 * The hour of a day at which a birth is set: the game time it starts. The earliest stretch of the day that is free of
 * everything else of his; failing that the earliest that costs him only an event, then only a shift, then a class, then
 * another plan. It is always while the place is open, and never in the past. Nothing when the day has no hour left.
 */
export function birthSlot(content: ContentPack, state: GameState, dayIndex: number, hours: number): number | undefined {
  return slotOn(content, state, dayIndex, hours, content.pregnancy?.birthLocationId ?? '')?.time
}

/**
 * The best hour of a day for something he has to be at a place for: the stretch least in the way of the rest of his
 * day, and of those the earliest, with what it costs him (nothing when it is free). Between the hours given, while the
 * place is open, and never in the past.
 */
export function slotOn(content: ContentPack, state: GameState, dayIndex: number, hours: number, placeId: string, earliest = EARLIEST_HOUR, latestEnd = content.calendar.hoursPerDay): { time: number; cost: number } | undefined {
  const place = content.locations.find((l) => l.id === placeId)
  if (!place) return undefined
  const day = dayAgenda(content, state, dayIndex).filter((item) => item.startHour !== undefined)
  let best: { time: number; cost: number } | undefined
  for (let hour = earliest; hour + hours <= Math.min(latestEnd, content.calendar.hoursPerDay); hour++) {
    const time = timeOn(content, dayIndex, hour)
    if (time <= state.time || isGameOver(content.calendar, time + hours - 1)) continue
    if (Array.from({ length: hours }, (_, i) => hour + i).some((h) => !isOpen(place, h))) continue
    const cost = Math.max(
      0,
      ...day.filter((item) => item.startHour! < hour + hours && hour < item.startHour! + (item.hours ?? 1)).map((item) => IN_THE_WAY[item.kind])
    )
    // The least in the way, and of those the earliest: the hours are walked in order, so only a better one takes its place.
    if (!best || cost < best.cost) best = { time, cost }
  }
  return best
}

/**
 * Sets the hour for every birth that is near and has none: on the day she is due, or on the first day after it that
 * has an hour left. She writes to tell him when. Returns the same state when there was nothing to set.
 */
export function scheduleBirths(content: ContentPack, state: GameState): { state: GameState; scheduled: Appointment[] } {
  const config = content.pregnancy
  if (!config || !content.locations.some((l) => l.id === config.birthLocationId)) return { state, scheduled: [] }
  const today = toDate(content.calendar, state.time).dayIndex
  const scheduled: Appointment[] = []
  let next = state
  for (const [motherId, pregnancy] of Object.entries(state.pregnancies)) {
    const mother = content.loveInterests.find((li) => li.id === motherId)
    if (!mother || birthAppointment(next, motherId)) continue
    const due = toDate(content.calendar, pregnancy.dueAt).dayIndex
    if (due - today > config.birthNoticeDays) continue
    const day = Math.max(due, today)
    const time = birthSlot(content, next, day, config.birthHours) ?? birthSlot(content, next, day + 1, config.birthHours)
    if (time === undefined) continue
    const plan: Appointment = { id: `birth-${motherId}`, kind: 'birth', loveInterestId: motherId, companionIds: [], title: 'The birth of your child', time, hours: config.birthHours, locationId: config.birthLocationId }
    scheduled.push(plan)
    const place = content.locations.find((l) => l.id === config.birthLocationId)?.name ?? config.birthLocationId
    next = addNote(giveContact({ ...next, appointments: [...next.appointments, plan].sort((a, b) => a.time - b.time) }, motherId), motherId, {
      from: 'them',
      text: `They have given me a time at ${place}: ${describeWhen(content, time)}. That is when our child comes. I want you there, ${state.player.name}. Please be there.`,
      read: false
    })
  }
  return { state: next, scheduled }
}

/**
 * He is there for it. The child is born as the scene opens: the scene is the two of them, and the child, in the hour
 * after. It is set in the room the Health Center keeps for it, with her picture of the moment for its whole stage if
 * she has one.
 */
export function attendBirth(content: ContentPack, state: GameState, appointmentId: string): { state: GameState; scene: Scene; child: Child | undefined } {
  const { state: kept, appointment } = keepAppointment(content, state, appointmentId)
  const motherId = appointment.loveInterestId
  const mother = content.loveInterests.find((li) => li.id === motherId)
  const delivered = deliverChild(content, kept, motherId, appointment.time)
  const place = content.locations.find((l) => l.id === appointment.locationId)
  const first = mother?.name.split(' ')[0] ?? 'She'
  const child = delivered.child
  const what = child ? childWord(child) : 'child'
  const place_ = place?.name ?? 'the Health Center'
  return {
    state: placeBabies(content, delivered.state),
    child,
    scene: {
      loveInterestId: motherId,
      companionIds: [],
      npc: false,
      nsfw: false,
      beats: [
        {
          activityName: 'The birth',
          locationName: place?.name,
          description: `It is over, and they are both well. ${first} is propped on the pillows with your ${what} in her arms.${child ? ` She would like to call ${child.daughter ? 'her' : 'him'} ${child.name}.` : ''}`,
          direction: birthDirection(state.player.name, place_, child)
        }
      ],
      messages: [],
      gifts: [],
      conceived: [],
      departed: [],
      viewId: content.pregnancy?.birthViewId,
      picture: mother?.birthPicture,
      newborn: child?.bornAt,
      // From before the child came, so that what the hour did to her feelings is the scene's to say.
      baseline: sceneBaseline(state, motherId, [])
    }
  }
}

/** Told to the mother in the scene of a birth: what has just happened, and what the child is called. */
function birthDirection(player: string, place: string, child: Child | undefined, suggested?: string): string {
  const what = child ? childWord(child) : 'child'
  const naming = !child
    ? ''
    : suggested !== undefined && suggested !== child.name
      ? `You had thought of ${suggested} for a name; ${player} has chosen ${child.name} instead, and you took to it at once and gladly. ${child.daughter ? 'Her' : 'His'} name is ${child.name}, and that is settled. `
      : `You want to call ${child.daughter ? 'her' : 'him'} ${child.name}, and have told ${player} so; unless he chooses another, which you would accept gladly, that is ${child.daughter ? 'her' : 'his'} name. `
  return (
    `You have just given birth to ${player}'s child, a ${what}, here in the maternity room of ${place}. ` +
    `You are sitting up in the hospital bed in a hospital gown, worn out and overjoyed, with the newborn in your arms. ${player} was with you through all of it. ` +
    naming +
    `This is the first hour afterwards, the three of you. Stay in this room and in this bed: do not move the scene anywhere, and nothing sexual happens here.`
  )
}

/**
 * He names the child, in the scene of its birth, in place of the name she thought of. She takes it without a word
 * against: the child has that name from then on, and she is told so for the rest of the scene.
 */
export function renameNewborn(content: ContentPack, state: GameState, scene: Scene, name: string): { state: GameState; scene: Scene } {
  const before = state.children.find((child) => child.motherId === scene.loveInterestId && child.bornAt === scene.newborn)
  if (!before) return { state, scene }
  const named = nameChild(state, before.motherId, before.bornAt, name)
  const child = named.children.find((one) => one.motherId === before.motherId && one.bornAt === before.bornAt)
  if (named === state || !child || child.name === before.name) return { state, scene }
  const place = content.locations.find((l) => l.id === content.pregnancy?.birthLocationId)?.name ?? 'the Health Center'
  const [first, ...rest] = scene.beats
  // What she first thought of is kept, so that naming the child twice still tells her what she gave up.
  const suggested = scene.suggestedName ?? before.name
  return { state: named, scene: { ...scene, suggestedName: suggested, beats: first ? [{ ...first, direction: birthDirection(state.player.name, place, child, suggested) }, ...rest] : scene.beats } }
}

/**
 * Counts up the births whose hour has gone by without him. The child is born all the same, at the end of that hour,
 * and she holds it against him as she holds nothing else: she remembers it for good, and writes to say so.
 */
export function settleBirths(content: ContentPack, state: GameState): { state: GameState; missed: { motherId: string; child: Child }[] } {
  const over = state.appointments.filter((plan) => plan.kind === 'birth' && plan.time + plan.hours <= state.time)
  if (over.length === 0) return { state, missed: [] }
  const missed: { motherId: string; child: Child }[] = []
  let next: GameState = { ...state, appointments: state.appointments.filter((plan) => !over.includes(plan)) }
  for (const plan of over) {
    const motherId = plan.loveInterestId
    const delivered = deliverChild(content, next, motherId, plan.time + plan.hours)
    if (!delivered.child) continue
    const child = delivered.child
    missed.push({ motherId, child })
    next = placeBabies(content, delivered.state)
    next = applyFeelings(content, next, motherId, { ...MISSED_BIRTH, reason: 'He was not there for the birth.' }, true)
    const where = content.locations.find((l) => l.id === plan.locationId)?.name ?? plan.locationId
    next = addMemory(next, motherId, `${state.player.name} was not there when you gave birth to his ${childWord(child)} at ${where}. You went through it without him, and he sent no word.`, 'core')
    next = addNote(giveContact(next, motherId), motherId, {
      from: 'them',
      text: `It's done. You have a ${childWord(child)}. I have named ${child.daughter ? 'her' : 'him'} ${child.name}. We are both well. You weren't here.`,
      read: false
    })
  }
  return { state: next, missed }
}

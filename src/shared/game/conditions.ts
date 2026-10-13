import type { Condition, ContentPack, Effect, GameState } from '../model'
import { toDate } from './calendar'
import { eventsOn } from './events'
import { stageFor, stageRank } from './relationships'
import { affectionGain, trainStat } from './stats'
import { addBoon, feltChange } from './modifiers'

export interface RuleContext {
  state: GameState
  content: ContentPack
  /** Target for conditions and effects that don't name a love interest. */
  loveInterestId?: string
  /** What the effects come from, as he would name it: a boon is known by it. */
  source?: string
}

function inRange(value: number, min?: number, max?: number): boolean {
  return (min === undefined || value >= min) && (max === undefined || value <= max)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function evaluateCondition(c: Condition, ctx: RuleContext): boolean {
  const { state, content } = ctx
  switch (c.type) {
    case 'stat':
      return inRange(state.player.stats[c.stat] ?? 0, c.min, c.max)
    case 'money':
      return state.player.money >= c.min
    case 'energy':
      return state.player.energy >= c.min
    case 'meter': {
      const rel = state.relationships[c.loveInterestId ?? ctx.loveInterestId ?? '']
      return rel !== undefined && rel[c.meter] >= c.min
    }
    case 'stage': {
      const rel = state.relationships[c.loveInterestId ?? ctx.loveInterestId ?? '']
      if (rel === undefined) return false
      const current = stageFor(content.relationships, rel.affection)
      return (
        stageRank(content.relationships, current.id) >= stageRank(content.relationships, c.min)
      )
    }
    case 'flag':
      return (state.flags[c.flag] ?? false) === c.value
    case 'pregnant':
      return (state.pregnancies[c.loveInterestId ?? ctx.loveInterestId ?? ''] !== undefined) === c.value
    case 'event':
      return eventsOn(content, state).some((e) => e.id === c.eventId)
    case 'day':
      return inRange(toDate(content.calendar, state.time).dayIndex + 1, c.min, c.max)
  }
}

export function evaluateAll(conditions: Condition[], ctx: RuleContext): boolean {
  return conditions.every((c) => evaluateCondition(c, ctx))
}

export function describeCondition(c: Condition, content: ContentPack): string {
  const who = (id?: string): string =>
    id === undefined
      ? 'them'
      : (content.loveInterests.find((li) => li.id === id)?.name ?? id)
  switch (c.type) {
    case 'stat':
      return c.min !== undefined ? `${c.stat} ${c.min}+` : `${c.stat} at most ${c.max}`
    case 'money':
      return `${c.min} money`
    case 'energy':
      return `${c.min} energy`
    case 'meter':
      return `${c.meter} ${c.min}+ with ${who(c.loveInterestId)}`
    case 'stage': {
      const stage = content.relationships.stages.find((s) => s.id === c.min)
      return `${stage?.name ?? c.min} or closer with ${who(c.loveInterestId)}`
    }
    case 'flag':
      return c.value ? `"${c.flag}" has happened` : `"${c.flag}" has not happened`
    case 'pregnant':
      return `${who(c.loveInterestId)} ${c.value ? 'to be' : 'not to be'} with child`
    case 'event':
      return `it to be ${content.calendar.events.find((e) => e.id === c.eventId)?.name ?? c.eventId}`
    case 'day':
      return c.min !== undefined ? `day ${c.min} or later` : `day ${c.max} or earlier`
  }
}

/** Returns a new state with the effect applied; the input is not modified. */
export function applyEffect(state: GameState, e: Effect, ctx: Omit<RuleContext, 'state'>): GameState {
  const { player } = state
  switch (e.type) {
    case 'stat':
      // Not a point of the score, but that much work toward one.
      return trainStat(ctx.content, state, e.stat, e.amount)
    case 'money':
      return { ...state, player: { ...player, money: player.money + e.amount } }
    case 'energy':
      return {
        ...state,
        player: { ...player, energy: clamp(player.energy + e.amount, 0, player.maxEnergy) }
      }
    case 'meter': {
      const id = e.loveInterestId ?? ctx.loveInterestId
      const rel = id === undefined ? undefined : state.relationships[id]
      if (id === undefined || rel === undefined) return state
      // Someone who admires what the player has made of himself warms to him faster.
      const appealed = e.meter === 'affection' ? affectionGain(ctx.content, state, id, e.amount) : e.amount
      const amount = feltChange(ctx.content, state, id, e.meter, appealed)
      const value = clamp(rel[e.meter] + amount, 0, ctx.content.relationships.meterMax)
      return {
        ...state,
        relationships: { ...state.relationships, [id]: { ...rel, [e.meter]: value } }
      }
    }
    case 'flag':
      return { ...state, flags: { ...state.flags, [e.flag]: e.value } }
    case 'boon':
      // One meant for her and used on nobody does nothing.
      if (e.on === 'her' && ctx.loveInterestId === undefined) return state
      return addBoon(state, { ...e.modifier, until: state.time + e.hours, source: ctx.source ?? 'Something', targetId: e.on === 'her' ? ctx.loveInterestId : undefined, telling: e.telling })
    case 'item':
      return { ...state, inventory: { ...state.inventory, [e.itemId]: (state.inventory[e.itemId] ?? 0) + e.count } }
    case 'unlockCodex':
      if (state.unlockedCodexIds.includes(e.entryId)) return state
      return { ...state, unlockedCodexIds: [...state.unlockedCodexIds, e.entryId] }
  }
}

export function applyEffects(
  state: GameState,
  effects: Effect[],
  ctx: Omit<RuleContext, 'state'>
): GameState {
  return effects.reduce((s, e) => applyEffect(s, e, ctx), state)
}

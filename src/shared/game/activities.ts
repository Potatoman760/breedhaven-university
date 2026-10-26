import type { Activity, ContentPack, GameState } from '../model'
import { isGameOver, toDate } from './calendar'
import { applyEffects, describeCondition, evaluateCondition } from './conditions'
import { inClass, locationOf } from './map'
import { isOpen, matchesWhen } from './schedule'
import { t } from '../i18n'

export interface PerformCheck {
  ok: boolean
  /** Player-facing reasons the activity can't be done right now. Empty when ok. */
  reasons: string[]
}

/**
 * Whether the activity can be done now. Activities tied to a location need the player
 * to be there. A shared activity needs the love interest to be at the player's location
 * and not in class, unless `inScene` says the two are already out together.
 */
export function canPerform(
  activity: Activity,
  state: GameState,
  content: ContentPack,
  loveInterestId?: string,
  inScene = false
): PerformCheck {
  const reasons: string[] = []
  const { calendar } = content
  const date = toDate(calendar, state.time)
  const { availability } = activity

  if (isGameOver(calendar, state.time)) reasons.push(t('game.activities.gameOver'))

  if (activity.locationId !== undefined && activity.locationId !== state.locationId) {
    const where = content.locations.find((l) => l.id === activity.locationId)
    reasons.push(t('game.activities.goTo', { place: where?.name ?? activity.locationId }))
  }
  const partner = content.loveInterests.find((li) => li.id === loveInterestId)
  if (partner && !inScene && locationOf(content, state, partner) !== state.locationId) {
    reasons.push(t('game.activities.notHere', { name: partner.name }))
  } else if (partner && !inScene && inClass(content, state, partner)) {
    reasons.push(t('game.activities.inClass', { name: partner.name }))
  }

  if (availability.weekdays && !availability.weekdays.includes(date.weekday)) {
    reasons.push(t('game.activities.onlyOn', { days: availability.weekdays.join(', ') }))
  }
  if (availability.periods && !matchesWhen({ periods: availability.periods }, date)) {
    const names = availability.periods.map(
      (id) => calendar.periods.find((p) => p.id === id)?.name ?? id
    )
    reasons.push(t('game.activities.onlyDuring', { periods: names.join(', ') }))
  }
  if (availability.earliestHour !== undefined && date.hour < availability.earliestHour) {
    reasons.push(t('game.activities.notBefore', { hour: availability.earliestHour }))
  }
  if (availability.latestHour !== undefined && date.hour > availability.latestHour) {
    reasons.push(t('game.activities.notAfter', { hour: availability.latestHour }))
  }

  const location = content.locations.find((l) => l.id === activity.locationId)
  if (location && !isOpen(location, date.hour)) reasons.push(t('game.activities.closed', { place: location.name }))

  if (activity.withLoveInterest === 'required' && loveInterestId === undefined) {
    reasons.push(t('game.activities.needsPartner'))
  }

  const ctx = { state, content, loveInterestId }
  for (const requirement of activity.requirements) {
    if (!evaluateCondition(requirement, ctx)) {
      reasons.push(t('game.activities.requires', { condition: describeCondition(requirement, content) }))
    }
  }

  return { ok: reasons.length === 0, reasons }
}

/** Short player-facing descriptions of what the activity changes, e.g. "+1 intellect". */
export function describeEffects(activity: Activity): string[] {
  const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${-n}`)
  return activity.effects.flatMap((e) => {
    switch (e.type) {
      case 'stat':
        return [`${signed(e.amount)} ${e.stat}`]
      case 'money':
        return [`${e.amount < 0 ? '−' : '+'}$${Math.abs(e.amount)}`]
      case 'energy':
        return [t('game.activities.energy', { amount: signed(e.amount) })]
      case 'meter':
        return [`${signed(e.amount)} ${e.meter}`]
      default:
        return []
    }
  })
}

/** Activities tied to a calendar event are the ones worth featuring while it is on. */
export function isEventActivity(activity: Activity): boolean {
  return activity.requirements.some((r) => r.type === 'event')
}

/** Applies the activity's effects and advances the clock by its duration. */
export function perform(
  activity: Activity,
  state: GameState,
  content: ContentPack,
  loveInterestId?: string,
  inScene = false
): GameState {
  const partnerId = activity.withLoveInterest === 'none' ? undefined : loveInterestId
  const check = canPerform(activity, state, content, partnerId, inScene)
  if (!check.ok) {
    throw new Error(`Cannot perform "${activity.name}": ${check.reasons.join('; ')}`)
  }
  const after = applyEffects(state, activity.effects, { content, loveInterestId: partnerId })
  return { ...after, time: after.time + activity.durationHours }
}

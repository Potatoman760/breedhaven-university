import type { ContentPack, GameState } from '../model'
import { eventDay, eventsOn } from './events'
import { partCast } from './eventParts'
import { isOrientationDay, orientationCasts } from './orientation'

/**
 * What today's parts put their casts in, by id, for the day to begin in: an orientation step's and an event part's
 * `outfitId`, given to whoever is in it, so that she is already in what its cutscene draws her in. Whether she has
 * it, and whether it can last a day, is for `dressForDay` to see. Kept apart from it, as orientation and the parts
 * of events reach back to the pregnancy rules it is part of.
 */
export function dayOutfitsPlanned(content: ContentPack, state: GameState): Record<string, string> {
  const planned: Record<string, string> = {}
  const give = (ids: string[], outfitId: string) => ids.forEach((id) => (planned[id] ??= outfitId))
  if (content.orientation && isOrientationDay(content, state)) {
    const casts = orientationCasts(content, state)
    content.orientation.steps.forEach((step, i) => step.outfitId && give(casts[i] ?? [], step.outfitId))
  }
  for (const event of eventsOn(content, state)) {
    const today = eventDay(content, event, state.time)
    for (const part of event.program) if (part.outfitId && part.day === today) give(partCast(content, state, event, part), part.outfitId)
  }
  return planned
}

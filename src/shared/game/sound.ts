import type { ContentPack, Cue, GameState, Sound } from '../model'
import { toDate } from './calendar'

/**
 * What a change of the game calls to be heard, the weightiest first. Read off the state before and after
 * it, so that a cue is not missed or doubled whichever of the game's many paths made the change.
 */
export function soundCues(content: ContentPack, before: GameState, after: GameState): Cue[] {
  const cues: Cue[] = []
  if (after.children.length > before.children.length) cues.push('birth')
  if (Object.keys(after.pregnancies).some((id) => !(id in before.pregnancies))) cues.push('pregnancy')
  if (after.bonds.some((bond) => !before.bonds.some((was) => was.statusId === bond.statusId && was.since === bond.since))) cues.push('bond')
  if (after.skillsTold.length > before.skillsTold.length) cues.push('skill')
  const written = (state: GameState) => Object.values(state.courier).reduce((sum, notes) => sum + notes.filter((note) => note.from === 'them').length, 0)
  if (written(after) > written(before)) cues.push('message')
  if (after.player.money !== before.player.money) cues.push('coins')
  if (after.locationId !== before.locationId && content.locations.find((l) => l.id === after.locationId)?.indoors) cues.push('door')
  return cues
}

/** The loop to play behind where he is at this hour, if the place has one. */
export function ambienceAt(content: ContentPack, state: GameState): Sound | undefined {
  const place = content.sounds.places[state.locationId]
  if (!place) return undefined
  const dark = toDate(content.calendar, state.time).period.light === 'night'
  return content.sounds.ambience[(dark && place.night) || place.day]
}

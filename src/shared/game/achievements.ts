import { STATS, kindOf, type BondProposal, type ContentPack, type GameState } from '../model'
import { END_BOND, bondOf } from './bonds'
import { enrolledCourses } from './courses'
import { eventsOn } from './events'
import { trustOf } from './modifiers'
import { LEGENDARY, statOf } from './stats'
import { t } from '../i18n'

/**
 * The achievements, kept for the install and not for a game: once earned, earned in every save. Each id stays as it
 * is, since it is how one is known on disk, and will be how it is known to Steam. Most are read off a game as it
 * stands (`earnedInState`), so a save that already meets one earns it the moment it is loaded; the rest are of
 * something a save does not keep, and are earned as it happens.
 */
export const ACHIEVEMENTS = [
  'perfection',
  'aced',
  'legendary',
  'heartbreaker',
  'conqueror',
  'light-of-my-life',
  'we-live-in-a-society',
  'obligatory-onsen-scene',
  'wheres-the-landlady',
  'oil-and-water',
  'xxxmas',
  'forbidden',
  'teach-me',
  'maid-my-day',
  'diplomacy',
  'bffs'
] as const
export type AchievementId = (typeof ACHIEVEMENTS)[number]

/** Those kept secret until they are earned, as Steam's hidden ones are: neither named nor described before. */
export const HIDDEN_ACHIEVEMENTS: readonly AchievementId[] = [
  'oil-and-water',
  'xxxmas',
  'forbidden',
  'teach-me',
  'maid-my-day',
  'diplomacy',
  'bffs'
]

export const isHidden = (id: AchievementId): boolean => HIDDEN_ACHIEVEMENTS.includes(id)

// How deep the Undercroft goes: Conqueror is clearing the last of it.
const UNDERCROFT_DEPTHS = 8

/** What an achievement is called, and what earns it. */
export function describeAchievement(id: AchievementId): { name: string; description: string } {
  return { name: t(`game.achievements.${id}.name` as const), description: t(`game.achievements.${id}.description` as const) }
}

/** Those a game earns as it stands. */
export function earnedInState(content: ContentPack, state: GameState): AchievementId[] {
  const earned: AchievementId[] = []
  // Perfection: every meter full with any one of them, trust as he sees it.
  const max = content.relationships.meterMax
  if (content.loveInterests.some((li) => {
    const rel = state.relationships[li.id]
    return rel !== undefined && rel.affection >= max && rel.desire >= max && trustOf(content, state, li.id) >= max
  })) earned.push('perfection')
  // Aced!: a midterm in every course he takes, and every one an A.
  const courses = enrolledCourses(state)
  if (courses.length > 0 && courses.every((course) => state.grades[course.id]?.midterm?.letter === 'A')) earned.push('aced')
  // Legendary: every stat legendary at once.
  if (STATS.every((stat) => statOf(state, stat) >= LEGENDARY)) earned.push('legendary')
  // Conqueror: the Undercroft cleared to its last depth.
  if (state.expedition.cleared >= UNDERCROFT_DEPTHS) earned.push('conqueror')
  // We live in a society: in any of them.
  if (state.societies.length > 0) earned.push('we-live-in-a-society')
  // Obligatory onsen scene: any part of the Mistmoon Break, the trip to Saltmere's springs.
  if (state.partsAttended.some((part) => part.startsWith('mistmoon-break:'))) earned.push('obligatory-onsen-scene')
  // Where's the landlady?: Haven House is his, once he has moved in; it stays earned if he is put out.
  if (state.housing.movedInAt !== undefined || state.housing.status === 'resident') earned.push('wheres-the-landlady')
  // BFFs: Tamsin carrying his child, and with him in any arrangement.
  if (state.pregnancies['tamsin'] !== undefined && bondOf(state, 'tamsin') !== undefined) earned.push('bffs')
  return earned
}

/** Those a scene earns as it ends: who he had sex with in it, by id, and the game as it was. */
export function earnedInScene(content: ContentPack, state: GameState, intimateIds: readonly string[]): AchievementId[] {
  const with_ = (...ids: string[]) => ids.every((id) => intimateIds.includes(id))
  const earned: AchievementId[] = []
  // Oil and Water: Dinah and Morwenna, in the one scene.
  if (with_('dinah', 'morwenna')) earned.push('oil-and-water')
  // Forbidden: the twins, together.
  if (with_('anwen', 'elowen')) earned.push('forbidden')
  // Teach me!: any three of his teachers at once.
  const teachers = content.loveInterests.filter((li) => kindOf(li) === 'teacher' && intimateIds.includes(li.id))
  if (teachers.length >= 3) earned.push('teach-me')
  // Diplomacy: Yelena and Seraphine, in the one scene.
  if (with_('yelena', 'seraphine')) earned.push('diplomacy')
  // Maid my Day: Zélie.
  if (with_('zelie')) earned.push('maid-my-day')
  // XXXmas: anyone at all, on the Feast of First Frost.
  if (intimateIds.length > 0 && eventsOn(content, state).some((event) => event.id === 'first-frost')) earned.push('xxxmas')
  return earned
}

/** Those a part of an event earns as he goes to it, with those he took. */
export function earnedAtEvent(eventId: string, withIds: readonly string[]): AchievementId[] {
  // Light of my life: the lanterns let go, with a date.
  return eventId === 'lantern-festival' && withIds.length > 0 ? ['light-of-my-life'] : []
}

/** Those a change to what he and they are to each other earns, once it is agreed. */
export function earnedByBond(proposal: BondProposal): AchievementId[] {
  // Heartbreaker: what they had is ended.
  return proposal.statusId === END_BOND ? ['heartbreaker'] : []
}

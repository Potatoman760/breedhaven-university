import type { ContentPack, GameState, LoveInterest, Scene } from '../model'
import { sceneCast } from './scene'

/** What a woman he has not met is called on screen until her name has been said. */
export const UNNAMED = '???'

/** A line as it is searched for a name: no accents, lower case. */
const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whether a reply or a line of his says her name: her first name or her whole name as a word, whatever became of the
 * accents. The hidden tags a reply carries and the speaker's name before a line in a group name her without saying it.
 */
export function saysName(text: string, who: Pick<LoveInterest, 'name'>): boolean {
  const spoken = text
    .replace(/\[[^\]]*\]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/^\s*\**[^:*\n]{1,40}?\**\s*:\s*/, ''))
    .join('\n')
  const first = who.name.trim().split(/\s+/)[0] ?? ''
  return [who.name.trim(), first].some((name) => name !== '' && new RegExp(`(^|[^\\p{L}])${escaped(plain(name))}($|[^\\p{L}])`, 'u').test(plain(spoken)))
}

/**
 * Those in a scene he is meeting for the first time, to be added to it as it begins or as each walks in: a love interest
 * he has not met. Not at a masked ball, where who she is is his to guess.
 */
export function newStrangers(content: ContentPack, state: GameState, scene: Pick<Scene, 'loveInterestId' | 'companionIds' | 'npc' | 'mask' | 'strangers'>): string[] {
  if (scene.npc || scene.mask) return []
  return sceneCast(scene).filter((id) => content.loveInterests.some((li) => li.id === id) && !state.met.includes(id) && !(scene.strangers ?? []).includes(id))
}

/** That she has said her first line to him: once said, never again. */
export const firstLineFlag = (id: string) => `first-line:${id}`

/**
 * The scene's opening as the strangers in it say who they are: each of them with a first line, not yet said, in the
 * order they are in it; alone, as she says it, and in a group with her name before it. Nothing for a class, which the
 * teacher opens, a masked ball, or an NPC.
 */
export function firstLinesIn(
  content: ContentPack,
  state: GameState,
  scene: Pick<Scene, 'loveInterestId' | 'companionIds' | 'npc' | 'mask' | 'strangers' | 'lesson' | 'messages'>
): { ids: string[]; text: string } | undefined {
  if (scene.npc || scene.mask || scene.lesson || scene.messages.length > 0) return undefined
  const strangers = new Set([...(scene.strangers ?? []), ...newStrangers(content, state, scene)])
  const saying = sceneCast(scene).flatMap((id) => content.loveInterests.find((li) => li.id === id && strangers.has(id) && li.firstLine && !state.flags[firstLineFlag(id)]) ?? [])
  if (saying.length === 0) return undefined
  const group = sceneCast(scene).length > 1
  return { ids: saying.map((li) => li.id), text: saying.map((li) => (group ? `${li.name.split(' ')[0]}: ${li.firstLine}` : li.firstLine)).join('\n\n') }
}

/** The strangers of a scene whose name nobody has yet said in it. */
export function unnamedIn(content: ContentPack, scene: Pick<Scene, 'strangers' | 'messages'>): string[] {
  return (scene.strangers ?? []).filter((id) => {
    const who = content.loveInterests.find((li) => li.id === id)
    return who !== undefined && !scene.messages.some((message) => saysName(message.content, who))
  })
}

/** The content as the screen shows a scene: each of its strangers called `UNNAMED` until her name is said. */
export function withStrangers(content: ContentPack, scene: Pick<Scene, 'strangers' | 'messages'> | null | undefined): ContentPack {
  const unnamed = scene ? unnamedIn(content, scene) : []
  if (unnamed.length === 0) return content
  return { ...content, loveInterests: content.loveInterests.map((li) => (unnamed.includes(li.id) ? { ...li, name: UNNAMED } : li)) }
}

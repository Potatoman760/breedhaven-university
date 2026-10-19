import type { ContentPack, GameState, LoveInterest, Scene } from '../model'
import { bondOf, canBond, statusOf } from './bonds'
import { hasContact } from './courier'
import { handleOf } from './feed'
import { stageFor, stageRank } from './relationships'
import { sceneCast } from './scene'

/**
 * What the scene's text box can offer him to say: an ask the rules allow right now, written out, and the note that goes
 * to the LLM with it when he sends it, so that she knows what he is asking and that it can be granted. Her answer is
 * still hers.
 */
export interface Suggestion {
  id: string
  text: string
  cue: string
}

// She has to know him a little before he can ask for her Bloomr: an acquaintance, not a stranger.
const CONTACT_STAGE = 'acquaintance'

const first = (li: LoveInterest) => li.name.split(' ')[0]

/** Whether she is as far along with him as a stage. */
function reached(content: ContentPack, state: GameState, li: LoveInterest, stageId: string | undefined): boolean {
  if (!stageId) return true
  const at = stageFor(content.relationships, state.relationships[li.id]?.affection ?? 0)
  return stageRank(content.relationships, at.id) >= stageRank(content.relationships, stageId)
}

/** The asks open to him in this scene, for whoever is in it: her Bloomr, and each arrangement the rules would allow. */
export function sceneSuggestions(content: ContentPack, state: GameState, scene: Pick<Scene, 'loveInterestId' | 'companionIds' | 'npc'>): Suggestion[] {
  if (scene.npc) return []
  const player = state.player.name
  const cast = sceneCast(scene).flatMap((id) => content.loveInterests.find((li) => li.id === id) ?? [])
  const suggestions: Suggestion[] = []

  for (const li of cast) {
    if (hasContact(state, li.id) || !reached(content, state, li, CONTACT_STAGE)) continue
    suggestions.push({
      id: `contact:${li.id}`,
      text: `${first(li)}, could I get your Bloomr?`,
      cue: `${player} is asking ${first(li)} for her Bloomr. If she gives it, she says her handle: ${handleOf(li)}.`
    })
  }

  // Each arrangement the rules allow now and that is not what they already have: for her alone, or for two of them together.
  const groups = [...cast.map((li) => [li]), ...cast.flatMap((a, i) => cast.slice(i + 1).map((b) => [a, b]))]
  for (const status of content.relationships.statuses) {
    for (const members of groups) {
      if (members.length < status.minMembers || members.length > status.maxMembers) continue
      const memberIds = members.map((li) => li.id)
      const current = bondOf(state, memberIds[0])
      if (current?.statusId === status.id && memberIds.every((id) => current.memberIds.includes(id))) continue
      if (!members.every((li) => reached(content, state, li, status.minStage))) continue
      if (!canBond(content, state, { statusId: status.id, memberIds }).ok) continue
      const names = members.map(first)
      const asked = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
      suggestions.push({
        id: `bond:${status.id}:${memberIds.join('+')}`,
        text: `${asked}, do you think we're ready for ${status.name.toLowerCase().replace(/^an? /, '')}?`,
        cue: `${player} is asking ${asked} for ${status.name}${statusOf(content, current) ? `, in place of ${statusOf(content, current)!.name}` : ''}. It is possible: if ${names.length === 1 ? 'she wants' : 'they want'} it, call propose_relationship with ${status.id}; if not, say why, in character.`
      })
    }
  }
  return suggestions
}

/** A name with its accents taken off and in lower case, for matching what is typed against it. */
export function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * The rest of a name the last word typed is the start of: the first of those given that it begins, from its first
 * letter. Nothing when the word is already a whole name, or begins none.
 */
export function completeName(names: string[], text: string): string | undefined {
  const word = text.match(/([\p{L}'-]+)$/u)?.[1]
  if (!word) return undefined
  const typed = plain(word)
  const name = names.find((one) => plain(one).startsWith(typed) && plain(one) !== typed)
  return name?.slice(word.length)
}

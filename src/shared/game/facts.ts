import { kindOf, type ContentPack, type GameState, type Item, type LoveInterest } from '../model'
import { evaluateAll } from './conditions'
import { giftReaction } from './market'

/** The kinds of thing there are to find out about a love interest, in the order they are shown. */
export const FACT_GROUPS = ['likes', 'dislikes', 'traits', 'admires', 'life', 'secrets'] as const
export type FactGroup = (typeof FACT_GROUPS)[number]

export const FACT_GROUP_NAMES: Record<FactGroup, string> = {
  likes: 'Likes',
  dislikes: 'Dislikes',
  traits: 'Nature',
  admires: 'Drawn to',
  life: 'Her life',
  secrets: 'Confided'
}

/**
 * One thing about a love interest that the player can come to know. It is written in her
 * file; whether the player knows it yet is kept in the save.
 */
export interface Fact {
  /** Stable within the love interest: `like:tea`, `trait:shy`, `studies`. */
  id: string
  group: FactGroup
  /** What the player reads once it is known: "tea", "Shy", "Reads Economics, year 4". */
  label: string
  /** More to say about it, shown with it. */
  detail?: string
  /** What the LLM is told it is, so that it knows when it has come out: "she likes tea". */
  telling: string
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Everything there is to find out about a love interest, drawn from her file. */
export function factsOf(content: ContentPack, li: LoveInterest): Fact[] {
  const first = li.name.split(' ')[0]
  const facts: Fact[] = [
    ...li.likes.map((like): Fact => ({ id: `like:${slug(like)}`, group: 'likes', label: like, telling: `${first} likes ${like}` })),
    ...li.dislikes.map((dislike): Fact => ({ id: `dislike:${slug(dislike)}`, group: 'dislikes', label: dislike, telling: `${first} dislikes ${dislike}` })),
    ...content.traits
      .filter((trait) => li.traitIds.includes(trait.id))
      .map((trait): Fact => ({ id: `trait:${trait.id}`, group: 'traits', label: trait.name, detail: trait.definition, telling: `${first} is ${trait.name.toLowerCase()}: ${trait.definition}` })),
    ...li.admires.map((stat): Fact => ({ id: `admires:${stat}`, group: 'admires', label: stat, telling: `${first} is drawn to ${stat} in a man` }))
  ]

  const kind = kindOf(li)
  if (kind === 'student' && li.studies) {
    const year = li.studies.level >= 5 ? 'a graduate' : `year ${li.studies.level}`
    facts.push({ id: 'studies', group: 'life', label: `Reads ${li.studies.subject}, ${year}`, telling: `what ${first} studies (${li.studies.subject})` })
  } else if (kind === 'teacher' && li.teaching) {
    const subjects = li.teaching.subjects.map((s) => s.subject).join(' and ')
    facts.push({ id: 'teaching', group: 'life', label: `Teaches ${subjects}, ${li.teaching.department}`, telling: `what ${first} teaches (${subjects})` })
  }
  facts.push({ id: 'age', group: 'life', label: `${li.age} years old`, telling: `${first}'s age (${li.age})` })
  if (li.birthday) {
    const month = content.calendar.months.find((m) => m.id === li.birthday?.month)?.name ?? li.birthday.month
    facts.push({ id: 'birthday', group: 'life', label: `Born on ${li.birthday.day} ${month}`, telling: `${first}'s birthday (${li.birthday.day} ${month})` })
  }
  if (li.room) {
    const where = content.locations.find((l) => l.id === li.room?.locationId)?.name ?? li.room.locationId
    facts.push({ id: 'room', group: 'life', label: `Lives in ${li.room.name}, at ${where}`, detail: li.room.description, telling: `where ${first} lives (${li.room.name}, at ${where})` })
  }
  li.ai.secrets.forEach((secret, index) => {
    if (secret.text.trim() === '') return
    facts.push({ id: `secret:${index}`, group: 'secrets', label: secret.text, telling: `the secret: ${secret.text}` })
  })
  return facts
}

/** The ids of the facts about a love interest that the player knows. */
export function revealedIds(state: GameState, loveInterestId: string): string[] {
  return state.revealed[loveInterestId] ?? []
}

/**
 * What the player does not yet know about a love interest and could now be told: every
 * fact not revealed, leaving out secrets she is not yet ready to share.
 */
export function hiddenFacts(content: ContentPack, state: GameState, li: LoveInterest): Fact[] {
  const known = revealedIds(state, li.id)
  return factsOf(content, li).filter((fact) => {
    if (known.includes(fact.id)) return false
    if (fact.group !== 'secrets') return true
    const secret = li.ai.secrets[Number(fact.id.split(':')[1])]
    return secret !== undefined && evaluateAll(secret.revealWhen, { state, content, loveInterestId: li.id })
  })
}

/** Marks facts about a love interest as known. Ids that are not facts of hers, or already known, change nothing. */
export function revealFacts(content: ContentPack, state: GameState, loveInterestId: string, factIds: string[]): GameState {
  const li = content.loveInterests.find((c) => c.id === loveInterestId)
  if (!li) return state
  const real = new Set(factsOf(content, li).map((fact) => fact.id))
  const known = revealedIds(state, loveInterestId)
  const fresh = [...new Set(factIds)].filter((id) => real.has(id) && !known.includes(id))
  if (fresh.length === 0) return state
  return { ...state, revealed: { ...state.revealed, [loveInterestId]: [...known, ...fresh] } }
}

/**
 * What a gift gives away about her taste: one she loves shows the like it matched, one
 * she dislikes shows the dislike. A gift she merely accepts shows nothing.
 */
export function factsFromGift(li: LoveInterest, item: Item): string[] {
  const reaction = giftReaction(item, li)
  const tags = item.tags.map((tag) => tag.toLowerCase())
  if (reaction === 'loved') return li.likes.filter((like) => tags.includes(like.toLowerCase())).map((like) => `like:${slug(like)}`)
  if (reaction === 'disliked') return li.dislikes.filter((dislike) => tags.includes(dislike.toLowerCase())).map((dislike) => `dislike:${slug(dislike)}`)
  return []
}

/** "Faye likes potions", for the line that tells the player what they have just learned. */
export function describeLearned(content: ContentPack, loveInterestId: string, factId: string): string | undefined {
  const li = content.loveInterests.find((c) => c.id === loveInterestId)
  const fact = li && factsOf(content, li).find((f) => f.id === factId)
  if (!li || !fact) return undefined
  const first = li.name.split(' ')[0]
  const about: Record<FactGroup, string> = {
    likes: `${first} likes ${fact.label}`,
    dislikes: `${first} dislikes ${fact.label}`,
    traits: `${first} is ${fact.label.toLowerCase()}`,
    admires: `${first} is drawn to ${fact.label}`,
    life: `${first}: ${fact.label}`,
    secrets: `${first} confided in you`
  }
  return about[fact.group]
}

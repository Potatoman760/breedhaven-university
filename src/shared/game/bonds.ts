import type { Bond, BondProposal, ContentPack, GameState, RelationshipStatus, TieLevel } from '../model'
import type { PerformCheck } from './activities'
import { stageFor, stageRank } from './relationships'
import { firstNames } from './scene'

// What sharing a scene does for how two love interests feel about each other.
const SCENE_TIE_GAIN = 5

/** The key two love interests' tie is stored under, whichever order they are named in. */
export function tieKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

/** How two love interests feel about each other: what play has made of it, else what the content starts them at. */
export function tieOf(content: ContentPack, state: GameState, a: string, b: string): number {
  const authored = content.relationships.ties.find((t) => tieKey(t.a, t.b) === tieKey(a, b))
  return state.ties[tieKey(a, b)] ?? authored?.affection ?? 0
}

/** The highest tie level the value has reached, if the content defines any. */
export function tieLevel(content: ContentPack, value: number): TieLevel | undefined {
  return [...content.relationships.tieLevels].sort((x, y) => x.min - y.min).filter((level) => level.min <= value).at(-1)
}

export function changeTie(content: ContentPack, state: GameState, a: string, b: string, amount: number): GameState {
  if (a === b) return state
  const value = Math.min(content.relationships.meterMax, Math.max(0, tieOf(content, state, a, b) + amount))
  return { ...state, ties: { ...state.ties, [tieKey(a, b)]: value } }
}

/** Everyone who shared a scene grows a little closer to each other, pair by pair. */
export function growTies(content: ContentPack, state: GameState, cast: string[], amount = SCENE_TIE_GAIN): GameState {
  let after = state
  for (let i = 0; i < cast.length; i++) {
    for (let j = i + 1; j < cast.length; j++) after = changeTie(content, after, cast[i], cast[j], amount)
  }
  return after
}

/** The arrangement a love interest is in with the player, if any. Each is in at most one. */
export function bondOf(state: GameState, loveInterestId: string): Bond | undefined {
  return state.bonds.find((bond) => bond.memberIds.includes(loveInterestId))
}

export function statusOf(content: ContentPack, bond: Pick<Bond, 'statusId'> | undefined): RelationshipStatus | undefined {
  return content.relationships.statuses.find((s) => s.id === bond?.statusId)
}

/**
 * Whether the player and these love interests can enter an arrangement: the right number
 * of people, each far enough along with the player, close enough to each other where the
 * arrangement joins them too, and nobody left outside a promise of exclusivity.
 */
export function canBond(content: ContentPack, state: GameState, proposal: BondProposal): PerformCheck {
  const status = statusOf(content, proposal)
  if (!status) return { ok: false, reasons: [`There is no arrangement called "${proposal.statusId}"`] }
  const ids = [...new Set(proposal.memberIds)]
  const reasons: string[] = []
  const name = (id: string) => firstNames(content, [id])

  if (ids.some((id) => !content.loveInterests.some((li) => li.id === id))) reasons.push('Someone named is not known')
  if (ids.length < status.minMembers || ids.length > status.maxMembers) {
    const wanted = status.minMembers === status.maxMembers ? `${status.minMembers}` : `${status.minMembers} to ${status.maxMembers}`
    reasons.push(`${status.name} is between ${state.player.name} and ${wanted} other${status.maxMembers === 1 ? '' : 's'}`)
  }
  const needed = status.minStage
  if (needed) {
    const stage = content.relationships.stages.find((s) => s.id === needed)
    for (const id of ids) {
      const now = stageFor(content.relationships, state.relationships[id]?.affection ?? 0)
      if (stageRank(content.relationships, now.id) < stageRank(content.relationships, needed)) {
        reasons.push(`It is too soon for ${name(id)}: ${name(id)} and ${state.player.name} are only ${now.name}, not yet ${stage?.name ?? needed}`)
      }
    }
  }
  if (status.mutual) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (tieOf(content, state, ids[i], ids[j]) < status.minTie) {
          reasons.push(`${name(ids[i])} and ${name(ids[j])} are not close enough to each other yet`)
        }
      }
    }
  }
  // A promise to see only each other holds until it is changed with the people it was made to.
  const outside = state.bonds.filter((bond) => !bond.memberIds.every((id) => ids.includes(id)))
  const promised = outside.filter((bond) => statusOf(content, bond)?.exclusive)
  for (const bond of promised) {
    reasons.push(`${state.player.name} has promised to see only ${firstNames(content, bond.memberIds)}`)
  }
  if (status.exclusive && outside.length > 0) {
    reasons.push(`${state.player.name} is also with ${firstNames(content, outside.flatMap((b) => b.memberIds))}, which ${status.name} would not allow`)
  }
  return { ok: reasons.length === 0, reasons }
}

/** Enters the arrangement. Whatever any of its members had with the player before is replaced by it. */
export function formBond(content: ContentPack, state: GameState, proposal: BondProposal): GameState {
  const check = canBond(content, state, proposal)
  if (!check.ok) throw new Error(`Cannot become "${proposal.statusId}": ${check.reasons.join('; ')}`)
  const memberIds = [...new Set(proposal.memberIds)]
  return {
    ...state,
    bonds: [
      ...state.bonds
        .map((bond) => ({ ...bond, memberIds: bond.memberIds.filter((id) => !memberIds.includes(id)) }))
        .filter((bond) => bond.memberIds.length > 0),
      { statusId: proposal.statusId, memberIds, since: state.time }
    ]
  }
}

/** Takes a love interest out of whatever arrangement they are in. Others in it stay, if it still makes sense for them. */
export function endBond(content: ContentPack, state: GameState, loveInterestId: string): GameState {
  return {
    ...state,
    bonds: state.bonds
      .map((bond) => ({ ...bond, memberIds: bond.memberIds.filter((id) => id !== loveInterestId) }))
      .filter((bond) => bond.memberIds.length >= (statusOf(content, bond)?.minMembers ?? 1))
  }
}

/** Applies an accepted proposal: a new arrangement, or the end of the one the first person named is in. */
export function acceptBond(content: ContentPack, state: GameState, proposal: BondProposal): GameState {
  if (proposal.statusId !== END_BOND) return formBond(content, state, proposal)
  return proposal.memberIds.reduce((current, id) => endBond(content, current, id), state)
}

/** The status id a proposal carries when it is to end things, not begin them. */
export const END_BOND = 'none'

/** "Open triad with Faye and Seraphine", for the player to read. */
export function describeBond(content: ContentPack, bond: Pick<Bond, 'statusId' | 'memberIds'>): string {
  const status = statusOf(content, bond)
  const who = firstNames(content, bond.memberIds)
  return bond.statusId === END_BOND ? `End things with ${who}` : `${status?.name ?? bond.statusId} with ${who}`
}

/**
 * Told to a character: what they and the player are to each other, who else is part of
 * it, who else the player is with (when the arrangement means they would know), and how
 * they feel about the other love interests they have reason to have feelings about.
 */
export function describeBonds(content: ContentPack, state: GameState, loveInterestId: string, alsoPresent: string[] = []): string[] {
  const { name } = state.player
  const lines: string[] = []
  const bond = bondOf(state, loveInterestId)
  const status = statusOf(content, bond)
  const partners = bond?.memberIds.filter((id) => id !== loveInterestId) ?? []

  if (bond && status) {
    lines.push(`You and ${name} are in a relationship: ${status.name}. ${status.description} ${status.guidance}`.trim())
    if (partners.length > 0) {
      lines.push(
        `${firstNames(content, partners)} ${partners.length > 1 ? 'are' : 'is'} part of it too` +
          (status.mutual ? `: you are with ${partners.length > 1 ? 'them' : 'her'} as well as with ${name}.` : '.')
      )
    }
    if (!status.exclusive) {
      const elsewhere = state.bonds.filter((other) => other !== bond).flatMap((other) => other.memberIds)
      lines.push(
        elsewhere.length > 0
          ? `You know ${name} is also with ${firstNames(content, elsewhere)}, and that is within what you agreed.`
          : `${name} is free to see others under what you agreed, though you know of nobody else at present.`
      )
    }
  } else if (content.relationships.statuses.length > 0) {
    lines.push(`You and ${name} have made each other no promises.`)
  }

  // Feelings about the others: partners, anyone here now, and anyone they have come to know.
  const others = content.loveInterests.filter((li) => li.id !== loveInterestId)
  for (const other of others) {
    const value = tieOf(content, state, loveInterestId, other.id)
    const level = tieLevel(content, value)
    const note = content.relationships.ties.find((t) => tieKey(t.a, t.b) === tieKey(loveInterestId, other.id))?.note
    const relevant = partners.includes(other.id) || alsoPresent.includes(other.id) || value > 0 || note
    if (!relevant || !level) continue
    lines.push([`You and ${other.name.split(' ')[0]}: ${level.name}.`, level.description, note].filter(Boolean).join(' '))
  }
  return lines
}

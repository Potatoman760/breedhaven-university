import type { Bond, BondProposal, ContentPack, GameState, RelationshipStage, RelationshipStatus, TieLevel } from '../model'
import type { PerformCheck } from './activities'
import { stageFor, stageRank } from './relationships'
import { factor } from './modifiers'
import { firstNames } from './scene'
import { t } from '../i18n'

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

/** Everyone who shared a scene grows a little closer to each other, pair by pair: more so where he understands the pull between them. */
export function growTies(content: ContentPack, state: GameState, cast: string[], amount = SCENE_TIE_GAIN): GameState {
  if (amount > 0) amount = Math.round(amount * factor(content, state, 'bonds'))
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
 * of people, close enough to each other where the arrangement joins them too, and nobody
 * left outside a promise of exclusivity. How far along each is with the player does not
 * stand in the way: someone who asks for it means it, and is brought up to it when it is agreed.
 */
export function canBond(content: ContentPack, state: GameState, proposal: BondProposal): PerformCheck {
  const status = statusOf(content, proposal)
  if (!status) return { ok: false, reasons: [t('scene.bonds.noStatus', { id: proposal.statusId })] }
  const ids = [...new Set(proposal.memberIds)]
  const reasons: string[] = []
  const name = (id: string) => firstNames(content, [id])

  if (ids.some((id) => !content.loveInterests.some((li) => li.id === id))) reasons.push(t('scene.bonds.unknown'))
  if (ids.length < status.minMembers || ids.length > status.maxMembers) {
    const wanted = status.minMembers === status.maxMembers ? `${status.minMembers}` : t('scene.bonds.range', { min: status.minMembers, max: status.maxMembers })
    reasons.push(t('scene.bonds.size', { status: status.name, player: state.player.name, wanted, max: status.maxMembers }))
  }
  if (status.mutual) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (tieOf(content, state, ids[i], ids[j]) < status.minTie) {
          reasons.push(t('scene.bonds.notClose', { a: name(ids[i]), b: name(ids[j]) }))
        }
      }
    }
  }
  // A promise to see only each other holds until it is changed with the people it was made to.
  const outside = state.bonds.filter((bond) => !bond.memberIds.every((id) => ids.includes(id)))
  const promised = outside.filter((bond) => statusOf(content, bond)?.exclusive)
  for (const bond of promised) {
    reasons.push(t('scene.bonds.promised', { player: state.player.name, names: firstNames(content, bond.memberIds) }))
  }
  if (status.exclusive && outside.length > 0) {
    reasons.push(t('scene.bonds.exclusive', { player: state.player.name, names: firstNames(content, outside.flatMap((b) => b.memberIds)), status: status.name }))
  }
  return { ok: reasons.length === 0, reasons }
}

/**
 * Those an arrangement would bring further along with the player than they are, and the stage it brings them to: the
 * one the arrangement is for. Someone already there, or past it, is not named.
 */
export function bondLifts(content: ContentPack, state: GameState, proposal: BondProposal): { id: string; stage: RelationshipStage }[] {
  const needed = content.relationships.stages.find((s) => s.id === statusOf(content, proposal)?.minStage)
  if (!needed) return []
  return [...new Set(proposal.memberIds)].flatMap((id) => {
    const now = stageFor(content.relationships, state.relationships[id]?.affection ?? 0)
    return state.relationships[id] !== undefined && stageRank(content.relationships, now.id) < stageRank(content.relationships, needed.id) ? [{ id, stage: needed }] : []
  })
}

/**
 * Enters the arrangement. Whatever any of its members had with the player before is replaced by it, and anyone not
 * yet as far along with him as the arrangement is for is brought up to it: her affection is raised to where that stage begins.
 */
export function formBond(content: ContentPack, state: GameState, proposal: BondProposal): GameState {
  const check = canBond(content, state, proposal)
  if (!check.ok) throw new Error(`Cannot become "${proposal.statusId}": ${check.reasons.join('; ')}`)
  const memberIds = [...new Set(proposal.memberIds)]
  const relationships = { ...state.relationships }
  for (const { id, stage } of bondLifts(content, state, proposal)) relationships[id] = { ...relationships[id], affection: Math.max(relationships[id].affection, stage.minAffection) }
  return {
    ...state,
    relationships,
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

/** "Open throuple with Faye and Seraphine", for the player to read. */
export function describeBond(content: ContentPack, bond: Pick<Bond, 'statusId' | 'memberIds'>): string {
  const who = firstNames(content, bond.memberIds)
  return bond.statusId === END_BOND ? t('scene.bonds.end', { who }) : t('scene.bonds.with', { status: bondName(content, bond), who })
}

/** "Open throuple", or the ending of one, without who it is with. */
export function bondName(content: ContentPack, bond: Pick<Bond, 'statusId'>): string {
  return bond.statusId === END_BOND ? t('scene.bonds.endName') : (statusOf(content, bond)?.name ?? bond.statusId)
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
    lines.push(t('scene.bonds.inBond', { player: name, status: status.name, description: status.description, guidance: status.guidance }).trim())
    if (partners.length > 0) {
      lines.push(t('scene.bonds.partners', { names: firstNames(content, partners), count: partners.length, mutual: status.mutual, player: name }))
    }
    if (!status.exclusive) {
      const elsewhere = state.bonds.filter((other) => other !== bond).flatMap((other) => other.memberIds)
      lines.push(
        elsewhere.length > 0
          ? t('scene.bonds.alsoWith', { player: name, names: firstNames(content, elsewhere) })
          : t('scene.bonds.free', { player: name })
      )
    }
  } else if (content.relationships.statuses.length > 0) {
    lines.push(t('scene.bonds.none', { player: name }))
  }

  // Feelings about the others: partners, anyone here now, and anyone they have come to know.
  const others = content.loveInterests.filter((li) => li.id !== loveInterestId)
  for (const other of others) {
    const value = tieOf(content, state, loveInterestId, other.id)
    const level = tieLevel(content, value)
    const note = content.relationships.ties.find((t) => tieKey(t.a, t.b) === tieKey(loveInterestId, other.id))?.note
    const relevant = partners.includes(other.id) || alsoPresent.includes(other.id) || value > 0 || note
    if (!relevant || !level) continue
    lines.push([t('scene.bonds.tie', { first: other.name.split(' ')[0], level: level.name }), level.description, note].filter(Boolean).join(' '))
  }
  return lines
}

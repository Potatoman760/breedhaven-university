import { HIM, type ContentPack, type GameState } from '../model'
import { nodeAt, pregnancyPower, roleOf } from './expedition'
import { pregnancyStage } from './pregnancy'
import { stageFor } from './relationships'
import { namesHer } from './scene'

/**
 * A few words between the party as a fight below begins, and again when a depth's guardian is down and its anchor
 * set. It is the one place the LLM has in the Undercroft: asked once each time, for a handful of lines and no more, with a cut-down account of who is there and what they are
 * looking at. Nothing is asked of the player in return, and nothing in the fight depends on it.
 */

// How many lines are kept of what comes back, and how long one may be.
export const BANTER_LINES = 4
const LINE_CHARS = 220

const firstName = (name: string): string => name.split(' ')[0]

/** When they speak: before a fight, or with a depth's guardian beaten and its anchor set. */
export const BANTER_MOMENTS = ['before', 'won'] as const
export type BanterMoment = (typeof BANTER_MOMENTS)[number]

/** The women of the party in a run, as the content has them. */
function partyOf(content: ContentPack, state: GameState) {
  const run = state.expedition.run
  return (run?.party ?? []).flatMap((fighter) => {
    const li = fighter.id === HIM ? undefined : content.loveInterests.find((one) => one.id === fighter.id)
    return li ? [{ li, fighter }] : []
  })
}

/** Whether there is anyone to say anything: a fight about to begin, or a depth just won, and at least one woman in the party. */
export function banterDue(content: ContentPack, state: GameState, moment: BanterMoment = 'before'): boolean {
  const run = state.expedition.run
  if (!content.expedition || !run || partyOf(content, state).length === 0) return false
  return moment === 'won' ? run.over === 'won' : run.fight !== undefined && !run.done && !run.over
}

/** The prompt asking for the party's few lines: before the fight he is in, or over the guardian they have just beaten. */
export function buildBanterPrompt(content: ContentPack, state: GameState, moment: BanterMoment = 'before'): { system: string; user: string } {
  const config = content.expedition!
  const run = state.expedition.run!
  const depth = config.depths[run.depth]
  const node = nodeAt(content, run)
  const player = state.player.name
  const party = partyOf(content, state)
  const foes = (run.fight?.foes ?? []).map((foe) => config.enemies.find((enemy) => enemy.id === foe.enemyId)!)
  const names = party.map(({ li }) => firstName(li.name))
  // What is lying by the anchor, the first time it is set.
  const won = moment === 'won' && !state.expedition.relics.includes(depth.relic.id) ? depth.relic : undefined
  const system = [
    `You write a few lines of talk between the women with ${player} ${moment === 'won' ? 'just after a hard fight is won' : 'as a fight is about to begin'}, in a fantasy game. They are in ${config.name}: the old places under their University, where slipped ward-lines have let raw magic pool and take shape. ${player} is the one man with them; he has no magic, and the anchors down here only hold under his hands. They are here in secret.`,
    `Reply with ${party.length === 1 ? '2 or 3' : '3 or 4'} lines and nothing else, each on its own line as "Name: what she says", using only ${names.join(' and ')}.`,
    `- Each line under 25 words, in her own voice, about ${moment === 'won' ? 'what they just did' : 'what is in front of them'}, each other, or ${player}. They may tease, steady or needle one another.`,
    `- Spoken words only: no narration, no asterisks, no hidden tags. Nothing said by ${player}, and nothing that waits on an answer from him.`,
    'Write in US English.'
  ].join('\n')
  const user = [
    `Where: ${depth.name}. ${depth.appearance}`,
    `${moment === 'won' ? 'What they have just beaten, the guardian of this depth' : `What they face${node.kind === 'guardian' ? ', the guardian of this depth' : ''}`}: ${[...new Set(foes)].map((enemy) => `${foes.filter((one) => one === enemy).length > 1 ? `${foes.filter((one) => one === enemy).length} of ` : ''}${enemy.name} (${enemy.appearance})`).join('; ')}`,
    moment === 'won'
      ? `${player} has set his hands on the anchor of ${depth.name}, and it holds. They are done here, and about to climb back up.${won ? ` Lying by it: ${won.name}.` : ''}`
      : run.node > 0
        ? `They have already come through ${run.node} stop${run.node === 1 ? '' : 's'} on the way down.`
        : 'They have only just come down the stair.',
    '',
    ...party.flatMap(({ li, fighter }) => {
      const role = roleOf(config, li)
      const feelings = state.relationships[li.id]
      const stage = pregnancyStage(content, state, li.id)
      const hurt = fighter.footing < fighter.max * 0.5
      const fell = run.downed.includes(li.id)
      return [
        `${firstName(li.name)}, ${li.age}. ${li.personality}`,
        li.ai.speechPattern ? `  Voice: ${li.ai.speechPattern}` : '',
        `  Here as the party's ${role?.name.toLowerCase() ?? 'mage'}. To ${player} she is: ${stageFor(content.relationships, feelings?.affection ?? 0).name.toLowerCase()}.` +
          `${stage && (pregnancyPower(content, state, li.id) ?? 1) > 1 ? ` She is carrying his child (${stage.name.toLowerCase()}), and her magic runs far stronger and wilder for it.` : ''}` +
          `${moment === 'won' ? (fell ? ' She went down in the fight and had to be helped up.' : hurt ? ' She is hurt.' : '') : hurt ? ' She is already hurt.' : ''}`
      ].filter(Boolean)
    })
  ].join('\n')
  return { system, user }
}

/** One thing said before a fight: who said it, and what. */
export interface BanterLine {
  speakerId: string
  text: string
}

/**
 * Reads what came back into lines, each given to whoever of the party it names. A line that names nobody in the
 * party, or is said by him, is left out, as is anything past the few that were asked for.
 */
export function parseBanter(reply: string, content: ContentPack, state: GameState): BanterLine[] {
  const party = partyOf(content, state)
  const lines: BanterLine[] = []
  for (const raw of reply.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').split('\n')) {
    const found = /^\s*[-*"“]*\s*([^:"”]{1,40}?)\s*[*"”]*\s*:\s*(.+)$/.exec(raw)
    if (!found) continue
    const speaker = party.find(({ li }) => namesHer(found[1], li))
    // What is said is said aloud: anything wrapped round it comes off, and stage directions between asterisks go.
    const text = found[2].replace(/\*[^*]*\*/g, '').replace(/\[[^\]]*\]/g, '').trim().replace(/^["“]+|["”]+$/g, '').trim().slice(0, LINE_CHARS)
    if (speaker && text !== '') lines.push({ speakerId: speaker.li.id, text })
    if (lines.length >= BANTER_LINES) break
  }
  return lines
}

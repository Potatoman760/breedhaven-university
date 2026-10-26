import { HIM, type ContentPack, type GameState, type LoveInterest } from '../model'
import { nodeAt, pregnancyPower, roleOf } from './expedition'
import { pregnancyStage } from './pregnancy'
import { stageFor } from './relationships'
import { namesHer } from './scene'
import { t } from '../i18n'

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
    t('llm.banter.systemRole', { player, moment, place: config.name }),
    t('llm.banter.systemReply', { single: party.length === 1, names: names.join(t('llm.banter.and')) }),
    t('llm.banter.systemLines', { moment, player }),
    t('llm.banter.systemSpoken', { player }),
    t('llm.banter.systemEnglish')
  ].join('\n')
  const user = [
    t('llm.banter.where', { name: depth.name, appearance: depth.appearance }),
    t('llm.banter.foes', {
      moment,
      guardian: node.kind === 'guardian',
      foes: [...new Set(foes)].map((enemy) => t('llm.banter.foe', { count: foes.filter((one) => one === enemy).length, name: enemy.name, appearance: enemy.appearance })).join('; ')
    }),
    moment === 'won'
      ? t('llm.banter.anchored', { player, depth: depth.name, found: won !== undefined, relic: won?.name })
      : run.node > 0
        ? t('llm.banter.stops', { count: run.node })
        : t('llm.banter.justDown'),
    '',
    ...party.flatMap(({ li, fighter }) => {
      const role = roleOf(config, li)
      const feelings = state.relationships[li.id]
      const stage = pregnancyStage(content, state, li.id)
      const hurt = fighter.footing < fighter.max * 0.5
      const fell = run.downed.includes(li.id)
      return [
        t('llm.banter.woman', { name: firstName(li.name), age: li.age, personality: li.personality }),
        li.ai.speechPattern ? t('llm.banter.voice', { text: li.ai.speechPattern }) : '',
        t('llm.banter.role', { role: role?.name.toLowerCase() ?? t('llm.banter.mage'), player, stage: stageFor(content.relationships, feelings?.affection ?? 0).name.toLowerCase() }) +
          `${stage && (pregnancyPower(content, state, li.id) ?? 1) > 1 ? t('llm.banter.carrying', { stage: stage.name.toLowerCase() }) : ''}` +
          `${moment === 'won' ? (fell ? t('llm.banter.fell') : hurt ? t('llm.banter.hurt') : '') : hurt ? t('llm.banter.alreadyHurt') : ''}`
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
  return readLines(reply, partyOf(content, state).map(({ li }) => li))
}

/** Lines of "Name: what she says", each given to whoever of `people` it names; the rest left out. */
export function readLines(reply: string, people: LoveInterest[], most = BANTER_LINES): BanterLine[] {
  const lines: BanterLine[] = []
  for (const raw of reply.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').split('\n')) {
    const found = /^\s*[-*"“]*\s*([^:"”]{1,40}?)\s*[*"”]*\s*:\s*(.+)$/.exec(raw)
    if (!found) continue
    const speaker = people.find((li) => namesHer(found[1], li))
    // What is said is said aloud: anything wrapped round it comes off, and stage directions between asterisks go.
    const text = found[2].replace(/\*[^*]*\*/g, '').replace(/\[[^\]]*\]/g, '').trim().replace(/^["“]+|["”]+$/g, '').trim().slice(0, LINE_CHARS)
    if (speaker && text !== '') lines.push({ speakerId: speaker.id, text })
    if (lines.length >= most) break
  }
  return lines
}

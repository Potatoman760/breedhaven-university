import type { ContentPack, GameState } from '../model'
import { readLines, type BanterLine } from './banter'
import { stageFor } from './relationships'
import { t, type MessageKey } from '../i18n'

/**
 * A few words from the women with him at a moment the game plays for itself: his date, or his two, at the pond as the
 * Lantern Festival's lanterns are let go; those coming with him on the drive to a trip, and on the drive home. Asked of
 * the LLM once, for a handful of lines; nothing waits on it, and the moment plays with or without them.
 */

export const MOMENTS = ['lanterns', 'drive-there', 'drive-home', 'trip-booked', 'group'] as const
export type Moment = (typeof MOMENTS)[number]

const firstName = (name: string): string => name.split(' ')[0]

/** Where they are and what is about to happen, and what the lines are about: for each moment. */
const SETTING: Record<Moment, { where: MessageKey; about: MessageKey; tone: MessageKey }> = {
  lanterns: { where: 'llm.momentLines.lanterns.where', about: 'llm.momentLines.lanterns.about', tone: 'llm.momentLines.lanterns.tone' },
  'drive-there': { where: 'llm.momentLines.driveThere.where', about: 'llm.momentLines.driveThere.about', tone: 'llm.momentLines.driveThere.tone' },
  'trip-booked': { where: 'llm.momentLines.tripBooked.where', about: 'llm.momentLines.tripBooked.about', tone: 'llm.momentLines.tripBooked.tone' },
  group: { where: 'llm.momentLines.group.where', about: 'llm.momentLines.group.about', tone: 'llm.momentLines.group.tone' },
  'drive-home': { where: 'llm.momentLines.driveHome.where', about: 'llm.momentLines.driveHome.about', tone: 'llm.momentLines.driveHome.tone' }
}

/** The prompt asking for the lines. */
export function buildMomentPrompt(content: ContentPack, state: GameState, ids: string[], moment: Moment, history: { speaker: string; text: string }[] = []): { system: string; user: string } {
  const player = state.player.name
  const women = ids.flatMap((id) => content.loveInterests.find((li) => li.id === id) ?? [])
  const names = women.map((li) => firstName(li.name))
  const many = women.length > 1
  const both = names.join(t('llm.momentLines.and'))
  const said = { player, names: both, many }
  const setting = { where: t(SETTING[moment].where, said), about: t(SETTING[moment].about, said), tone: t(SETTING[moment].tone, said) }
  const system = [
    t('llm.momentLines.systemRole', { where: setting.where }),
    moment === 'trip-booked'
      ? t('llm.momentLines.replyBooked', { names: both })
      : moment === 'group'
        ? t('llm.momentLines.replyGroup', { names: names.join(t('llm.momentLines.or')) })
        : t('llm.momentLines.reply', { single: women.length === 1, names: both }),
    t('llm.momentLines.lines', { tone: setting.tone, about: setting.about, many }),
    t('llm.momentLines.spoken', { player }),
    t('llm.momentLines.english')
  ].join('\n')
  const user = women
    .flatMap((li) => [
      t('llm.momentLines.woman', { name: firstName(li.name), age: li.age, personality: li.personality }),
      li.ai.speechPattern ? t('llm.momentLines.voice', { text: li.ai.speechPattern }) : '',
      t('llm.momentLines.stage', { player, stage: stageFor(content.relationships, state.relationships[li.id]?.affection ?? 0).name.toLowerCase() })
    ])
    .filter(Boolean)
    .concat(history.length > 0 ? ['', t('llm.momentLines.chatSoFar'), ...history.slice(-12).map((line) => `${line.speaker}: ${line.text}`)] : [])
    .join('\n')
  return { system, user }
}

/** What came back, as lines said by those it was asked of. */
export function parseMomentLines(reply: string, content: ContentPack, ids: string[]): BanterLine[] {
  return readLines(reply, content.loveInterests.filter((li) => ids.includes(li.id)))
}

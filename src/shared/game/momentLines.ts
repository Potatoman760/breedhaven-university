import type { ContentPack, GameState } from '../model'
import { readLines, type BanterLine } from './banter'
import { stageFor } from './relationships'

/**
 * A few words from the women with him at a moment the game plays for itself: his date, or his two, at the pond as the
 * Lantern Festival's lanterns are let go; those coming with him on the drive to a trip, and on the drive home. Asked of
 * the LLM once, for a handful of lines; nothing waits on it, and the moment plays with or without them.
 */

export const MOMENTS = ['lanterns', 'drive-there', 'drive-home', 'trip-booked', 'group'] as const
export type Moment = (typeof MOMENTS)[number]

const firstName = (name: string): string => name.split(' ')[0]

/** Where they are and what is about to happen, and what the lines are about: for each moment. */
const SETTING: Record<Moment, (player: string, names: string, many: boolean) => { where: string; about: string; tone: string }> = {
  lanterns: (player, names, many) => ({
    where: `at the Lantern Festival, the University's night for lovers. ${player} has brought ${names} as his date${many ? 's' : ''}. They stand at the edge of the Physic Garden pond under the stars, each holding a paper lantern lit with a wish, about to let it go into the sky.`,
    about: `the night, the lantern, her wish, or ${player}`,
    tone: 'tender, a little shy or bold as she is'
  }),
  'drive-there': (player, names) => ({
    where: `in a car on the winding road into the hills, on the way to Saltmere Springs, a hot-spring spa town, for the Mistmoon Break. ${player} invited ${names}; it is the start of four days away together.`,
    about: `the trip, the hot springs, what she wants to do there, or being away with ${player}`,
    tone: 'excited, playful, a little flirty as she is'
  }),
  'trip-booked': (player, names, many) => ({
    where: `in a Bloomr group chat ${player} has just made for the trip he booked: four days at Saltmere Springs, a hot-spring spa town in the hills, over the Mistmoon Break, with ${names}. He has just told ${many ? 'them' : 'her'} he booked it.`,
    about: `going, what she is looking forward to there, or ${player}`,
    tone: 'thrilled, texting as she would, an emoji or two if she uses them'
  }),
  group: (player, names) => ({
    where: `in a Bloomr group chat with ${player} and ${names}, about the trip to Saltmere Springs over the Mistmoon Break. The chat so far is below; ${player} has just written.`,
    about: `what he just said, the trip, or each other`,
    tone: 'texting as she would, short'
  }),
  'drive-home': (player, names) => ({
    where: `in a car on the road back from Saltmere Springs, after four days at the hot springs with ${player}. ${names} ${names.includes(' and ') ? 'are' : 'is'} with him, tired and happy, on the way back to the University.`,
    about: `the best moments of the trip, going back, or ${player}`,
    tone: 'warm, wistful, teasing as she is'
  })
}

/** The prompt asking for the lines. */
export function buildMomentPrompt(content: ContentPack, state: GameState, ids: string[], moment: Moment, history: { speaker: string; text: string }[] = []): { system: string; user: string } {
  const player = state.player.name
  const women = ids.flatMap((id) => content.loveInterests.find((li) => li.id === id) ?? [])
  const names = women.map((li) => firstName(li.name))
  const setting = SETTING[moment](player, names.join(' and '), women.length > 1)
  const system = [
    `You write a few lines said ${setting.where}`,
    moment === 'trip-booked'
      ? `Reply with exactly one line from each of ${names.join(' and ')}, each on its own line as "Name: what she writes".`
      : moment === 'group'
        ? `Reply with 1 or 2 lines and nothing else, each on its own line as "Name: what she writes", from ${names.join(' or ')}.`
        : `Reply with ${women.length === 1 ? '2' : '3 or 4'} lines and nothing else, each on its own line as "Name: what she says", using only ${names.join(' and ')}.`,
    `- Each line under 20 words, in her own voice: ${setting.tone}, about ${setting.about}.${women.length > 1 ? ` They may tease or needle each other about sharing him.` : ''}`,
    `- Spoken words only: no narration, no asterisks, no hidden tags. Nothing said by ${player}, and no question that waits on his answer.`,
    'Write in US English.'
  ].join('\n')
  const user = women
    .flatMap((li) => [
      `${firstName(li.name)}, ${li.age}. ${li.personality}`,
      li.ai.speechPattern ? `  Voice: ${li.ai.speechPattern}` : '',
      `  To ${player} she is: ${stageFor(content.relationships, state.relationships[li.id]?.affection ?? 0).name.toLowerCase()}.`
    ])
    .filter(Boolean)
    .concat(history.length > 0 ? ['', 'The chat so far:', ...history.slice(-12).map((line) => `${line.speaker}: ${line.text}`)] : [])
    .join('\n')
  return { system, user }
}

/** What came back, as lines said by those it was asked of. */
export function parseMomentLines(reply: string, content: ContentPack, ids: string[]): BanterLine[] {
  return readLines(reply, content.loveInterests.filter((li) => ids.includes(li.id)))
}

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLAYER_TOKEN, createInitialState, giveContact, meet, personalise, sceneBaseline, sceneCast } from '../../shared/game'
import { sceneExtras } from '../../shared/game/npcs'
import { buildCharacterPrompt } from '../../shared/game/prompt'
import { sceneHours } from '../../shared/game/sceneMoves'
import type { ContentPack, GameState, Scene } from '../../shared/model'
import { loadContentPack } from '../content/loader'
import type { LlmTool } from './openai'
import { meetingTool, moveTool, relationshipTool } from './tools'

/**
 * Writes out, for reading, everything a scene sends to the LLM: the system prompt, the
 * tools offered with it, and the conversation so far. Run with
 * `npx vitest run src/main/ai/scenePrompt.test.ts` and read the files in `out/prompt-samples`.
 * Built from the shipped content, the way the chat handler in `src/main/index.ts` builds it.
 */
const OUT = join(process.cwd(), 'out', 'prompt-samples')

/** The request for the next reply in a scene, laid out as text. */
function sample(content: ContentPack, state: GameState, scene: Scene): string {
  const system = buildCharacterPrompt({
    content,
    state,
    extras: sceneExtras(content, state, scene),
    backgroundId: scene.backgroundId,
    roomOf: scene.roomOf,
    departed: scene.departed,
    hoursSoFar: sceneHours(state, scene),
    loveInterestId: scene.loveInterestId,
    companionIds: scene.companionIds,
    sceneBeats: scene.beats,
    look: scene,
    looks: scene.looks,
    comfort: scene.comfort,
    gifts: scene.gifts,
    recentText: scene.messages.map((m) => m.content).join('\n')
  })
  const cast = sceneCast(scene)
  const nothing = () => undefined
  const tools = [
    meetingTool(content, state, scene.loveInterestId, nothing, cast),
    relationshipTool(content, state, scene.loveInterestId, nothing, cast),
    moveTool(content, state, scene, nothing, nothing)
  ].filter((tool): tool is LlmTool => tool !== undefined)
  const rule = (title: string) => `\n\n${'='.repeat(100)}\n${title}\n${'='.repeat(100)}\n\n`
  return [
    rule(`SYSTEM PROMPT (${system.length} characters, about ${Math.round(system.length / 4)} tokens)`),
    system,
    rule(`TOOLS (${tools.length})`),
    tools.map((tool) => `--- ${tool.name}\n${tool.description}\n${JSON.stringify(tool.parameters, null, 2)}`).join('\n\n'),
    rule(`MESSAGES (${scene.messages.length})`),
    scene.messages.map((m) => `[${m.role}]\n${m.content}`).join('\n\n')
  ].join('')
}

describe('what a scene sends to the LLM', () => {
  const written = loadContentPack(join(process.cwd(), 'content', 'default'))
  // As a game reads it: under the name a new game starts with.
  const content = personalise(written, written.newGame.player.name)
  mkdirSync(OUT, { recursive: true })
  const placeName = (id: string) => content.locations.find((l) => l.id === id)?.name

  /** A game some weeks in: these people met, and things with them as given. */
  function midGame(locationId: string, people: Record<string, { affection: number; trust: number; desire: number; memories: string[] }>): GameState {
    let state: GameState = { ...createInitialState(content), locationId }
    state = meet(content, state, Object.keys(people))
    for (const [id, { memories, ...meters }] of Object.entries(people)) {
      state = {
        ...state,
        relationships: { ...state.relationships, [id]: { ...state.relationships[id], ...meters } },
        memories: { ...state.memories, [id]: memories.map((summary, i) => ({ time: state.time - 24 * (memories.length - i), summary: summary.split(PLAYER_TOKEN).join(state.player.name), level: 'normal' as const })) }
      }
    }
    return state
  }

  it('alone with one love interest, on a date', () => {
    const state = giveContact(
      midGame('great-court', {
        faye: { affection: 45, trust: 30, desire: 55, memories: ['{player} and Faye shared lunch in the Commons and she teased him about his handwriting.', 'Faye kissed {player} goodnight outside the dormitories.'] }
      }),
      'faye'
    )
    const scene: Scene = {
      loveInterestId: 'faye',
      companionIds: [],
      npc: false,
      nsfw: false,
      beats: [{ activityName: 'A stroll around the court', locationName: placeName('great-court') }],
      messages: [
        { role: 'user', content: 'I was hoping you would say yes to this.' },
        { role: 'assistant', content: '[EXPRESSION: happy]\nFaye: "You hoped? You asked so nicely I could hardly do anything else."\n*She slips her arm through yours.*' },
        { role: 'user', content: 'Where do you want to walk?' }
      ],
      gifts: [],
      conceived: [],
      departed: [],
      outfitId: 'default',
      expression: 'happy',
      baseline: sceneBaseline(state, 'faye', [])
    }
    const text = sample(content, state, scene)
    writeFileSync(join(OUT, 'scene-alone.txt'), text)
    expect(text).toContain('Faye')
  })

  it('with two love interests at once', () => {
    const state = midGame('spell-and-sip', {
      anwen: { affection: 35, trust: 40, desire: 20, memories: ['Anwen helped {player} find a book in the library and stayed to talk.'] },
      elowen: { affection: 50, trust: 25, desire: 60, memories: ['Elowen dared {player} to race her across the tiltyard and lost on purpose.'] }
    })
    const scene: Scene = {
      loveInterestId: 'elowen',
      companionIds: ['anwen'],
      npc: false,
      nsfw: false,
      beats: [{ activityName: 'Drinks', locationName: placeName('spell-and-sip') }],
      messages: [{ role: 'user', content: 'So which of you is the older twin?' }],
      gifts: [],
      conceived: [],
      departed: [],
      baseline: sceneBaseline(state, 'elowen', ['anwen'])
    }
    const text = sample(content, state, scene)
    writeFileSync(join(OUT, 'scene-group.txt'), text)
    expect(text).toContain('Anwen')
    expect(text).toContain('Elowen')
  })
})

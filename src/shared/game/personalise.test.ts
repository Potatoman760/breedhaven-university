import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLAYER_TOKEN, personalise } from './personalise'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

describe('the player in the content', () => {
  const base = fixture()
  const ana = { ...base.loveInterests[0], bio: `${PLAYER_TOKEN}'s oldest friend.`, ai: { ...base.loveInterests[0].ai, extraInstructions: `Tease ${PLAYER_TOKEN}, then ${PLAYER_TOKEN} again.` } }
  const content = { ...base, loveInterests: [ana] }

  it('is written as a token, and read under the name the game was started with', () => {
    const read = personalise(content, 'Wren')
    expect(read.loveInterests[0].bio).toBe("Wren's oldest friend.")
    expect(read.loveInterests[0].ai.extraInstructions).toBe('Tease Wren, then Wren again.')
    // What was written is left as written, for the editor and for the next game.
    expect(content.loveInterests[0].bio).toContain(PLAYER_TOKEN)
    expect(personalise(content, 'Asha').loveInterests[0].bio).toBe("Asha's oldest friend.")
    // The same game gets the same content back, and what holds no token is not copied.
    expect(personalise(content, 'Wren')).toBe(read)
    expect(read.locations).toBe(content.locations)
    expect(personalise(base, 'Wren')).toBe(base)

    const state = { ...createInitialState(read), player: { ...createInitialState(read).player, name: 'Wren' } }
    const prompt = buildCharacterPrompt({ content: read, state, loveInterestId: 'ana' })
    expect(prompt).toContain("Wren's oldest friend.")
    expect(prompt).not.toContain(PLAYER_TOKEN)
  })

  it('is named nowhere in the content but as the name a new game starts with', () => {
    const dir = join(process.cwd(), 'content', 'default')
    const name = (JSON.parse(readFileSync(join(dir, 'new-game.json'), 'utf8')) as { player: { name: string } }).player.name
    const files = [
      ...readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'new-game.json').map((f) => join(dir, f)),
      ...readdirSync(join(dir, 'love-interests')).map((f) => join(dir, 'love-interests', f))
    ]
    // Read as text and not as the file is written: a name straight after a line break in a JSON string is still a name.
    const texts = (value: unknown): string[] =>
      typeof value === 'string' ? [value] : value !== null && typeof value === 'object' ? Object.values(value).flatMap(texts) : []
    const named = new RegExp(`\\b${name}\\b`)
    const naming = files.filter((f) => texts(JSON.parse(readFileSync(f, 'utf8'))).some((text) => named.test(text)))
    expect(naming).toEqual([])
  })
})

describe('who the player is', () => {
  it('is his bio and what the player added to it, told to every character under his own name, and nothing when there is none', () => {
    const base = fixture()
    const written = { ...base, newGame: { ...base.newGame, player: { ...base.newGame.player, bio: `${PLAYER_TOKEN} is nineteen and new in town.` } } }
    // The content's own, under the name he chose when the game began.
    const read = written
    const state = createInitialState(written, 'Wren')
    const prompt = buildCharacterPrompt({ content: read, state, loveInterestId: 'ana' })
    expect(prompt).toContain('## About Wren\nWren is nineteen and new in town.')
    expect(buildCharacterPrompt({ content: base, state: createInitialState(base), loveInterestId: 'ana' })).not.toContain('## About')
    // What the player wrote of himself when the game began is told after the content's own, which stays.
    const own = createInitialState(written, 'Wren', 0, undefined, ` ${PLAYER_TOKEN} grew up on a barge. `)
    expect(own.player).toMatchObject({ bio: `${PLAYER_TOKEN} is nineteen and new in town.`, about: `${PLAYER_TOKEN} grew up on a barge.` })
    expect(buildCharacterPrompt({ content: read, state: own, loveInterestId: 'ana' })).toContain('## About Wren\nWren is nineteen and new in town.\nWren grew up on a barge.')
  })

  it('is said in his bio and not in the codex, which every character is given whole', () => {
    const dir = join(process.cwd(), 'content', 'default')
    const codex = readFileSync(join(dir, 'codex.json'), 'utf8')
    expect(codex).not.toMatch(/[Tt]he player\b/)
    expect((JSON.parse(readFileSync(join(dir, 'new-game.json'), 'utf8')) as { player: { bio: string } }).player.bio).toContain(PLAYER_TOKEN)
  })
})

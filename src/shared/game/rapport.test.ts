import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContentPack } from '../../main/content/loader'
import { kindOf } from '../model'
import { buildCharacterPrompt } from './prompt'
import { assignRapport, describeRapport, relationBetween, setRelation } from './rapport'
import { createInitialState } from './state'

const content = loadContentPack(join(process.cwd(), 'content', 'default'))
const students = content.loveInterests.filter((li) => kindOf(li) === 'student').map((li) => li.id)

describe('friends and enemies', () => {
  it('begin each game with what the content says, and every student given a few of each', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rapport = assignRapport(content, seed)
      // What is written holds in every game.
      expect(rapport['anwen'].friends).toContain('elowen')
      expect(rapport['seraphine'].enemies).toContain('yelena')
      for (const id of students) {
        const { friends, enemies } = rapport[id]
        expect(friends.length, `${id} friends, seed ${seed}`).toBeLessThanOrEqual(4)
        expect(enemies.length, `${id} enemies, seed ${seed}`).toBeLessThanOrEqual(3)
        expect(friends.length + enemies.length, `${id}, seed ${seed}`).toBeGreaterThan(0)
        // Nobody is both, and it always goes both ways.
        expect(friends.filter((other) => enemies.includes(other))).toEqual([])
        for (const other of friends) expect(rapport[other].friends).toContain(id)
        for (const other of enemies) expect(rapport[other].enemies).toContain(id)
      }
      // Only students are dealt any; a teacher keeps what she was written with.
      const teacher = content.loveInterests.find((li) => kindOf(li) === 'teacher')!
      expect(rapport[teacher.id].friends.every((id) => teacher.friends.includes(id) || !students.includes(id))).toBe(true)
    }
    const counts = students.map((id) => assignRapport(content, 7)[id].friends.length)
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(2)
  })

  it('are the same for the same game and differ between games', () => {
    expect(assignRapport(content, 3)).toEqual(assignRapport(content, 3))
    expect(assignRapport(content, 3)).not.toEqual(assignRapport(content, 4))
    expect(createInitialState(content, 'Kael', 3).rapport).toEqual(assignRapport(content, 3))
  })

  it('change on both sides at once', () => {
    const start = createInitialState(content, 'Kael', 1)
    const fallenOut = setRelation(start, 'anwen', 'elowen', 'enemies')
    expect(relationBetween(fallenOut, 'elowen', 'anwen')).toBe('enemies')
    expect(fallenOut.rapport['anwen'].friends).not.toContain('elowen')
    expect(relationBetween(setRelation(fallenOut, 'elowen', 'anwen', 'neither'), 'anwen', 'elowen')).toBe('neither')
    expect(setRelation(start, 'anwen', 'elowen', 'friends')).toBe(start)
  })

  it('are told to the LLM only when more than one of them is in the scene', () => {
    const state = createInitialState(content, 'Kael', 1)
    expect(describeRapport(content, state, ['anwen', 'elowen'])).toEqual([expect.stringContaining('Anwen and Elowen are friends')])
    expect(describeRapport(content, state, ['seraphine', 'yelena'])[0]).toContain('Seraphine and Yelena are enemies')
    const together = buildCharacterPrompt({ content, state, loveInterestId: 'seraphine', companionIds: ['yelena'], sceneBeats: [{ activityName: 'Tea' }] })
    expect(together).toContain('## How the women here stand with each other')
    expect(together).toContain('Seraphine and Yelena are enemies')
    expect(buildCharacterPrompt({ content, state, loveInterestId: 'seraphine', sceneBeats: [{ activityName: 'Tea' }] })).not.toContain('stand with each other')
  })
})

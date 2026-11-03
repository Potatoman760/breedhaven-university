import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stageFor } from '../../shared/game'
import { loadContentPack } from './loader'

// The story beats are hand-written, for the two who carry the story. Each is earned by a stage she can reach, and is hers.
describe('the story beats of the default pack', () => {
  const content = loadContentPack(join(process.cwd(), 'content', 'default'))
  const story = content.story

  it('are written for every love interest at Friend, Dating and Lover, but for Tamsin, a friend from the start, at Dating and Lover', () => {
    expect(Object.keys(story).sort()).toEqual(content.loveInterests.map((li) => li.id).sort())
    for (const [id, beats] of Object.entries(story)) expect(beats.map((beat) => beat.stage), id).toEqual(id === 'tamsin' ? ['dating', 'lover'] : ['friend', 'dating', 'lover'])
    const tamsin = content.loveInterests.find((li) => li.id === 'tamsin')!
    expect(stageFor(content.relationships, tamsin.startsAt!.affection).id).toBe('friend')
  })

  it('are each spoken by her, and at Lover have a telling for one already her lover and one already unprotected', () => {
    for (const [id, beats] of Object.entries(story)) {
      for (const beat of beats) {
        const where = `${id} ${beat.stage}`
        expect(beat.cutscene.speakerId, where).toBe(id)
        expect(beat.ifIntimate?.cutscene.speakerId ?? id, where).toBe(id)
        expect(beat.ifUnprotected?.cutscene.speakerId ?? id, where).toBe(id)
        expect(beat.ifIntimate !== undefined, where).toBe(beat.stage === 'lover')
        expect(beat.ifUnprotected !== undefined, where).toBe(beat.stage === 'lover')
      }
    }
  })

  it("say nothing of birth control or a child in the telling for one already unprotected", () => {
    const forbidden = /damper|suppressant|birth control|pregnan|child|baby/i
    for (const [id, beats] of Object.entries(story)) {
      const lover = beats.find((beat) => beat.stage === 'lover')!
      for (const line of lover.ifUnprotected!.cutscene.scenes.flatMap((scene) => scene.lines)) expect(line, id).not.toMatch(forbidden)
    }
  })

  it('are held in her room only where she has one, at the place it is', () => {
    for (const [id, beats] of Object.entries(story)) {
      const room = content.loveInterests.find((li) => li.id === id)!.room
      for (const beat of beats.filter((one) => one.inHerRoom)) expect(beat.locationId, `${id} ${beat.stage}`).toBe(room?.locationId)
    }
  })

  it('take her off birth control only at Lover, and not one who was never on it', () => {
    for (const [id, beats] of Object.entries(story)) {
      const her = content.loveInterests.find((li) => li.id === id)!
      for (const beat of beats) {
        if (beat.stage !== 'lover' || !her.birthControl) expect(beat.stopsBirthControl, `${id} ${beat.stage}`).toBe(false)
      }
    }
  })
})

import { describe, expect, it } from 'vitest'
import type { Intro } from '../model'
import { cutsceneBeats } from './cutscene'

const people = [
  { id: 'tamsin', name: 'Tamsin' },
  { id: 'zelie', name: 'Zélie Marchand' }
]

describe('a cutscene as it is read', () => {
  it('reads its lines in order, and changes how someone looks from the line after one that says so, not reading that line', () => {
    const intro: Intro = {
      speakerId: 'tamsin',
      scenes: [
        { locationId: 'tiltyard', castIds: ['tamsin', 'zelie'], lines: ['*The showers steam.*', '[OUTFIT: Tamsin=nude]', '[expression: zelie=Aroused]', 'Tamsin: Get in.', '[OUTFIT: default]'] },
        { locationId: 'house', castIds: ['tamsin'], lines: ['Tamsin: Dressed again.'] }
      ]
    }
    const beats = cutsceneBeats(intro, people)
    expect(beats.map((beat) => beat.line.text)).toEqual(['The showers steam.', 'Get in.', 'Dressed again.'])
    expect(beats[0].looks).toEqual({})
    // A name is matched without its accents or case, and a tag without one is the speaker's.
    expect(beats[1].looks).toEqual({ tamsin: { outfitId: 'nude' }, zelie: { expression: 'aroused' } })
    expect(beats[2].looks.tamsin).toEqual({ outfitId: 'default' })
  })

  it('starts the speaker in the outfit it names', () => {
    const intro: Intro = { speakerId: 'tamsin', outfitId: 'nude', scenes: [{ locationId: 'house', lines: ['Tamsin: Hi.'] }] }
    expect(cutsceneBeats(intro, people)[0].looks).toEqual({ tamsin: { outfitId: 'nude' } })
  })
})

import { describe, expect, it } from 'vitest'
import { rawFixture } from '../game/testFixture'
import { ContentError, validateContentPack } from './content'

describe('validateContentPack', () => {
  it('accepts a valid pack and fills in defaults', () => {
    const pack = validateContentPack(rawFixture())
    expect(pack.activities[0].withLoveInterest).toBe('none')
    expect(pack.relationships.meterMax).toBe(100)
  })

  it('rejects references to ids that do not exist', () => {
    const raw = rawFixture()
    raw.loveInterests[0].traitIds = ['nope']
    raw.activities[1].locationId = 'nowhere'
    expect(() => validateContentPack(raw)).toThrow(ContentError)
    expect(() => validateContentPack(raw)).toThrow(/loveInterests\.ana: unknown trait "nope"/)
    expect(() => validateContentPack(raw)).toThrow(/activities\.work: unknown location "nowhere"/)
  })

  it('rejects dates that do not exist in the calendar', () => {
    const raw = rawFixture()
    raw.calendar.start.day = 4
    expect(() => validateContentPack(raw)).toThrow(/calendar\.start: A has only 3 days/)
  })

  it('rejects duplicate ids', () => {
    const raw = rawFixture()
    raw.traits.push({ ...raw.traits[0] })
    expect(() => validateContentPack(raw)).toThrow(/traits: duplicate id "shy"/)
  })

  it('rejects love interests under 18', () => {
    const raw = rawFixture()
    raw.loveInterests[0].age = 17
    expect(() => validateContentPack(raw)).toThrow(/loveInterests\.0\.age/)
  })
})

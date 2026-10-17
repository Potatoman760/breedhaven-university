import { describe, expect, it } from 'vitest'
import { buildDraftPrompt, draftSchema, parseDraft } from './draftCharacter'
import { fixture } from './testFixture'

const content = fixture()
const place = content.locations[0].id
const stages = content.relationships.stages

/** A reply as the LLM is asked to write it. */
const written = (patch: Record<string, unknown> = {}) => ({
  name: 'Mira Vale',
  age: 22,
  pronouns: 'she/her',
  handle: '@mira.writes',
  bio: 'Edits the student paper.',
  appearance: 'A 22-year-old woman with dark skin and short curls.',
  usualClothes: 'a mustard jumper and grey trousers',
  personality: 'Sharp and nosy.',
  traitIds: [content.traits[0].id],
  likes: ['books'],
  dislikes: [],
  admires: ['wisdom'],
  childNames: { daughters: ['Ada', 'Bea', 'Cora', 'Dell', 'Etta'], sons: ['Finn', 'Gus'] },
  kind: 'student',
  studies: { subject: 'Journalism', code: 'JRN', level: 2, stats: ['charisma'] },
  teaching: { department: 'the College of Arts', title: 'Dr', subjects: [{ subject: 'Rhetoric', code: 'RHT', level: 1, stats: ['charisma'] }] },
  room: { name: 'a flat over the print shop', description: 'A cramped attic flat with a desk under a skylight.', locationId: place },
  schedule: [{ periods: [content.calendar.periods[0].id], locationId: place }, { locationId: place }],
  ai: {
    speechPattern: 'Quick questions.',
    tone: 'dry, curious',
    verbalQuirks: ['Says "off the record".'],
    backstory: 'Studies: second year.\n\n## The True Sire\n\nShe takes notes.',
    goals: ['Break a real story.', 'Be trusted.'],
    secret: 'She already knows who leaked it.',
    avoidTopics: [],
    extraInstructions: 'Never cruel.'
  },
  ...patch
})

describe('writing a new love interest', () => {
  it('shows the LLM the schema of what it is to write, with the ids this game has', () => {
    const { system, user } = buildDraftPrompt(content, 'A nosy student journalist.')
    expect(system).toContain('valid against this JSON Schema')
    // The schema is the game's own, so its choices are the real ones.
    const schema = JSON.parse(system.split('\n\n')[2]) as { properties: Record<string, { minimum?: number; properties?: Record<string, { enum?: string[] }> }>; required: string[] }
    expect(schema.properties['age'].minimum).toBe(18)
    expect(schema.properties['room'].properties?.['locationId'].enum).toEqual(content.locations.map((l) => l.id))
    expect(schema.required).toEqual(expect.arrayContaining(['name', 'age', 'appearance', 'usualClothes', 'room', 'schedule', 'ai']))
    expect(user).toContain('The idea for the new character: A nosy student journalist.')
    expect(user).toContain(`- ${content.loveInterests[0].name}`)
  })

  it('turns a reply into an unsaved character with an id, the four outfits and a kept secret', () => {
    const li = parseDraft(content, `Here she is:\n${JSON.stringify(written())}\nEnjoy.`)
    expect(li).toMatchObject({ id: 'mira', name: 'Mira Vale', handle: 'mira.writes', kind: 'student', defaultOutfitId: 'default' })
    expect(li.outfits.map((o) => o.id)).toEqual(['default', 'pregnant', 'nude', 'nude-pregnant'])
    expect(li.outfits[0].description).toBe('a mustard jumper and grey trousers')
    expect(li.outfits[1]).toMatchObject({ inherits: 'default', pregnant: true })
    // A student has studies and nothing a teacher has.
    expect(li.studies?.code).toBe('JRN')
    expect(li.teaching).toBeUndefined()
    // The names she would give her children come with her.
    expect(li.childNames).toEqual({ daughters: ['Ada', 'Bea', 'Cora', 'Dell', 'Etta'], sons: ['Finn', 'Gus'] })
    expect(li.ai.secrets).toEqual([{ text: 'She already knows who leaked it.', revealWhen: [{ type: 'stage', min: stages.at(-2)!.id }] }])
  })

  it('gives her an id nobody has, and refuses a reply that does not fit', () => {
    const taken = content.loveInterests[0]
    expect(parseDraft(content, JSON.stringify(written({ name: `${taken.name.split(' ')[0]} Other` }))).id).toBe(`${taken.id}-2`)
    expect(() => parseDraft(content, JSON.stringify(written({ age: 17 })))).toThrow('did not fit: age')
    expect(() => parseDraft(content, JSON.stringify(written({ room: { name: 'x', description: 'y', locationId: 'nowhere' } })))).toThrow('room.locationId')
    expect(() => parseDraft(content, 'Sorry, I cannot.')).toThrow('held no character')
    // Read to the brace that closes her, whatever comes after it, and forgiving a comma left before one.
    const json = JSON.stringify(written())
    expect(parseDraft(content, `Here she is:\n\`\`\`json\n${json}\n\`\`\`\nI hope {she} suits.`).name).toBe(written().name)
    expect(parseDraft(content, json.replace(/}$/, ',}')).name).toBe(written().name)
    // A reply cut off part way says so.
    expect(() => parseDraft(content, json.slice(0, json.length / 2))).toThrow('cut off')
    expect(draftSchema(content).safeParse(written()).success).toBe(true)
  })
})

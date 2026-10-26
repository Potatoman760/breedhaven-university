import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Breedhaven keeps its own calendar: written lines that name a day of our week (a Tuesday, a Friday) or a month of our
// year read as a slip, and teach the LLM to say them too.
describe('the wording of the default pack', () => {
  const dir = join(process.cwd(), 'content', 'default')
  const files = [
    ...readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'catalogue.json').map((f) => join(dir, f)),
    ...readdirSync(join(dir, 'love-interests')).map((f) => join(dir, 'love-interests', f))
  ]
  const texts = (value: unknown): string[] =>
    typeof value === 'string' ? [value] : value !== null && typeof value === 'object' ? Object.values(value).flatMap(texts) : []

  // The week's days are ours, Sunday to Saturday, since an LLM loses track of days with names of their own. The months are the setting's.
  it('names no month of our calendar, only its own', () => {
    // May and March are left out: they are words as well as months.
    const ours = /\b(January|February|April|June|July|August|September|October|November|December)\b/i
    const slips = files.flatMap((file) =>
      texts(JSON.parse(readFileSync(file, 'utf8')))
        .filter((text) => ours.test(text))
        .map((text) => `${file.slice(dir.length + 1)}: ${text.match(ours)![0]} in "${text.slice(0, 80)}"`)
    )
    expect(slips).toEqual([])
  })

  // The game is written in US English: a British word in the pack is copied by the LLM into everything it writes.
  it('is written in US English', () => {
    // Joined to an id or a path by a hyphen, slash or underscore, a word is a name and keeps its spelling.
    const british = new RegExp(
      String.raw`(?<![\w/_-])(grey|greys|coloured|colour|colours|colourful|centre|centres|favour|favours|favourite|honour|behaviour|neighbour|humour|` +
        String.raw`armour|harbour|flavour|licence|programme|programmes|labelled|travelling|counsellor|catalogue|whilst|amongst|learnt|maths|` +
        String.raw`pyjamas|fortnight|timetable|revise|revises|revising|trainers|jumper|high street|kerb|studio flat|a flat above|her flat|enrol|enrolment|practised|practising|` +
        String.raw`plough|ploughed|queue|queues|flats|reads (?:Government|Law|Economics|Agriculture|Medicine|Engineering|History))(?![\w/_-])`,
      'i'
    )
    // Kept as they are: a coffee, and the programming course's queues.
    const kept = /flat white|Dictionaries and Queues|A queue serves|in a queue$/g
    const slips = files.flatMap((file) =>
      texts(JSON.parse(readFileSync(file, 'utf8')))
        .map((text) => text.replace(kept, ''))
        .filter((text) => british.test(text))
        .map((text) => `${file.slice(dir.length + 1)}: ${text.match(british)![0]} in "${text.slice(0, 80)}"`)
    )
    expect(slips).toEqual([])
  })
})

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

  it('names no day or month of our calendar, only its own', () => {
    // May and March are left out: they are words as well as months.
    const ours = /\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)days?\b|\b(January|February|April|June|July|August|September|October|November|December)\b/i
    const slips = files.flatMap((file) =>
      texts(JSON.parse(readFileSync(file, 'utf8')))
        .filter((text) => ours.test(text))
        .map((text) => `${file.slice(dir.length + 1)}: ${text.match(ours)![0]} in "${text.slice(0, 80)}"`)
    )
    expect(slips).toEqual([])
  })
})

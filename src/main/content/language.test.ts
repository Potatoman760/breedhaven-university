import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { languagesIn, readStrings, translated } from './language'
import { loadContentPack } from './loader'

const PACK_DIR = resolve(__dirname, '../../../content/default')

describe('translated', () => {
  it('replaces text, and keeps what the translation leaves out', () => {
    expect(translated({ name: 'Library', hours: 8, blurb: 'Quiet.' }, { name: 'Bibliothek' })).toEqual({ name: 'Bibliothek', hours: 8, blurb: 'Quiet.' })
  })

  it('matches entries of a list by id, whatever order the translation has them in', () => {
    const base = [{ id: 'a', name: 'One' }, { id: 'b', name: 'Two' }]
    expect(translated(base, [{ id: 'b', name: 'Zwei' }])).toEqual([{ id: 'a', name: 'One' }, { id: 'b', name: 'Zwei' }])
  })

  it('matches subjects by code and entries without an id by place', () => {
    expect(translated([{ code: 'POL', subject: 'Politics' }], [{ code: 'POL', subject: 'Politik' }])).toEqual([{ code: 'POL', subject: 'Politik' }])
    expect(translated([{ text: 'x' }, { text: 'y' }], [{}, { text: 'ypsilon' }])).toEqual([{ text: 'x' }, { text: 'ypsilon' }])
  })

  it('replaces a list of plain values whole', () => {
    expect(translated({ keywords: ['bloom', 'seed'] }, { keywords: ['Blüte'] })).toEqual({ keywords: ['Blüte'] })
  })

  it('adds nothing and changes no number, id or kind', () => {
    expect(translated({ id: 'a', price: 5 }, { id: 'b', price: 1, extra: 'no' })).toEqual({ id: 'a', price: 5 })
    expect(translated({ name: 'A' }, { name: 3 })).toEqual({ name: 'A' })
  })
})

describe('a language folder', () => {
  let root: string | undefined
  afterEach(() => root && rmSync(root, { recursive: true, force: true }))

  const make = (): string => {
    root = mkdtempSync(join(tmpdir(), 'breedhaven-language-'))
    const dir = join(root, 'de')
    mkdirSync(join(dir, 'strings'), { recursive: true })
    writeFileSync(join(dir, 'language.json'), JSON.stringify({ name: 'Deutsch' }))
    return dir
  }

  it('is offered by the name it gives itself, after English', () => {
    make()
    expect(languagesIn(root!, 'English')).toEqual([{ id: 'en', name: 'English' }, { id: 'de', name: 'Deutsch' }])
  })

  it('has its strings read, and what is wrong with them said', () => {
    const dir = make()
    writeFileSync(join(dir, 'strings', 'core.json'), JSON.stringify({ 'settings.language': 'Sprache', 'no.such': 'x' }))
    writeFileSync(join(dir, 'strings', 'nope.json'), '{}')
    const { messages, issues } = readStrings(dir)
    expect(messages).toEqual({ 'core.settings.language': 'Sprache' })
    expect(issues).toHaveLength(2)
  })

  it('translates the content it names, and the game still loads', () => {
    const dir = make()
    mkdirSync(join(dir, 'love-interests'))
    writeFileSync(join(dir, 'love-interests', 'anwen.json'), JSON.stringify({ id: 'anwen', name: 'Anwen Übersetzt' }))
    const pack = loadContentPack(PACK_DIR, dir)
    expect(pack.loveInterests.find((li) => li.id === 'anwen')?.name).toBe('Anwen Übersetzt')
  })
})

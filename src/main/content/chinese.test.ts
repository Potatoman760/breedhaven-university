import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENGLISH, format, placeholders, setLanguage, t, weekdayName, type Namespace } from '../../shared/i18n'
import { createInitialState } from '../../shared/game/state'
import { selectCodexEntries } from '../../shared/game/codex'
import { sexWrittenOf } from '../../shared/game/scene'
import { languagesIn, readStrings } from './language'
import { loadContentPack } from './loader'

const root = resolve(__dirname, '../../../content')
const dir = join(root, 'zh-CN')
const english = loadContentPack(join(root, 'default'))
const chinese = loadContentPack(join(root, 'default'), dir)
// The fields a translation may change: what the player reads. Everything else (numbers, ids, references, and the
// directions and prompts written for the LLM and the image model) has to come through as the English has it.
const TEXT_FIELDS = ['name', 'title', 'description', 'bio', 'invitation', 'subject', 'content', 'ask', 'answer', 'wrong', 'label', 'definition', 'lines', 'blurb', 'highlights', 'summary', 'text', 'missedText', 'said', 'telling', 'syllabus', 'texts']

describe('the Simplified Chinese translation', () => {
  it('is discoverable and has valid message placeholders', () => {
    expect(languagesIn(root, 'English')).toContainEqual({ id: 'zh-CN', name: '简体中文' })
    const { messages, issues } = readStrings(dir)
    expect(issues).toEqual([])
    expect(messages['core.llm.writeIn']).toContain('简体中文')
    expect(messages['panels.codex.pageOf']).toBe('第 {n} 页，共 {total} 页')
  })

  it('covers every shipped entry, preserves player placeholders and keeps the game rules', () => {
    const overlay = JSON.parse(readFileSync(join(dir, 'codex.json'), 'utf8')) as { id: string }[]
    expect(overlay.map((entry) => entry.id)).toEqual(english.codex.map((entry) => entry.id))
    for (const [i, source] of english.codex.entries()) {
      const entry = chinese.codex[i]
      for (const field of ['title', 'category', 'content'] as const) {
        if (source.id === 'courier-app' && field === 'title') expect(entry[field]).toBe('Bloomr')
        else expect(entry[field], `${source.id}.${field}`).toMatch(/\p{Script=Han}/u)
        expect(placeholders(entry[field]), `${source.id}.${field}`).toEqual(placeholders(source[field]))
      }
      expect(entry.content, source.id).not.toBe(source.content)
      expect(entry.keywords, source.id).toEqual(expect.arrayContaining(source.keywords))
      const { title: _st, category: _sc, content: _sb, keywords: _sk, ...sourceRules } = source
      const { title: _tt, category: _tc, content: _tb, keywords: _tk, ...translatedRules } = entry
      expect(translatedRules, source.id).toEqual(sourceRules)
    }
    const withoutLabels = (value: unknown, also: readonly string[] = []): unknown => Array.isArray(value)
      ? value.map((entry) => withoutLabels(entry, also))
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).filter(([key]) => !TEXT_FIELDS.includes(key) && !also.includes(key)).map(([key, entry]) => [key, withoutLabels(entry, also)]))
        : value
    // The loading tips are a list of text and nothing else: translated whole, one for one.
    expect(chinese.tips).toHaveLength(english.tips.length)
    const { codex: _ec, housing: englishHousing, tips: _et, loveInterests: englishCharacters, npcs: englishNpcs, ...sourceRest } = english
    const { codex: _cc, housing: chineseHousing, tips: _ct, loveInterests: chineseCharacters, npcs: chineseNpcs, ...translatedRest } = chinese
    expect(withoutLabels(translatedRest)).toEqual(withoutLabels(sourceRest))
    // A character's role is the words she is introduced by (a house room's is what the game does with it, and stays);
    // her aliases are the language's own way of writing her name, which only the parser reads.
    expect(withoutLabels([...chineseCharacters, ...chineseNpcs], ['role', 'aliases'])).toEqual(withoutLabels([...englishCharacters, ...englishNpcs], ['role', 'aliases']))
    const { floors: _ef, ...sourceHouse } = englishHousing!
    const { floors: _cf, ...translatedHouse } = chineseHousing!
    expect(chineseHousing!.floors).toHaveLength(englishHousing!.floors.length)
    expect(withoutLabels(translatedHouse)).toEqual(withoutLabels(sourceHouse))
    expect(chinese.calendar.weekdays).toEqual(english.calendar.weekdays)
  })

  it('sees sex written in Chinese of a woman who will not, as it does in English, and not talk about it', () => {
    const { messages } = readStrings(dir)
    const cast = [{ id: 'tamsin', name: 'Tamsin', aliases: ['塔姆辛'] }, { id: 'maren', name: 'Maren', aliases: ['玛伦'] }]
    try {
      setLanguage('zh-CN', messages)
      expect(sexWrittenOf('Tamsin: 我骑在他身上，慢慢坐了下去。', cast, ['tamsin'], 'tamsin')).toEqual(['tamsin'])
      // Narrated of her by name, whoever says it; in her Chinese name too.
      expect(sexWrittenOf('*玛伦看着塔姆辛，他的肉棒插入她的身体。*', cast, ['tamsin', 'maren'], 'tamsin').sort()).toEqual(['maren', 'tamsin'])
      // Talk about it is not it.
      expect(sexWrittenOf('Tamsin: 今晚不做爱，我们只是聊聊交合受孕的课。', cast, ['tamsin'], 'tamsin')).toEqual([])
    } finally {
      setLanguage('en')
    }
    // In English the language adds nothing, and the English list still reads an English reply.
    expect(sexWrittenOf('Tamsin: 我骑在他身上。', cast, ['tamsin'], 'tamsin')).toEqual([])
    expect(sexWrittenOf('Tamsin: I straddle him.', cast, ['tamsin'], 'tamsin')).toEqual(['tamsin'])
  })

  it("gives every character her name in Chinese script, for the parser to know her by, and English none", () => {
    const of = (pack: typeof english, id: string) => [...pack.loveInterests, ...pack.npcs].find((one) => one.id === id)
    for (const li of [...english.loveInterests, ...english.npcs]) {
      expect(li.aliases ?? [], li.id).toEqual([])
      expect(of(chinese, li.id)?.aliases?.some((alias) => /\p{Script=Han}/u.test(alias)), li.id).toBe(true)
      expect(of(chinese, li.id)?.name, li.id).toBe(li.name)
    }
  })

  it('names the entry each translated one is for, wherever the English entries have an id', () => {
    // Matched by place, a translation goes on the wrong entry as soon as the English list is reordered or grows.
    const loose: string[] = []
    const walk = (eng: unknown, over: unknown, where: string): void => {
      if (Array.isArray(eng) && Array.isArray(over)) {
        const identity = ['id', 'code', 'number', 'key'].find((field) => eng.length > 0 && eng.every((entry) => entry !== null && typeof entry === 'object' && field in entry))
        over.forEach((entry, i) => {
          const keyed = identity && entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>)[identity] : undefined
          if (identity && keyed === undefined) loose.push(`${where}[${i}]`)
          walk(identity ? eng.find((one) => one[identity] === keyed) : eng[i], entry, `${where}[${String(keyed ?? i)}]`)
        })
      } else if (eng !== null && typeof eng === 'object' && over !== null && typeof over === 'object') {
        for (const [key, value] of Object.entries(over)) walk((eng as Record<string, unknown>)[key], value, `${where}.${key}`)
      }
    }
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.json') && !file.startsWith('strings') && file !== 'language.json')
    for (const file of files) walk(JSON.parse(readFileSync(join(root, 'default', file), 'utf8')), JSON.parse(readFileSync(join(dir, file), 'utf8')), file)
    expect(loose).toEqual([])
  })

  it('covers every interface catalog key and every game message', () => {
    const { messages } = readStrings(dir)
    for (const ns of ['core', 'shell', 'screens', 'panels', 'editor', 'comfy', 'game'] satisfies Namespace[]) {
      for (const key of Object.keys(ENGLISH[ns])) {
        expect(messages[`${ns}.${key}` as keyof typeof messages], `${ns}.${key}`).toBeTypeOf('string')
      }
    }
  })

  it('formats Chinese plurals, nested choices and weekday labels', () => {
    const { messages } = readStrings(dir)
    try {
      setLanguage('zh-CN', messages)
      expect(t('screens.dayView.courses', { n: 1 })).toBe('1 门课程')
      expect(t('screens.dayView.courses', { n: 2 })).toBe('2 门课程')
      expect(t('game.births.description', { first: 'Faye', child: 'daughter', named: true, daughter: true, name: 'Rosa' })).toContain('她想给她取名为Rosa。')
      expect(weekdayName('Monday')).toBe('周一')
      expect(weekdayName('Sunday', true)).toBe('周日')
      expect(t('panels.phone.meets', { weekday: 'Monday', time: '18:00' })).toBe('每周一 18:00')
      expect(t('game.achievements.true-sire.name')).toBe('真育嗣者')
      for (const [key, message] of Object.entries(messages)) {
        const params = Object.fromEntries(placeholders(message!).map((name) => [name, 2]))
        const result = format(message!, params, 'zh-CN')
        expect(result, key).not.toMatch(/[{}]/)
      }
    } finally {
      setLanguage('en')
    }
    expect(weekdayName('Monday', true)).toBe('Mon')
  })

  it('retrieves fertility lore from a Chinese sentence with the agreed terminology', () => {
    const entries = selectCodexEntries({ content: chinese, state: createInitialState(chinese), recentText: '我想了解真育嗣者的生育能力。' })
    expect(entries.map((entry) => entry.id)).toContain('sires')
    expect(chinese.codex.find((entry) => entry.id === 'sires')?.title).toBe('育嗣者与真育嗣者')
  })
})

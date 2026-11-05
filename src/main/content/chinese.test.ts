import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENGLISH, format, placeholders, setLanguage, t, weekdayName, type Namespace } from '../../shared/i18n'
import { createInitialState } from '../../shared/game/state'
import { selectCodexEntries } from '../../shared/game/codex'
import { languagesIn, readStrings } from './language'
import { loadContentPack } from './loader'

const root = resolve(__dirname, '../../../content')
const dir = join(root, 'zh-CN')
const english = loadContentPack(join(root, 'default'))
const chinese = loadContentPack(join(root, 'default'), dir)

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
    const withoutLabels = (value: unknown): unknown => Array.isArray(value)
      ? value.map(withoutLabels)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).filter(([key]) => !['name', 'title', 'description'].includes(key)).map(([key, entry]) => [key, withoutLabels(entry)]))
        : value
    const { codex: _ec, housing: englishHousing, ...sourceRest } = english
    const { codex: _cc, housing: chineseHousing, ...translatedRest } = chinese
    expect(withoutLabels(translatedRest)).toEqual(withoutLabels(sourceRest))
    const { floors: _ef, ...sourceHouse } = englishHousing!
    const { floors: _cf, ...translatedHouse } = chineseHousing!
    expect(chineseHousing!.floors).toHaveLength(englishHousing!.floors.length)
    expect(withoutLabels(translatedHouse)).toEqual(withoutLabels(sourceHouse))
    expect(chinese.calendar.weekdays).toEqual(english.calendar.weekdays)
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

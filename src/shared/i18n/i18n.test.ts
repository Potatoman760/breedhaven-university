import { afterEach, describe, expect, it } from 'vitest'
import { format, placeholders } from './format'
import { allKeys, english, setLanguage, t, type MessageKey } from './index'

describe('format', () => {
  it('fills values by name', () => {
    expect(format('{who} sits in your {course} class.', { who: 'Anwen', course: 'POL 101' }, 'en')).toBe('Anwen sits in your POL 101 class.')
  })

  it('leaves a placeholder whose value was not given', () => {
    expect(format('Hello {player}.', {}, 'en')).toBe('Hello {player}.')
  })

  it('keeps braces that open no placeholder, as JSON has', () => {
    expect(format('Reply with {"memory": "..."} and {n} more.', { n: 2 }, 'en')).toBe('Reply with {"memory": "..."} and 2 more.')
  })

  it('picks a plural by count, with exact matches first', () => {
    const message = '{n, plural, =0 {no days} one {# day} other {# days}}'
    expect(format(message, { n: 0 }, 'en')).toBe('no days')
    expect(format(message, { n: 1 }, 'en')).toBe('1 day')
    expect(format(message, { n: 5 }, 'en')).toBe('5 days')
  })

  it('uses the plural rules of the language', () => {
    const message = '{n, plural, one {one} few {few} many {many} other {other}}'
    expect(format(message, { n: 3 }, 'pl')).toBe('few')
    expect(format(message, { n: 3 }, 'en')).toBe('other')
  })

  it('picks a case by value, and nests', () => {
    const message = 'You {kind, select, teacher {sponsor} other {belong to}} {n, plural, one {a society} other {# societies}}.'
    expect(format(message, { kind: 'teacher', n: 1 }, 'en')).toBe('You sponsor a society.')
    expect(format(message, { kind: 'student', n: 2 }, 'en')).toBe('You belong to 2 societies.')
  })

  it('fills values inside a chosen case', () => {
    expect(format('{n, plural, one {{who} has one} other {{who} has #}}', { n: 4, who: 'Faye' }, 'en')).toBe('Faye has 4')
  })

  it('names the values a message takes', () => {
    expect(placeholders('{a} and {n, plural, one {{b}} other {#}} {"json": 1}')).toEqual(['a', 'b', 'n'])
  })
})

describe('t', () => {
  afterEach(() => setLanguage('en'))

  it('is the English when no translation is set', () => {
    expect(t('core.settings.language')).toBe('Language')
  })

  it('takes a translation, and falls back to the English for what it leaves out', () => {
    setLanguage('de', { 'core.settings.language': 'Sprache' })
    expect(t('core.settings.language')).toBe('Sprache')
    expect(t('core.language.en')).toBe('English')
  })

  it('has an English message for every key', () => {
    for (const key of allKeys()) expect(typeof english(key as MessageKey)).toBe('string')
  })
})

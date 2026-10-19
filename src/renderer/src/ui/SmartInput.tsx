import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { completeName, plain, type Suggestion } from '../../../shared/game'
import { Button } from './Button'

interface Props {
  value: string
  onChange: (value: string) => void
  /** What he could ask now: finished in grey once he has begun one. */
  suggestions: Suggestion[]
  /** Names to finish as he types them, first the likeliest. */
  names: string[]
  /** Words the game has that no dictionary does (names, places, handles): never marked as misspelled. */
  known: Set<string>
  /** The suggestion the line was started from, or nothing once he has made it his own from scratch. */
  onPick: (suggestion: Suggestion | undefined) => void
  placeholder?: string
  ariaLabel: string
  autoFocus?: boolean
}

// What a word is, for checking it and finishing it: letters, with an apostrophe or a hyphen inside.
const WORD = /[\p{L}][\p{L}'-]*/gu

/**
 * The scene's text box, made to help as an editor does: the rest of a name or of a suggested line in grey after the
 * cursor, taken with Tab; and a wavy line under a word the spell checker does not know, with its likeliest fix
 * offered, also taken with Tab. Nothing is offered until he starts typing.
 */
export function SmartInput({ value, onChange, suggestions, names, known, onPick, placeholder, ariaLabel, autoFocus }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [atEnd, setAtEnd] = useState(true)
  const [scroll, setScroll] = useState(0)
  // What the spell checker made of each word, asked once a word.
  const checked = useRef(new Map<string, boolean>())

  // The rest of a suggested line he has begun, or else of a name being typed: only while the cursor is at the end.
  const ghost = useMemo(() => {
    if (!atEnd || value.length === 0) return undefined
    const line = value.trim().length >= 2 ? suggestions.find((one) => plain(one.text).startsWith(plain(value)) && one.text.length > value.length) : undefined
    if (line) return { rest: line.text.slice(value.length), suggestion: line }
    const name = completeName(names, value)
    return name ? { rest: name } : undefined
  }, [value, atEnd, names, suggestions])

  // The words to mark: every one the checker does not know, but for the one still being typed.
  const marks = useMemo(() => {
    const typing = /[\p{L}'-]$/u.test(value)
    const words = [...value.matchAll(WORD)]
    return words
      .filter((_, i) => !(typing && i === words.length - 1))
      .filter((match) => {
        const word = match[0].replace(/['-]+$/, '')
        if (word.length < 2 || known.has(plain(word))) return false
        if (!checked.current.has(word)) checked.current.set(word, window.api.spell.misspelled(word))
        return checked.current.get(word)
      })
      .map((match) => ({ start: match.index!, end: match.index! + match[0].length, word: match[0] }))
  }, [value, known])
  // The last of them, and what it most likely was.
  const fix = useMemo(() => {
    const last = marks.at(-1)
    const to = last && window.api.spell.suggestions(last.word)[0]
    return last && to ? { ...last, to } : undefined
  }, [marks])

  // The grey and the wavy lines are drawn on a layer under the box, kept in step with it as it scrolls.
  useLayoutEffect(() => {
    if (input.current && input.current.scrollLeft !== scroll) setScroll(input.current.scrollLeft)
  })
  const follow = () => {
    const box = input.current
    if (!box) return
    setAtEnd(box.selectionStart === box.value.length && box.selectionEnd === box.value.length)
    setScroll(box.scrollLeft)
  }

  const takeGhost = () => {
    if (!ghost) return
    onChange(value + ghost.rest)
    if (ghost.suggestion) onPick(ghost.suggestion)
  }
  const takeFix = () => {
    if (!fix) return
    onChange(value.slice(0, fix.start) + fix.to + value.slice(fix.end))
  }
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Tab' || event.shiftKey) return
    if (ghost) {
      event.preventDefault()
      takeGhost()
    } else if (fix) {
      event.preventDefault()
      takeFix()
    }
  }

  // The line as drawn on the layer: the words he typed, clear, with the unknown ones marked, and then the grey.
  const pieces: { text: string; mark?: boolean }[] = []
  let at = 0
  for (const mark of marks) {
    if (mark.start > at) pieces.push({ text: value.slice(at, mark.start) })
    pieces.push({ text: value.slice(mark.start, mark.end), mark: true })
    at = mark.end
  }
  if (at < value.length) pieces.push({ text: value.slice(at) })

  return (
    <div className="smart-input">
      {fix && !ghost && (
        <Button size="small" variant="quiet" className="smart-fix" title="Tab to fix it" onClick={takeFix}>
          <s>{fix.word}</s> {fix.to} <kbd>Tab</kbd>
        </Button>
      )}
      <div className="smart-layer" aria-hidden="true">
        <span style={{ transform: `translateX(${-scroll}px)` }}>
          {pieces.map((piece, i) => (piece.mark ? <span key={i} className="smart-misspelled">{piece.text}</span> : <span key={i}>{piece.text}</span>))}
          {ghost && <span className="smart-ghost">{ghost.rest}</span>}
        </span>
      </div>
      <input
        ref={input}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          if (event.target.value === '') onPick(undefined)
        }}
        onKeyDown={onKey}
        onKeyUp={follow}
        onSelect={follow}
        onScroll={follow}
        onClick={follow}
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  )
}

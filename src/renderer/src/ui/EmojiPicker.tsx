import { useEffect, useRef, useState } from 'react'
import { t } from '../../../shared/i18n'

// The emoji people reach for most in a message, a row to a mood: faces, affection, gestures, and the odds and ends of a day.
const COMMON_EMOJI = [
  '😀', '😄', '😁', '😂', '🤣', '😊', '🙂', '😉',
  '😍', '🥰', '😘', '😚', '🤗', '😏', '😇', '🤭',
  '😅', '😬', '🙃', '🤔', '😳', '🥺', '😢', '😭',
  '😤', '😠', '🙄', '😴', '🤤', '😈', '🤯', '🥳',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💕',
  '💖', '💘', '💋', '🔥', '✨', '🌸', '🌹', '🌙',
  '👍', '👎', '👏', '🙏', '🙌', '👀', '💪', '🤝',
  '☕', '🍵', '🍷', '🍻', '🍰', '🎉', '📚', '💤'
] as const

interface Props {
  /** Given the emoji picked. The picker stays open, so that more than one can be put in. */
  onPick: (emoji: string) => void
  disabled?: boolean
}

/**
 * A button that opens a small sheet of common emoji over whatever is being written. One is
 * put in at a press; a press anywhere else, or Escape, puts the sheet away.
 */
export function EmojiPicker({ onPick, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    // Escape closes the sheet and nothing behind it: it is caught before the dialog it sits in hears of it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className="emoji-picker" ref={root}>
      <button type="button" className="secondary icon" aria-label={t('screens.emojiPicker.label')} aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">🙂</span>
      </button>
      {open && (
        <div className="emoji-sheet" role="listbox" aria-label={t('screens.emojiPicker.label')}>
          {COMMON_EMOJI.map((emoji) => (
            <button key={emoji} type="button" role="option" aria-selected="false" aria-label={emoji} onClick={() => onPick(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

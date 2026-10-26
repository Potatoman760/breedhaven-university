import { useEffect, type ReactNode } from 'react'
import type { Cue } from '../../../shared/model'
import { t } from '../../../shared/i18n'
import { play } from '../sound'
import { BackButton } from './BackButton'

interface DialogProps {
  title: string
  /** A few words beside the title, small: where things stand, such as the day of the season. */
  note?: string
  onClose: () => void
  narrow?: boolean
  wide?: boolean
  /** What it sounds like to open and to close, where that is not a window's: the bag's. */
  sounds?: [Cue, Cue]
  /** Drawn in the ornate kit, dark and trimmed in gold, for a dialog that is a moment of the game and not a form. */
  ornate?: boolean
  /** Leaves out the Close button in its heading, for a dialog whose own buttons include the way out. Escape and a press outside still close it. */
  noClose?: boolean
  /** A class of its own, for a dialog sized to what it holds. */
  className?: string
  children: ReactNode
}

/**
 * The dimmed screen a dialog sits on. Pressing it anywhere outside the dialog closes the
 * dialog, and so does Escape.
 */
export function Overlay({ onClose, sounds = ['open', 'close'], children }: { onClose: () => void; sounds?: [Cue, Cue]; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // What it sounds like to open and to close: a window by default, the phone its own.
  useEffect(() => {
    play(sounds[0])
    return () => play(sounds[1])
  }, [])

  return (
    // Only a press that starts on the dimmed part itself counts: one that starts inside
    // the dialog and ends outside it, as when selecting text, does not.
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      {children}
    </div>
  )
}

/** A framed parchment dialog over a dimmed screen. */
export function Dialog({ title, note, onClose, narrow, wide, noClose, ornate, sounds, className, children }: DialogProps) {
  return (
    <Overlay onClose={onClose} sounds={sounds}>
      <div className={['dialog', narrow ? 'narrow' : wide ? 'wide' : '', ornate && 'ornate', className].filter(Boolean).join(' ')}>
        <div className="dialog-head">
          <h1>
            {title}
            {note && <span className="dialog-note">{note}</span>}
          </h1>
          {!noClose && !ornate && (
            <button className="secondary" onClick={onClose}>
              {t('shell.common.close')}
            </button>
          )}
        </div>
        {children}
        {/* In the kit the way out is the round back button in the bottom left corner, as on every main screen. */}
        {!noClose && ornate && (
          <div className="dialog-foot">
            <BackButton onClick={onClose} />
          </div>
        )}
      </div>
    </Overlay>
  )
}

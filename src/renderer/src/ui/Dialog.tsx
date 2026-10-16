import { useEffect, type ReactNode } from 'react'
import type { Cue } from '../../../shared/model'
import { play } from '../sound'

interface DialogProps {
  title: string
  /** A few words beside the title, small: where things stand, such as the day of the season. */
  note?: string
  onClose: () => void
  narrow?: boolean
  wide?: boolean
  /** What it sounds like to open and to close, where that is not a window's: the bag's. */
  sounds?: [Cue, Cue]
  /** Leaves out the Close button in its heading, for a dialog whose own buttons include the way out. Escape and a press outside still close it. */
  noClose?: boolean
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
export function Dialog({ title, note, onClose, narrow, wide, noClose, sounds, children }: DialogProps) {
  return (
    <Overlay onClose={onClose} sounds={sounds}>
      <div className={narrow ? 'dialog narrow' : wide ? 'dialog wide' : 'dialog'}>
        <div className="dialog-head">
          <h1>
            {title}
            {note && <span className="dialog-note">{note}</span>}
          </h1>
          {!noClose && (
            <button className="secondary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        {children}
      </div>
    </Overlay>
  )
}

/** Stand-in for a feature the design calls for but the game doesn't have yet. */
export function ToBeImplemented({ note }: { note: string }) {
  return (
    <div className="tbi">
      <strong>To be implemented</strong>
      <span>{note}</span>
    </div>
  )
}

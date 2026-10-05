import type { ReactNode } from 'react'

interface DialogProps {
  title: string
  onClose: () => void
  narrow?: boolean
  wide?: boolean
  children: ReactNode
}

/** A framed parchment dialog over a dimmed screen. */
export function Dialog({ title, onClose, narrow, wide, children }: DialogProps) {
  return (
    <div className="overlay">
      <div className={narrow ? 'dialog narrow' : wide ? 'dialog wide' : 'dialog'}>
        <div className="dialog-head">
          <h1>{title}</h1>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
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

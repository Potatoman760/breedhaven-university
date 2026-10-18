import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { GrandButton } from './GrandButton'

interface Question {
  title: string
  /** What will happen, in a sentence. */
  detail?: string
  /** What the button that goes ahead says: "Overwrite", "Delete". */
  confirm: string
  /** What the other says. Left out, "Cancel". */
  cancel?: string
  /** Going ahead cannot be undone: the button is the red one. */
  grave?: boolean
}

/**
 * A yes or no asked in the game's own dialog, in place of the browser's. `ask` puts the
 * question and resolves to the answer; `dialog` is rendered wherever the asking is done,
 * and is there only while a question stands. Escape, or a press outside it, is a no.
 */
export function useConfirm(): { ask: (question: Question) => Promise<boolean>; dialog: ReactNode } {
  const [open, setOpen] = useState<{ question: Question; answer: (yes: boolean) => void } | null>(null)
  const ask = useCallback((question: Question) => new Promise<boolean>((answer) => setOpen({ question, answer })), [])
  const close = (yes: boolean) => {
    open?.answer(yes)
    setOpen(null)
  }

  useEffect(() => {
    if (!open) return
    // Heard before whatever dialog it stands over, so that Escape answers the question and leaves that dialog up.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      open.answer(false)
      setOpen(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  const dialog = open && (
    <div className="overlay confirm" onMouseDown={(event) => event.target === event.currentTarget && close(false)}>
      <div className="dialog narrow ornate" role="alertdialog" aria-label={open.question.title}>
        <div className="dialog-head">
          <h1>{open.question.title}</h1>
        </div>
        {open.question.detail && <p>{open.question.detail}</p>}
        <div className="confirm-actions">
          {/* Enter takes the safe answer: going ahead, unless that cannot be undone. */}
          <GrandButton label={open.question.cancel ?? 'Cancel'} chevron={false} className="confirm-no" autoFocus={open.question.grave === true} onClick={() => close(false)} />
          <GrandButton label={open.question.confirm} chevron={false} className={open.question.grave ? 'grave' : undefined} autoFocus={!open.question.grave} onClick={() => close(true)} />
        </div>
      </div>
    </div>
  )
  return { ask, dialog }
}

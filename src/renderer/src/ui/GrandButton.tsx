import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Button } from './Button'
import { ChevronIcon } from './icons'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  /** What it is, in a word or two, large. */
  label: string
  /** A few words under it, small: what it costs, who it is for. */
  note?: string
  /** Drawn in a gold-ringed disc at its left. */
  icon?: ReactNode
  /** The tooltip, for what does not fit on it. */
  tip?: string
  /** The chevron at its right, that says it leads on. Left off for a way back. */
  chevron?: boolean
}

/**
 * The game's grand button: a substantial dark panel trimmed in gold, an icon in a ring, a large label and a line under
 * it, for the actions a screen is about. It is the shared Button underneath.
 */
export function GrandButton({ label, note, icon, tip, chevron = true, className, ...rest }: Props) {
  return (
    // A label alone, with nothing after it, is centred on the button.
    <Button variant="primary" className={['grand', !note && !chevron && 'centred', className].filter(Boolean).join(' ')} title={tip} {...rest}>
      {icon && <span className="grand-icon">{icon}</span>}
      <span className="grand-text">
        <span className="grand-label">{label}</span>
        {note && <span className="grand-note">{note}</span>}
      </span>
      {chevron && <ChevronIcon size={16} />}
    </Button>
  )
}

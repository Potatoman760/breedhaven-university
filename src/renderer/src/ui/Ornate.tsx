import type { ReactNode } from 'react'
import { VineCorner } from './icons'

interface Props {
  title?: string
  /** A few words under the title, small. */
  note?: string
  /** Gold vines in the corners, for a panel that is a showpiece and not a working list. */
  corners?: boolean
  className?: string
  children: ReactNode
}

/**
 * The ornate panel: dark moss and wood trimmed in gold, with a title in gold. What the game frames as something to be
 * proud of is drawn in it: the household, a room of the house, a summary.
 */
export function Ornate({ title, note, corners, className, children }: Props) {
  return (
    <section className={['ornate', corners && 'cornered', className].filter(Boolean).join(' ')}>
      {corners && (
        <>
          <VineCorner corner="tl" />
          <VineCorner corner="tr" />
          <VineCorner corner="bl" />
          <VineCorner corner="br" />
        </>
      )}
      {(title || note) && (
        <div className="ornate-head">
          {title && <h2>{title}</h2>}
          {note && <span className="caps">{note}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

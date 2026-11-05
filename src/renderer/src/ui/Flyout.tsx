import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

export interface FlyoutItem {
  label: ReactNode
  onClick: () => void
  disabled?: boolean
}

interface Props {
  /** What the button that opens it shows: an icon. */
  icon: ReactNode
  /** What it is called, for the button's tooltip and for reading aloud. */
  label: string
  disabled?: boolean
  items: FlyoutItem[]
  /** Added to the span that holds the button. */
  className?: string
}

/**
 * A button that opens a short menu upward from beside it, its right edge on the button's. A press anywhere else,
 * Escape, or the window changing size shuts it; choosing one of its items shuts it and does that.
 */
export function Flyout({ icon, label, disabled, items, className }: Props) {
  // Where it opens: its foot just above the button, its right edge on the button's. Nothing while it is shut.
  const [at, setAt] = useState<{ right: number; bottom: number } | null>(null)
  const open = at !== null
  const menu = useRef<HTMLSpanElement>(null)
  const flyout = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => !menu.current?.contains(event.target as Node) && !flyout.current?.contains(event.target as Node) && setAt(null)
    const escape = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && setAt(null)
    const shut = () => setAt(null)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', shut)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', shut)
    }
  }, [open])
  const toggle = () => {
    const box = menu.current?.getBoundingClientRect()
    setAt(open || !box ? null : { right: window.innerWidth - box.right, bottom: window.innerHeight - box.top + 8 })
  }
  const pick = (action: () => void) => () => {
    setAt(null)
    action()
  }
  return (
    <span className={`exit-menu${className ? ` ${className}` : ''}`} ref={menu}>
      <Button type="button" className="icon" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={toggle}>
        {icon}
      </Button>
      {/* Put on the page itself, over everything: inside a box that scrolls, it would be cut off at the box's top. */}
      {at &&
        createPortal(
          <span className="exit-flyout glass" role="menu" ref={flyout} style={{ right: at.right, bottom: at.bottom }}>
            {items.map((item, index) => (
              <Button key={index} type="button" role="menuitem" variant="quiet" size="small" disabled={item.disabled} onClick={pick(item.onClick)}>
                {item.label}
              </Button>
            ))}
          </span>,
          document.body
        )}
    </span>
  )
}

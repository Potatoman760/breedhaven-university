import { useEffect } from 'react'

/**
 * The mouse's back button is Escape: whatever closes or steps back on Escape does so on it. It never opens the menu,
 * and never skips a tour, since those are Escape's own and not a way back. Escapes made from it are kept here.
 */
const fromMouse = new WeakSet<Event>()

export const isMouseBack = (event: Event): boolean => fromMouse.has(event)

export function installMouseBack(): void {
  // Pressed, it is not a step back through the page's history.
  window.addEventListener('mousedown', (event) => {
    if (event.button === 3) event.preventDefault()
  })
  window.addEventListener('mouseup', (event) => {
    if (event.button !== 3) return
    event.preventDefault()
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    fromMouse.add(escape)
    ;(document.activeElement ?? document.body).dispatchEvent(escape)
  })
}

/**
 * A step back inside a screen (a page back to its list, a choice back to what it was chosen from), taken on Escape or
 * the mouse's back button before the screen itself closes. Passed over while a dialog stands over it: `overlays` is how
 * many the screen is in itself.
 */
export function useBack(onBack: (() => void) | undefined, overlays = 0): void {
  useEffect(() => {
    if (!onBack) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelectorAll('.overlay').length > overlays) return
      event.stopPropagation()
      onBack()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onBack, overlays])
}

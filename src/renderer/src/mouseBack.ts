import { useEffect } from 'react'

/**
 * The mouse's back button is Escape: whatever closes or steps back on Escape does so on it. It never opens the menu,
 * and never skips a tour, since those are Escape's own and not a way back. Escapes made from it are kept here.
 */
const fromMouse = new WeakSet<Event>()

export const isMouseBack = (event: Event): boolean => fromMouse.has(event)

function back(): void {
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  fromMouse.add(escape)
  ;(document.activeElement ?? document.body).dispatchEvent(escape)
}

export function installMouseBack(): void {
  // Pressed, it is not a step back through the page's history.
  window.addEventListener('mousedown', (event) => {
    if (event.button === 3) event.preventDefault()
  })
  window.addEventListener('mouseup', (event) => {
    if (event.button !== 3) return
    event.preventDefault()
    back()
  })
  // With a menu open (the map, the phone, the calendar, any dialog), a right click is the back button too. It is caught
  // first, so that what is under the menu (a scene, which hides its interface on one) never hears of it. In something
  // being typed it is still the usual menu, with the spelling checker's suggestions; with no menu open it is the screen's own.
  window.addEventListener(
    'contextmenu',
    (event) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')) return
      if (!document.querySelector('.overlay, .lightbox')) return
      event.preventDefault()
      event.stopPropagation()
      back()
    },
    true
  )
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

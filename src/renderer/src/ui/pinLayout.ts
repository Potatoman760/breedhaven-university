/**
 * Laying out the panels pinned to a picture, as the town map and the fair have them: each is moved the least that keeps
 * it clear of the others and of what stands in the corners, and on the screen.
 */

// The least room left between two places' panels, in pixels.
const GAP = 6

type Box = { left: number; right: number; top: number; bottom: number }
const overlaps = (a: Box, b: Box) => a.left < b.right + GAP && b.left < a.right + GAP && a.top < b.bottom + GAP && b.top < a.bottom + GAP

/**
 * Moves each place's panel the least way up or down that keeps it clear of those above it and of the corner panel,
 * and back onto the screen. What a panel holds changes with the hour and its size with the screen, so this is measured,
 * not written into the map.
 */
export function settle(board: HTMLElement) {
  const pins = [...board.querySelectorAll<HTMLElement>('.map-pin')]
  for (const pin of pins) pin.style.translate = ''
  // What of the map is on the screen: it covers the screen, and its edges may be cut off.
  const drawn = board.getBoundingClientRect()
  const bounds = { top: Math.max(drawn.top, 0), bottom: Math.min(drawn.bottom, window.innerHeight), left: Math.max(drawn.left, 0), right: Math.min(drawn.right, window.innerWidth) }
  const placed: Box[] = [...(board.parentElement ?? board).querySelectorAll<HTMLElement>('.map-rooms, .pin-keepout')].map((panel) => panel.getBoundingClientRect())
  const boxes = pins.map((pin) => ({ pin, box: pin.getBoundingClientRect() })).sort((a, b) => a.box.top - b.box.top)
  for (const { pin, box } of boxes) {
    const dx = Math.max(bounds.left + GAP - box.left, Math.min(0, bounds.right - GAP - box.right))
    const at = (dy: number): Box => ({ left: box.left + dx, right: box.right + dx, top: box.top + dy, bottom: box.bottom + dy })
    const clear = (b: Box) => b.top >= bounds.top && b.bottom <= bounds.bottom && !placed.some((q) => overlaps(b, q))
    const tries = [0, ...placed.flatMap((q) => [q.bottom + GAP + 1 - box.top, q.top - GAP - 1 - box.bottom])].sort((a, b) => Math.abs(a) - Math.abs(b))
    const dy = tries.find((d) => clear(at(d))) ?? 0
    if (dx || dy) pin.style.translate = `${dx}px ${dy}px`
    placed.push(at(dy))
  }
}

/**
 * Taking a white card out from behind a picture.
 *
 * An image generator hands back a sprite on flat paper, and to stand it in a
 * scene the paper has to go. The naive version of that — every white pixel
 * becomes transparent — is wrong for exactly the art this exists for: a
 * character with pale skin, white highlights and light hair is full of pixels
 * indistinguishable from the card, and a global key punches holes through her.
 *
 * So the card is defined by *reachability* rather than by colour alone. The
 * fill starts at the border and works inward, and stops the moment it meets
 * something that is not the card. White enclosed by the subject — a highlight,
 * a window, the whites of an eye — is never reached and never touched.
 *
 * Pure on purpose: rasters in, raster out, no filesystem and no Electron, so
 * every decision below is a unit test rather than something to be eyeballed.
 * `mediaCutout.ts` is the thin part that knows how to decode a PNG.
 */

/** A straight (unpremultiplied) RGBA image, row-major, four bytes per pixel. */
export interface Raster {
  width: number
  height: number
  /** `width * height * 4` bytes. */
  data: Uint8ClampedArray
}

/**
 * How much of the card to take out.
 *
 * `edge` is the careful one and the default: only card the fill can reach from
 * the border. `gaps` also takes the card walled in by the art — the paper
 * showing through a loop of hair, which `edge` leaves standing as a white blob
 * because no path from the border reaches it. See `walledIn` for what keeps
 * that from eating a blown-out highlight.
 */
export type KeyMode = 'edge' | 'gaps'

export interface KeyOptions {
  /** How far from the border's own colour still counts as card. */
  tolerance?: number
  /** Reachable card only, or card the art has closed around as well. */
  mode?: KeyMode
}

/**
 * How far from the card colour a pixel may sit and still be called card.
 *
 * Twelve suits clean generated art, where the paper is flat to within a couple
 * of levels. Raise it for a scan with visible grain in the white; never raise
 * it to get past a refusal, which is a different problem wearing this one's
 * clothes.
 */
export const DEFAULT_TOLERANCE = 12
export const MIN_TOLERANCE = 1
export const MAX_TOLERANCE = 64

/**
 * How far from the card a pixel must be, in levels, to be left entirely alone.
 *
 * A counterweight, and the number to argue about. Black lineart on white is 255
 * levels away and safe anywhere below that; a *dark grey* edge pixel at 40 is
 * 215, and lowering this much further starts making solid outlines faintly
 * see-through. Raising it leaves the darkest edge pixels their fringe.
 */
const SOLID = 217

/**
 * How far past the card the soft edge is allowed to reach, in pixels.
 *
 * This bound is the whole reason pale hair survives. If the fill were free to
 * cross anything below `SOLID`, then hair at #EDEAE2 — coverage about 0.08 —
 * would be a corridor, and the fill would walk up it and eat the head. Capping
 * it at two means the fill moves *freely* only over card-coloured pixels and
 * reaches exactly two past, which is the width of an antialiased edge.
 */
const SKIRT = 2

/** Bright enough to be paper rather than a wall. */
const LIGHT_ENOUGH = 225

/** Close enough to grey to be paper rather than a colour. */
const NEUTRAL_ENOUGH = 24

/** How much of one edge must be card before that edge counts as clean. */
const EDGE_CLEAR = 0.9

/**
 * How many of the four edges must be clean. See `refuseKey`.
 *
 * One, measured rather than guessed. This started at three, on the reasoning
 * that a sprite cropped at the waist has a bottom edge of solid subject and
 * ought still to work — and the first real sprite it was pointed at read
 * 0.96 / 0.58 / 0.14 / 0.73 and was refused. A figure cropped at the waist does
 * not touch one edge, it touches three: the bottom, and both sides wherever the
 * shoulders and hair reach the frame.
 *
 * One clean edge is the honest version of the same guard. It says a whole side
 * of the card is visible, which is what makes it a card rather than a
 * background — and the fill does not need clean edges anyway. It seeds from
 * every card-coloured border pixel there is and stops at the subject, so a
 * figure running off three sides keys exactly as well as one running off none.
 * What the guard is really for is the mistaken click on a photograph, and
 * `RING_CLEAR` below is what catches that.
 */
const EDGES_NEEDED = 1

/** Below this much of the whole ring, the picture is not on a card at all. */
const RING_CLEAR = 0.5

/** Past this much existing transparency, it has been cut out already. */
const ALREADY_CUT = 0.02

/**
 * How far from the card a pixel must be to count as a wall around a gap.
 *
 * A quarter of the range. Below it a pixel is still plausibly the top of a
 * ramp off the card rather than something standing in front of it.
 */
const WALLED = 64

/**
 * The smallest pocket worth taking out, as a fraction of the picture.
 *
 * Not a tie-breaker between gap and highlight — the outline test already does
 * that — but a guard against the arithmetic being decided by four pixels. A
 * pocket of one has an outline of four, so a single dark neighbour is 25% and
 * it passes; the first run of `gaps` on a real sprite came back speckled with
 * pinholes through her chin and her dress for exactly that reason.
 *
 * Relative because a gap in a 400px sprite is not the size of a gap in a 4K
 * one, with a floor for the very small pictures where the fraction rounds to
 * nothing. At 1080×1920 it works out at 63 pixels, about eight across.
 */
const MIN_GAP_SHARE = 1 / 32768
const MIN_GAP = 16

/**
 * How much of a pocket's outline must be wall before the pocket is card.
 *
 * The whole of the `gaps` mode is this number, and it was measured rather than
 * picked. A real sprite's unreachable near-white pockets fall into two kinds
 * with nothing in between: the gaps inside her hair are 36-48% walled in by
 * hair, and the blown-out highlights on her skin are 0-1% — because a highlight
 * is the top of a gradient and is surrounded by more gradient, while a gap in
 * the art is surrounded by the art. A quarter sits in the middle of that gulf.
 *
 * Size does not separate them: the largest highlight was 3,092 px and plenty of
 * genuine hair gaps are smaller. Only the outline does.
 */
const WALLED_SHARE = 0.25

/** Bigger than any sprite, and small enough that the typed arrays are sane. */
const MAX_PIXELS = 40_000_000

/** What the border says about whether this picture can be keyed at all. */
export interface BorderReading {
  /** Per-channel median of the border ring: the colour being removed. */
  colour: [number, number, number]
  /** Fraction of the whole ring that is card-coloured, 0..1. */
  coverage: number
  /** The same per edge, in the order top, right, bottom, left. */
  edges: [number, number, number, number]
  /** Fraction of the whole picture already below 250 alpha. */
  transparency: number
}

export type KeyOutcome =
  | {
      ok: true
      image: Raster
      reading: BorderReading
      /** Pixels taken out entirely. */
      cleared: number
      /** Pixels given a partial alpha at the edge of the subject. */
      feathered: number
      /**
       * How many of the cleared pixels were gaps the art had closed around.
       * Always zero in `edge` mode, which is what makes it worth reporting:
       * it says whether choosing `gaps` actually found anything.
       */
      enclosed: number
    }
  | { ok: false; reading: BorderReading | null; message: string }

/**
 * How far a pixel is from the card, in levels, by its furthest channel.
 *
 * This is what decides whether a pixel *is* card, and it is deliberately not
 * `coverage` below. The two answer different questions and conflating them has
 * a sharp edge: on a card of #fdfcfd, `coverage` calls a pixel at 255 fully
 * opaque, because there are only two levels of headroom above the key and
 * filling them takes all the alpha there is. That is the right answer for
 * un-blending and quite wrong for classifying — it would leave every grain of
 * card that happens to be *brighter* than the median standing as a speck.
 *
 * Distance is symmetric about the key and measured in levels, so `tolerance`
 * means what it says: twelve levels either side.
 *
 * Furthest channel rather than a distance through colour space, so a cast in
 * one channel counts at full weight instead of being divided by √3.
 */
export function distance(
  r: number,
  g: number,
  b: number,
  key: readonly [number, number, number]
): number {
  return Math.max(Math.abs(r - key[0]), Math.abs(g - key[1]), Math.abs(b - key[2]))
}

/**
 * The least coverage a pixel can have and still be the key colour blended with
 * something that exists.
 *
 * Used only to decide the alpha of a soft edge and to un-blend it — never to
 * decide what is card. See `distance`.
 *
 * `C = a·F + (1−a)·K`, with `F` confined to 0..255 per channel. Rearranged,
 * each channel names a floor for `a`, and the largest of the three is the
 * answer — the alpha at which un-blending puts one channel exactly on 0 or on
 * 255 and no further. Anything smaller would need a foreground outside the
 * gamut, which is another way of saying this pixel is not that colour blended
 * with anything.
 *
 * Per-channel rather than a distance through colour space on purpose: a faint
 * cast in one channel counts at its full weight instead of being divided by
 * √3 and dismissed.
 *
 * `noise` is what stops that faithfulness turning into a wrong answer on a
 * near-white card, and it is here because the first real sprite this was run on
 * demanded it. Its card is #fcfbfc, three levels below white, and the picture
 * is speckled with compression artefacts like 235,255,255 — a cyan tint on what
 * is plainly still card. In green that pixel sits four levels above the key
 * with three levels of headroom, so the formula concludes, correctly and
 * uselessly, that it must be fully opaque: filling three levels of room takes
 * all the alpha there is. Each such speck then survived at alpha 255. A channel
 * with less headroom than the noise floor cannot tell card from subject, so it
 * is asked to say nothing rather than to shout. On a white card that leaves the
 * dark side doing all the work, where the denominator is ~252 and the answer is
 * exact — which is the side that carries the signal anyway.
 */
export function coverage(
  r: number,
  g: number,
  b: number,
  key: readonly [number, number, number],
  noise = 0
): number {
  let most = 0

  for (let channel = 0; channel < 3; channel++) {
    const value = channel === 0 ? r : channel === 1 ? g : b
    const target = key[channel]!

    // How far this channel could travel before it hit the end of the range.
    // Zero on a key of 0 or 255, which is also what guards the division.
    const headroom = value > target ? 255 - target : target
    if (headroom <= noise) continue

    const needed = Math.abs(value - target) / headroom
    if (needed > most) most = needed
  }

  return most > 1 ? 1 : most
}

function clampTolerance(asked: number | undefined): number {
  if (asked === undefined || !Number.isFinite(asked)) return DEFAULT_TOLERANCE
  return Math.min(Math.max(Math.round(asked), MIN_TOLERANCE), MAX_TOLERANCE)
}

/**
 * How deep the ring sampled for the card colour goes.
 *
 * Two pixels on anything of a normal size, which survives a stray line left by
 * a crop where one would not. Scaled down on a small picture, because a ring
 * two deep into a 5×5 is most of the picture, and the "border" would then be
 * sampling the subject and reporting it as the card.
 */
function ringDepth(width: number, height: number): number {
  return Math.min(2, Math.max(1, Math.floor(Math.min(width, height) / 8)))
}

function median(values: number[]): number {
  if (values.length === 0) return 255
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[sorted.length >> 1]!
}

/**
 * The colour of the card, and how much of the border actually is one.
 *
 * The median rather than the mean, because the mean is dragged by whatever
 * subject runs off the edge of the frame — and a sprite cropped at the waist
 * has a whole edge of it. A median survives up to half the ring being subject.
 */
export function readBorder(image: Raster, tolerance: number): BorderReading {
  const { width, height, data } = image
  const depth = ringDepth(width, height)

  const reds: number[] = []
  const greens: number[] = []
  const blues: number[] = []
  /** Ring pixel indices, grouped as top, right, bottom, left. */
  const edges: number[][] = [[], [], [], []]

  const add = (x: number, y: number, edge: number): void => {
    const at = (y * width + x) * 4
    reds.push(data[at]!)
    greens.push(data[at + 1]!)
    blues.push(data[at + 2]!)
    edges[edge]!.push(at)
  }

  for (let y = 0; y < height; y++) {
    const top = y < depth
    const bottom = y >= height - depth

    for (let x = 0; x < width; x++) {
      // Corners are counted with the top and the bottom, so every ring pixel
      // belongs to exactly one edge and the four fractions are comparable.
      if (top) add(x, y, 0)
      else if (bottom) add(x, y, 2)
      else if (x < depth) add(x, y, 3)
      else if (x >= width - depth) add(x, y, 1)
    }
  }

  const colour: [number, number, number] = [median(reds), median(greens), median(blues)]

  const clearOf = (indices: number[]): number => {
    if (indices.length === 0) return 1
    let clear = 0
    for (const at of indices) {
      if (distance(data[at]!, data[at + 1]!, data[at + 2]!, colour) <= tolerance) clear++
    }
    return clear / indices.length
  }

  const perEdge: [number, number, number, number] = [
    clearOf(edges[0]!),
    clearOf(edges[1]!),
    clearOf(edges[2]!),
    clearOf(edges[3]!)
  ]

  const all = edges.flat()
  let seeThrough = 0
  for (let at = 3; at < data.length; at += 4) if (data[at]! < 250) seeThrough++

  return {
    colour,
    coverage: clearOf(all),
    edges: perEdge,
    transparency: seeThrough / (width * height)
  }
}

const hex = (colour: readonly [number, number, number]): string =>
  `#${colour.map((one) => one.toString(16).padStart(2, '0')).join('')}`

const EDGE_NAMES = ['top', 'right', 'bottom', 'left'] as const

/**
 * Why this picture must not be keyed, or null when it may be.
 *
 * The point of refusing is that there is no undo in a workspace: a picture
 * whose "background" is a grey wall would come back with a hole through the
 * wall and a fringe round everything, and nothing would say why. Every message
 * names what was actually measured, so it reads as a finding rather than a
 * shrug — and so the author can tell a wrong threshold from a wrong picture.
 */
export function refuseKey(image: Raster, reading: BorderReading): string | null {
  const { width, height } = image
  const { colour, edges, transparency } = reading

  if (width < 1 || height < 1) return 'That picture has no pixels in it.'
  if (width * height > MAX_PIXELS) {
    return `That picture is ${width}×${height}, which is larger than this can work on.`
  }

  if (Math.min(...colour) < LIGHT_ENOUGH) {
    return `The border of this picture is ${hex(colour)}, which is not a white background. Nothing was changed.`
  }

  if (Math.max(...colour) - Math.min(...colour) > NEUTRAL_ENOUGH) {
    return `The border of this picture is ${hex(colour)} — a colour, not white. Nothing was changed.`
  }

  if (transparency > ALREADY_CUT) {
    return `${Math.round(transparency * 100)}% of this picture is already transparent — it looks like it has been cut out already. Nothing was changed.`
  }

  const clean = edges.filter((one) => one >= EDGE_CLEAR).length
  if (clean < EDGES_NEEDED) {
    const best = EDGE_NAMES[edges.indexOf(Math.max(...edges))]!
    return `The subject runs off every side of this picture — the clearest edge is the ${best}, and even that is only ${Math.round(Math.max(...edges) * 100)}% background. Nothing was changed.`
  }

  if (reading.coverage < RING_CLEAR) {
    return `Only ${Math.round(reading.coverage * 100)}% of the border is background, so there is no card to take out. Nothing was changed.`
  }

  return null
}

/** Untouched, taken out entirely, or on the soft edge between. */
const UNTOUCHED = 0
const CLEAR = 1
const SKIN = 2

/**
 * Floods inward from the border over card-coloured pixels and takes them out.
 *
 * The input is never mutated — the result is a new raster, so a refusal or a
 * bad result costs nothing and the caller still holds the original.
 */
export function keyBackground(image: Raster, options: KeyOptions = {}): KeyOutcome {
  const { width, height, data } = image
  const tolerance = clampTolerance(options.tolerance)
  const mode = options.mode ?? 'edge'

  // Size before contents: a picture too large to work on is worth saying so
  // about whether or not its bytes were handed over.
  if (width * height > MAX_PIXELS) {
    return {
      ok: false,
      reading: null,
      message: `That picture is ${width}×${height}, which is larger than this can work on.`
    }
  }
  if (width < 1 || height < 1 || data.length !== width * height * 4) {
    return { ok: false, reading: null, message: 'That picture has no pixels in it.' }
  }

  const reading = readBorder(image, tolerance)
  const refusal = refuseKey(image, reading)
  if (refusal) return { ok: false, reading, message: refusal }

  const key = reading.colour
  const pixels = width * height

  /** How far this pixel is from the card, in levels. Decides what it is. */
  const distanceAt = (pixel: number): number => {
    const at = pixel * 4
    return distance(data[at]!, data[at + 1]!, data[at + 2]!, key)
  }

  /** The alpha a soft-edge pixel should carry. Decides what it becomes. */
  const coverageAt = (pixel: number): number => {
    const at = pixel * 4
    return coverage(data[at]!, data[at + 1]!, data[at + 2]!, key, tolerance)
  }

  const state = new Uint8Array(pixels)

  // An explicit queue rather than recursion, sized exactly: every pixel is
  // enqueued at most once, so a 4096-wide picture is a flat walk rather than a
  // stack thousands deep.
  const queue = new Int32Array(pixels)
  let head = 0
  let tail = 0

  const seed = (pixel: number): void => {
    if (state[pixel] !== UNTOUCHED || distanceAt(pixel) > tolerance) return
    state[pixel] = CLEAR
    queue[tail++] = pixel
  }

  for (let x = 0; x < width; x++) {
    seed(x)
    seed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    seed(y * width)
    seed(y * width + width - 1)
  }

  // Four-connected, not eight. Eight walks diagonally through the gap where two
  // antialiased outline pixels meet corner to corner — the classic paint-bucket
  // leak — and a leak here does not spill a little colour, it dissolves the
  // subject from the inside.
  while (head < tail) {
    const pixel = queue[head++]!
    const x = pixel % width
    const y = (pixel / width) | 0

    const step = (nx: number, ny: number): void => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
      const next = ny * width + nx
      if (state[next] !== UNTOUCHED || distanceAt(next) > tolerance) return
      state[next] = CLEAR
      queue[tail++] = next
    }

    step(x - 1, y)
    step(x + 1, y)
    step(x, y - 1)
    step(x, y + 1)
  }

  const reached = tail
  if (mode === 'gaps') fillGaps()
  const enclosed = tail - reached
  const cleared = tail

  /**
   * Card the art has closed around, taken out as well.
   *
   * Every pocket of card-coloured pixels the border fill could not reach is
   * walked once, and kept or cleared on what walls it in — see `WALLED_SHARE`.
   * Cleared ones join the queue, so the skirt below feathers their outlines
   * exactly as it does the outside of the subject; without that a gap would
   * come out with a hard white rim inside a loop of hair.
   *
   * `seen` is separate from `state` on purpose. A pocket that is kept must be
   * left in exactly the condition `edge` mode would have left it, or the two
   * modes would differ on more than the thing they are meant to differ on.
   */
  function fillGaps(): void {
    const seen = new Uint8Array(pixels)
    const members: number[] = []
    const smallest = Math.max(MIN_GAP, Math.round(pixels * MIN_GAP_SHARE))

    for (let start = 0; start < pixels; start++) {
      if (seen[start] === 1 || state[start] !== UNTOUCHED) continue
      seen[start] = 1
      if (distanceAt(start) > tolerance) continue

      members.length = 0
      members.push(start)
      let wall = 0
      let walled = 0

      for (let read = 0; read < members.length; read++) {
        const pixel = members[read]!
        const x = pixel % width
        const y = (pixel / width) | 0

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue

            const next = ny * width + nx
            const away = distanceAt(next)

            if (away > tolerance) {
              // Only the four square neighbours are counted, so that a
              // staircase does not weigh twice as much as a straight run.
              if (dx === 0 || dy === 0) {
                wall++
                if (away >= WALLED) walled++
              }
              continue
            }

            // Card, so part of this same pocket — unless the border fill
            // already has it, which cannot happen for a four-neighbour and
            // can for a diagonal one.
            if (seen[next] === 1 || state[next] !== UNTOUCHED) continue
            seen[next] = 1
            members.push(next)
          }
        }
      }

      if (members.length < smallest) continue
      if (wall === 0 || walled / wall < WALLED_SHARE) continue

      for (const pixel of members) {
        state[pixel] = CLEAR
        queue[tail++] = pixel
      }
    }
  }

  // The soft edge, bounded to SKIRT pixels. Eight-connected here, unlike the
  // fill: two pixels cannot leak anywhere, and four would leave a stray speck
  // of card at every concave corner.
  let frontier = Array.from(queue.subarray(0, tail))
  for (let pass = 0; pass < SKIRT; pass++) {
    const next: number[] = []

    for (const pixel of frontier) {
      const x = pixel % width
      const y = (pixel / width) | 0

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue

          const neighbour = ny * width + nx
          if (state[neighbour] !== UNTOUCHED) continue
          if (distanceAt(neighbour) >= SOLID) continue

          state[neighbour] = SKIN
          next.push(neighbour)
        }
      }
    }

    frontier = next
  }

  const out = new Uint8ClampedArray(data)
  let feathered = 0

  for (let pixel = 0; pixel < pixels; pixel++) {
    const at = pixel * 4

    if (state[pixel] === CLEAR) {
      // The colour under a fully clear pixel is never composited, but writing
      // the card colour rather than leaving whatever was there keeps the file
      // honest for anything that reads RGB without the alpha.
      out[at] = key[0]
      out[at + 1] = key[1]
      out[at + 2] = key[2]
      out[at + 3] = 0
      continue
    }

    if (state[pixel] !== SKIN) continue

    const alpha = coverageAt(pixel)
    feathered++

    // Un-blending is what removes the fringe. A half-covered edge pixel reads
    // 127 over white; left at 127 it composites to `0.5·127 + 0.5·background`,
    // a white halo that is invisible against pale chrome and glaring against a
    // night scene. Recovering F puts it at 0, where it belongs.
    //
    // The division needs no epsilon. A skirt pixel is more than `tolerance`
    // levels from the card and tolerance is clamped to at least 1, so its
    // coverage is at least 1/255 and the reciprocal is bounded. The guard is
    // the classification, not a floating-point fudge.
    for (let channel = 0; channel < 3; channel++) {
      const value = data[at + channel]!
      out[at + channel] = Math.round(key[channel]! + (value - key[channel]!) / alpha)
    }
    out[at + 3] = Math.round(alpha * 255)
  }

  return {
    ok: true,
    image: { width, height, data: out },
    reading,
    cleared,
    feathered,
    enclosed
  }
}

/** `#fbfaf7`, for saying which colour was taken out. */
export function describeColour(colour: readonly [number, number, number]): string {
  return hex(colour)
}

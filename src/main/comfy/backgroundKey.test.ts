import { describe, expect, it } from 'vitest'
import {
  coverage,
  describeColour,
  keyBackground,
  readBorder,
  refuseKey,
  type Raster
} from './backgroundKey'

/**
 * Taking a card out from behind a picture.
 *
 * The cases are drawn as text rather than built as byte arrays, because every
 * one of them is about a *shape* — what the fill can reach and what it cannot —
 * and a grid you can read is the difference between a test that documents the
 * rule and one that restates the implementation.
 *
 * Two of them carry the whole design. "keeps white the fill cannot reach" is
 * the reason this is a flood fill instead of a colour match; "leaves no white
 * fringe" is the reason there is a skirt and an un-blend rather than a hard
 * cut.
 */

type Swatch = [number, number, number, number]

const WHITE: Swatch = [255, 255, 255, 255]
const BLACK: Swatch = [0, 0, 0, 255]
const GREY: Swatch = [128, 128, 128, 255]

/** A picture drawn as text, so a case can be read rather than decoded. */
function grid(rows: string[], palette: Record<string, Swatch>): Raster {
  const height = rows.length
  const width = rows[0]!.length
  const data = new Uint8ClampedArray(width * height * 4)

  rows.forEach((row, y) => {
    expect(row.length, `row ${y} is a different length`).toBe(width)
    for (let x = 0; x < width; x++) {
      const swatch = palette[row[x]!]
      if (!swatch) throw new Error(`no swatch for ${JSON.stringify(row[x])}`)
      data.set(swatch, (y * width + x) * 4)
    }
  })

  return { width, height, data }
}

/** The four bytes at one pixel. */
function at(image: Raster, x: number, y: number): number[] {
  const start = (y * image.width + x) * 4
  return [...image.data.subarray(start, start + 4)]
}

const alphaAt = (image: Raster, x: number, y: number): number => at(image, x, y)[3]!

function ok(outcome: ReturnType<typeof keyBackground>): Extract<
  ReturnType<typeof keyBackground>,
  { ok: true }
> {
  if (!outcome.ok) throw new Error(`expected it to key, but: ${outcome.message}`)
  return outcome
}

describe('coverage', () => {
  const white = [255, 255, 255] as const

  it('is nothing for the key colour itself and everything for its opposite', () => {
    expect(coverage(255, 255, 255, white)).toBe(0)
    expect(coverage(0, 0, 0, white)).toBe(1)
  })

  it('reads a blend as the fraction of it that is not the key', () => {
    // 200 on white is 55 levels of something at full strength, or 255 levels of
    // it at 55/255. The latter is what an antialiased edge actually is.
    expect(coverage(200, 200, 200, white)).toBeCloseTo(55 / 255, 5)
  })

  it('takes the strongest channel rather than averaging them', () => {
    // A cast in one channel is a real difference, and a distance through colour
    // space would divide it by root three and dismiss it.
    expect(coverage(255, 255, 200, white)).toBeCloseTo(55 / 255, 5)
  })

  it('handles a channel brighter than the key without going negative', () => {
    expect(coverage(255, 128, 128, [128, 128, 128])).toBeCloseTo(127 / 127, 5)
  })

  /**
   * The case a real sprite produced, and the reason `noise` exists. Its card
   * reads #fcfbfc and the file is speckled with pale artefacts; without a noise
   * floor each one is called fully opaque on three levels of headroom and
   * survives the cut as a white speck.
   */
  it('ignores a channel with less headroom than the noise floor', () => {
    const card = [252, 251, 252] as const

    expect(coverage(235, 255, 255, card)).toBe(1)
    expect(coverage(235, 255, 255, card, 12)).toBeCloseTo(17 / 252, 5)

    // The dark side is untouched, because that is where the signal is: black
    // lineart is still fully opaque and a half-covered edge still reads a half.
    expect(coverage(0, 0, 0, card, 12)).toBe(1)
    expect(coverage(126, 126, 126, card, 12)).toBeCloseTo(126 / 252, 5)
  })

  it('never divides by zero on a key that is pure in a channel', () => {
    expect(Number.isFinite(coverage(10, 10, 10, [255, 0, 128]))).toBe(true)
    expect(Number.isFinite(coverage(250, 250, 250, [0, 255, 0]))).toBe(true)
  })
})

describe('keyBackground', () => {
  it('takes out the card and leaves the subject alone', () => {
    const image = grid(
      [
        '.....',
        '.###.',
        '.###.',
        '.###.',
        '.....'
      ],
      { '.': WHITE, '#': BLACK }
    )

    const result = ok(keyBackground(image))

    expect(alphaAt(result.image, 0, 0)).toBe(0)
    expect(alphaAt(result.image, 2, 2)).toBe(255)
    expect(at(result.image, 2, 2)).toEqual([0, 0, 0, 255])
  })

  /**
   * The reason this is a flood fill and not a colour match. Their art is a
   * character with pale skin and white highlights; a global key would put
   * holes through her.
   */
  it('keeps white the fill cannot reach', () => {
    const image = grid(
      [
        '.......',
        '.#####.',
        '.#...#.',
        '.#...#.',
        '.#####.',
        '.......'
      ],
      { '.': WHITE, '#': BLACK }
    )

    const result = ok(keyBackground(image))

    expect(alphaAt(result.image, 0, 0)).toBe(0)
    // Enclosed by the subject, so it is part of the picture.
    expect(alphaAt(result.image, 3, 3)).toBe(255)
    expect(at(result.image, 3, 3)).toEqual([255, 255, 255, 255])
  })

  it('does not leak diagonally between two corners of the subject', () => {
    // Four-connected on purpose: eight would squeeze through where the two
    // black pixels meet and dissolve the enclosed white.
    const image = grid(
      [
        '.....',
        '.#...',
        '..#..',
        '.....',
        '.....'
      ],
      { '.': WHITE, '#': BLACK }
    )

    const result = ok(keyBackground(image))
    expect(alphaAt(result.image, 2, 1)).toBe(0)
  })

  /**
   * The fringe test, and the reason for the un-blend.
   *
   * Asserted as a composite rather than as particular alpha numbers: what
   * matters is that putting the result back over the card reproduces the
   * original, which is what "no halo" means. Restating the alphas would only
   * restate the implementation.
   */
  it('leaves no white fringe on a soft edge', () => {
    const ramp: Record<string, Swatch> = {
      '.': WHITE,
      a: [191, 191, 191, 255],
      b: [127, 127, 127, 255],
      c: [63, 63, 63, 255],
      '#': BLACK
    }

    const image = grid(
      [
        '.....',
        '.....',
        '.abc#',
        '.....',
        '.....'
      ],
      ramp
    )

    const result = ok(keyBackground(image))

    for (const [x, original] of [
      [1, 191],
      [2, 127],
      [3, 63]
    ] as const) {
      const [r, , , a] = at(result.image, x, 2) as [number, number, number, number]
      const alpha = a / 255
      // Composited back onto the card it came off, within a rounding step.
      expect(alpha * r + (1 - alpha) * 255).toBeCloseTo(original, 0)
    }
  })

  /**
   * The other half of the same design. The fill moves freely only over card,
   * and reaches exactly two pixels past it — so a long pale gradient is an
   * edge, not a corridor to walk up.
   */
  it('reaches two pixels past the card and no further', () => {
    // A block rather than a line, because a pale line one pixel thick really
    // is entirely within two pixels of the card and would prove nothing. Five
    // across is the smallest that has an inside.
    const image = grid(
      [
        '.........',
        '.........',
        '..ppppp..',
        '..ppppp..',
        '..ppppp..',
        '..ppppp..',
        '..ppppp..',
        '.........',
        '.........'
      ],
      { '.': WHITE, p: [235, 235, 235, 255] }
    )

    const result = ok(keyBackground(image))

    expect(alphaAt(result.image, 0, 0)).toBe(0)
    // Two rings in from the card, and no further: the middle of the block is
    // untouched. This is pale hair surviving.
    expect(alphaAt(result.image, 2, 2)).toBeLessThan(255)
    expect(alphaAt(result.image, 3, 3)).toBeLessThan(255)
    expect(alphaAt(result.image, 4, 4)).toBe(255)
    expect(at(result.image, 4, 4)).toEqual([235, 235, 235, 255])
  })

  it('takes the card colour from the border rather than assuming white', () => {
    // Their real card is #fdfcfd, and un-blending against pure white would
    // leave a tint on every soft edge.
    const paper: Swatch = [253, 252, 253, 255]
    const image = grid(
      [
        '.....',
        '.....',
        '..#..',
        '.....',
        '.....'
      ],
      { '.': paper, '#': BLACK }
    )

    const reading = readBorder(image, 12)
    expect(reading.colour).toEqual([253, 252, 253])
    expect(describeColour(reading.colour)).toBe('#fdfcfd')
    expect(ok(keyBackground(image)).cleared).toBeGreaterThan(0)
  })

  it('survives grain in the card', () => {
    const image = grid(
      [
        'abab.',
        'ba.ab',
        'ab#ba',
        'ba.ab',
        'abab.'
      ],
      {
        '.': [255, 255, 255, 255],
        a: [252, 253, 251, 255],
        b: [249, 250, 252, 255],
        '#': BLACK
      }
    )

    const result = ok(keyBackground(image))
    expect(alphaAt(result.image, 0, 0)).toBe(0)
    expect(alphaAt(result.image, 2, 2)).toBe(255)
  })

  it('never touches the picture it was given', () => {
    const image = grid(['...', '.#.', '...'], { '.': WHITE, '#': BLACK })
    const before = new Uint8ClampedArray(image.data)

    ok(keyBackground(image))
    expect(image.data).toEqual(before)
  })

  it('counts what it did', () => {
    const image = grid(['...', '.#.', '...'], { '.': WHITE, '#': BLACK })
    const result = ok(keyBackground(image))

    expect(result.cleared).toBe(8)
    expect(result.cleared + result.feathered).toBeLessThanOrEqual(9)
  })

  it('walks a big picture without recursion or a quadratic', () => {
    const side = 1024
    const data = new Uint8ClampedArray(side * side * 4).fill(255)
    const started = Date.now()

    const result = ok(keyBackground({ width: side, height: side, data }))

    expect(result.cleared).toBe(side * side)
    expect(Date.now() - started).toBeLessThan(5000)
  })
})

/**
 * The second mode, and the reason it needs a rule rather than a switch.
 *
 * `edge` leaves the paper showing through a loop of hair, because no path from
 * the border reaches it — which is the same property that protects the whites
 * of an eye. `gaps` tells the two apart by what walls them in: art, or more of
 * the same near-white ramp.
 */
describe('gaps the art has closed around', () => {
  /** A 4×4 pocket inside a two-pixel ring of whatever `wall` is. */
  const pocket = (wall: Swatch): Raster =>
    grid(
      [
        '............',
        '............',
        '..wwwwwwww..',
        '..wwwwwwww..',
        '..ww....ww..',
        '..ww....ww..',
        '..ww....ww..',
        '..ww....ww..',
        '..wwwwwwww..',
        '..wwwwwwww..',
        '............',
        '............'
      ],
      { '.': WHITE, w: wall }
    )

  it('leaves it alone in edge mode, whatever walls it', () => {
    const inArt = ok(keyBackground(pocket(BLACK)))

    expect(alphaAt(inArt.image, 4, 4)).toBe(255)
    expect(inArt.enclosed).toBe(0)
  })

  it('takes out card the art has closed around', () => {
    const result = ok(keyBackground(pocket(BLACK), { mode: 'gaps' }))

    expect(alphaAt(result.image, 4, 4)).toBe(0)
    expect(alphaAt(result.image, 6, 6)).toBe(0)
    expect(result.enclosed).toBe(16)
    // The art itself is untouched: it is what made this a gap.
    expect(at(result.image, 3, 3)).toEqual([0, 0, 0, 255])
  })

  /**
   * A pocket of one pixel has an outline of four, so a single dark neighbour is
   * a quarter of it and the share test passes on nothing. Left unguarded, the
   * first real run came back with pinholes through her chin and her dress.
   */
  it('leaves a pocket too small to be a gap', () => {
    const image = grid(
      [
        '.......',
        '.#####.',
        '.#####.',
        '.##.##.',
        '.#####.',
        '.#####.',
        '.......'
      ],
      { '.': WHITE, '#': BLACK }
    )

    const result = ok(keyBackground(image, { mode: 'gaps' }))

    expect(alphaAt(result.image, 3, 3)).toBe(255)
    expect(result.enclosed).toBe(0)
  })

  /**
   * The case that decides whether this mode is usable at all. A blown-out
   * highlight is white enclosed by white-ish, and clearing it puts a hole
   * through the subject — through pale skin, in the picture this was built for.
   */
  it('keeps a highlight, which is walled in by more of the same ramp', () => {
    // Forty levels off the card: too far to be card, too near to be art.
    const result = ok(keyBackground(pocket([215, 215, 215, 255]), { mode: 'gaps' }))

    expect(alphaAt(result.image, 4, 4)).toBe(255)
    expect(result.enclosed).toBe(0)
  })

  it('still keeps white the fill cannot reach when it is walled in softly', () => {
    // Both modes agree here, which is the point: `gaps` is not `edge` with the
    // protection removed, it is `edge` plus one measured exception.
    const soft: Swatch = [215, 215, 215, 255]
    const edge = ok(keyBackground(pocket(soft)))
    const gaps = ok(keyBackground(pocket(soft), { mode: 'gaps' }))

    expect(gaps.cleared).toBe(edge.cleared)
  })
})

describe('refusing rather than wrecking it', () => {
  const refusal = (image: Raster): string => {
    const outcome = keyBackground(image)
    if (outcome.ok) throw new Error('expected it to refuse')
    return outcome.message
  }

  it('says so when the border is not light', () => {
    const image = grid(['###', '#.#', '###'], { '.': WHITE, '#': [106, 106, 114, 255] })
    expect(refusal(image)).toMatch(/#6a6a72, which is not a white background/)
  })

  it('says so when the border is a colour', () => {
    // Light enough to pass the brightness test, so it is the spread between
    // channels that catches it rather than the brightness.
    const image = grid(['ccc', 'c.c', 'ccc'], { '.': WHITE, c: [255, 245, 228, 255] })
    expect(refusal(image)).toMatch(/a colour, not white/)
  })

  /**
   * Something crossing the frame both ways touches all four sides, so no whole
   * side of a card is visible and there is no telling this from a picture that
   * simply has pale things at its edges. The ring is still 78% white, which is
   * the point: the ring alone would have let this through.
   */
  it('says so when the subject runs off every side', () => {
    const image = grid(
      [
        '....##....',
        '....##....',
        '....##....',
        '....##....',
        '##########',
        '##########',
        '....##....',
        '....##....',
        '....##....',
        '....##....'
      ],
      { '.': WHITE, '#': BLACK }
    )

    const message = refusal(image)
    expect(message).toMatch(/runs off every side/)
    expect(message).toMatch(/clearest edge is the top/)
  })

  /**
   * The near miss that must not be refused, and the reason the rule is one
   * clean edge rather than three.
   *
   * This is the shape of the first real sprite the feature was pointed at: a
   * figure cropped at the waist, whose shoulders and hair also reach both
   * sides. Three of its four edges carry subject. Only the top is clear, and
   * the top is enough — the fill seeds from every card pixel on the border and
   * stops at the subject, so where the subject happens to touch changes
   * nothing about the result.
   */
  it('proceeds for a subject cropped off three edges', () => {
    const image = grid(
      [
        '........',
        '...##...',
        '..####..',
        '.######.',
        '########',
        '########'
      ],
      { '.': WHITE, '#': BLACK }
    )

    const outcome = keyBackground(image)
    expect(outcome.ok, outcome.ok ? '' : outcome.message).toBe(true)
    if (outcome.ok) expect(outcome.cleared).toBeGreaterThan(0)
  })

  it('says so when it has been cut out already', () => {
    const image = grid(['...', '.o.', '...'], {
      '.': WHITE,
      o: [255, 255, 255, 0]
    })
    expect(refusal(image)).toMatch(/already transparent/)
  })

  it('says so when the picture is too big to work on', () => {
    const outcome = keyBackground({
      width: 8000,
      height: 8000,
      data: new Uint8ClampedArray(0)
    })
    if (outcome.ok) throw new Error('expected it to refuse')
    expect(outcome.message).toMatch(/larger than this can work on/)
  })

  it('says so about a picture with no pixels', () => {
    const outcome = keyBackground({ width: 0, height: 0, data: new Uint8ClampedArray(0) })
    if (outcome.ok) throw new Error('expected it to refuse')
    expect(outcome.message).toMatch(/no pixels/)
  })

  it('copes with a single pixel', () => {
    const image = grid(['.'], { '.': WHITE })
    const outcome = keyBackground(image)
    expect(outcome.ok).toBe(true)
  })

  it('reports the measurements whether or not it proceeds', () => {
    const image = grid(['###', '#.#', '###'], { '.': WHITE, '#': GREY })
    const outcome = keyBackground(image)

    if (outcome.ok) throw new Error('expected it to refuse')
    // Diagnostic rather than a shrug: the reading is there to be looked at.
    expect(outcome.reading?.colour).toEqual([128, 128, 128])
    expect(refuseKey(image, outcome.reading!)).toBe(outcome.message)
  })
})

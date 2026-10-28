import { useEffect, useRef, useState } from 'react'
import {
  backgroundFor,
  BOARD,
  circuitLit,
  createMiniGame,
  drillPoints,
  miniGameDone,
  miniGameScore,
  moveWire,
  onPace,
  paceLead,
  pressPower,
  lightCandle,
  candleLit,
  CANDLE_COLORS,
  releasePower,
  answerFace,
  faceNow,
  shownForce,
  SIDES,
  stepMiniGame,
  tapPace,
  toDate,
  TONES,
  turnTile,
  viewImage,
  type MiniGame,
  type Tone
} from '../../../shared/game'
import { MOODS, STAT_NAMES, type ContentPack, type GameState, type Mood, type PendingDrill } from '../../../shared/model'
import { t, type MessageKey } from '../../../shared/i18n'
import { Dialog } from './Dialog'
import { Facts } from './Facts'
import { Button } from './Button'

interface Props {
  content: ContentPack
  state: GameState
  drill: PendingDrill
  /** The game is over, played or skipped: how it went, from 0 to 1. */
  onFinish: (score: number) => void
}

type Rect = { x: number; y: number; w: number; h: number }
type Pictures = Map<string, HTMLImageElement>

const HOW: Record<MiniGame['kind'], MessageKey> = {
  strength: 'screens.miniGame.how.strength',
  dexterity: 'screens.miniGame.how.dexterity',
  endurance: 'screens.miniGame.how.endurance',
  intelligence: 'screens.miniGame.how.intelligence',
  wisdom: 'screens.miniGame.how.wisdom',
  charisma: 'screens.miniGame.how.charisma'
}
const TONE_LABELS: Record<Tone, MessageKey> = {
  compliment: 'screens.miniGame.tone.compliment',
  joke: 'screens.miniGame.tone.joke',
  comfort: 'screens.miniGame.tone.comfort',
  space: 'screens.miniGame.tone.space'
}
// Where the tip of the wick is in the candle's picture, and where the flame's base is in a flame's, as shares of each:
// the flame is set so that the one is on the other. Measured from the pictures; one drawn again may need them again.
const WICK = { x: 0.5, y: 0.066 }
const FLAME_BASE = 0.78
const GOLD = '#e8c66a'
const GOOD = '#7fd88a'
const BAD = '#e57373'
const INK = '#f4ecd8'

/**
 * A drill, played: its game drawn over the place it is at, with what it is and what it is worth before it, and how it
 * went after. Everything in the game is drawn on the one canvas, with the pictures the game has for it.
 */
export function MiniGameView({ content, state, drill, onFinish }: Props) {
  const [phase, setPhase] = useState<'intro' | 'playing' | 'done'>('intro')
  const [score, setScore] = useState(0)
  const playing = useRef(false)
  const game = useRef<MiniGame>(createMiniGame(content, state, drill))
  const canvas = useRef<HTMLCanvasElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const pictures = usePictures(content, state)

  const end = () => {
    playing.current = false
    setScore(miniGameScore(game.current))
    setPhase('done')
  }
  const act = (next: MiniGame) => {
    if (!playing.current) return
    game.current = next
    if (miniGameDone(next)) end()
  }

  // The game goes on in time, and is drawn afresh, every frame.
  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (playing.current) act(stepMiniGame(game.current, dt))
      const el = canvas.current
      if (el) draw(el, game.current, pictures.current, pointer.current)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // The space bar is a press as a click is, and Escape stops the game where it is.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!playing.current) return
      // The tones, and the candles, can be chosen with the number keys as well, in the order they stand.
      const nth = Number(event.key) - 1
      if (event.key === 'Escape') end()
      else if (game.current.kind === 'charisma' && TONES[nth] && !event.repeat) act(answerFace(game.current, TONES[nth]))
      else if (game.current.kind === 'wisdom' && nth >= 0 && !event.repeat) act(lightCandle(game.current, nth))
      else if (event.key === ' ' && !event.repeat) {
        event.preventDefault()
        press()
      }
    }
    const up = (event: KeyboardEvent) => event.key === ' ' && release()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  function press(at?: { x: number; y: number }) {
    const g = game.current
    const el = canvas.current
    if (g.kind === 'strength') act(pressPower(g))
    else if (g.kind === 'endurance') act(tapPace(g))
    else if (at && el && g.kind === 'wisdom') {
      const candle = candleSpots(board(el), g.candles).findIndex((rect) => inside(at, rect))
      if (candle >= 0) act(lightCandle(g, candle))
    }
    else if (at && el && g.kind === 'intelligence') {
      const cell = circuitCells(board(el), g.size).find((one) => inside(at, one.rect))
      if (cell) act(turnTile(g, cell.r, cell.c))
    } else if (at && el && g.kind === 'charisma') {
      const tone = toneButtons(board(el)).findIndex((rect) => inside(at, rect))
      if (tone >= 0) act(answerFace(g, TONES[tone]))
    } else if (at) move(at)
  }
  function release() {
    const g = game.current
    if (g.kind === 'strength') act(releasePower(g))
  }
  function move(at: { x: number; y: number }) {
    pointer.current = at
    const g = game.current
    const el = canvas.current
    if (g.kind === 'dexterity' && el) act(moveWire(g, toUnits(board(el), at)))
  }
  const at = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  // Who sets the pace on the run, by her first name.
  const pacerName = [...content.loveInterests, ...content.npcs].find((one) => one.id === content.minigames.pacerId)?.name.split(' ')[0] ?? ''
  const least = drillPoints(drill.hours, 0)
  const most = drillPoints(drill.hours, 1)
  return (
    <main className="stage">
      <canvas
        ref={canvas}
        className="backdrop"
        onPointerDown={(event) => press(at(event))}
        onPointerUp={release}
        onPointerMove={(event) => move(at(event))}
        onPointerLeave={() => {
          pointer.current = null
          release()
        }}
      />
      {phase === 'intro' && (
        <Dialog title={drill.title} narrow noClose onClose={() => undefined}>
          {drill.description && <p>{drill.description}</p>}
          <Facts
            facts={[
              { label: STAT_NAMES[drill.stat], value: state.player.stats[drill.stat] ?? 0 },
              { label: t('screens.miniGame.hours'), value: drill.hours },
              { label: t('screens.miniGame.training'), value: t('screens.miniGame.range', { least, most }) }
            ]}
          />
          <p className="hint">{t(HOW[game.current.kind], { name: pacerName })}</p>
          <div className="actions end">
            <Button variant="quiet" onClick={() => onFinish(0)}>
              {t('screens.miniGame.skip', { points: least })}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                playing.current = true
                setPhase('playing')
              }}
            >
              {t('screens.miniGame.play')}
            </Button>
          </div>
        </Dialog>
      )}
      {phase === 'done' && (
        <Dialog title={drill.title} narrow noClose onClose={() => onFinish(score)}>
          <Facts
            facts={[
              { label: t('screens.miniGame.score'), value: t('screens.miniGame.percent', { percent: Math.round(score * 100) }) },
              { label: t('screens.miniGame.training'), value: t('screens.miniGame.points', { points: Math.round(drillPoints(drill.hours, score) * 10) / 10 }) }
            ]}
          />
          <div className="actions end">
            <Button variant="primary" onClick={() => onFinish(score)}>
              {t('screens.miniGame.done')}
            </Button>
          </div>
        </Dialog>
      )}
    </main>
  )
}

/** The pictures the games are drawn with, and the place behind them, by id, as each loads. */
function usePictures(content: ContentPack, state: GameState) {
  const pictures = useRef<Pictures>(new Map())
  useEffect(() => {
    const { pieces, runners, scenery, listeners } = content.minigames
    const location = content.locations.find((l) => l.id === state.locationId)
    const backdrop = viewImage(location && backgroundFor(location), toDate(content.calendar, state.time).period.light)
    const wanted: [string, string | undefined][] = [
      ...[...pieces, ...runners].map((one): [string, string | undefined] => [one.id, one.iconImage]),
      ...scenery.map((one): [string, string | undefined] => [`scenery:${one.id}`, one.iconImage]),
      ...listeners.flatMap((one) => MOODS.map((mood): [string, string | undefined] => [faceKey(one.id, mood), one.faces[mood]]))
    ]
    for (const [id, path] of [...wanted, ['backdrop', backdrop] as [string, string | undefined]]) {
      if (!path) continue
      const image = new Image()
      image.onload = () => pictures.current.set(id, image)
      image.src = `content://pack/${path}`
    }
  }, [])
  return pictures
}

/** Where the game is played: the middle of the screen, sixteen by nine, under the title. */
function board(el: HTMLCanvasElement): Rect {
  const width = el.clientWidth
  const height = el.clientHeight
  const w = Math.min(width * 0.86, ((height - 170) * BOARD.width) / BOARD.height)
  const h = (w * BOARD.height) / BOARD.width
  return { x: (width - w) / 2, y: 100 + (height - 170 - h) / 2, w, h }
}

const inside = (at: { x: number; y: number }, rect: Rect) => at.x >= rect.x && at.x <= rect.x + rect.w && at.y >= rect.y && at.y <= rect.y + rect.h
const toUnits = (rect: Rect, at: { x: number; y: number }) => ({ x: ((at.x - rect.x) / rect.w) * BOARD.width, y: ((at.y - rect.y) / rect.h) * BOARD.height })
const toScreen = (rect: Rect, at: { x: number; y: number }) => ({ x: rect.x + (at.x / BOARD.width) * rect.w, y: rect.y + (at.y / BOARD.height) * rect.h })

function circuitCells(rect: Rect, size: number): { r: number; c: number; rect: Rect }[] {
  const side = Math.min(rect.h, rect.w * 0.7)
  const cell = side / size
  const x0 = rect.x + (rect.w - side) / 2
  const y0 = rect.y + (rect.h - side) / 2
  return Array.from({ length: size * size }, (_, i) => ({ r: Math.floor(i / size), c: i % size, rect: { x: x0 + (i % size) * cell, y: y0 + Math.floor(i / size) * cell, w: cell, h: cell } }))
}

/** The candles, in a row across the middle of the board. */
function candleSpots(rect: Rect, count: number): Rect[] {
  const h = rect.h * 0.5
  const w = Math.min(h * 0.6, (rect.w * 0.9) / count)
  const x0 = rect.x + (rect.w - count * w) / 2
  return Array.from({ length: count }, (_, i) => ({ x: x0 + i * w, y: rect.y + (rect.h - h) / 2, w, h }))
}

/** A stranger's face in one mood, as the pictures are kept. */
const faceKey = (id: string, mood: Mood) => `face:${id}:${mood}`

/** The four tones he can answer in, in a row along the bottom of the board. */
function toneButtons(rect: Rect): Rect[] {
  const w = rect.w * 0.17
  const h = rect.h * 0.3
  const gap = rect.w * 0.035
  const x0 = rect.x + (rect.w - (TONES.length * w + (TONES.length - 1) * gap)) / 2
  return TONES.map((_, i) => ({ x: x0 + i * (w + gap), y: rect.y + rect.h - h, w, h }))
}

/** How he is doing on the run, as its banner says it. */
type PaceState = 'pace' | 'behind' | 'fast'
const PACE_BANNERS: Record<PaceState, { label: MessageKey; icon: string; ribbon: keyof typeof RIBBONS }> = {
  pace: { label: 'screens.miniGame.keepingPace', icon: 'run-pace', ribbon: 'green' },
  behind: { label: 'screens.miniGame.speedUp', icon: 'run-behind', ribbon: 'amber' },
  fast: { label: 'screens.miniGame.easeOff', icon: 'run-fast', ribbon: 'crimson' }
}
// The banner each screen is showing, by what it is about, and since when, with the one it replaced: a new one sweeps in
// as the old one fades away, and one that stays stays put.
const banners = new WeakMap<HTMLCanvasElement, { key: string; since: number; style: Banner; y: number; prev?: { style: Banner; y: number } }>()
// How long the banner that has gone takes to fade, and a new one to come in, in milliseconds.
const BANNER_IN = 300
const BANNER_OUT = 220

// What the run's screen keeps from frame to frame: where the pacer is drawn, gliding toward where she should be, and
// how he is doing as the banner says it, which changes only once the new state has held for a moment.
const runViews = new WeakMap<HTMLCanvasElement, { x: number; at: number; shown: PaceState; candidate: PaceState; since: number }>()
// How long a new state has to hold before the banner says so, and how quickly she closes on where she should be.
const PACE_SETTLE = 400
const PACER_GLIDE = 3

// The vine of the ornate kit's corners (`VineCorner` in icons.tsx), drawn for the top left on its 56-unit grid.
const VINE = ['M4 52V20C4 11 11 4 20 4h32', 'M4 30c7-1 10-5 9-11-6 0-9 5-9 11zM30 4c-1 7-5 10-11 9 0-6 5-9 11-9z', 'M12 12c4 0 7 3 7 7'].map((d) => new Path2D(d))
// How far in from the edge the vines sit, and how big they are, as the kit has them.
const VINE_INSET = 6
const VINE_SIZE = 20

/** The colours of the ornate kit, as the stylesheet sets them, so that the panels here match the ones in the page. */
function kitColors() {
  const css = getComputedStyle(document.documentElement)
  const of = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return { moss: of('--moss-deep', '#33492a'), wood: of('--wood', '#25301f'), woodDeep: of('--wood-deep', '#1a2216'), gold: of('--gold', '#d4af5a'), goldDeep: of('--gold-deep', '#9c7a2e') }
}

/**
 * A panel of the ornate kit, drawn: dark moss and wood trimmed in gold, with the kit's double rule inside its edge and
 * its gold vines in the corners, as `.ornate.cornered` is in the stylesheet.
 */
function framed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const kit = kitColors()
  ctx.save()
  // The ground: the kit's gradient at 160 degrees, from the top left down to the bottom right, under a deep shadow.
  const angle = (160 * Math.PI) / 180
  const [dx, dy] = [Math.sin(angle), -Math.cos(angle)]
  const reach = Math.abs((w / 2) * dx) + Math.abs((h / 2) * dy)
  const [cx, cy] = [x + w / 2, y + h / 2]
  const ground = ctx.createLinearGradient(cx - dx * reach, cy - dy * reach, cx + dx * reach, cy + dy * reach)
  ground.addColorStop(0, kit.moss)
  ground.addColorStop(0.55, kit.wood)
  ground.addColorStop(1, kit.woodDeep)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 14
  ctx.fillStyle = ground
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 10)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  // Its edge, and the double rule inside it: a dark band four wide, then a line of gold.
  ctx.strokeStyle = kit.goldDeep
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 10)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(26, 34, 22, 0.6)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 8)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(212, 175, 90, 0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x + 5.5, y + 5.5, w - 11, h - 11, 6)
  ctx.stroke()
  // The vines, one to a corner, turned to face into it as the stylesheet turns them.
  ctx.strokeStyle = kit.gold
  ctx.globalAlpha = 0.7
  ctx.lineCap = 'round'
  for (const [fx, fy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    ctx.save()
    ctx.translate(fx > 0 ? x + VINE_INSET : x + w - VINE_INSET, fy > 0 ? y + VINE_INSET : y + h - VINE_INSET)
    ctx.scale((fx * VINE_SIZE) / 56, (fy * VINE_SIZE) / 56)
    // A little under a pixel, as fine as the kit's vines are drawn in the page.
    ctx.lineWidth = 2.4
    for (const part of VINE) ctx.stroke(part)
    ctx.restore()
  }
  ctx.restore()
}

/** The colours a banner comes in: its ribbon, and the light along its edges. */
const RIBBONS = {
  green: { color: '#1f9d5c', light: '#8dffc0' },
  amber: { color: '#c8730f', light: '#ffd27a' },
  crimson: { color: '#c42a3c', light: '#ff9aa6' },
  violet: { color: '#5b34b8', light: '#c9a8ff' },
  gold: { color: '#a8801f', light: '#ffe9a8' }
} as const

// Icons drawn a little larger than the rest when they stand for something: the barbell's picture is mostly the space
// above and below a thin bar, which already runs from side to side.
const ICON_SCALE: Record<string, number> = { barbell: 1.2 }

/** What a banner says, and how: its colour, its icon, its words. */
interface Banner {
  color: string
  light: string
  icon: string
  words: string
}

/**
 * A slanted ribbon across the left of the screen, with its icon on a disc and its words. `shown` is how far it has
 * swept in, from 0 to 1. It is as long as its words need.
 */
function banner(
  ctx: CanvasRenderingContext2D,
  style: Banner,
  picture: (id: string, x: number, y: number, w: number, h?: number) => void,
  text: (words: string, x: number, y: number, size: number, color?: string, align?: CanvasTextAlign, weight?: string) => void,
  width: number,
  y: number,
  shown: number
) {
  const h = 66
  ctx.font = `italic 700 30px ${getComputedStyle(document.body).fontFamily}`
  const w = Math.max(320, width * 0.24, ctx.measureText(style.words).width + h * 2.4 + 40)
  const eased = 1 - (1 - shown) ** 3
  ctx.save()
  ctx.translate(-w * (1 - eased), y)
  ctx.rotate(-0.07)
  ctx.globalAlpha = eased
  const fill = ctx.createLinearGradient(0, 0, w, 0)
  fill.addColorStop(0, `${style.color}00`)
  fill.addColorStop(0.25, `${style.color}dd`)
  fill.addColorStop(1, `${style.color}f2`)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(-20, -h / 2)
  ctx.lineTo(w, -h / 2)
  ctx.lineTo(w - 26, h / 2)
  ctx.lineTo(-20, h / 2)
  ctx.closePath()
  ctx.fill()
  // Glowing edges above and below.
  ctx.shadowColor = style.light
  ctx.shadowBlur = 14
  ctx.strokeStyle = style.light
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(w * 0.15, -h / 2)
  ctx.lineTo(w, -h / 2)
  ctx.moveTo(w * 0.15, h / 2)
  ctx.lineTo(w - 26, h / 2)
  ctx.stroke()
  ctx.shadowBlur = 0
  // The icon on a dark disc rimmed in the banner's light, so that it stands out from a banner of its own colour.
  const disc = h * 1.1
  ctx.fillStyle = 'rgba(16, 10, 28, 0.85)'
  ctx.strokeStyle = style.light
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(disc, 0, h * 0.62, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  picture(style.icon, disc, 0, h * 1.05 * (ICON_SCALE[style.icon] ?? 1))
  text(style.words, disc + h * 0.8, 2, 30, '#ffffff', 'left', 'italic 700')
  ctx.restore()
}

/** A small gold-rimmed key, with the number that picks what it is under. */
function keycap(ctx: CanvasRenderingContext2D, text: (words: string, x: number, y: number, size: number, color?: string) => void, n: number, x: number, y: number, lit: boolean) {
  const kit = kitColors()
  ctx.fillStyle = lit ? kit.gold : 'rgba(22, 16, 30, 0.9)'
  ctx.strokeStyle = kit.gold
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(x - 13, y - 13, 26, 26, 6)
  ctx.fill()
  ctx.stroke()
  text(String(n), x, y + 1, 15, lit ? '#1a1206' : kit.gold)
}

function draw(el: HTMLCanvasElement, game: MiniGame, pictures: Pictures, pointer: { x: number; y: number } | null) {
  const ratio = window.devicePixelRatio || 1
  const [width, height] = [el.clientWidth, el.clientHeight]
  if (el.width !== Math.round(width * ratio) || el.height !== Math.round(height * ratio)) {
    el.width = Math.round(width * ratio)
    el.height = Math.round(height * ratio)
  }
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  const path = game.kind === 'endurance' ? pictures.get('scenery:river-path') : undefined
  if (game.kind === 'endurance' && path) {
    // The river path, going by as fast as he runs: copy after copy across the screen, every other one mirrored so
    // that each meets the next on the same edge and the join does not show.
    // A couple of pixels are trimmed off each side, where a drawn picture's edge is often a faint line.
    const trim = 2
    const scale = height / path.height
    const w = (path.width - trim * 2) * scale
    const offset = (game.distance * width * 0.45) % (w * 2)
    for (let x = -offset, i = 0; x < width; x += w, i++) {
      if (i % 2 === 0) ctx.drawImage(path, trim, 0, path.width - trim * 2, path.height, x, 0, w + 1, height)
      else {
        ctx.save()
        ctx.translate(x + w, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(path, trim, 0, path.width - trim * 2, path.height, -1, 0, w + 1, height)
        ctx.restore()
      }
    }
    ctx.fillStyle = 'rgba(10, 8, 14, 0.12)'
  } else {
    // The place he is at, filling the screen, darkened for the game to stand out on.
    const backdrop = pictures.get('backdrop')
    if (backdrop) {
      const scale = Math.max(width / backdrop.width, height / backdrop.height)
      ctx.drawImage(backdrop, (width - backdrop.width * scale) / 2, (height - backdrop.height * scale) / 2, backdrop.width * scale, backdrop.height * scale)
    }
    ctx.fillStyle = 'rgba(10, 8, 14, 0.55)'
  }
  ctx.fillRect(0, 0, width, height)
  const font = getComputedStyle(document.body).fontFamily
  const text = (words: string, x: number, y: number, size: number, color = INK, align: CanvasTextAlign = 'center', weight = '600') => {
    ctx.font = `${weight} ${size}px ${font}`
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 6
    ctx.fillStyle = color
    ctx.fillText(words, x, y)
    ctx.shadowBlur = 0
  }
  const picture = (id: string, x: number, y: number, w: number, h = w) => {
    const image = pictures.get(id)
    if (image) ctx.drawImage(image, x - w / 2, y - h / 2, w, h)
    else {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fillRect(x - w / 2, y - h / 2, w, h)
    }
  }
  // The time a game played against the clock has left, as a stopwatch reads it, in a panel of the kit at the top right.
  const timeLeft = (seconds: number) => {
    const left = Math.max(0, seconds)
    framed(ctx, width - 262, 20, 240, 64)
    picture('stopwatch', width - 212, 52, 42)
    text(t('screens.miniGame.timeLeft'), width - 184, 40, 14, kitColors().gold, 'left')
    text(`${String(Math.floor(left / 60)).padStart(2, '0')}:${(left % 60).toFixed(1).padStart(4, '0')}`, width - 184, 63, 26, INK, 'left')
  }
  // A count the game keeps, in a panel of the kit at the top left: its icon, what it counts, and how many.
  const counter = (icon: string, label: string, value: string, color = INK) => {
    framed(ctx, 22, 20, 210, 64)
    picture(icon, 74, 52, 40 * (ICON_SCALE[icon] ?? 1))
    text(label, 102, 40, 14, kitColors().gold, 'left')
    text(value, 102, 63, 26, color, 'left')
  }
  // A banner about something: it sweeps in when what it is about changes, as the one before fades out, and stays put
  // while it does not change.
  const showBanner = (key: string, ribbon: keyof typeof RIBBONS, icon: string, words: string, y = height * 0.42) => {
    const now = performance.now()
    const style: Banner = { ...RIBBONS[ribbon], icon, words }
    const was = banners.get(el)
    if (was?.key !== key) banners.set(el, { key, since: now, style, y, prev: was && { style: was.style, y: was.y } })
    // The words of one that stays may change as it stays: his turn, counted.
    const shown = banners.get(el)!
    shown.style = style
    const into = now - shown.since
    if (shown.prev && into < BANNER_OUT) banner(ctx, shown.prev.style, picture, text, width, shown.prev.y, 1 - into / BANNER_OUT)
    banner(ctx, style, picture, text, width, y, Math.min(1, into / BANNER_IN))
  }

  const rect = board(el)

  switch (game.kind) {
    case 'strength': {
      // The bar rises with the force he puts into it; the mark is where it should be let go.
      const track = { x: rect.x + rect.w / 2, top: rect.y + rect.h * 0.08, bottom: rect.y + rect.h * 0.92 }
      const yOf = (force: number) => track.bottom - force * (track.bottom - track.top)
      ctx.fillStyle = 'rgba(232, 198, 106, 0.28)'
      ctx.fillRect(track.x - rect.w * 0.16, yOf(game.zone.center + game.zone.width / 2), rect.w * 0.32, yOf(game.zone.center - game.zone.width / 2) - yOf(game.zone.center + game.zone.width / 2))
      ctx.strokeStyle = 'rgba(244, 236, 216, 0.5)'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(track.x, track.top)
      ctx.lineTo(track.x, track.bottom)
      ctx.stroke()
      // The bar spans the mark it is lifted into.
      picture('barbell', track.x, yOf(shownForce(game)), rect.w * 0.34)
      counter('barbell', t('screens.miniGame.reps'), `${Math.min(game.reps, game.results.length + 1)} / ${game.reps}`)
      // How the last rep went, as a banner that comes in with each one.
      const lastRep = game.results[game.results.length - 1]
      if (lastRep !== undefined) {
        const [ribbon, words] = lastRep >= 0.75 ? (['green', 'screens.miniGame.repPerfect'] as const) : lastRep > 0 ? (['gold', 'screens.miniGame.repGood'] as const) : (['crimson', 'screens.miniGame.repMissed'] as const)
        showBanner(`rep-${game.results.length}`, ribbon, 'barbell', t(words, { percent: Math.round(lastRep * 100) }))
      }
      break
    }
    case 'dexterity': {
      const points = game.path.map((p) => toScreen(rect, p))
      const line = (to: number, w: number, color: string) => {
        ctx.strokeStyle = color
        ctx.lineWidth = w
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        points.slice(0, to + 1).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
        ctx.stroke()
      }
      line(points.length - 1, (game.tolerance * 2 * rect.w) / BOARD.width, 'rgba(232, 198, 106, 0.18)')
      line(points.length - 1, 4, '#b87333')
      line(game.progress, 6, GOLD)
      picture('spark', points[game.progress].x, points[game.progress].y, rect.h * 0.08)
      picture('lamp', points[points.length - 1].x, points[points.length - 1].y, rect.h * 0.12)
      // The iron is held by its handle, its tip where the pointer is.
      if (pointer) picture('iron', pointer.x + rect.h * 0.07, pointer.y - rect.h * 0.07, rect.h * 0.2)
      timeLeft(game.limit - game.time)
      counter('iron', t('screens.miniGame.slips'), String(game.slips), game.slips > 0 ? BAD : INK)
      // Off the wire, he is told where to take it up again: at the start, or where he slipped.
      if (!game.onWire) {
        if (game.slips === 0) showBanner('wire-start', 'violet', 'spark', t('screens.miniGame.pickUp'), rect.y + rect.h + 16)
        else showBanner(`wire-slip-${game.slips}`, 'crimson', 'spark', t('screens.miniGame.slipped'), rect.y + rect.h + 16)
      }
      break
    }
    case 'endurance': {
      // The run is seen through his eyes: the path goes by at his pace, and the trainer runs at the pace he should keep.
      // Level with him she is in the middle; when he is slower she pulls ahead to the right, and when he is faster she
      // drops back to the left. She glides there rather than jumping with each tap of his, and her stride is a bob and
      // a little sway.
      const lead = paceLead(game)
      const keeping = onPace(game)
      const now = performance.now()
      const target = width * 0.5 - lead * width * 0.32
      const raw: PaceState = keeping ? 'pace' : lead < 0 ? 'behind' : 'fast'
      const view = runViews.get(el) ?? { x: target, at: now, shown: raw, candidate: raw, since: now }
      view.x += (target - view.x) * (1 - Math.exp((-PACER_GLIDE * Math.min(100, now - view.at)) / 1000))
      view.at = now
      if (raw !== view.candidate) {
        view.candidate = raw
        view.since = now
      }
      if (view.candidate !== view.shown && now - view.since >= PACE_SETTLE) view.shown = view.candidate
      runViews.set(el, view)
      const her = pictures.get('pacer')
      const tall = height * 0.5
      const wide = her ? (tall * her.width) / her.height : tall * 0.66
      const strides = game.time * 2.6
      const bob = Math.abs(Math.sin(strides * Math.PI)) * tall * 0.03
      ctx.save()
      ctx.translate(view.x, height * 0.88 - bob)
      ctx.rotate(0.04 + Math.sin(strides * Math.PI * 2) * 0.012)
      picture('pacer', 0, -tall / 2, wide, tall)
      ctx.restore()

      // How far through the run he is, along the top: his icon at the start, the flag at the end.
      // In the middle of the top, clear of the panels at either side.
      const bar = { x: width * 0.31, y: 52, w: width * 0.38, h: 16 }
      // Room is kept at either end for the kit's corner vines, clear of the icons.
      framed(ctx, bar.x - 92, bar.y - 32, bar.w + 184, 64)
      ctx.fillStyle = 'rgba(8, 6, 16, 0.85)'
      ctx.beginPath()
      ctx.roundRect(bar.x, bar.y - bar.h / 2, bar.w, bar.h, bar.h / 2)
      ctx.fill()
      const done = Math.min(1, game.time / game.duration)
      if (done > 0) {
        const fill = ctx.createLinearGradient(bar.x, 0, bar.x + bar.w, 0)
        fill.addColorStop(0, '#7b3cff')
        fill.addColorStop(0.6, '#e070d0')
        fill.addColorStop(1, '#ffd27a')
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.roundRect(bar.x, bar.y - bar.h / 2, Math.max(bar.h, bar.w * done), bar.h, bar.h / 2)
        ctx.fill()
        // A bright point at the head of it.
        const tip = bar.x + bar.w * done
        const glow = ctx.createRadialGradient(tip, bar.y, 0, tip, bar.y, 22)
        glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
        glow.addColorStop(0.3, 'rgba(255, 220, 150, 0.6)')
        glow.addColorStop(1, 'rgba(255, 220, 150, 0)')
        ctx.fillStyle = glow
        ctx.fillRect(tip - 22, bar.y - 22, 44, 44)
      }
      picture('run-progress', bar.x - 38, bar.y, 50)
      picture('finish-flag', bar.x + bar.w + 38, bar.y - 2, 52)

      timeLeft(game.duration - game.time)

      // His heart, beating as fast as he is going, green while he keeps pace.
      framed(ctx, 22, 20, 150, 64)
      const beat = 1 + 0.15 * Math.max(0, Math.sin(game.time * (4 + 10 * game.rate)))
      picture('heart', 74, 52, 36 * beat)
      text(`${Math.round(90 + 90 * game.rate)}`, 100, 53, 24, keeping ? GOOD : INK, 'left')

      // How he is doing, as a banner that sweeps in from the left once a change has held for a moment.
      const state = view.shown
      showBanner(`pace-${state}`, PACE_BANNERS[state].ribbon, PACE_BANNERS[state].icon, t(PACE_BANNERS[state].label))
      break
    }
    case 'intelligence': {
      const cells = circuitCells(rect, game.size)
      const { lit, solved } = circuitLit(game)
      for (const { r, c, rect: cell } of cells) {
        picture('tile', cell.x + cell.w / 2, cell.y + cell.h / 2, cell.w * 0.96)
        const ends = game.tiles[r][c]
        const on = lit.has(`${r},${c}`)
        ctx.strokeStyle = on ? '#7fe3ff' : 'rgba(205, 160, 90, 0.9)'
        ctx.shadowColor = on ? '#7fe3ff' : 'transparent'
        ctx.shadowBlur = on ? 12 : 0
        ctx.lineWidth = cell.w * 0.14
        ctx.lineCap = 'round'
        const [mx, my] = [cell.x + cell.w / 2, cell.y + cell.h / 2]
        for (const [side, dx, dy] of [[SIDES.north, 0, -1], [SIDES.east, 1, 0], [SIDES.south, 0, 1], [SIDES.west, -1, 0]] as const) {
          if (!(ends & side)) continue
          ctx.beginPath()
          ctx.moveTo(mx, my)
          ctx.lineTo(mx + (dx * cell.w) / 2, my + (dy * cell.h) / 2)
          ctx.stroke()
        }
        ctx.shadowBlur = 0
      }
      const first = cells.find((one) => one.r === game.from && one.c === 0)!.rect
      const last = cells.find((one) => one.r === game.to && one.c === game.size - 1)!.rect
      picture('spark', first.x - first.w * 0.55, first.y + first.h / 2, first.w * 0.8)
      picture('lamp', last.x + last.w * 1.55, last.y + last.h / 2, last.w * (solved ? 1.1 : 0.9))
      timeLeft(game.limit - game.time)
      // How much of the way to the lamp the spark has got.
      counter('spark', t('screens.miniGame.circuit'), `${game.route.filter(({ r, c }) => lit.has(`${r},${c}`)).length} / ${game.route.length}`)
      break
    }
    case 'wisdom': {
      // The candles in a row, unlit, the same candle each; one that flares has its own colour of flame set on its wick.
      const lit = candleLit(game)
      candleSpots(rect, game.candles).forEach((spot, i) => {
        const flaring = lit?.candle === i
        const [cx, cy] = [spot.x + spot.w / 2, spot.y + spot.h / 2]
        picture('candle', cx, cy, spot.h)
        if (flaring) {
          const wick = { x: cx + (WICK.x - 0.5) * spot.h, y: cy + (WICK.y - 0.5) * spot.h }
          const size = spot.h * 0.45
          picture(`flame-${CANDLE_COLORS[i]}`, wick.x, wick.y - (FLAME_BASE - 0.5) * size, size)
          if (!lit.right) text('✗', wick.x, wick.y - size * 0.3, 44, BAD)
        }
        keycap(ctx, text, i + 1, cx, spot.y + spot.h + 22, flaring)
      })
      // Whose turn it is, as a banner that comes in as it changes hands.
      if (game.phase === 'showing') showBanner(`candles-watch-${game.rounds}`, 'violet', 'candle', t('screens.miniGame.watch'), rect.y + rect.h + 30)
      else showBanner(`candles-turn-${game.rounds}`, 'green', `flame-${CANDLE_COLORS[game.order[Math.max(0, game.entered - 1)]]}`, t('screens.miniGame.yourTurn', { n: game.entered + 1, total: game.length }), rect.y + rect.h + 30)
      counter('flame-gold', t('screens.miniGame.roundsLabel'), String(game.rounds))
      timeLeft(game.duration - game.time)
      break
    }
    case 'charisma': {
      // Her face, with how long she will wait under it; the tones to answer in below.
      const now = faceNow(game)
      const size = rect.h * 0.56
      const cx = rect.x + rect.w / 2
      if (now) {
        picture(faceKey(now.face.listenerId, now.mood), cx, rect.y + size / 2, size)
        // Her patience, running out: a rounded track under her, gold while she will wait and red as she tires of it.
        const left = Math.max(0, 1 - now.waited / game.patience)
        const track = { x: cx - size / 2, y: rect.y + size + 8, w: size, h: 12 }
        ctx.fillStyle = 'rgba(8, 6, 16, 0.85)'
        ctx.strokeStyle = kitColors().goldDeep
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(track.x, track.y, track.w, track.h, track.h / 2)
        ctx.fill()
        ctx.stroke()
        const fill = ctx.createLinearGradient(track.x, 0, track.x + track.w, 0)
        fill.addColorStop(0, left > 0.35 ? '#c9a24a' : '#a01c2c')
        fill.addColorStop(1, left > 0.35 ? '#ffe9a8' : '#ff6b7a')
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.roundRect(track.x, track.y, Math.max(track.h, track.w * left), track.h, track.h / 2)
        ctx.fill()
      }
      // How the last answer went, as a banner that comes in with each one.
      if (game.lastRight !== undefined) {
        showBanner(`face-${game.results.length}`, game.lastRight ? 'green' : 'crimson', game.lastRight ? 'heart' : 'space', t(game.lastRight ? 'screens.miniGame.rightTone' : 'screens.miniGame.wrongTone'))
      }
      // The tones he can answer in, each a panel of the kit with its key in the corner, lifted under the pointer.
      toneButtons(rect).forEach((button, i) => {
        const lifted = pointer && inside(pointer, button) ? 6 : 0
        framed(ctx, button.x, button.y - lifted, button.w, button.h)
        picture(TONES[i], button.x + button.w / 2, button.y + button.h * 0.44 - lifted, button.h * 0.56)
        text(t(TONE_LABELS[TONES[i]]), button.x + button.w / 2, button.y + button.h * 0.84 - lifted, 16)
        keycap(ctx, text, i + 1, button.x + 4, button.y + 4 - lifted, lifted > 0)
      })
      timeLeft(game.duration - game.time)
      break
    }
  }
}

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
  paceBand,
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
      if (el) draw(el, game.current, pictures.current, drill, pointer.current)
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
          <p className="hint">{t(HOW[game.current.kind])}</p>
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
    const { pieces, listeners } = content.minigames
    const location = content.locations.find((l) => l.id === state.locationId)
    const backdrop = viewImage(location && backgroundFor(location), toDate(content.calendar, state.time).period.light)
    const wanted: [string, string | undefined][] = [
      ...pieces.map((one): [string, string | undefined] => [one.id, one.iconImage]),
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

function draw(el: HTMLCanvasElement, game: MiniGame, pictures: Pictures, drill: PendingDrill, pointer: { x: number; y: number } | null) {
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
  // The place he is at, filling the screen, darkened for the game to stand out on.
  const backdrop = pictures.get('backdrop')
  if (backdrop) {
    const scale = Math.max(width / backdrop.width, height / backdrop.height)
    ctx.drawImage(backdrop, (width - backdrop.width * scale) / 2, (height - backdrop.height * scale) / 2, backdrop.width * scale, backdrop.height * scale)
  }
  ctx.fillStyle = 'rgba(10, 8, 14, 0.55)'
  ctx.fillRect(0, 0, width, height)
  const font = getComputedStyle(document.body).fontFamily
  const text = (words: string, x: number, y: number, size: number, color = INK, align: CanvasTextAlign = 'center') => {
    ctx.font = `600 ${size}px ${font}`
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
  const seconds = (left: number) => t('screens.miniGame.seconds', { seconds: Math.ceil(Math.max(0, left)) })

  text(drill.title, width / 2, 44, 28, GOLD)
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
      text(t('screens.miniGame.rep', { n: Math.min(game.reps, game.results.length + 1), total: game.reps }), rect.x, rect.y + 20, 22, INK, 'left')
      const lastRep = game.results[game.results.length - 1]
      if (lastRep !== undefined) text(t('screens.miniGame.percent', { percent: Math.round(lastRep * 100) }), rect.x + rect.w, rect.y + 20, 22, lastRep > 0 ? GOOD : BAD, 'right')
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
      text(seconds(game.limit - game.time), rect.x + rect.w, rect.y + 20, 22, INK, 'right')
      if (!game.onWire) text(t('screens.miniGame.pickUp'), width / 2, rect.y + rect.h + 30, 20, game.slips > 0 ? BAD : INK)
      break
    }
    case 'endurance': {
      // The dial, its needle where his pace is, and the band it should be kept in drawn round its rim.
      const cx = rect.x + rect.w / 2
      const cy = rect.y + rect.h * 0.5
      const radius = rect.h * 0.4
      const angle = (rate: number) => Math.PI * (0.75 + 1.5 * rate)
      picture('dial', cx, cy, radius * 2.2)
      const band = paceBand(game)
      ctx.strokeStyle = 'rgba(127, 216, 138, 0.85)'
      ctx.lineWidth = radius * 0.12
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 0.86, angle(band.center - band.width / 2), angle(band.center + band.width / 2))
      ctx.stroke()
      ctx.strokeStyle = '#8b1e1e'
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(angle(game.rate)) * radius * 0.8, cy + Math.sin(angle(game.rate)) * radius * 0.8)
      ctx.stroke()
      // The heart beats as fast as he is going.
      const beat = 1 + 0.12 * Math.max(0, Math.sin(game.time * (4 + 10 * game.rate)))
      picture('heart', cx, cy + radius * 0.55, radius * 0.35 * beat)
      text(seconds(game.duration - game.time), rect.x + rect.w, rect.y + 20, 22, INK, 'right')
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
      text(seconds(game.limit - game.time), rect.x + rect.w, rect.y + 20, 22, INK, 'right')
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
        text(String(i + 1), cx, spot.y + spot.h + 18, 18, flaring ? INK : 'rgba(244, 236, 216, 0.55)')
      })
      text(game.phase === 'showing' ? t('screens.miniGame.watch') : t('screens.miniGame.yourTurn', { n: game.entered + 1, total: game.length }), rect.x + rect.w / 2, rect.y + rect.h + 34, 24, game.phase === 'showing' ? GOLD : GOOD)
      text(t('screens.miniGame.rounds', { n: game.rounds }), rect.x, rect.y + 20, 22, INK, 'left')
      text(seconds(game.duration - game.time), rect.x + rect.w, rect.y + 20, 22, INK, 'right')
      break
    }
    case 'charisma': {
      // Her face, with how long she will wait under it; the tones to answer in below.
      const now = faceNow(game)
      const size = rect.h * 0.56
      const cx = rect.x + rect.w / 2
      if (now) {
        picture(faceKey(now.face.listenerId, now.mood), cx, rect.y + size / 2, size)
        const left = 1 - now.waited / game.patience
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillRect(cx - size / 2, rect.y + size + 10, size, 10)
        ctx.fillStyle = left > 0.35 ? GOLD : BAD
        ctx.fillRect(cx - size / 2, rect.y + size + 10, size * left, 10)
      } else if (game.lastRight !== undefined) {
        // Between faces, how the last answer went.
        text(game.lastRight ? '✓' : '✗', cx, rect.y + size / 2, 64, game.lastRight ? GOOD : BAD)
      }
      toneButtons(rect).forEach((button, i) => {
        const lifted = pointer && inside(pointer, button) ? 6 : 0
        ctx.fillStyle = 'rgba(20, 16, 24, 0.6)'
        ctx.fillRect(button.x, button.y - lifted, button.w, button.h)
        picture(TONES[i], button.x + button.w / 2, button.y + button.h * 0.42 - lifted, button.h * 0.62)
        text(`${i + 1}  ${t(TONE_LABELS[TONES[i]])}`, button.x + button.w / 2, button.y + button.h * 0.86 - lifted, 16)
      })
      text(seconds(game.duration - game.time), rect.x + rect.w, rect.y + 20, 22, INK, 'right')
      break
    }
  }
}

import { useEffect, useState, type CSSProperties } from 'react'
import { toDate, weatherOn } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { WeatherIcon } from './icons'

// How long the night takes to turn into the morning, in milliseconds; a click cuts it short.
const LENGTH = 5400
// When, in that, the days move one place along: as the sky turns.
const TURN_FROM = 0.15
const TURN_TO = 0.62
// The days either side of today in the carousel.
const AROUND = 3

/** How far along the turn is at a share of the whole: eased in and out, as the sky is. */
const turned = (t: number): number => {
  const x = Math.min(1, Math.max(0, (t - TURN_FROM) / (TURN_TO - TURN_FROM)))
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

/**
 * The night going by after he sleeps: the night sky, its moon, turns away like a great wheel and the morning comes up
 * in its place. Over it, the month he is in, the days on their calendar pages turning past with the sky until the one
 * he wakes to stands in the middle and is stamped with a kiss, the weather of that day and those to come, and how far
 * through the semester he is, counting on as the day changes. Played over whatever is behind, which is already the
 * morning.
 */
export function DawnTransition({ content, state, onDone }: { content: ContentPack; state: GameState; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, LENGTH)
    return () => window.clearTimeout(timer)
  }, [onDone])

  const calendar = content.calendar
  const today = toDate(calendar, state.time)
  // The share of the semester gone, from yesterday's to today's as the days turn.
  const done = Math.min(calendar.lengthDays, today.dayIndex + 1)
  const [shown, setShown] = useState(done - 1)
  useEffect(() => {
    const began = performance.now()
    let frame = 0
    const tick = (now: number) => {
      setShown(done - 1 + turned((now - began) / LENGTH))
      if (now - began < LENGTH * TURN_TO) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [done])
  const share = (Math.max(0, shown) / calendar.lengthDays) * 100

  // The days with no classes are picked out in colour: the first of them blue, the last red.
  const teaching = content.coursework?.weekdays ?? calendar.weekdays
  const free = calendar.weekdays.filter((day) => !teaching.includes(day))
  const tint = (weekday: string) => (free.length > 0 && weekday === free[free.length - 1] ? 'last' : free.includes(weekday) ? 'free' : undefined)
  // Yesterday stands in the middle as it opens, and every day moves one place along as the sky turns.
  const days = Array.from({ length: AROUND * 2 + 2 }, (_, i) => i - AROUND - 1).map((offset) => {
    const time = state.time + offset * calendar.hoursPerDay
    return { offset, date: toDate(calendar, time), weather: offset >= 0 ? weatherOn(content, state, time) : undefined }
  })

  return (
    <div className="dawn" onClick={onDone} role="presentation">
      <img className="dawn-dial" src="content://pack/sprites/fx/dawn-dial.webp" alt="" />
      <div className="dawn-month">{today.month.name}</div>
      <div className="dawn-days">
        {days.map(({ offset, date, weather }) => (
          <div
            key={offset}
            className={['dawn-date', offset === 0 && 'today', tint(date.weekday)].filter(Boolean).join(' ')}
            style={{ '--from': offset + 1, '--to': offset, '--from-size': 1 - Math.min(3, Math.abs(offset + 1)) * 0.18, '--to-size': 1 - Math.min(3, Math.abs(offset)) * 0.18 } as CSSProperties}
          >
            <strong>{date.day}</strong>
            <span>{date.weekday}</span>
            {weather && (
              <i className="dawn-weather" title={weather.name}>
                <WeatherIcon kind={weather.icon} image={weather.iconImage} size={56} />
              </i>
            )}
            {offset === 0 && <img className="dawn-kiss" src="content://pack/sprites/fx/kiss.webp" alt="" />}
          </div>
        ))}
      </div>
      <div className="dawn-term">
        <span className="dawn-term-label">Semester · day {Math.round(Math.max(1, shown))} of {calendar.lengthDays}</span>
        <div className="dawn-term-bar">
          <i style={{ width: `${share}%` }} />
        </div>
        <strong className="dawn-term-share">{share.toFixed(1)}%</strong>
      </div>
    </div>
  )
}

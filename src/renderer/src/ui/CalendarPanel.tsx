import { useState } from 'react'
import {
  addEvents,
  attendees,
  dayIndexOf,
  describeMeetings,
  describeWhen,
  upcomingAppointments,
  enrolledCourses,
  eventsOn,
  firstNames,
  removeEvent,
  toDate,
  upcomingEvents
} from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { errorMessage } from '../errors'
import { Dialog } from './Dialog'
import { ChevronIcon } from './icons'

// How far ahead the "Coming up" list looks.
const UPCOMING_DAYS = 30

interface Props {
  content: ContentPack
  state: GameState
  onChange: (state: GameState) => void
  onClose: () => void
}

/** The player's calendar: a month at a time, with events, plus what is coming up. */
export function CalendarPanel({ content, state, onChange, onClose }: Props) {
  const { calendar } = content
  const today = toDate(calendar, state.time)
  // Months away from the current one being viewed.
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const monthCount = calendar.months.length
  const absolute = today.monthIndex + offset
  const month = calendar.months[((absolute % monthCount) + monthCount) % monthCount]
  const year = today.year + Math.floor(absolute / monthCount)

  const firstDay = dayIndexOf(calendar, year, month.id, 1)
  const week = calendar.weekdays.length
  const lead = (((calendar.startWeekday + firstDay) % week) + week) % week

  const days = Array.from({ length: month.days }, (_, i) => {
    const dayIndex = firstDay + i
    const time = state.time + (dayIndex - today.dayIndex) * calendar.hoursPerDay
    return {
      n: i + 1,
      isToday: dayIndex === today.dayIndex,
      inGame: dayIndex >= 0 && dayIndex < calendar.lengthDays,
      isPast: dayIndex < today.dayIndex,
      events: eventsOn(content, state, time),
      plans: state.appointments.filter((a) => toDate(calendar, a.time).dayIndex === dayIndex)
    }
  })

  async function generate() {
    setBusy(true)
    setNotice('')
    try {
      const events = await window.api.generateEvents({ state })
      onChange(addEvents(state, events))
      if (events.length === 0) setNotice('The AI did not come up with any usable events.')
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Calendar" onClose={onClose}>
      <div className="calendar">
        <div>
          <div className="month-nav">
            <button className="secondary icon flip" aria-label="Previous month" onClick={() => setOffset(offset - 1)}>
              <ChevronIcon size={16} />
            </button>
            <div>
              <h2>{month.name}</h2>
              <span className="hint">
                Year {year} · {month.days} days
              </span>
            </div>
            <button className="secondary icon" aria-label="Next month" onClick={() => setOffset(offset + 1)}>
              <ChevronIcon size={16} />
            </button>
          </div>
          <div className="month-grid" style={{ gridTemplateColumns: `repeat(${week}, minmax(0, 1fr))` }}>
            {calendar.weekdays.map((name) => (
              <div key={name} className="caps weekday">
                {name.replace(/day$/, '')}
              </div>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <div key={`lead-${i}`} />
            ))}
            {days.map((d) => (
              <div
                key={d.n}
                className={[
                  'day',
                  d.isToday && 'today',
                  d.events.length > 0 && 'has-event',
                  (d.isPast || !d.inGame) && 'faded'
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="day-number">{d.n}</span>
                {d.isToday && <span className="day-note">Today</span>}
                {d.events.map((e) => (
                  <span key={e.id} className="day-note">
                    {e.name}
                  </span>
                ))}
                {d.plans.map((plan) => (
                  <span key={plan.id} className="day-note plan">
                    {plan.title}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="hint">
            Day {today.dayIndex + 1} of {calendar.lengthDays}.
          </p>
        </div>

        <div className="upcoming">
          {upcomingAppointments(state).length > 0 && <h2>Your plans</h2>}
          {upcomingAppointments(state).map((plan) => (
            <div key={plan.id} className="card">
              <span className="hint">{describeWhen(content, plan.time)}</span>
              <strong>
                {plan.title} with {firstNames(content, attendees(plan))}
              </strong>
              <span>At {content.locations.find((l) => l.id === plan.locationId)?.name}</span>
            </div>
          ))}
          {enrolledCourses(state).length > 0 && <h2>Your classes</h2>}
          {enrolledCourses(state).map((course) => (
            <div key={course.id} className="card">
              <span className="hint">
                {describeMeetings(course)} · attended {state.attendance[course.id]?.count ?? 0}
              </span>
              <strong>
                {course.number} · {course.title}
              </strong>
              <span>{course.professor}</span>
            </div>
          ))}
          <h2>Coming up</h2>
          {upcomingEvents(content, state, UPCOMING_DAYS).map(({ event, inDays }) => (
            <div key={event.id} className="card">
              <span className="hint">
                {inDays === 1 ? 'Tomorrow' : `In ${inDays} days`}
                {event.durationDays > 1 && ` · ${event.durationDays} days long`}
                {event.generated && ' · invented by the AI'}
              </span>
              <strong>{event.name}</strong>
              {event.description && <span>{event.description}</span>}
              {event.generated && (
                <button className="quiet" onClick={() => onChange(removeEvent(state, event.id))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          {upcomingEvents(content, state, UPCOMING_DAYS).length === 0 && (
            <p className="hint">Nothing in the next {UPCOMING_DAYS} days.</p>
          )}
          <button className="secondary" disabled={busy} onClick={generate}>
            {busy ? 'Asking...' : 'Ask the AI for events'}
          </button>
          {notice && <p className="notice">{notice}</p>}
        </div>
      </div>
    </Dialog>
  )
}

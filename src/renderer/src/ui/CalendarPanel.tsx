import { useState } from 'react'
import { dayAgenda, dayIndexOf, eventHours, eventsOn, removeEvent, toDate, upcomingEvents, type AgendaItem } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { BackButton } from './BackButton'
import { ChevronIcon } from './icons'
import { Portrait } from './Portrait'
import { t } from '../../../shared/i18n'

// How far ahead the "Coming up" list looks: the week ahead, and no further.
const UPCOMING_DAYS = 7
// The hours the week view lays out. Anything outside them is still listed, at the edge.
const FIRST_HOUR = 7
const LAST_HOUR = 22
// How many things a day of the month view names before it says how many more there are.
const MONTH_LINES = 3

interface Props {
  content: ContentPack
  state: GameState
  onChange: (state: GameState) => void
  onClose: () => void
}

const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`

/** Timed things side by side where they overlap: each gets a lane, and the lanes share the day's width. */
function lanes(items: AgendaItem[]): { item: AgendaItem; lane: number; of: number }[] {
  const placed: { item: AgendaItem; lane: number; end: number }[] = []
  for (const item of items) {
    const start = item.startHour ?? 0
    const taken = placed.filter((p) => p.end > start).map((p) => p.lane)
    let lane = 0
    while (taken.includes(lane)) lane++
    placed.push({ item, lane, end: start + (item.hours ?? 1) })
  }
  return placed.map((p) => {
    const start = p.item.startHour ?? 0
    // Everything it overlaps, itself included, decides how narrow it has to be.
    const beside = placed.filter((q) => (q.item.startHour ?? 0) < p.end && q.end > start)
    return { item: p.item, lane: p.lane, of: Math.max(...beside.map((q) => q.lane)) + 1 }
  })
}

/**
 * The player's calendar. It opens on the week, hour by hour, with classes, plans and
 * events where they fall; the month is a step back from that. What is coming up further
 * off is listed beside it.
 */
export function CalendarPanel({ content, state, onChange, onClose }: Props) {
  const { calendar } = content
  const today = toDate(calendar, state.time)
  const [mode, setMode] = useState<'week' | 'month'>('week')
  // Weeks, or months, away from the current one.
  const [offset, setOffset] = useState(0)
  // What has been picked out of the calendar to be read about, and the day it was picked on.
  const [picked, setPicked] = useState<{ item: AgendaItem; dayIndex: number } | null>(null)
  const placeName = (locationId: string | undefined) => content.locations.find((l) => l.id === locationId)?.name
  const onNow = eventsOn(content, state).filter((event) => !event.secret)

  const week = calendar.weekdays.length
  const weekdayOf = (dayIndex: number) => (((calendar.startWeekday + dayIndex) % week) + week) % week
  const label = (dayIndex: number) => toDate(calendar, Math.max(0, dayIndex) * calendar.hoursPerDay)


  const switchTo = (next: 'week' | 'month', nextOffset = 0) => {
    setMode(next)
    setOffset(nextOffset)
  }

  // ----- the week
  const weekStart = today.dayIndex - weekdayOf(today.dayIndex) + offset * week
  const weekDays = Array.from({ length: week }, (_, i) => {
    const dayIndex = weekStart + i
    const items = dayAgenda(content, state, dayIndex)
    return {
      dayIndex,
      date: dayIndex >= 0 ? label(dayIndex) : undefined,
      whole: items.filter((item) => item.startHour === undefined),
      timed: lanes(items.filter((item) => item.startHour !== undefined))
    }
  })
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i)
  const firstShown = weekDays.find((d) => d.date)?.date
  const lastShown = [...weekDays].reverse().find((d) => d.date)?.date

  // ----- the month
  const monthCount = calendar.months.length
  const absolute = today.monthIndex + offset
  const month = calendar.months[((absolute % monthCount) + monthCount) % monthCount]
  const year = today.year + Math.floor(absolute / monthCount)
  const firstDay = dayIndexOf(calendar, year, month.id, 1)
  const lead = weekdayOf(firstDay)

  // The calendar goes no further than the game does: the week, or the month, that holds its last day is the last that can be turned to.
  const lastDay = calendar.lengthDays - 1
  const atEnd = mode === 'week' ? weekStart + week > lastDay : firstDay + month.days > lastDay

  const title =
    mode === 'month'
      ? t('screens.calendar.monthTitle', { month: month.name, year })
      : firstShown && lastShown
        ? firstShown.month.id === lastShown.month.id
          ? t('screens.calendar.weekTitle', { from: firstShown.day, to: lastShown.day, month: lastShown.month.name })
          : t('screens.calendar.weekTitleAcross', { from: firstShown.day, fromMonth: firstShown.month.name, to: lastShown.day, month: lastShown.month.name })
        : t('screens.calendar.beforeTerm')

  return (
    <Dialog title={t('screens.calendar.title')} note={t('screens.dayView.dayOf', { day: today.dayIndex + 1, days: calendar.lengthDays })} onClose={onClose} wide ornate noClose>
      <div className="calendar">
        <div className="calendar-main">
          <div className="month-nav">
            <Button className="icon flip" aria-label={mode === 'week' ? t('screens.calendar.previousWeek') : t('screens.calendar.previousMonth')} onClick={() => setOffset(offset - 1)}>
              <ChevronIcon size={16} />
            </Button>
            <div>
              <h2>{title}</h2>
            </div>
            <Button className="icon" disabled={atEnd} aria-label={mode === 'week' ? t('screens.calendar.nextWeek') : t('screens.calendar.nextMonth')} onClick={() => setOffset(offset + 1)}>
              <ChevronIcon size={16} />
            </Button>
            <Button variant="quiet" disabled={offset === 0} onClick={() => setOffset(0)}>
              {t('screens.calendar.today')}
            </Button>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={mode === 'week'} className={mode === 'week' ? 'tab selected' : 'tab'} onClick={() => switchTo('week')}>
                {t('screens.calendar.week')}
              </button>
              <button role="tab" aria-selected={mode === 'month'} className={mode === 'month' ? 'tab selected' : 'tab'} onClick={() => switchTo('month')}>
                {t('screens.calendar.month')}
              </button>
            </div>
          </div>

          {/* The calendar itself is a parchment sheet in the dark frame, so what is on it reads as it always has. */}
          <div className="calendar-sheet sheet">
            {mode === 'week' ? (
              <div
                className="week"
                style={{
                  gridTemplateColumns: `52px repeat(${week}, minmax(0, 1fr))`
                }}
              >
                <span />
                {weekDays.map((d) => (
                  <div
                    key={d.dayIndex}
                    className={['week-head', d.dayIndex === today.dayIndex && 'today', (d.dayIndex < today.dayIndex || d.dayIndex >= calendar.lengthDays) && 'faded'].filter(Boolean).join(' ')}
                  >
                    <span className="caps">{calendar.weekdays[weekdayOf(d.dayIndex)].slice(0, 3)}</span>
                    <strong>{d.date ? d.date.day : ''}</strong>
                  </div>
                ))}

                <span className="week-time">{t('screens.calendar.allDay')}</span>
                {weekDays.map((d) => (
                  <div key={d.dayIndex} className="week-whole">
                    {d.whole.map((item) => (
                      <button key={item.id} type="button" className={`entry ${item.kind}`} title={item.detail} onClick={() => setPicked({ item, dayIndex: d.dayIndex })}>
                        {item.title}
                      </button>
                    ))}
                  </div>
                ))}

                <div className="week-hours">
                  {hours.map((hour) => (
                    <span key={hour} className="week-time">
                      {clock(hour)}
                    </span>
                  ))}
                </div>
                {weekDays.map((d) => (
                  <div key={d.dayIndex} className={d.dayIndex === today.dayIndex ? 'week-day today' : 'week-day'} style={{ gridTemplateRows: `repeat(${hours.length}, 1fr)` }}>
                    {d.dayIndex === today.dayIndex && today.hour >= FIRST_HOUR && today.hour < LAST_HOUR && (
                      <span
                        className="now"
                        style={{
                          top: `${((today.hour - FIRST_HOUR) / hours.length) * 100}%`
                        }}
                      />
                    )}
                    {d.timed.map(({ item, lane, of }) => {
                      // Kept within the hours shown, so something very early or late is still there to see.
                      const start = Math.min(Math.max(item.startHour ?? FIRST_HOUR, FIRST_HOUR), LAST_HOUR - 1)
                      const end = Math.min(Math.max((item.startHour ?? FIRST_HOUR) + (item.hours ?? 1), start + 1), LAST_HOUR)
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setPicked({ item, dayIndex: d.dayIndex })}
                          onKeyDown={(e) => e.key === 'Enter' && setPicked({ item, dayIndex: d.dayIndex })}
                          className={`entry timed ${item.kind}`}
                          title={[t('screens.calendar.fromTo', { from: clock(item.startHour ?? 0), to: clock((item.startHour ?? 0) + (item.hours ?? 1)) }), item.title, item.detail].filter(Boolean).join(' · ')}
                          style={{
                            top: `${((start - FIRST_HOUR) / hours.length) * 100}%`,
                            height: `${((end - start) / hours.length) * 100}%`,
                            left: `${(lane / of) * 100}%`,
                            width: `${100 / of}%`
                          }}
                        >
                          <strong>{item.title}</strong>
                          {item.detail && <span>{item.detail}</span>}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="month-grid"
                style={{
                  gridTemplateColumns: `repeat(${week}, minmax(0, 1fr))`
                }}
              >
                {calendar.weekdays.map((name) => (
                  <div key={name} className="caps weekday">
                    {name.slice(0, 3)}
                  </div>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <div key={`lead-${i}`} />
                ))}
                {Array.from({ length: month.days }, (_, i) => {
                  const dayIndex = firstDay + i
                  const items = dayAgenda(content, state, dayIndex)
                  const weeksAway = Math.floor((dayIndex - (today.dayIndex - weekdayOf(today.dayIndex))) / week)
                  return (
                    <button
                      key={i}
                      className={['day', dayIndex === today.dayIndex && 'today', (dayIndex < today.dayIndex || dayIndex >= calendar.lengthDays) && 'faded'].filter(Boolean).join(' ')}
                      title={t('screens.calendar.seeWeek')}
                      onClick={() => switchTo('week', weeksAway)}
                    >
                      <span className="day-number">{i + 1}</span>
                      {items.slice(0, MONTH_LINES).map((item) => (
                        <span key={item.id} className={`entry ${item.kind}`}>
                          {item.startHour !== undefined && `${clock(item.startHour)} `}
                          {item.title}
                        </span>
                      ))}
                      {items.length > MONTH_LINES && <span className="hint">{t('screens.calendar.more', { n: items.length - MONTH_LINES })}</span>}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="legend">
              <span className="entry class">{t('screens.dayView.class')}</span>
            {state.societies.length > 0 && <span className="entry society">{t('screens.dayView.society')}</span>}
              <span className="entry plan">{t('screens.dayView.plan')}</span>
              <span className="entry event">{t('screens.dayView.eventChip')}</span>
              {state.job && <span className="entry work">{t('screens.dayView.work')}</span>}
              <span className="entry birth">{t('screens.dayView.birth')}</span>
              {content.housing && state.housing.status === 'resident' && (
                <>
                  <span className="entry rent">{t('screens.calendar.rent')}</span>
                  <span className="entry household">{t('screens.calendar.childrensWeek')}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="upcoming">
          {/* Whatever was last pressed in the calendar, in full: when, where, and what it is. */}
          {picked && (
            <div className={`card picked ${picked.item.kind}`}>
              <span className="hint">
                {(() => {
                  const date = label(picked.dayIndex)
                  const { startHour, hours: length } = picked.item
                  const day = { weekday: calendar.weekdays[weekdayOf(picked.dayIndex)], day: date.day, month: date.month.name }
                  return startHour === undefined
                    ? t('screens.calendar.pickedAllDay', day)
                    : t('screens.calendar.pickedHours', { ...day, from: clock(startHour), to: clock(startHour + (length ?? 1)) })
                })()}
              </span>
              <strong>{picked.item.title}</strong>
              {picked.item.detail && <span className="caps">{picked.item.detail}</span>}
              {picked.item.description && <span>{picked.item.description}</span>}
              {/* A class: who he will find in it. */}
              {(() => {
                const course = picked.item.kind === 'class' ? state.courses.find((one) => picked.item.id === `class-${one.id}`) : undefined
                if (!course) return null
                const people = [course.teacherId, ...course.studentIds].flatMap((id) => content.loveInterests.find((li) => li.id === id) ?? [])
                return (
                  <>
                    <span className="caps">{t('screens.calendar.inThisClass')}</span>
                    {people.length > 0 ? (
                      <div className="portraits">
                        {people.map((li) => (
                          <Portrait key={li.id} who={li} caption />
                        ))}
                      </div>
                    ) : (
                      <span className="hint">{t('screens.calendar.noOneYouKnow')}</span>
                    )}
                  </>
                )
              })()}
            </div>
          )}
          {onNow.length > 0 && <h2>{t('screens.calendar.onToday')}</h2>}
          {onNow.map((event) => (
            <div key={event.id} className="card">
              <span className="hint">{[eventHours(event) ?? t('screens.calendar.allDay'), placeName(event.locationId)].filter(Boolean).join(' · ')}</span>
              <strong>{event.name}</strong>
              {event.description && <span>{event.description}</span>}
            </div>
          ))}
          <h2>{t('screens.calendar.comingUp')}</h2>
          {upcomingEvents(content, state, UPCOMING_DAYS).map(({ event, inDays }) => (
            <div key={event.id} className="card">
              <span className="hint">
                {t('screens.calendar.inDays', { n: inDays })}
                {event.durationDays > 1 && t('screens.calendar.daysLong', { n: event.durationDays })}
                {eventHours(event) && ` · ${eventHours(event)}`}
                {placeName(event.locationId) && ` · ${placeName(event.locationId)}`}
                {event.generated && t('screens.calendar.invented')}
              </span>
              <strong>{event.name}</strong>
              {event.description && <span>{event.description}</span>}
              {event.generated && (
                <Button variant="quiet" size="small" onClick={() => onChange(removeEvent(state, event.id))}>
                  {t('screens.calendar.remove')}
                </Button>
              )}
            </div>
          ))}
          {upcomingEvents(content, state, UPCOMING_DAYS).length === 0 && <p className="hint">{t('screens.calendar.nothingAhead', { n: UPCOMING_DAYS })}</p>}
          {/* The way out, at the foot of this column: the bottom left corner, as on every main screen. */}
          <BackButton className="calendar-close" onClick={onClose} />
        </div>
      </div>
    </Dialog>
  )
}

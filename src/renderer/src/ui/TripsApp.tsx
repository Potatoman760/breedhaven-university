import { useState } from 'react'
import { addGroupNote, bookGetaway, canBookGetaway, dayStart, formatDate, getawayDays, getawayEventId, toDate, tripChatId, tripUnderway, upcomingTrips } from '../../../shared/game'
import type { ContentPack, GameState, Getaway } from '../../../shared/model'
import { Button } from './Button'
import { Portrait } from './Portrait'
import { TripListing, TripWho } from './TripBooking'
import { t } from '../../../shared/i18n'

interface Props {
  content: ContentPack
  state: GameState
  onChange: (update: (state: GameState) => GameState) => void
  /** Whether he can book now: not in the middle of a scene. */
  canAct: boolean
  /** Opens a chat in his DMs: a group chat as `group:<id>`. */
  onOpenChat: (id: string) => void
}

/**
 * The Trips app: the trips he has coming, each with who is going and its group chat, and the weekend getaways he can
 * book, each opened on its listing with the weekends it can be had, who comes, and what it comes to.
 */
export function TripsApp({ content, state, onChange, canAct, onOpenChat }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const getaway = content.getaways.trips.find((one) => one.id === open)
  if (getaway) return <Booking content={content} state={state} getaway={getaway} canAct={canAct} onChange={onChange} onOpenChat={onOpenChat} onBack={() => setOpen(null)} />

  const dateOf = (day: number) => formatDate(toDate(content.calendar, dayStart(content, day)))
  const away = tripUnderway(content, state)
  const booked = upcomingTrips(content, state)
  const nameOf = (id: string) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id
  return (
    <div className="trips-app">
      <section>
        <h2>{t('panels.trips.yours')}</h2>
        {booked.length === 0 && <p className="hint">{t('panels.trips.none')}</p>}
        {booked.map(({ event, dayIndex, ids }) => {
          const place = content.locations.find((location) => location.id === event.locationId)
          const photo = place?.backgrounds[0]?.images.day
          return (
            <div key={event.id} className="trip-booked">
              <span className="trip-booked-photo" style={photo ? { backgroundImage: `url("content://pack/${photo}")` } : undefined} />
              <span className="trip-booked-text">
                <strong>{event.name.replace(/^the /, 'The ')}</strong>
                <span>{away?.id === event.id ? t('panels.trips.on') : dateOf(dayIndex)}</span>
                <span className="trip-booked-who">
                  {ids.flatMap((id) => content.loveInterests.find((li) => li.id === id) ?? []).map((li) => (
                    <Portrait key={li.id} who={li} size={30} />
                  ))}
                  {t('panels.trips.going', { names: ids.map(nameOf).join(', ') })}
                </span>
              </span>
              {state.groupChats[tripChatId(event.id)] && (
                <Button size="small" onClick={() => onOpenChat(`group:${tripChatId(event.id)}`)}>
                  {t('panels.trips.chat')}
                </Button>
              )}
            </div>
          )
        })}
      </section>
      <section>
        <h2>{t('panels.trips.getaways')}</h2>
        <div className="trip-cards">
          {content.getaways.trips.map((one) => {
            const place = content.locations.find((location) => location.id === one.locationId)
            const photo = place?.backgrounds[0]?.images.day
            const next = getawayDays(content, state, one)[0]
            return (
              <button key={one.id} type="button" className="trip-card" onClick={() => setOpen(one.id)}>
                <span className="trip-card-photo" style={photo ? { backgroundImage: `url("content://pack/${photo}")` } : undefined} />
                <strong>{one.name}</strong>
                <span className="trip-card-meta">
                  {t('panels.trips.from', { price: one.price })}
                  {one.rating !== undefined && <b className="trip-rating">★ {one.rating.toFixed(1)}</b>}
                </span>
                <span className="trip-card-when">{next === undefined ? t('panels.trips.noWeekend') : dateOf(next)}</span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

interface BookingProps {
  content: ContentPack
  state: GameState
  getaway: Getaway
  canAct: boolean
  onChange: Props['onChange']
  onOpenChat: Props['onOpenChat']
  onBack: () => void
}

/** One getaway's listing, with which weekend, who comes and what it comes to. Booked, he is taken to its group chat. */
function Booking({ content, state, getaway, canAct, onChange, onOpenChat, onBack }: BookingProps) {
  const days = getawayDays(content, state, getaway)
  const [day, setDay] = useState<number | undefined>(days[0])
  const [taking, setTaking] = useState<string[]>([])
  const check = day === undefined ? { ok: false, reasons: [t('panels.trips.noWeekend')] } : canBookGetaway(content, state, getaway, day, taking)

  function book(ids: string[]) {
    if (day === undefined || !canAct) return
    const booked = bookGetaway(content, state, getaway, day, ids)
    if (booked === state) return
    const eventId = getawayEventId(getaway, day)
    const chatId = tripChatId(eventId)
    onChange(() => booked)
    onOpenChat(`group:${chatId}`)
    // Told, they answer in the chat as their lines come in.
    const history = (booked.groupChats[chatId]?.notes ?? []).map((note) => ({ speaker: booked.player.name, text: note.text }))
    void window.api.momentLines({ state: booked, ids, moment: 'trip-booked', history, tripId: eventId }).then(({ lines }) =>
      onChange((current) => lines.reduce((next, line) => addGroupNote(next, chatId, { from: 'them', speakerId: line.speakerId, text: line.text, read: false }), current))
    )
  }

  return (
    <div className="trips-detail">
      <TripListing content={content} locationId={getaway.locationId} name={getaway.name} days={getaway.days} blurb={getaway.blurb} highlights={getaway.highlights} rating={getaway.rating} />
      <TripWho content={content} state={state} terms={getaway} taking={taking} onTaking={setTaking} check={canAct ? check : { ok: false, reasons: [t('panels.phone.disabledInScene')] }} onBook={book} onSkip={onBack} skipLabel={t('panels.trips.back')}>
        <label className="trip-when">
          {t('panels.trips.when')}
          <select value={day ?? ''} disabled={days.length === 0} onChange={(event) => setDay(Number(event.target.value))}>
            {days.length === 0 && <option value="">{t('panels.trips.noWeekend')}</option>}
            {days.map((one) => (
              <option key={one} value={one}>
                {formatDate(toDate(content.calendar, dayStart(content, one)))}
              </option>
            ))}
          </select>
        </label>
      </TripWho>
    </div>
  )
}

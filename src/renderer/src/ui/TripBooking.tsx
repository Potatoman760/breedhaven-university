import { useState } from 'react'
import { canBookTrip, spriteFor, tripChoices, tripCost, wornOutfit } from '../../../shared/game'
import type { ContentPack, EventPart, GameState } from '../../../shared/model'
import { Button } from './Button'
import { Overlay } from './Dialog'
import { HeartIcon } from './icons'
import { Portrait } from './Portrait'
import { t } from '../../../shared/i18n'

interface Props {
  content: ContentPack
  state: GameState
  booking: NonNullable<EventPart['booking']>
  onBook: (ids: string[]) => void
  onSkip: () => void
}

/**
 * Booking a trip, once, on his phone, laid out as a travel listing: the place, its pictures and what is on there,
 * and beside it who of those close enough to say yes he takes and what it comes to. Not going is a choice too.
 */
export function TripBooking({ content, state, booking, onBook, onSkip }: Props) {
  const [taking, setTaking] = useState<string[]>([])
  const trip = content.calendar.events.find((event) => event.id === booking.eventId)
  const place = content.locations.find((location) => location.id === trip?.locationId)
  const photos = (place?.backgrounds ?? []).flatMap((view) => (view.images.day ? [{ id: view.id, name: view.name, image: view.images.day }] : []))
  const [photo, setPhoto] = useState(0)
  const shown = photos[photo]
  const choices = tripChoices(content, state, booking)
  const check = canBookTrip(content, state, booking, taking)
  const toggle = (id: string) => setTaking((now) => (now.includes(id) ? now.filter((one) => one !== id) : now.length < booking.most ? [...now, id] : now))
  const nights = Math.max(1, (trip?.durationDays ?? 1) - 1)

  return (
    <Overlay onClose={onSkip} sounds={['phoneOn', 'phoneOff']}>
      <div className="phone">
        <div className="phone-glass trip-booking">
          <section className="trip-listing">
            <div className="trip-photo" style={shown ? { backgroundImage: `url("content://pack/${shown.image}")` } : undefined}>
              {shown && <span className="trip-photo-name">{shown.name}</span>}
            </div>
            <div className="trip-thumbs">
              {photos.map((one, i) => (
                <button
                  key={one.id}
                  type="button"
                  className={i === photo ? 'trip-thumb on' : 'trip-thumb'}
                  style={{ backgroundImage: `url("content://pack/${one.image}")` }}
                  aria-label={one.name}
                  title={one.name}
                  onClick={() => setPhoto(i)}
                />
              ))}
            </div>
            <div className="trip-listing-head">
              <h1>{place?.name ?? trip?.name}</h1>
              {booking.rating !== undefined && (
                <span className="trip-rating" title={t('panels.tripBooking.rating', { rating: booking.rating })}>
                  {'★'.repeat(Math.round(booking.rating))}
                  <b>{booking.rating.toFixed(1)}</b>
                </span>
              )}
            </div>
            <p className="trip-meta">
              {t('panels.tripBooking.meta', { name: trip?.name, days: trip?.durationDays, nights })}
            </p>
            {booking.blurb && <p className="trip-blurb">{booking.blurb}</p>}
            <ul className="trip-highlights">
              {booking.highlights.map((line) => (
                <li key={line}>
                  <HeartIcon size={16} />
                  {line}
                </li>
              ))}
            </ul>
          </section>

          <aside className="trip-who">
            <h2>{t('panels.tripBooking.whoComing')}</h2>
            <div className="trip-who-list">
              {choices.map((li) => {
                const chosen = taking.includes(li.id)
                const full = !chosen && taking.length >= booking.most
                return (
                  <button key={li.id} type="button" aria-pressed={chosen} className={chosen ? 'trip-who-row picked' : 'trip-who-row'} disabled={full} onClick={() => toggle(li.id)}>
                    <Portrait who={li} image={spriteFor(li, wornOutfit(content, state, li), 'happy')} size={44} />
                    <span>{li.name.split(' ')[0]}</span>
                  </button>
                )
              })}
              {choices.length === 0 && <p className="hint">{t('panels.tripBooking.nobody')}</p>}
            </div>
            <dl className="trip-price">
              <dt>
                ${booking.price} × {taking.length + 1}
              </dt>
              <dd>${tripCost(booking, taking)}</dd>
            </dl>
            <Button variant="primary" disabled={!check.ok} title={check.reasons.join(' · ') || undefined} onClick={() => onBook(taking)}>
              {t('panels.tripBooking.book')}
            </Button>
            <Button onClick={onSkip}>{t('panels.tripBooking.skip')}</Button>
          </aside>
        </div>
      </div>
    </Overlay>
  )
}

import { useState, type ReactNode } from 'react'
import { canBookTrip, spriteFor, tripChoices, tripCost, wornOutfit, type PerformCheck } from '../../../shared/game'
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
  return (
    <Overlay onClose={onSkip} sounds={['phoneOn', 'phoneOff']}>
      <div className="phone">
        <div className="phone-glass trip-booking">
          <TripListing content={content} locationId={trip?.locationId} name={trip?.name} days={trip?.durationDays ?? 1} blurb={booking.blurb} highlights={booking.highlights} rating={booking.rating} />
          <TripWho content={content} state={state} terms={booking} taking={taking} onTaking={setTaking} check={canBookTrip(content, state, booking, taking)} onBook={onBook} onSkip={onSkip} />
        </div>
      </div>
    </Overlay>
  )
}

/** A trip's listing: its place's pictures to flip through, its name and rating, how long it is, a line about it and what is on. */
export function TripListing({ content, locationId, name, days, blurb, highlights, rating }: { content: ContentPack; locationId?: string; name?: string; days: number; blurb: string; highlights: string[]; rating?: number }) {
  const place = content.locations.find((location) => location.id === locationId)
  const photos = (place?.backgrounds ?? []).flatMap((view) => (view.images.day ? [{ id: view.id, name: view.name, image: view.images.day }] : []))
  const [photo, setPhoto] = useState(0)
  const shown = photos[photo]
  const nights = Math.max(1, days - 1)
  return (
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
        <h1>{place?.name ?? name}</h1>
        {rating !== undefined && (
          <span className="trip-rating" title={t('panels.tripBooking.rating', { rating })}>
            {'★'.repeat(Math.round(rating))}
            <b>{rating.toFixed(1)}</b>
          </span>
        )}
      </div>
      <p className="trip-meta">{t('panels.tripBooking.meta', { name, days, nights })}</p>
      {blurb && <p className="trip-blurb">{blurb}</p>}
      <ul className="trip-highlights">
        {highlights.map((line) => (
          <li key={line}>
            <HeartIcon size={16} />
            {line}
          </li>
        ))}
      </ul>
    </section>
  )
}

interface WhoProps {
  content: ContentPack
  state: GameState
  terms: { most: number; price: number; minStage: string }
  taking: string[]
  onTaking: (ids: string[]) => void
  check: PerformCheck
  onBook: (ids: string[]) => void
  onSkip?: () => void
  /** What the way out says. Left out, "Not this time". */
  skipLabel?: string
  /** Anything asked before who: which weekend. */
  children?: ReactNode
}

/** Who of those close enough to say yes he takes, up to as many as it allows, what it comes to, and booking it. */
export function TripWho({ content, state, terms, taking, onTaking, check, onBook, onSkip, skipLabel, children }: WhoProps) {
  const choices = tripChoices(content, state, terms)
  const toggle = (id: string) => onTaking(taking.includes(id) ? taking.filter((one) => one !== id) : taking.length < terms.most ? [...taking, id] : taking)
  return (
    <aside className="trip-who">
      {children}
      <h2>{t('panels.tripBooking.whoComing')}</h2>
      <div className="trip-who-list">
        {choices.map((li) => {
          const chosen = taking.includes(li.id)
          const full = !chosen && taking.length >= terms.most
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
          ${terms.price} × {taking.length + 1}
        </dt>
        <dd>${tripCost(terms, taking)}</dd>
      </dl>
      <Button variant="primary" disabled={!check.ok} title={check.reasons.join(' · ') || undefined} onClick={() => onBook(taking)}>
        {t('panels.tripBooking.book')}
      </Button>
      {onSkip && <Button onClick={onSkip}>{skipLabel ?? t('panels.tripBooking.skip')}</Button>}
    </aside>
  )
}

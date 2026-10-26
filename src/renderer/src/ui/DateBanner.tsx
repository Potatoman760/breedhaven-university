import type { GameDate } from '../../../shared/game'
import type { WeatherType } from '../../../shared/model'
import { WeatherIcon } from './icons'
import { t } from '../../../shared/i18n'

interface Props {
  date: GameDate
  /** Minutes past the hour, where the clock keeps them: a scene's middle. */
  minute?: number
  weather: WeatherType | undefined
  /** What is said under the date, each apart: the day of the season, today's events, where he is. */
  notes: (string | false | undefined)[]
}

/** The day, the time and the weather, top left on every screen of the day and of a scene, so that they are always in one place. */
export function DateBanner({ date, minute = 0, weather, notes }: Props) {
  return (
    <div className="date-banner glass framed">
      <div className="weather" title={weather?.name}>
        <WeatherIcon kind={weather?.icon} image={weather?.iconImage} size={28} />
      </div>
      <div>
        <div className="date-line">
          {t('screens.dateBanner.date', { weekday: date.weekday, day: date.day, month: date.month.name })}
        </div>
        <div className="caps">{notes.filter(Boolean).join(' · ')}</div>
      </div>
      {/* The time, on its own at the right: the thing most often looked for. */}
      <div className="date-time">
        {String(date.hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
      </div>
    </div>
  )
}

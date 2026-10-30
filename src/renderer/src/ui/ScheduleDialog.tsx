import { useState } from 'react'
import { formatDate, scheduleDays, scheduleHours, toDate, type ScheduleRequest } from '../../../shared/game'
import { PlanCompare } from './PlanCompare'
import type { ContentPack, GameState } from '../../../shared/model'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { t } from '../../../shared/i18n'

interface Props {
  content: ContentPack
  state: GameState
  /** Those in the scene a plan can be made with, the scene's lead first. */
  withIds: string[]
  onSchedule: (request: ScheduleRequest) => void
  onClose: () => void
}

// How long a plan he makes can last, in hours. Two is what a plan the LLM makes lasts.
const LENGTHS = [1, 2, 3, 4]
const USUAL_LENGTH = 2
// The hour first offered: the evening, when most are free.
const USUAL_HOUR = 18

/** A plan he puts to those with him: what, where, when, for how long, and with whom of them. */
export function ScheduleDialog({ content, state, withIds, onSchedule, onClose }: Props) {
  const days = scheduleDays(content, state)
  const [title, setTitle] = useState('')
  const [locationId, setLocationId] = useState(state.locationId)
  const [hours, setHours] = useState(USUAL_LENGTH)
  const hourChoices = scheduleHours(content, hours)
  // Today, when the evening has not gone yet; otherwise tomorrow.
  const [day, setDay] = useState(days.find((midnight) => midnight + USUAL_HOUR > state.time) ?? days[0])
  const [hour, setHour] = useState(USUAL_HOUR)
  const [who, setWho] = useState(withIds)
  const at = hourChoices.includes(hour) ? hour : (hourChoices.at(-1) ?? hour)
  const toggle = (id: string) => setWho((now) => (now.includes(id) ? now.filter((one) => one !== id) : withIds.filter((one) => one === id || now.includes(one))))
  const name = (id: string) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id

  return (
    <Dialog title={t('screens.schedule.title')} onClose={onClose} narrow>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          onSchedule({ loveInterestIds: who, title, locationId, time: day + at, hours })
        }}
      >
        <label>
          {t('screens.schedule.what')}
          <input value={title} placeholder={t('screens.schedule.whatPlaceholder')} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label>
          {t('screens.schedule.where')}
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {content.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label>
            {t('screens.schedule.day')}
            <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {days.map((midnight) => (
                <option key={midnight} value={midnight}>
                  {formatDate(toDate(content.calendar, midnight))}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('screens.schedule.time')}
            <select value={at} onChange={(e) => setHour(Number(e.target.value))}>
              {hourChoices.map((h) => (
                <option key={h} value={h}>
                  {`${String(h).padStart(2, '0')}:00`}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('screens.schedule.hours')}
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {LENGTHS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {/* His day and theirs beside the plan, so that he can move it himself before it is moved for him. */}
        <PlanCompare content={content} state={state} plan={{ time: day + at, hours }} id="schedule" withIds={who} />
        {withIds.length > 1 && (
          <div className="row checks">
            {withIds.map((id) => (
              <label key={id} className="inline">
                <input type="checkbox" checked={who.includes(id)} onChange={() => toggle(id)} />
                {name(id)}
              </label>
            ))}
          </div>
        )}
        <div className="actions">
          <Button type="submit" variant="primary" disabled={who.length === 0}>
            {t('screens.schedule.offer')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

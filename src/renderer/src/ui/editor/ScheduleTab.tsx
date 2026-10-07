import { Button } from '../Button'
import type { ContentPack, ScheduleEntry } from '../../../../shared/model'
import { PickList, Group } from './fields'

interface Props {
  content: ContentPack
  schedule: ScheduleEntry[]
  onChange: (schedule: ScheduleEntry[]) => void
  /** What comes before every line, for the hint: classes and plans for a love interest, nothing for an NPC. */
  before?: string
}

/** Where a character is to be found: lines of place, days and times of day, the first that matches winning. */
export function ScheduleTab({ content, schedule, onChange, before }: Props) {
  const weekdays = content.calendar.weekdays.map((day) => ({ id: day, name: day.replace(/day$/, '') }))
  const periods = content.calendar.periods.map((p) => ({ id: p.id, name: p.name }))
  return (
    <Group
      title="Where she is"
      hint={`The first line that matches the day and time of day wins. ${before ?? ''} With no line that matches, she can't be found.`.replace(/\s+/g, ' ')}
    >
      {schedule.map((entry, index) => {
        const change = (patch: Partial<ScheduleEntry>) => onChange(schedule.map((e, i) => (i === index ? { ...e, ...patch } : e)))
        const move = (by: number) => {
          const next = [...schedule]
          const [moved] = next.splice(index, 1)
          next.splice(index + by, 0, moved)
          onChange(next)
        }
        return (
          <div key={index} className="card">
            <div className="row checks">
              <label>
                At
                <select value={entry.locationId} onChange={(e) => change({ locationId: e.target.value })}>
                  {content.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="quiet" disabled={index === 0} onClick={() => move(-1)}>
                Up
              </Button>
              <Button variant="quiet" disabled={index === schedule.length - 1} onClick={() => move(1)}>
                Down
              </Button>
              <Button variant="quiet" onClick={() => onChange(schedule.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </div>
            <PickList
              label="On"
              options={weekdays}
              value={entry.weekdays ?? []}
              onChange={(days) => change({ weekdays: days.length > 0 ? days : undefined })}
              hint={entry.weekdays ? undefined : 'Any day.'}
            />
            <PickList
              label="During"
              options={periods}
              value={entry.periods ?? []}
              onChange={(chosen) => change({ periods: chosen.length > 0 ? chosen : undefined })}
              hint={entry.periods ? undefined : 'Any time of day.'}
            />
          </div>
        )
      })}
      <Button onClick={() => onChange([...schedule, { locationId: content.locations[0].id }])}>
        Add a line
      </Button>
    </Group>
  )
}

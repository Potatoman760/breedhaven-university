import { Button } from "../Button";
import type { ContentPack, ScheduleEntry } from "../../../../shared/model";
import { CheckPills, Group } from "./fields";

interface Props {
  content: ContentPack;
  schedule: ScheduleEntry[];
  onChange: (schedule: ScheduleEntry[]) => void;
  /** What comes before every line, for the hint: classes and plans for a love interest, nothing for an NPC. */
  before?: string;
}

/** Where a character is to be found: lines of place, days and times of day, the first that matches winning. */
export function ScheduleTab({ content, schedule, onChange, before }: Props) {
  const weekdays = content.calendar.weekdays.map((day) => ({
    id: day,
    name: day.replace(/day$/, ""),
  }));
  const periods = content.calendar.periods.map((p) => ({
    id: p.id,
    name: p.name,
  }));
  // The hours each time of day runs for: from its own start to the start of the next, the last of them round past midnight.
  const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
  const byStart = [...content.calendar.periods].sort(
    (a, b) => a.startHour - b.startHour,
  );
  const hours = byStart.map((p, i) => ({
    id: p.id,
    name: p.name,
    from: clock(p.startHour),
    until: clock(byStart[(i + 1) % byStart.length].startHour),
  }));
  return (
    <Group
      title="Where she is"
      hint={`The first line that matches the day and time of day wins. ${before ?? ""} With no line that matches, she's in her room.`.replace(
        /\s+/g,
        " ",
      )}
    >
      {/* What the times of day named below mean by the clock. */}
      <div className="legend period-legend" aria-label="The hours of each time of day">
        {hours.map((p) => (
          <span key={p.id} className="chip">
            <strong>{p.name}</strong> {p.from} to {p.until}
          </span>
        ))}
      </div>
      {schedule.map((entry, index) => {
        const change = (patch: Partial<ScheduleEntry>) =>
          onChange(
            schedule.map((e, i) => (i === index ? { ...e, ...patch } : e)),
          );
        const move = (by: number) => {
          const next = [...schedule];
          const [moved] = next.splice(index, 1);
          next.splice(index + by, 0, moved);
          onChange(next);
        };
        return (
          <div key={index} className="card">
            <div className="row checks">
              <label>
                At
                <select
                  value={entry.locationId}
                  onChange={(e) => change({ locationId: e.target.value })}
                >
                  {content.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="quiet"
                disabled={index === 0}
                onClick={() => move(-1)}
              >
                Up
              </Button>
              <Button
                variant="quiet"
                disabled={index === schedule.length - 1}
                onClick={() => move(1)}
              >
                Down
              </Button>
              <Button
                variant="quiet"
                onClick={() => onChange(schedule.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
            <CheckPills
              label="On"
              options={weekdays}
              value={entry.weekdays ?? []}
              onChange={(days) =>
                change({ weekdays: days.length > 0 ? days : undefined })
              }
              hint={entry.weekdays ? undefined : "Any day."}
            />
            <CheckPills
              label="During"
              options={periods}
              value={entry.periods ?? []}
              onChange={(chosen) =>
                change({ periods: chosen.length > 0 ? chosen : undefined })
              }
              hint={entry.periods ? undefined : "Any time of day."}
            />
          </div>
        );
      })}
      <Button
        onClick={() =>
          onChange([...schedule, { locationId: content.locations[0].id }])
        }
      >
        Add a line
      </Button>
    </Group>
  );
}

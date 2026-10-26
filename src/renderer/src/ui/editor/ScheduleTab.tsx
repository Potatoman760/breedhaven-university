import { Button } from "../Button";
import type { ContentPack, ScheduleEntry } from "../../../../shared/model";
import { CheckPills, Group } from "./fields";
import { t } from "../../../../shared/i18n";

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
    name: day.slice(0, 3),
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
      title={t("editor.schedule.title")}
      hint={t("editor.schedule.hint", { before: before ?? "" }).replace(
        /\s+/g,
        " ",
      )}
    >
      {/* What the times of day named below mean by the clock. */}
      <div className="legend period-legend" aria-label={t("editor.schedule.hoursLabel")}>
        {hours.map((p) => (
          <span key={p.id} className="chip">
            <strong>{p.name}</strong> {t("editor.schedule.hours", { from: p.from, until: p.until })}
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
                {t("editor.schedule.at")}
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
                {t("editor.common.up")}
              </Button>
              <Button
                variant="quiet"
                disabled={index === schedule.length - 1}
                onClick={() => move(1)}
              >
                {t("editor.common.down")}
              </Button>
              <Button
                variant="quiet"
                onClick={() => onChange(schedule.filter((_, i) => i !== index))}
              >
                {t("editor.common.remove")}
              </Button>
            </div>
            <CheckPills
              label={t("editor.schedule.on")}
              options={weekdays}
              value={entry.weekdays ?? []}
              onChange={(days) =>
                change({ weekdays: days.length > 0 ? days : undefined })
              }
              hint={entry.weekdays ? undefined : t("editor.schedule.anyDay")}
            />
            <CheckPills
              label={t("editor.schedule.during")}
              options={periods}
              value={entry.periods ?? []}
              onChange={(chosen) =>
                change({ periods: chosen.length > 0 ? chosen : undefined })
              }
              hint={entry.periods ? undefined : t("editor.schedule.anyTime")}
            />
          </div>
        );
      })}
      <Button
        onClick={() =>
          onChange([...schedule, { locationId: content.locations[0].id }])
        }
      >
        {t("editor.schedule.addLine")}
      </Button>
    </Group>
  );
}

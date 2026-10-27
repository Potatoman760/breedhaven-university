import { useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { dayAgainst, describeWhen } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { t } from '../../../shared/i18n'

// How far the pop-up stands off the button, and the room it wants above it before it opens below instead.
const GAP = 6
const ROOM = 360

/**
 * A suggested plan beside his day, as a job's shifts are beside his week. Pointing at the button (or tabbing to it) lays
 * the plan over what he already has that day: his own things in grey, the plan in bright green where it is clear, and in
 * red where it falls on something of his. The pop-up is drawn over the whole window, where no scrolling list it sits in
 * can cut it off: above the button, or below it when there is no room above.
 */
export function PlanCompare({ content, state, plan, id }: { content: ContentPack; state: GameState; plan: { time: number; hours: number }; id: string }) {
  const button = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<CSSProperties | null>(null)
  const day = dayAgainst(content, state, plan)
  const clashes = day.clashes.length
  const open = () => {
    const box = button.current?.getBoundingClientRect()
    if (!box) return
    const right = window.innerWidth - box.right
    setAt(box.top >= ROOM ? { right, top: 'auto', bottom: window.innerHeight - box.top + GAP } : { right, top: box.bottom + GAP, bottom: 'auto' })
  }
  const close = () => setAt(null)
  return (
    <span className="compare" onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}>
      <button ref={button} type="button" className={clashes > 0 ? 'compare-button clash' : 'compare-button'} aria-describedby={`plan-compare-${id}`}>
        {t('screens.planCompare.button')}
        <span>{clashes === 0 ? t('screens.planCompare.clear') : t('screens.planCompare.conflicts', { n: clashes })}</span>
      </button>
      {at &&
        createPortal(
          <div className="compare-pop day" role="tooltip" id={`plan-compare-${id}`} style={at}>
            <strong className="compare-title">{describeWhen(content, plan.time)}</strong>
            {/* What takes the whole day, or has no hour: an event, rent due. */}
            {day.allDay.length > 0 && <span className="hint">{day.allDay.map((item) => item.title).join(' · ')}</span>}
            <div className="compare-grid" style={{ gridTemplateColumns: '44px minmax(0, 1fr)' }}>
              {day.hours.map(({ hour, mine, holds, plan: planned }) => {
                const kind = planned && holds ? 'clash' : planned ? 'shift' : mine ? 'mine' : ''
                return [
                  <span key={`h-${hour}`} className="compare-hour">
                    {String(hour).padStart(2, '0')}:00
                  </span>,
                  <span key={`c-${hour}`} className={`compare-cell ${kind}`} title={planned && holds && mine ? t('screens.planCompare.clashesWith', { what: mine }) : mine}>
                    {mine ?? ''}
                  </span>
                ]
              })}
            </div>
            <div className="compare-key">
              <span className="compare-cell mine" /> {t('screens.planCompare.keyYours')}
              <span className="compare-cell shift" /> {t('screens.planCompare.keyPlan')}
              <span className="compare-cell clash" /> {t('screens.planCompare.keyConflict')}
            </div>
          </div>,
          document.body
        )}
    </span>
  )
}

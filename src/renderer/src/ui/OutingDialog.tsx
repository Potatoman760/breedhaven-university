import { useState } from 'react'
import { checkOuting, describeOuting, describeWhen, firstNames, formatTime, outingHourRange, outingMisses, studyPoints, toDate, type Outing } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { Dialog } from './Dialog'
import { t } from '../../../shared/i18n'

interface Props {
  content: ContentPack
  state: GameState
  outing: Outing
  /** Do it, after waiting the given hours. The outing may be a cut-down one, without whoever is busy. */
  onGo: (outing: Outing, waitHours: number) => void
  onClose: () => void
}

const hours = (n: number) => t('screens.activityList.hours', { n })

/** Confirms something the player typed to do, and says what is in the way if it can't happen yet. */
export function OutingDialog({ content, state, outing: asked, onGo, onClose }: Props) {
  // How long it takes is his to choose, where it can be chosen: an hour at the least, and for an event no longer than is left of it.
  const window = asked.window
  const range = outingHourRange(state, asked)
  const mostHours = range?.max ?? asked.hours
  const [stay, setStay] = useState(asked.hours)
  const outing = range ? { ...asked, hours: Math.min(Math.max(range.min, stay), range.max) } : asked
  const check = checkOuting(content, state, outing)
  const wait = check.waitHours
  // What going would cost him: a class, a shift or a plan that falls in those hours.
  const missed = wait === undefined ? [] : outingMisses(content, state, outing, wait)

  return (
    <Dialog title={outing.title} onClose={onClose} narrow noClose>
      <p>
        {describeOuting(content, outing)}.
      </p>
      {range && range.max > range.min && (
        <div className="outing-hours">
          <span className="hint">
            {window
              ? t('screens.outing.runs', { from: formatTime(toDate(content.calendar, window.from)), to: formatTime(toDate(content.calendar, window.until)) })
              : t('screens.outing.howLong')}
          </span>
          <div className="stepper">
            <button type="button" className="secondary" aria-label={t('screens.outing.hourLess')} disabled={outing.hours <= 1} onClick={() => setStay(outing.hours - 1)}>
              −
            </button>
            <strong>{hours(outing.hours)}</strong>
            <button type="button" className="secondary" aria-label={t('screens.outing.hourMore')} disabled={outing.hours >= mostHours} onClick={() => setStay(outing.hours + 1)}>
              +
            </button>
          </div>
        </div>
      )}
      {outing.studyCourseId && (
        <p className="hint">
          {t('screens.outing.worth', { points: studyPoints(content, outing), own: Boolean(outing.ownRoom) })}
        </p>
      )}
      {outing.withIds.length === 0 && !outing.dropIn && (
        <p className="hint">{outing.ownRoom ? t('screens.outing.onYourOwn') : t('screens.outing.nobodyInvited')}</p>
      )}
      {missed.length > 0 && (
        <div className="notice">
          <strong>{t('screens.outing.wouldMiss')}</strong>
          <ul className="blockers">
            {missed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {check.blockers.length > 0 && (
        <ul className="blockers">
          {check.blockers.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {wait === undefined && (
        <p className="notice">
          {t('screens.outing.noTime')}
        </p>
      )}

      <div className="outing-options">
        {wait === 0 && (
          <button autoFocus onClick={() => onGo(outing, 0)}>
            {missed.length > 0 ? t('screens.outing.goAnyway') : t('screens.dateDialog.go')}
          </button>
        )}
        {wait !== undefined && wait > 0 && (
          <button autoFocus onClick={() => onGo(outing, wait)}>
            {t('screens.outing.waitThenGo', { n: wait })}
            <span className="hint">{t('screens.outing.until', { when: describeWhen(content, state.time + wait) })}</span>
          </button>
        )}
        {check.freeNow.length > 0 && (
          <button className="secondary" onClick={() => onGo({ ...outing, withIds: check.freeNow }, 0)}>
            {t('screens.outing.goNowWith', { names: firstNames(content, check.freeNow) })}
          </button>
        )}
        <button className="secondary" onClick={onClose}>
          {t('screens.outing.neverMind')}
        </button>
      </div>
    </Dialog>
  )
}

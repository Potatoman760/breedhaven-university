import { useEffect, useState } from 'react'
import { ACHIEVEMENTS, describeAchievement, isHidden, type AchievementId } from '../../../shared/game'
import { Dialog } from './Dialog'
import { t } from '../../../shared/i18n'

// Each icon, as Steam has them: 256 square, and the same in grey for one not yet earned. Filed by the achievement's id.
const ICONS = import.meta.glob<string>('../../../assets/achievements/*.jpg', { eager: true, import: 'default' })
const iconOf = (id: AchievementId, earned: boolean): string | undefined => ICONS[`../../../assets/achievements/${id}${earned ? '' : '-locked'}.jpg`]

/** Every achievement, those earned on this install first, each with when. A hidden one is only counted until it is earned. */
export function AchievementsPanel({ onClose }: { onClose: () => void }) {
  const [unlocked, setUnlocked] = useState<Partial<Record<AchievementId, string>>>({})
  useEffect(() => {
    window.api.achievements.list().then(setUnlocked, () => undefined)
  }, [])
  const earned = ACHIEVEMENTS.filter((id) => unlocked[id])
  const ordered = [...earned, ...ACHIEVEMENTS.filter((id) => !unlocked[id] && !isHidden(id))]
  const secret = ACHIEVEMENTS.filter((id) => !unlocked[id] && isHidden(id)).length
  return (
    <Dialog title={t('shell.achievements.title')} note={t('shell.achievements.count', { n: earned.length, total: ACHIEVEMENTS.length })} onClose={onClose} narrow>
      <ul className="achievements">
        {ordered.map((id) => {
          const { name, description } = describeAchievement(id)
          const when = unlocked[id]
          return (
            <li key={id} className={when ? 'achievement earned' : 'achievement'}>
              {iconOf(id, Boolean(when)) && <img className="achievement-icon" src={iconOf(id, Boolean(when))} alt="" draggable={false} />}
              <span className="achievement-text">
                <strong>{name}</strong>
                <span>{description}</span>
                {when && <span className="hint">{t('shell.achievements.earned', { date: new Date(when).toLocaleDateString() })}</span>}
              </span>
            </li>
          )
        })}
        {secret > 0 && (
          <li className="achievement">
            <span className="achievement-text">
              <strong>{t('shell.achievements.hidden', { n: secret })}</strong>
              <span>{t('shell.achievements.hiddenHint')}</span>
            </span>
          </li>
        )}
      </ul>
    </Dialog>
  )
}

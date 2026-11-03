import { useEffect } from 'react'
import { describeAchievement, type AchievementId } from '../../../shared/game'
import { iconOf } from './achievementIcon'
import { t } from '../../../shared/i18n'

// How long one stays up unless it is clicked away.
const SHOWN_MS = 6500

/** Achievements just earned, each a card of its own in the corner, as Steam shows them. */
export function AchievementToasts({ ids, onDone }: { ids: AchievementId[]; onDone: (id: AchievementId) => void }) {
  if (ids.length === 0) return null
  return (
    <div className="achievement-toasts" role="status">
      {ids.map((id) => (
        <AchievementToast key={id} id={id} onDone={() => onDone(id)} />
      ))}
    </div>
  )
}

function AchievementToast({ id, onDone }: { id: AchievementId; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [id])
  const { name, description } = describeAchievement(id)
  const icon = iconOf(id, true)
  return (
    <div className="achievement-toast" onClick={onDone}>
      <span className="achievement-toast-icon">
        {icon && <img src={icon} alt="" draggable={false} />}
      </span>
      <span className="achievement-toast-text">
        <span className="achievement-toast-caps">{t('shell.achievements.toast')}</span>
        <strong>{name}</strong>
        <span>{description}</span>
      </span>
    </div>
  )
}

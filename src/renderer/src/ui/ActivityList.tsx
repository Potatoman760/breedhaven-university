import { canPerform, isEventActivity } from '../../../shared/game'
import type { Activity, ContentPack, GameState } from '../../../shared/model'
import { ChevronIcon } from './icons'
import { t } from '../../../shared/i18n'

interface Props {
  content: ContentPack
  state: GameState
  /** Who a shared event is done with. */
  partnerId: string | undefined
  disabled?: boolean
  onPick: (activity: Activity) => void
}

/**
 * What a calendar event offers while it is on. Everything else the player might do, they
 * describe in their own words.
 */
export function ActivityList({ content, state, partnerId, disabled, onPick }: Props) {
  const partner = content.loveInterests.find((li) => li.id === partnerId)
  const events = content.activities.filter((activity) => {
    const shared = activity.withLoveInterest !== 'none'
    return isEventActivity(activity) && canPerform(activity, state, content, shared ? partnerId : undefined).ok
  })

  return (
    <>
      {events.map((activity) => {
        const firstName = activity.withLoveInterest !== 'none' ? partner?.name.split(' ')[0] : undefined
        return (
          <button key={activity.id} className="featured" disabled={disabled} onClick={() => onPick(activity)}>
            <span className="chip outline-light">{t('screens.dayView.eventChip')}</span>
            <span className="featured-title">{firstName ? t('screens.activityList.with', { activity: activity.name, name: firstName }) : activity.name}</span>
            <span>
              {t('screens.activityList.hours', { n: activity.durationHours })}
            </span>
            <ChevronIcon size={18} />
          </button>
        )
      })}
    </>
  )
}

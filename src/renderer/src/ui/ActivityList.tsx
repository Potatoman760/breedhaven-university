import { canPerform, isEventActivity } from '../../../shared/game'
import type { Activity, ContentPack, GameState } from '../../../shared/model'
import { ChevronIcon } from './icons'

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
            <span className="chip outline-light">Event</span>
            <span className="featured-title">{firstName ? `${activity.name} with ${firstName}` : activity.name}</span>
            <span>
              {activity.durationHours} {activity.durationHours === 1 ? 'hour' : 'hours'}
            </span>
            <ChevronIcon size={18} />
          </button>
        )
      })}
    </>
  )
}

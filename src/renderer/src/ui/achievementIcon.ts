import type { AchievementId } from '../../../shared/game'

// Each icon, as Steam has them: 256 square, and the same in grey for one not yet earned. Filed by the achievement's id.
const ICONS = import.meta.glob<string>('../../../assets/achievements/*.jpg', { eager: true, import: 'default' })

export const iconOf = (id: AchievementId, earned: boolean): string | undefined => ICONS[`../../../assets/achievements/${id}${earned ? '' : '-locked'}.jpg`]

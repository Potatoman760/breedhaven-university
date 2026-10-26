import type { ContentPack, GameState, LoveInterest } from '../../../shared/model'
import type { Panel } from './panels'
import { Tour, type TourStep } from './Tour'
import { t } from '../../../shared/i18n'

interface Props {
  content: ContentPack
  /** What is open over the day, for the step that waits on him to open the way down. */
  panel: Panel | null
  onOpen: (panel: Panel | null) => void
  /** The practice fight, while one is up: made, played and thrown away, nothing of it kept. */
  practice: GameState | null
  onPractice: (on: boolean) => void
  onDone: () => void
}

/**
 * The guide's walk through going below, straight after she has shown him the way down: the window he sets out from,
 * which he opens himself, and then a practice fight she puts him in, with his first move his to make. Skipped, it is
 * over all the same, and the practice goes with it.
 */
export function BelowTour({ content, panel, onOpen, practice, onPractice, onDone }: Props) {
  const config = content.expedition
  const guide: LoveInterest | undefined = content.loveInterests.find((li) => li.id === config?.guideId)
  if (!config || !guide) return null
  const close = () => onOpen(null)
  const fight = practice?.expedition.run?.fight
  // He has made his move once the fight has moved on from where it opened.
  const moved = fight !== undefined && (fight.events.length > 0 || fight.round > 1 || fight.turn !== 0)

  const steps: TourStep[] = [
    {
      target: '[data-tour="go-below"]',
      before: close,
      waits: true,
      done: panel?.kind === 'below',
      text: t('shell.belowTour.wayDown', { place: content.locations.find((l) => l.id === config.entryLocationId)?.name ?? t('shell.belowTour.bathhouse') })
    },
    { target: '.dialog .facts', text: t('shell.belowTour.facts') },
    {
      target: '.depth-carousel',
      text: t('shell.belowTour.depths'),
      expression: 'happy'
    },
    {
      target: '.party-grid',
      text: t('shell.belowTour.party')
    },
    { target: '.party-actions > :last-child', text: t('shell.belowTour.partyActions') },
    // The window is put away before the practice: it would stand over the fight.
    { before: close, text: t('shell.belowTour.practice'), expression: 'happy' },
    {
      target: '.below-party',
      before: () => {
        close()
        onPractice(true)
      },
      text: t('shell.belowTour.ourParty') },
    { target: '.below-foes', text: t('shell.belowTour.foes') },
    { target: '.below-status', text: t('shell.belowTour.status') },
    { target: '.below-bar.energy', text: t('shell.belowTour.energy') },
    {
      target: '.below-surge',
      text: t('shell.belowTour.surge'),
      expression: 'embarrassed'
    },
    { target: '.below-menu', waits: true, done: moved, text: t('shell.belowTour.menu') },
    {
      target: '.below-way',
      text: t('shell.belowTour.way')
    },
    { before: () => onPractice(false), text: t('shell.belowTour.farewell'), expression: 'happy' }
  ]

  return (
    <Tour
      guide={guide}
      steps={steps}
      onDone={() => {
        onPractice(false)
        onOpen(null)
        onDone()
      }}
    />
  )
}

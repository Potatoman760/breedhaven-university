import type { ContentPack, GameState, LoveInterest } from '../../../shared/model'
import type { Panel } from './panels'
import { Tour, type TourStep } from './Tour'

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
      text: `Whenever you're here at ${content.locations.find((l) => l.id === config.entryLocationId)?.name ?? 'the bathhouse'}, this is the way down. Open it.`
    },
    { target: '.dialog .facts', text: `How long a trip takes out of your day, how many anchors you've set, the relics you've brought back, and how many can come with you.` },
    {
      target: '.depth-carousel',
      text: `Each depth has an anchor at the bottom. Set it and the next depth opens. You can always go back to one you've cleared: the arrows pick among them.`,
      expression: 'happy'
    },
    {
      target: '.party-grid',
      text: `Who comes with you. Each of them has a part to play: a guard holds the line, a healer keeps you standing, a hexer spoils what's coming. She has to trust you enough to follow you down, and a mother-to-be hits a great deal harder.`
    },
    { target: '.party-actions > :last-child', text: `Pick your company, then go down. It takes a few hours, however it ends.` },
    // The window is put away before the practice: it would stand over the fight.
    { before: close, text: `Rather than talk you through the rest, I'll show you. A practice round, just you and me. Nothing down here is real yet.`, expression: 'happy' },
    {
      target: '.below-party',
      before: () => {
        close()
        onPractice(true)
      },
      text: `That's us. You, and whoever you brought.` },
    { target: '.below-foes', text: `And that's what the Bloom made. The bar is how much fight it has left. Under it, what it's about to do.` },
    { target: '.below-status', text: `How much each of us can take before we go down. Lose everyone and the trip is over, and you come up with only what you'd made safe.` },
    { target: '.below-bar.energy', text: `Your own energy. What you do in a fight costs some, so don't spend it all on the first thing you meet.` },
    {
      target: '.below-surge',
      text: `This is the part to watch. The Bloom builds in us while we work. Let it fill and it spills over. Ground it before then: that's your job.`,
      expression: 'embarrassed'
    },
    { target: '.below-menu', waits: true, done: moved, text: `Your turn. Pick Attack, then pick what to hit.` },
    {
      target: '.below-way',
      text: `The stops on the way to the anchor: fights, things left lying around, a dry ledge to rest on. Turn back whenever you like, but you only keep what you'd made safe.`
    },
    { before: () => onPractice(false), text: `That's all there is to it, sugar. Bring company you trust, mind the Bloom, and come back up in one piece.`, expression: 'happy' }
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

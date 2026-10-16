import { useEffect, useRef, useState } from 'react'
import { dialogueLines, spriteFor, toDate, wornOutfit } from '../../../shared/game'
import type { ContentPack, GameState, Intro } from '../../../shared/model'
import { Backdrop } from './Backdrop'
import { ChevronIcon } from './icons'
import { emphasise } from './SceneView'

interface Props {
  content: ContentPack
  state: GameState
  intro: Intro
  onDone: () => void
}

/**
 * The welcome before orientation: scenes written out in full, read a line at a time, with nothing to answer and
 * nothing else on the screen. A click, Space, Enter, the right arrow or the wheel goes on; the left arrow or the wheel
 * back goes back. The last line read, it is over.
 */
export function IntroView({ content, state, intro, onDone }: Props) {
  const speaker = [...content.npcs, ...content.loveInterests].find((character) => character.id === intro.speakerId)
  // Every line of every scene in order, each with the scene it is in. A line in asterisks is narration.
  const beats = intro.scenes.flatMap((scene) => scene.lines.flatMap((line) => dialogueLines(line)).map((line) => ({ scene, line })))
  const [index, setIndex] = useState(0)
  const { scene, line } = beats[Math.min(index, beats.length - 1)]
  const location = content.locations.find((l) => l.id === scene.locationId)
  const date = toDate(content.calendar, state.time)
  const sprite = speaker && spriteFor(speaker, wornOutfit(content, state, speaker), undefined)

  const next = () => (index < beats.length - 1 ? setIndex(index + 1) : onDone())
  const back = () => setIndex(Math.max(0, index - 1))
  const turned = useRef(0)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (['Enter', ' ', 'ArrowRight'].includes(event.key)) next()
      else if (event.key === 'ArrowLeft') back()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <main
      className="stage intro"
      onClick={next}
      onWheel={(event) => {
        // One line for each turn of the wheel, however many events a turn sends.
        if (event.deltaY === 0 || event.timeStamp - turned.current < 180) return
        turned.current = event.timeStamp
        if (event.deltaY < 0) back()
        else next()
      }}
    >
      <Backdrop screen="intro" location={location} periodId={date.period.id} light={date.period.light} backgroundId={scene.backgroundId} />
      {sprite && <img className="sprite-art" src={`content://pack/${sprite}`} alt={speaker.name} />}
      <div className="textbox-wrap">
        {speaker && !line.action && (
          <div className="speaker-tab">
            <span
              className="speaker-face"
              role="img"
              aria-label={speaker.name}
              style={sprite ? { backgroundImage: `url("content://pack/${sprite}")`, backgroundPosition: `50% ${speaker.faceY}%` } : undefined}
            />
            <span className="speaker-name">{speaker.name.split(' ')[0]}</span>
          </div>
        )}
        <div className="textbox glass framed turning">
          {line.action ? (
            <p className="narration action">{line.text}</p>
          ) : (
            <div className="speech">
              <p>{emphasise(line.text)}</p>
            </div>
          )}
          <span className="turn-mark" aria-hidden="true">
            {index + 1} / {beats.length}
            <ChevronIcon size={14} />
          </span>
        </div>
      </div>
    </main>
  )
}

import logo from '../../../assets/BreedhavenTitle.png'

interface Props {
  /** He has said he is of age: on to the title screen. */
  onConfirm: () => void
}

/**
 * What stands before the title screen the first time the game is started: the player is
 * asked to say he is an adult, and told what the game is. Once he has said so it is not
 * asked again. Saying he is not closes the game, and it is asked the next time.
 */
export function AgeGate({ onConfirm }: Props) {
  return (
    <main className="title age-gate">
      <div className="title-frame framed">
        <img className="title-logo" src={logo} alt="Breedhaven University" />
        <h1>Adults only</h1>
        <p>This game contains sexual content and adult themes, and is for adults only. By going on you confirm that you are 18 years of age or older.</p>
        <p className="hint">All characters in this game are fictional and are over the age of 18. Any resemblance to real people, living or dead, is coincidental.</p>
        <div className="menu">
          <button autoFocus onClick={onConfirm}>
            I am 18 or older
          </button>
          <button className="secondary" onClick={() => window.close()}>
            I am under 18: leave
          </button>
        </div>
      </div>
    </main>
  )
}

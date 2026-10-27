import logo from '../../../assets/BreedhavenTitle.webp'
import { t } from '../../../shared/i18n'

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
        <img className="title-logo" src={logo} alt={t('shell.common.gameTitle')} />
        <h1>{t('shell.ageGate.title')}</h1>
        <p>{t('shell.ageGate.body')}</p>
        <p className="hint">{t('shell.ageGate.fiction')}</p>
        <div className="menu">
          <button autoFocus onClick={onConfirm}>
            {t('shell.ageGate.confirm')}
          </button>
          <button className="secondary" onClick={() => window.close()}>
            {t('shell.ageGate.leave')}
          </button>
        </div>
      </div>
    </main>
  )
}

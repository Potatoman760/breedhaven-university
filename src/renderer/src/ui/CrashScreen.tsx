import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../../../shared/i18n'

interface State {
  error: Error | null
  /** Which part of the screen it happened in, as React tells it. */
  where: string
}

/**
 * What is shown when something on the screen throws while it is being drawn. Without it the
 * window simply goes blank and nothing says why. The game as it was last saved is untouched:
 * the autosave is written as play goes on, so starting the window again loses nothing but
 * the line that was being waited for.
 */
export class CrashScreen extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, where: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('The screen could not be drawn:', error, info.componentStack)
    this.setState({ where: info.componentStack ?? '' })
  }

  render(): ReactNode {
    const { error, where } = this.state
    if (!error) return this.props.children
    const detail = [`${error.name}: ${error.message}`, error.stack?.split('\n').slice(1, 6).join('\n'), where.trim().split('\n').slice(0, 8).join('\n')].filter(Boolean).join('\n\n')
    return (
      <main className="crash">
        <h1>{t('shell.crash.title')}</h1>
        <p>{t('shell.crash.body')}</p>
        <pre>{detail}</pre>
        <div className="row">
          <button onClick={() => window.location.reload()}>{t('shell.crash.startAgain')}</button>
          <button className="secondary" onClick={() => void navigator.clipboard.writeText(detail)}>
            {t('shell.crash.copyError')}
          </button>
        </div>
      </main>
    )
  }
}

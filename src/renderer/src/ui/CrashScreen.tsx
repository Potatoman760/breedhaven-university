import { Component, type ErrorInfo, type ReactNode } from 'react'

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
        <h1>Something went wrong</h1>
        <p>The screen could not be drawn. Your game is safe: it is saved as you play, and Continue on the title screen picks it up from there.</p>
        <pre>{detail}</pre>
        <div className="row">
          <button onClick={() => window.location.reload()}>Start again</button>
          <button className="secondary" onClick={() => void navigator.clipboard.writeText(detail)}>
            Copy the error
          </button>
        </div>
      </main>
    )
  }
}

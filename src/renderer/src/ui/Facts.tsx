import type { ReactNode } from 'react'

export interface Fact {
  label: string
  value: ReactNode
  /** A few words under the value: when it falls due, what it allows. */
  note?: ReactNode
  /** Said on hover: how the figure is come by. */
  title?: string
  /** Something wrong that he should see at a glance. */
  warn?: boolean
  /** Something to be done about it, set beside it. */
  action?: ReactNode
}

/**
 * A row of figures, each under its name: the standing of something, read across. For what a screen has to tell at
 * its head, where a pill would make a label of what is really a number.
 */
export function Facts({ facts }: { facts: Fact[] }) {
  return (
    <dl className="facts">
      {facts.map((fact) => (
        <div key={fact.label} className={fact.warn ? 'fact warn' : 'fact'} title={fact.title}>
          <dt className="caps">{fact.label}</dt>
          <dd>
            <strong>{fact.value}</strong>
            {fact.note && <span className="hint">{fact.note}</span>}
            {fact.action}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** The dialogs that can be open over the game. */
export type Panel =
  | { kind: 'save' | 'load' | 'settings' | 'calendar' | 'map' | 'log' | 'gifts' }
  /** The player's phone, opened on one of the people he knows when `id` is given. */
  | { kind: 'courier'; id?: string }
  | { kind: 'tbi'; feature: string; note: string }

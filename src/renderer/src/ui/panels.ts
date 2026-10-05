/** The dialogs that can be open over the game. */
export type Panel =
  | { kind: 'save' | 'load' | 'settings' | 'calendar' | 'map' | 'log' | 'backgrounds' | 'gifts' | 'courier' }
  | { kind: 'char'; id: string }
  | { kind: 'tbi'; feature: string; note: string }

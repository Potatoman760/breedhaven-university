/** The dialogs that can be open over the game. */
export type Panel =
  | { kind: 'save' | 'load' | 'settings' | 'calendar' | 'map' | 'log' | 'gifts' | 'menu' | 'endDay' | 'house' | 'help' | 'below' | 'bag' | 'poker' | 'fair' }
  /** The player's phone, opened on one of the people he knows when `id` is given, or on one of its apps. */
  | { kind: 'courier'; id?: string; app?: PhoneApp; chat?: string }

/** The phone's apps, down its left edge. */
export type PhoneApp = 'chats' | 'friends' | 'updates' | 'jobs' | 'societies' | 'shop'

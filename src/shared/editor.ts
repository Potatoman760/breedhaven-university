import type { ContentPack } from './model'

/** Paths in content that start with this are served from the user's add-on folder, not the game's own. */
export const ADDON_PREFIX = 'addons/'

/** Where an entry comes from: the game, an add-on, or an add-on that replaces one of the game's. */
export type ContentOrigin = 'base' | 'addon' | 'override'

/** The two lists of `looks.json`: faces and sex-acts added to the standard ones. */
export const LOOK_KINDS = ['expressions', 'acts'] as const
export type LookKind = (typeof LOOK_KINDS)[number]

/** Ids become file and folder names, so they are kept plain. */
export function isSafeId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(id)
}

/** "Maren of the Mill" -> "maren-of-the-mill" */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export interface EditorInfo {
  /** The folder add-ons are kept in. */
  addonDir: string
  /** Add-on files that were left out of the game, and why. */
  issues: string[]
  /** By character id: love interests and NPCs alike. */
  loveInterests: Record<string, ContentOrigin>
  /** By trait id. */
  traits: Record<string, ContentOrigin>
  /** By location id. A location is only ever the game's own, or the game's own with changes. */
  locations: Record<string, ContentOrigin>
  /** By subject code: the game's own subjects, and those made in the editor. */
  majors: Record<string, ContentOrigin>
  /** By id, the faces and the sex-acts added to the standard ones: those that came with the game, and those added here. */
  looks: Record<LookKind, Record<string, ContentOrigin>>
  /** The player a new game starts with has been changed from the game's own. */
  playerChanged: boolean
  /**
   * The editor is writing the game's own content, not add-ons laid over it: so it is when the game is run from
   * its source (`npm run dev`), where every change made is a change to the base game. `addonDir` is then the pack itself.
   */
  base: boolean
  /** What a picture's path starts with when the editor files one: `addons/` for an add-on, nothing for the game's own. */
  assetPrefix: string
}

/** The answer to any change made in the editor. */
export interface EditorResult {
  /** Why the change was not made. Empty when it was. */
  issues: string[]
  /** The game's content as it now stands. */
  content: ContentPack
  info: EditorInfo
  /** How many of the character's pictures and videos were deleted on saving her, because nothing of hers uses them any more. */
  removed?: number
  /** The term's catalogue was laid out again for the change, for new games. */
  catalogueRebuilt?: boolean
}

/** Asks for a file to be picked and copied into a character's add-on folder. `loveInterestId` may be an NPC's id. */
/** A picture of the content made smaller: the one it was made from, and the WebP it was made into. */
export interface OptimizedPicture {
  path: string
  bytes: Uint8Array
}

export interface ImportAssetRequest {
  loveInterestId: string
  /** A picture, a video, or either of the two. */
  kind: 'image' | 'video' | 'media'
}

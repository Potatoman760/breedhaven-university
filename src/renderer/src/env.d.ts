/// <reference types="vite/client" />
import type { RendererApi } from '../../shared/types'

declare global {
  interface Window {
    api: RendererApi
  }
  /** The game's version, from package.json, written in when the window's code is built. */
  const __APP_VERSION__: string
}

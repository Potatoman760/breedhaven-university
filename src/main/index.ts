import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, safeStorage, session, shell, type MenuItemConstructorOptions } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { z } from 'zod'
import { chatCompletion, listModels } from './ai/openai'
import { completeWithFallback, notConfigured } from './ai/router'
import { leavers, lookLines, namesHer, parseDirectives, sceneCast, sceneWitnesses, validLook, whoSpoke } from '../shared/game/scene'
import { canSleepOver } from '../shared/game/sleep'
import { sexGate } from '../shared/game/intimacy'
import { sceneRelicUses } from '../shared/game/relics'
import { CONTENT_SCHEME, resolveContentPath, serveContent } from './content/assets'
import { deleteLoveInterest,
  removeUnusedAssets,
  deleteTrait, deleteJob, saveJob, deleteSociety, saveSociety, importAsset, loadBase, loadWithAddons, rebuildCatalogue, saveCatalogue, saveMajor, deleteMajor, saveLocation, deleteLocation, saveLoveInterest, saveTrait,
  resetPlayer,
  savePlayer
} from './content/addons'
import { isSafeId, type EditorInfo, type EditorResult } from '../shared/editor'
import { SaveStore } from './saves/store'
import { SettingsStore, type KeyCipher } from './settings/store'
import { RenameSaveRequestSchema, SaveRequestSchema, SlotIdSchema } from '../shared/saves'
import { contactsSaid, DM_CLOSE, DM_OPEN, fallbackInvite, messageText } from '../shared/game/courier'
import { buildFeedPrompt, draftPosts, feedReplyTokens, feedShortfall, parseFeedReply } from '../shared/game/feed'
import { attendableEvents, buildEventPrompt, parseGeneratedEvents } from '../shared/game/events'
import { buildSpendingPrompt, buildSummaryPrompt, fallbackSummary, parseSpending, parseSummary, PLAIN_FEELINGS, sceneRapport, sceneRevelations, type Spending, type Summary } from '../shared/game/memory'
import { npcOf, sceneExtras, withNpc } from '../shared/game/npcs'
import { inMasks } from '../shared/game/masquerade'
import { unnamedIn } from '../shared/game/strangers'
import { sceneHours } from '../shared/game/sceneMoves'
import { exchanges, windingDown } from '../shared/game/windDown'
import { asEventOuting, buildOutingPrompt, fallbackOuting, parseOuting } from '../shared/game/outing'
import { buildCoursePickPrompt, parseCoursePick, type CoursePick } from '../shared/game/coursePick'
import { banterDue, buildBanterPrompt, parseBanter } from '../shared/game/banter'
import { buildMomentPrompt, parseMomentLines } from '../shared/game/momentLines'
import { personalise } from '../shared/game/personalise'
import { withHousing } from '../shared/game/housing'
import { buildCharacterPrompt, clockNote, sceneTurns } from '../shared/game/prompt'
import { CHAT_CANCELLED, IPC } from '../shared/ipc'
import { DEFAULT_LANGUAGE, setLanguage, t, type Messages } from '../shared/i18n'
import { languagesIn, readStrings } from './content/language'
import {
  CutoutRequestSchema,
  GenerateArtRequestSchema,
  GenerateVideoRequestSchema,
  framingFor,
  normaliseComfyUrl,
  sizeFor,
  type ComfyBundle,
  type ComfyBundleCheck,
  type ComfyDownloadList,
  type ModelDownloadResult,
  type ComfyTestResult,
  type CutoutResult,
  type GenerateArtResult
} from '../shared/comfy'
import { testComfy } from './comfy/client'
import { cutoutArt } from './comfy/cutout'
import { ComfyStore, generateArt, generateClip } from './comfy/studio'
import { listWorkflows } from './comfy/workflows'
import { bundleDir, checkBundle, readBundle } from './comfy/bundle'
import { CivitaiKeyStore, downloadModel, findModelsDir, hasModel, readDownloads } from './comfy/downloads'
import { basePoseId, isMoment, isSeeding, poseMedia, pregnantPoseId, type BondProposal, type ContentPack, type GameState, type LoveInterest, type Major, type Proposal } from '../shared/model'
import { pregnancyStage, wornOutfit } from '../shared/game/pregnancy'
import { buildDraftPrompt, DRAFT_MAX_IDEA_CHARS, DRAFT_MIN_TOKENS, parseDraft } from '../shared/game/draftCharacter'
import { cardFromJson, cardFromPng, characterFromCard, type Card } from '../shared/game/sillyCard'
import { buildMajorDraftPrompt, MAJOR_DRAFT_MIN_TOKENS, parseMajorDraft } from '../shared/game/draftMajor'
import { excuseTool, meetingTool, moveTool, relationshipTool, revealTool, type Leaving } from './ai/tools'
import {
  isConfigured,
  ListModelsRequestSchema,
  LLM_PROFILE_IDS,
  SettingsUpdateSchema,
  type ListModelsResponse,
  toView
} from '../shared/settings'
import {
  CourierRequestSchema,
  type CourierResponse,
  FeedPictureRequestSchema,
  type FeedPictureResponse,
  FeedRequestSchema,
  type FeedResponse,
  PlanOutingRequestSchema,
  PickCoursesRequestSchema,
  BanterRequestSchema, MomentLinesRequestSchema,
  type BanterResponse,
  type PlanOutingResponse,
  GenerateEventsRequestSchema,
  SceneRequestSchema,
  type ChatResponse,
  type SummarizeResponse,
  type TestConnectionResponse
} from '../shared/types'

// How many trailing messages are scanned for codex keywords.
const CODEX_SCAN_MESSAGES = 4
// Summaries should be faithful rather than creative.
const SUMMARY_TEMPERATURE = 0.3

// A list of events as JSON needs more room than a line of dialogue.
// Room enough for the lecture a class opens with, whatever the profile allows an ordinary reply.
const LESSON_MIN_TOKENS = 900
const EVENT_MIN_TOKENS = 800
// A whole character takes a while to write.
const DRAFT_TIMEOUT_MS = 180_000


/** Where the game's content is: its own, in English, and a folder beside it for each language it is translated into. */
function contentRoot(): string {
  return join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'content')
}

function contentDir(): string {
  return join(contentRoot(), 'default')
}

/** The language the game is in, and the folder its translation is in: none for English, or for a language that is not there any more. */
interface InLanguage {
  language: string
  languageDir?: string
  messages: Messages
}

/** Puts this process into a language, which is what the LLM is told everything in. */
function useLanguage(wanted: string): InLanguage {
  const dir = join(contentRoot(), wanted)
  const languageDir = wanted !== DEFAULT_LANGUAGE && existsSync(join(dir, 'language.json')) ? dir : undefined
  const { messages, issues } = languageDir ? readStrings(languageDir) : { messages: {}, issues: [] }
  for (const issue of issues) console.warn(`${wanted}: ${issue}`)
  const language = languageDir ? wanted : DEFAULT_LANGUAGE
  setLanguage(language, messages)
  return { language, languageDir, messages }
}

// Must happen before the app is ready. Lets the renderer load pack artwork as images.
protocol.registerSchemesAsPrivileged([
  { scheme: CONTENT_SCHEME, privileges: { standard: true, secure: true } }
])

function serveContentAssets(packDir: string, addonDir: string): void {
  protocol.handle(CONTENT_SCHEME, (request) => serveContent(packDir, request, addonDir))
}

function keyCipher(): KeyCipher | undefined {
  if (!safeStorage.isEncryptionAvailable()) return undefined
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (stored) => safeStorage.decryptString(Buffer.from(stored, 'base64'))
  }
}

/**
 * The game's icon, for a run from source. A packaged build has it written into the executable, and needs nothing here;
 * run from source, it is Electron's own executable that runs, with Electron's icon, unless the window is given one.
 */
function devIcon(): string | undefined {
  if (app.isPackaged) return undefined
  // Windows picks the size it wants from the .ico, which has the small ones drawn for it.
  return join(app.getAppPath(), 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

function createWindow(): void {
  const icon = devIcon()
  // macOS takes no icon from a window: the dock's is set instead.
  if (icon && process.platform === 'darwin') app.dock?.setIcon(icon)
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // A window has no right-click menu of its own. Where something is typed, or text is picked out, it gets the usual
  // one: the spelling checker's suggestions for a misspelt word, then cut, copy and paste.
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable && params.selectionText.trim() === '') return
    const items: MenuItemConstructorOptions[] = []
    if (params.misspelledWord) {
      for (const word of params.dictionarySuggestions) items.push({ label: word, click: () => win.webContents.replaceMisspelling(word) })
      if (params.dictionarySuggestions.length === 0) items.push({ label: t('llm.main.noSuggestions'), enabled: false })
      items.push(
        { label: t('llm.main.addToDictionary'), click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) },
        { type: 'separator' }
      )
    }
    if (params.isEditable) {
      items.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll' }
      )
    } else items.push({ role: 'copy' })
    Menu.buildFromTemplate(items).popup({ window: win })
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // electron-vite sets ELECTRON_RENDERER_URL when running the dev server.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  // A screen opened on its own for a look at it (`npm run preview:loading`): named in the address, for the window to show in place of the game.
  const preview = !app.isPackaged ? process.env['BREEDHAVEN_PREVIEW'] : undefined
  const hash = preview ? `preview=${encodeURIComponent(preview)}` : undefined
  if (!app.isPackaged && devUrl) {
    win.loadURL(hash ? `${devUrl}#${hash}` : devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

function registerIpc(
  loaded: { content: ContentPack; info: EditorInfo },
  packDir: string,
  settings: SettingsStore,
  saves: SaveStore,
  comfy: ComfyStore,
  /** The player's Civitai key, for downloading models that want him signed in. */
  civitaiKey: CivitaiKeyStore,
  /** The user's own add-on folder, where what the game makes as it is played (the selfies on the feed) is always filed. */
  userDir: string,
  /** The language the content was loaded in. */
  inLanguage: InLanguage
): void {
  // Replaced whenever the editor changes an add-on; every handler below reads the current one.
  let { content, info } = loaded
  let lang = inLanguage
  // Read afresh the way it was first read: the game's own files when they are what is being edited, and otherwise with the add-ons over them.
  const reload = () => ({ content, info } = info.base ? loadBase(packDir, lang.languageDir) : loadWithAddons(packDir, info.addonDir, lang.languageDir))
  const languageView = () => ({ language: lang.language, messages: lang.messages, languages: languagesIn(contentRoot(), t('core.language.en')) })
  ipcMain.handle(IPC.getLanguage, () => languageView())
  ipcMain.handle(IPC.setLanguage, (_event, raw: unknown) => {
    lang = useLanguage(z.string().parse(raw))
    settings.setLanguage(lang.language)
    reload()
    return { ...languageView(), content }
  })
  /** The content as the game with this state reads it: the player's name filled in wherever the content wrote the token. */
  // And with the house he has been let in it or out of it, as his game has it.
  const readBy = (state: Pick<GameState, 'player' | 'housing'>): ContentPack => withHousing(personalise(content, state.player.name), state)
  const baseTraitIds = () => Object.keys(info.traits).filter((id) => info.traits[id] !== 'addon')

  ipcMain.handle(IPC.getContent, () => content)

  // The PNGs a WebP has been made from, by their files: each goes once a save leaves nothing in the content naming it.
  const optimized = new Map<string, string>()
  /** Deletes the PNGs that were made smaller and that nothing names any more. One still named stays, and is tried again at the next save. */
  const tidyOptimized = (): void => {
    const named = JSON.stringify(content)
    for (const [path, file] of optimized) {
      if (named.includes(JSON.stringify(path))) continue
      rmSync(file, { force: true })
      optimized.delete(path)
    }
  }

  /** Makes a change to the add-ons, then loads the content afresh so the game and the editor agree. */
  const change = (apply: () => string[]): EditorResult => {
    // What the editor has in another language is a translation: saved, it would be written over the English.
    const issues = lang.languageDir ? [t('core.editor.englishOnly')] : apply()
    let catalogueRebuilt = false
    if (issues.length === 0) {
      reload()
      // Whoever was saved has her classes in the next new game: the term is laid out again for her.
      if (rebuildCatalogue(packDir, info.addonDir, content, info.base)) {
        catalogueRebuilt = true
        reload()
      }
      tidyOptimized()
    }
    return { issues, content, info, ...(catalogueRebuilt && { catalogueRebuilt }) }
  }
  ipcMain.handle(IPC.editorInfo, () => info)
  /** Saves a character, then clears out whatever of hers the saved file no longer uses. */
  const saveAndTidy = (raw: unknown, save: () => string[], find: (id: string) => Parameters<typeof removeUnusedAssets>[1] | undefined): EditorResult => {
    const result = change(save)
    const saved = result.issues.length === 0 ? find(String((raw as { id?: unknown } | null)?.id ?? '')) : undefined
    return saved ? { ...result, removed: removeUnusedAssets(info.addonDir, saved, info.assetPrefix).length } : result
  }
  ipcMain.handle(IPC.editorSaveLoveInterest, (_event, raw: unknown) =>
    saveAndTidy(raw, () => saveLoveInterest(info.addonDir, content, raw), (id) => [...content.loveInterests, ...content.npcs].find((li) => li.id === id))
  )
  ipcMain.handle(IPC.editorDeleteLoveInterest, (_event, raw: unknown) =>
    change(() => deleteLoveInterest(info.addonDir, z.string().parse(raw)))
  )
  /** A new character written by the Main LLM, from an idea or from a card. Never throws: what went wrong comes back as the reason. */
  async function draftCharacter(idea: string, card?: Card): Promise<{ loveInterest?: LoveInterest; error?: string }> {
    const profile = settings.get().main
    if (!isConfigured(profile)) return { error: notConfigured() }
    try {
      const { system, user } = buildDraftPrompt(content, idea, card)
      const reply = await chatCompletion(profile, {
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: Math.max(profile.maxTokens, DRAFT_MIN_TOKENS),
        timeoutMs: DRAFT_TIMEOUT_MS
      })
      try {
        return { loveInterest: parseDraft(content, reply, card) }
      } catch (error) {
        // What came back is kept, so that a reply that could not be read can be looked at.
        const kept = join(app.getPath('userData'), 'last-draft-reply.txt')
        writeFileSync(kept, reply)
        return { error: t('llm.main.replySaved', { error: (error as Error).message, file: kept }) }
      }
    } catch (error) {
      return { error: (error as Error).message }
    }
  }
  ipcMain.handle(IPC.editorDraftLoveInterest, async (_event, raw: unknown) => {
    const idea = z.string().trim().min(1).max(DRAFT_MAX_IDEA_CHARS).safeParse(raw)
    if (!idea.success) return { error: t('llm.main.describeHer') }
    return draftCharacter(idea.data)
  })
  // The card last picked: kept here, and only its words are used.
  let pickedCard: Card | null = null
  ipcMain.handle(IPC.editorReadCard, async (event): Promise<{ card?: Card; error?: string } | null> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = { properties: ['openFile' as const], filters: [{ name: t('llm.main.characterCards'), extensions: ['png', 'json'] }] }
    const forced = app.isPackaged ? undefined : process.env['BREEDHAVEN_IMPORT_FILE']
    const picked = forced ? { canceled: false, filePaths: [forced] } : await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
    const file = picked.filePaths[0]
    if (picked.canceled || !file) return null
    try {
      const card = extname(file).toLowerCase() === '.png' ? cardFromPng(new Uint8Array(readFileSync(file))) : cardFromJson(readFileSync(file, 'utf8'))
      pickedCard = card
      return { card }
    } catch (error) {
      return { error: (error as Error).message }
    }
  })
  // Her from the card last picked: as the card has her, or written into the setting by the LLM. The card's picture is not hers.
  ipcMain.handle(IPC.editorFromCard, async (_event, raw: unknown): Promise<{ loveInterest?: LoveInterest; error?: string }> => {
    const { generate, notes } = z.object({ generate: z.boolean(), notes: z.string().max(DRAFT_MAX_IDEA_CHARS).default('') }).parse(raw)
    if (!pickedCard) return { error: t('llm.main.pickCard') }
    return generate ? draftCharacter(notes, pickedCard) : { loveInterest: characterFromCard(content, pickedCard) }
  })
  ipcMain.handle(IPC.editorSaveMajor, (_event, raw: unknown) => change(() => saveMajor(info.addonDir, content, raw)))
  ipcMain.handle(IPC.editorDeleteMajor, (_event, raw: unknown) => change(() => deleteMajor(info.addonDir, content, z.string().parse(raw))))
  // Never fails: a subject that can't be written comes back as the reason why. Written once here, and kept as written.
  ipcMain.handle(IPC.editorDraftMajor, async (_event, raw: unknown): Promise<{ major?: Major; error?: string }> => {
    const idea = z.object({ subject: z.string().trim().min(1), college: z.string(), notes: z.string().max(DRAFT_MAX_IDEA_CHARS).default('') }).safeParse(raw)
    if (!idea.success) return { error: t('llm.main.nameSubject') }
    const profile = settings.get().main
    if (!isConfigured(profile)) return { error: notConfigured() }
    try {
      const { system, user } = buildMajorDraftPrompt(content, idea.data)
      const reply = await chatCompletion(profile, {
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: Math.max(profile.maxTokens, MAJOR_DRAFT_MIN_TOKENS),
        timeoutMs: DRAFT_TIMEOUT_MS
      })
      try {
        return { major: parseMajorDraft(content, idea.data, reply) }
      } catch (error) {
        const kept = join(app.getPath('userData'), 'last-draft-reply.txt')
        writeFileSync(kept, reply)
        return { error: t('llm.main.replySaved', { error: (error as Error).message, file: kept }) }
      }
    } catch (error) {
      return { error: (error as Error).message }
    }
  })
  ipcMain.handle(IPC.editorSaveTrait, (_event, raw: unknown) => change(() => saveTrait(info.addonDir, raw)))
  ipcMain.handle(IPC.editorDeleteTrait, (_event, raw: unknown) =>
    change(() => deleteTrait(info.addonDir, content, baseTraitIds(), z.string().parse(raw)))
  )
  ipcMain.handle(IPC.editorSaveLocation, (_event, raw: unknown) => change(() => saveLocation(info.addonDir, content, raw, info.base)))
  ipcMain.handle(IPC.editorDeleteLocation, (_event, raw: unknown) => change(() => deleteLocation(info.addonDir, z.string().parse(raw))))
  // Jobs and societies are the game's own: there to be changed only when it is run from source.
  const ownOnly = (apply: () => string[]) => change(() => (info.base ? apply() : [t('llm.main.ownOnly')]))
  ipcMain.handle(IPC.editorSaveJob, (_event, raw: unknown) => ownOnly(() => saveJob(packDir, content, raw)))
  ipcMain.handle(IPC.editorDeleteJob, (_event, raw: unknown) => ownOnly(() => deleteJob(packDir, z.string().parse(raw))))
  ipcMain.handle(IPC.editorSaveSociety, (_event, raw: unknown) => ownOnly(() => saveSociety(packDir, content, raw)))
  ipcMain.handle(IPC.editorDeleteSociety, (_event, raw: unknown) => ownOnly(() => deleteSociety(packDir, z.string().parse(raw))))
  ipcMain.handle(IPC.editorSavePlayer, (_event, raw: unknown) => change(() => savePlayer(info.addonDir, content, raw)))
  ipcMain.handle(IPC.editorResetPlayer, () => change(() => resetPlayer(info.addonDir)))
  ipcMain.handle(IPC.editorSaveCatalogue, (_event, raw: unknown) => change(() => saveCatalogue(info.addonDir, raw)))
  ipcMain.handle(IPC.editorImportAsset, async (event, raw: unknown): Promise<string | null> => {
    const { loveInterestId, kind } = z.object({ loveInterestId: z.string(), kind: z.enum(['image', 'video', 'media']) }).parse(raw)
    if (!isSafeId(loveInterestId)) throw new Error(t('llm.main.usableId'))
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: kind === 'image' ? t('llm.main.choosePicture') : kind === 'video' ? t('llm.main.chooseVideo') : t('llm.main.choosePictureOrClip'),
      properties: ['openFile' as const],
      filters: [
        kind === 'image'
          ? { name: t('llm.main.pictures'), extensions: ['png', 'webp', 'jpg', 'jpeg', 'gif'] }
          : kind === 'video'
            ? { name: t('llm.main.videos'), extensions: ['mp4', 'webm'] }
            : { name: t('llm.main.picturesAndClips'), extensions: ['png', 'webp', 'jpg', 'jpeg', 'gif', 'mp4', 'webm'] }
      ]
    }
    // A test or a script can name the file outright instead of going through the dialog.
    const forced = app.isPackaged ? undefined : process.env['BREEDHAVEN_IMPORT_FILE']
    const picked = forced ? { canceled: false, filePaths: [forced] } : await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
    if (picked.canceled || !picked.filePaths[0]) return null
    return importAsset(info.addonDir, loveInterestId, picked.filePaths[0], info.assetPrefix)
  })
  /** Where one of the content's pictures is on disk, by its path; never outside the content. */
  const pictureFile = (path: string): string => {
    const file = resolveContentPath(packDir, `${CONTENT_SCHEME}://pack/${path.split('/').map(encodeURIComponent).join('/')}`, info.addonDir)
    if (!file || !existsSync(file)) throw new Error(t('llm.main.noPicture', { path }))
    return file
  }
  ipcMain.handle(IPC.editorReadPicture, (_event, raw: unknown): Uint8Array => readFileSync(pictureFile(z.string().min(1).parse(raw))))
  ipcMain.handle(IPC.editorSaveOptimized, (_event, raw: unknown): string => {
    const { path, bytes } = z.object({ path: z.string().min(1), bytes: z.instanceof(Uint8Array) }).parse(raw)
    const source = pictureFile(path)
    // It has to be a WebP: "RIFF", its length, "WEBP".
    if (bytes.length < 12 || Buffer.from(bytes.subarray(0, 4)).toString('latin1') !== 'RIFF' || Buffer.from(bytes.subarray(8, 12)).toString('latin1') !== 'WEBP') {
      throw new Error(t('llm.main.notWebp'))
    }
    // Beside the original: in the add-on folder at the same place, which for the game's own files being edited is the original's own folder.
    const own = info.assetPrefix !== '' && path.startsWith(info.assetPrefix)
    const stem = (own ? path.slice(info.assetPrefix.length) : path).replace(/\.png$/i, '')
    const root = resolve(info.addonDir)
    let rel = `${stem}.webp`
    for (let n = 2; existsSync(join(root, rel)); n++) rel = `${stem}-${n}.webp`
    const target = resolve(root, rel)
    if (!target.startsWith(root + sep)) throw new Error(t('llm.main.notInContent'))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
    // The original is deleted once nothing names it, and only if it is the editor's to delete: never the game's own while an add-on is edited.
    if (source.startsWith(root + sep)) optimized.set(path, source)
    return `${info.assetPrefix}${rel}`
  })
  // The art studio. Nothing in a scene reaches these: they run only when the studio asks.
  ipcMain.handle(IPC.comfyGetSettings, () => comfy.get())
  // What is said of the workflows goes into the game itself when the game's own files are what is being edited, and is the player's own otherwise.
  ipcMain.handle(IPC.comfySaveSettings, (_event, raw: unknown) => comfy.update(raw, info.base))
  ipcMain.handle(IPC.comfyTest, async (_event, raw: unknown): Promise<ComfyTestResult> => {
    const { url, problem } = normaliseComfyUrl(z.string().parse(raw))
    return url === null ? { ok: false, message: problem ?? t('llm.main.notAddress'), device: null } : testComfy(url)
  })
  // The game's own workflows, which are what is run: nobody points the game at a folder of them.
  ipcMain.handle(IPC.comfyWorkflows, () => listWorkflows(bundleDir(packDir), comfy.get().overrides))
  ipcMain.handle(IPC.comfyBundle, (): ComfyBundle => readBundle(packDir))
  ipcMain.handle(IPC.comfyBundleCheck, (): Promise<ComfyBundleCheck> => checkBundle(comfy.get().baseUrl, readBundle(packDir)))
  // The models the game's workflows call for: what there is to fetch, where it goes, and the fetching of it.
  const downloadList = (): ComfyDownloadList => {
    const { models, nodes } = readDownloads(packDir)
    const { modelsDir } = comfy.get()
    return { models: models.map((model) => ({ ...model, present: hasModel(modelsDir, model) })), nodes, modelsDir, hasCivitaiKey: civitaiKey.get() !== '' }
  }
  ipcMain.handle(IPC.comfyDownloads, () => downloadList())
  ipcMain.handle(IPC.comfyChooseModelsDir, async (event): Promise<ComfyDownloadList> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = { title: t('llm.main.chooseComfyFolder'), properties: ['openDirectory' as const] }
    const picked = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
    const dir = picked.canceled ? undefined : picked.filePaths[0]
    if (!dir) return downloadList()
    const found = findModelsDir(dir)
    if (!found) throw new Error(t('llm.main.noModelsFolder', { dir }))
    comfy.update({ ...comfy.get(), modelsDir: found })
    return downloadList()
  })
  ipcMain.handle(IPC.comfySetCivitaiKey, (_event, raw: unknown): ComfyDownloadList => {
    civitaiKey.set(z.string().max(200).parse(raw))
    return downloadList()
  })
  // One download at a time: these are files of many gigabytes.
  let downloading: AbortController | null = null
  ipcMain.handle(IPC.comfyDownloadModel, async (event, raw: unknown): Promise<ModelDownloadResult> => {
    const file = z.string().parse(raw)
    const model = readDownloads(packDir).models.find((m) => m.file === file)
    const { modelsDir } = comfy.get()
    if (!model) return { ok: false, file, message: t('llm.main.notListed') }
    if (!modelsDir) return { ok: false, file, message: t('llm.main.comfyFolderFirst') }
    if (downloading) return { ok: false, file, message: t('llm.main.downloadRunning') }
    const mine = new AbortController()
    downloading = mine
    try {
      return await downloadModel(model, modelsDir, civitaiKey.get(), (progress) => !event.sender.isDestroyed() && event.sender.send(IPC.comfyDownloadProgress, progress), mine.signal)
    } finally {
      if (downloading === mine) downloading = null
    }
  })
  ipcMain.handle(IPC.comfyCancelDownload, () => downloading?.abort())
  // One picture at a time: a second request while one is being drawn takes its place in the queue behind it.
  let drawing: AbortController | null = null
  ipcMain.handle(IPC.comfyGenerate, async (_event, raw: unknown): Promise<GenerateArtResult> => {
    const request = GenerateArtRequestSchema.parse(raw)
    const mine = new AbortController()
    drawing = mine
    try {
      return await generateArt(comfy.get(), packDir, info.addonDir, request, mine.signal, info.assetPrefix)
    } finally {
      if (drawing === mine) drawing = null
    }
  })
  ipcMain.handle(IPC.comfyGenerateVideo, async (_event, raw: unknown): Promise<GenerateArtResult> => {
    const request = GenerateVideoRequestSchema.parse(raw)
    const mine = new AbortController()
    drawing = mine
    try {
      return await generateClip(comfy.get(), packDir, info.addonDir, request, mine.signal, info.assetPrefix)
    } finally {
      if (drawing === mine) drawing = null
    }
  })
  ipcMain.handle(IPC.comfyCancel, () => drawing?.abort())
  ipcMain.handle(IPC.comfyCutout, (_event, raw: unknown): CutoutResult => {
    try {
      return cutoutArt(info.addonDir, CutoutRequestSchema.parse(raw), info.assetPrefix)
    } catch (error) {
      return { ok: false, message: (error as Error).message, path: null, colour: null, cleared: 0, feathered: 0, enclosed: 0 }
    }
  })
  ipcMain.handle(IPC.editorOpenFolder, async () => {
    mkdirSync(info.addonDir, { recursive: true })
    await shell.openPath(info.addonDir)
  })

  ipcMain.handle(IPC.listSaves, () => saves.list())

  ipcMain.handle(IPC.saveGame, (_event, raw: unknown) => {
    const { slotId, name, ...data } = SaveRequestSchema.parse(raw)
    return saves.save(slotId, data, new Date(), name)
  })

  ipcMain.handle(IPC.renameSave, (_event, raw: unknown) => {
    const { slotId, name } = RenameSaveRequestSchema.parse(raw)
    return saves.rename(slotId, name)
  })

  ipcMain.handle(IPC.loadGame, (_event, raw: unknown) => saves.load(SlotIdSchema.parse(raw)))

  ipcMain.handle(IPC.deleteSave, (_event, raw: unknown) => saves.delete(SlotIdSchema.parse(raw)))

  ipcMain.handle(IPC.getSettings, () => toView(settings.get()))

  ipcMain.handle(IPC.saveSettings, (_event, raw: unknown) =>
    toView(settings.update(SettingsUpdateSchema.parse(raw)))
  )

  ipcMain.handle(IPC.listModels, async (_event, raw: unknown): Promise<ListModelsResponse> => {
    const { profileId, baseUrl, apiKey } = ListModelsRequestSchema.parse(raw)
    try {
      // A key the user hasn't retyped stays in the main process; fall back to the saved one.
      const key = apiKey ?? settings.get()[profileId].apiKey
      return { models: await listModels({ baseUrl, apiKey: key }) }
    } catch (error) {
      return { models: [], error: (error as Error).message }
    }
  })

  ipcMain.handle(
    IPC.testConnection,
    async (_event, raw: unknown): Promise<TestConnectionResponse> => {
      const profile = settings.get()[z.enum(LLM_PROFILE_IDS).parse(raw)]
      if (!isConfigured(profile)) return { ok: false, message: t('llm.main.urlAndModel') }
      try {
        const reply = await chatCompletion(profile, {
          system: t('llm.main.testSystem'),
          messages: [{ role: 'user', content: t('llm.main.testUser') }]
        })
        return { ok: true, message: t('llm.main.connected', { reply: reply.slice(0, 80) }) }
      } catch (error) {
        return { ok: false, message: (error as Error).message }
      }
    }
  )

  // The scene reply being written, so that the player can stop it. There is only ever one: he waits for each before saying more.
  let sceneReply: AbortController | undefined
  ipcMain.handle(IPC.cancelChat, () => sceneReply?.abort(new Error(CHAT_CANCELLED)))

  ipcMain.handle(IPC.chat, async (event, raw: unknown): Promise<ChatResponse> => {
    const { state, scene } = SceneRequestSchema.parse(raw)
    const stop = (sceneReply = new AbortController())
    // Said to the window the moment a move is called for, while the leaving and arriving are still to be written: it has something to show meanwhile.
    const moving = (where: string) => !event.sender.isDestroyed() && event.sender.send(IPC.chatMoving, where)
    // The content as this game reads it, with the player's name where the content wrote the token.
    const content = readBy(state)
    // A scene with an NPC is built the same way, with the NPC standing among the characters.
    const npc = scene.npc ? npcOf(content, scene.loveInterestId) : undefined
    // At a masked ball she is herself in her mask's gown, with its sex-acts for her own.
    const cast = npc ? withNpc(content, npc.id) : inMasks(content, scene, false)
    const systemPrompt = buildCharacterPrompt({
      content: cast,
      state,
      npc: npc && { role: npc.role, knowledge: npc.ai.knowledge },
      extras: sceneExtras(content, state, scene),
      backgroundId: scene.backgroundId,
      roomOf: scene.roomOf,
      departed: scene.departed,
      hoursSoFar: sceneHours(state, scene),
      windDown: windingDown(scene) ? exchanges(scene) : undefined,
      loveInterestId: scene.loveInterestId,
      companionIds: scene.companionIds,
      sceneBeats: scene.beats,
      lesson: scene.lesson,
      opening: scene.messages.length === 0,
      uninhibited: scene.uninhibited,
      relics: sceneRelicUses(content, scene),
      look: scene,
      looks: scene.looks,
      comfort: scene.comfort,
      gifts: scene.gifts,
      presents: scene.presents,
      strangers: unnamedIn(cast, scene),
      pendingProposal: scene.proposal && scene.proposal.time > state.time ? scene.proposal : undefined,
      // Everything said in the scene: lore that has come up stays for the rest of it.
      recentText: scene.messages.map((m) => m.content).join('\n')
    })
    // Set if the character uses the scheduling tool while writing this reply.
    let proposal: Proposal | undefined
    let bondProposal: BondProposal | undefined
    const rolls: string[] = []
    let movedTo: string | undefined
    // The place the scene has gone to in this reply, so that going there is not also booked as a plan.
    let movedPlace: string | undefined
    let hoursPassed = 0
    let left: Leaving | undefined
    // Set when they leave together for something of his that is theirs too: the scene ends with the going.
    let walkTo: { withIds: string[] } | undefined
    // Nobody leaves a masked ball mid-dance, nor the terrace after it: the night keeps them where it put them.
    const move = npc || scene.dance || scene.mask
      ? undefined
      : moveTool(content, state, scene, (destination, hours, stayingIds) => {
          movedTo = destination.id
          movedPlace = destination.locationId
          // A room is named with what it is like after a colon: only its name is said.
          moving(t('llm.main.goingTo', { place: destination.name.split(':')[0] }))
          // A plan made a moment ago for the place they are now going to is the same thing asked for twice: the going is kept.
          if (proposal?.locationId === destination.locationId) proposal = undefined
          hoursPassed = hours
          // Whoever is left behind when the scene moves on is out of it, with no hard feelings unless she said otherwise.
          if (stayingIds.length > 0 && !left) left = { ids: stayingIds, feeling: 'content', reason: t('llm.main.stayedBehind') }
        }, (next, withIds) => {
          walkTo = { withIds }
          moving(t('llm.main.goingTo', { place: content.locations.find((l) => l.id === next.locationId)?.name ?? next.title }))
        })
    const { reply, profileId } = await completeWithFallback(settings.get(), scene.nsfw, {
      system: systemPrompt,
      signal: stop.signal,
      // With nothing said yet, the character opens the scene.
      messages: sceneTurns(scene.messages, state.player.name, scene.lesson, clockNote(content, state)),
      // The lecture a class opens with is several times the length of an ordinary reply.
      ...(scene.lesson && scene.messages.length === 0 ? { maxTokens: Math.max(settings.get().main.maxTokens, LESSON_MIN_TOKENS) } : {}),
      // An NPC makes no plans and no promises with the player.
      tools: [
        ...(npc
          ? []
          : [
              meetingTool(content, state, scene.loveInterestId, (p) => (proposal = p), sceneCast(scene), () => movedPlace),
              relationshipTool(content, state, scene.loveInterestId, (p) => (bondProposal = p), sceneCast(scene))
            ]),
        ...(move ? [move] : [])
      ]
    })
    const { text, ended, seeded, stopsControl, named, comfort: readings, leaving, attending: saidGoing, agreed, slept, ...asked } = parseDirectives(reply)
    const li = cast.loveInterests.find((c) => c.id === scene.loveInterestId)
    // A tag without a name means the scene's love interest; with one, whoever in the scene it names.
    const present = sceneCast(scene)
    const idOf = (name: string): string | undefined =>
      name === ''
        ? scene.loveInterestId
        : present.find((id) => {
            const who = cast.loveInterests.find((c) => c.id === id)
            return who !== undefined && namesHer(name, who)
          })
    // What she will not do is not done, whatever the reply says: no sex-act is shown and nothing can come of one.
    const willing = (id: string) => {
      const who = cast.loveInterests.find((c) => c.id === id)
      return who !== undefined && sexGate(content, state, who, scene.uninhibited?.includes(id)).open
    }
    const seededIds = seeded.map(idOf).filter((id): id is string => id !== undefined && willing(id))
    // Who the reply says leaves: at least one has to stay, and whoever was left behind by a move has already gone.
    const goers = leavers(scene, leaving.map((one) => idOf(one.name)).filter((id): id is string => id !== undefined))
    if (!npc && goers.length > 0 && !left) {
      const said = leaving.find((one) => idOf(one.name) === goers[0])
      left = { ids: goers, feeling: said?.feeling ?? 'content', reason: said?.reason ?? '' }
    }
    // Who the reply says will be at an event: only events that can be gone to, by people who are here. In a group, only
    // by those who said so themselves: a model asked whether one of them is coming writes the tag for all of them.
    const goable = attendableEvents(content, state)
    const spoke = whoSpoke(text, present.flatMap((id) => cast.loveInterests.find((c) => c.id === id) ?? []))
    const attending = npc
      ? []
      : saidGoing.flatMap((one) => {
          const id = idOf(one.name)
          if (id && present.length > 1 && !spoke.includes(id)) return []
          const event = goable.find((e) => e.id.toLowerCase() === one.eventId || e.name.toLowerCase().replace(/^the /, '') === one.eventId.replace(/^the /, ''))
          return id && event ? [{ eventId: event.id, ids: [id] }] : []
        })
    // The plan she suggested earlier, agreed to in words: booked, unless a new one was suggested in its place.
    const proposalAccepted = !npc && agreed && scene.proposal !== undefined && scene.proposal.time > state.time && !proposal
    // They go to sleep for the night where they are, when it is late enough for that.
    const sleptOver = !npc && slept && canSleepOver(content, state) && !walkTo && !movedTo
    // How comfortable each of them says she is, kept for the next prompt and for nothing else.
    const comfort: ChatResponse['comfort'] = {}
    for (const { name, level, reason } of readings) {
      const id = idOf(name)
      if (id && !npc) comfort[id] = { level, reason }
    }
    // Each love interest's face and outfit: the lead's on the scene itself, the others' beside it.
    let look: typeof asked = asked
    const looks: Record<string, { outfitId?: string; expression?: string }> = {}
    for (const one of named) {
      const id = idOf(one.name)
      const theirs = cast.loveInterests.find((c) => c.id === id)
      if (!id || !theirs) continue
      if (id === scene.loveInterestId) look = { ...look, outfitId: one.outfitId ?? look.outfitId, expression: one.expression ?? look.expression }
      else {
        const valid = validLook({ outfitId: one.outfitId, expression: one.expression }, theirs, { outfitId: scene.looks?.[id]?.outfitId })
        looks[id] = { outfitId: valid.outfitId && wornOutfit(content, state, theirs, valid.outfitId)?.id, expression: valid.expression }
      }
    }
    const fitted = (valid: ReturnType<typeof validLook>, who: LoveInterest): ReturnType<typeof validLook> =>
      valid.outfitId === undefined || npc ? valid : { ...valid, outfitId: wornOutfit(content, state, who, valid.outfitId)?.id }
    // A pose is one character's and is shown over everyone: the one named with it, or the scene's lead. It has to be one she has something to show for.
    const poser = cast.loveInterests.find((c) => c.id === (look.animationOf ? idOf(look.animationOf) : scene.loveInterestId))
    const drawn = (a: Parameters<typeof poseMedia>[0]) => poseMedia(a).length > 0
    // The pose asked for, by its own name: a plain one, or one drawn pregnant.
    const pose = poser?.animations.find((a) => a.id.toLowerCase() === look.animationId?.toLowerCase() && drawn(a))
    // Asked for plain while her pregnancy shows, it is put up as the same pose drawn pregnant, where she has that picture.
    const showing = poser !== undefined && !npc && pregnancyStage(content, state, poser.id)?.showing === true
    const shown = (showing && pose && poser?.animations.find((a) => a.id === pregnantPoseId(pose.id) && drawn(a))) || pose
    // A moment is shown once: asked for again in the very next reply, it is not put up a second time.
    const again = pose !== undefined && shown !== undefined && isMoment(basePoseId(pose.id)) && scene.animationId === shown.id && (scene.animationOf ?? scene.loveInterestId) === poser?.id
    const posed = look.animationId === null ? { animationId: null } : pose && shown && poser && !npc && !again && willing(poser.id) ? { animationId: shown.id, animationOf: poser.id } : {}
    return {
      message: { role: 'assistant', content: text || '...', tags: lookLines(reply) || undefined },
      systemPrompt,
      profileId,
      // Setting off together for his class, and going to sleep for the night, both close the scene.
      sceneEnded: ended || walkTo !== undefined || sleptOver,
      walkTo,
      proposal,
      bondProposal,
      // A pose that shows him finishing inside her says what the tag says, whether or not the tag was written. The game still decides what comes of it.
      offControlIds: npc ? [] : [...new Set(stopsControl.map(idOf).filter((id): id is string => id !== undefined))],
      seededIds: npc ? [] : [...new Set([...seededIds, ...(pose && poser && isSeeding(basePoseId(pose.id)) && willing(poser.id) ? [poser.id] : [])])],
      rolls,
      // Setting off for his class or plan is the going: the scene is not also taken somewhere.
      moveTo: walkTo || sleptOver ? undefined : movedTo,
      sleptOver: sleptOver || undefined,
      proposalAccepted: proposalAccepted || undefined,
      attending: attending.length > 0 ? attending : undefined,
      left,
      // A handle written out in the reply is a handle given.
      contacts: npc ? [] : contactsSaid(content, state, sceneCast(scene), text),
      comfort,
      hours: hoursPassed > 0 ? hoursPassed : undefined,
      look: li ? { ...fitted(validLook({ outfitId: look.outfitId, expression: look.expression }, li, scene), li), ...posed } : {},
      looks
    }
  })

  ipcMain.handle(IPC.generateEvents, async (_event, raw: unknown) => {
    const { state } = GenerateEventsRequestSchema.parse(raw)
    // The content as this game reads it, with the player's name where the content wrote the token.
    const content = readBy(state)
    const profile = settings.get().main
    if (!isConfigured(profile)) throw new Error(notConfigured())

    const { system, user } = buildEventPrompt({ content, state })
    const reply = await chatCompletion(profile, {
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: Math.max(profile.maxTokens, EVENT_MIN_TOKENS)
    })
    return parseGeneratedEvents(reply, { content, state })
  })

  ipcMain.handle(IPC.courier, async (_event, raw: unknown): Promise<CourierResponse> => {
    const { state, loveInterestId, invite, note, news } = CourierRequestSchema.parse(raw)
    // The content as this game reads it, with the player's name where the content wrote the token.
    const content = readBy(state)
    const unprompted = invite || note || news !== undefined
    const thread = state.courier[loveInterestId] ?? []
    let proposal: Proposal | undefined
    const told: string[] = []
    // An NPC in his DMs is his boss, and makes no plans with him. Whoever his boss is, NPC or not, can be told he will miss a shift.
    const npc = npcOf(content, loveInterestId)
    let excused: string | undefined
    const excuse = excuseTool(content, state, loveInterestId, (key) => (excused = key))
    const reveal = npc ? undefined : revealTool(content, state, [loveInterestId], (revelation) => told.push(revelation.factId))
    try {
      const system = buildCharacterPrompt({
        content: npc ? withNpc(content, npc.id) : content,
        npc: npc && { role: npc.role, knowledge: npc.ai.knowledge },
        state,
        loveInterestId,
        mode: news !== undefined ? 'news' : invite ? 'invite' : note ? 'note' : 'courier',
        news,
        recentText: thread
          .slice(-CODEX_SCAN_MESSAGES)
          .map((note) => note.text)
          .join('\n')
      })
      // The exchange so far is in the prompt; this says whose turn it is, and puts what he has just written last of all,
      // where it cannot be passed over for the weather or the hour: a reply is to that, and to nothing else.
      const said = [...thread].reverse().find((one) => one.from === 'player')?.text
      const cue = unprompted
        ? t('llm.main.cueUnprompted', { open: DM_OPEN, close: DM_CLOSE })
        : t('llm.main.cueReply', { player: state.player.name, hasSaid: Boolean(said), said, open: DM_OPEN, close: DM_CLOSE })
      const { reply } = await completeWithFallback(settings.get(), false, {
        system,
        messages: [{ role: 'user', content: cue }],
        tools: [...(npc ? [] : [meetingTool(content, state, loveInterestId, (p) => (proposal = p)), ...(reveal ? [reveal] : [])]), ...(excuse ? [excuse] : [])]
      })
      // Only the message is kept: whatever the LLM said to itself around it is dropped.
      const who = [...content.loveInterests, ...content.npcs].find((c) => c.id === loveInterestId)
      const read = parseDirectives(reply)
      const text = messageText(read.text, who?.name ?? '')
      // Saying she will be at an event puts her down for it, as it does face to face.
      const goable = attendableEvents(content, state)
      const attending = npc ? [] : read.attending.flatMap((one) => (goable.some((e) => e.id.toLowerCase() === one.eventId) ? [{ eventId: goable.find((e) => e.id.toLowerCase() === one.eventId)!.id, ids: [loveInterestId] }] : []))
      // An invitation has to name a time the game has checked.
      if (invite && news === undefined && !proposal) throw new Error(t('llm.main.noTime'))
      return { text: text || '...', proposal, revealed: told, excused, attending: attending.length > 0 ? attending : undefined }
    } catch (error) {
      if (!unprompted) throw error
      // An unprompted note is never worth an error: send a plain one, or none.
      const plain = invite && news === undefined ? fallbackInvite(content, state, loveInterestId) : undefined
      return { text: plain?.text ?? '', proposal: plain?.proposal, error: (error as Error).message }
    }
  })

  // Bloomr is selfies: it needs the Main LLM for the captions and ComfyUI for the pictures, and without both there are no posts.
  const comfyReady = (): boolean => normaliseComfyUrl(comfy.get().baseUrl).url !== null && readBundle(packDir).workflows.length > 0
  // Never fails: writes the captions of the day's planned posts, and the prompt each selfie is drawn from.
  ipcMain.handle(IPC.feed, async (_event, raw: unknown): Promise<FeedResponse> => {
    const { state, plans } = FeedRequestSchema.parse(raw)
    // The content as this game reads it, with the player's name where the content wrote the token.
    const content = readBy(state)
    const planned = plans.filter((plan) => content.loveInterests.some((li) => li.id === plan.authorId))
    const profile = settings.get().main
    if (!isConfigured(profile)) return { drafts: [], error: notConfigured() }
    if (!comfyReady()) return { drafts: [], error: t('llm.main.comfyNotSet') }
    if (planned.length === 0) return { drafts: [] }
    try {
      const { system, user } = buildFeedPrompt(content, state, planned)
      const reply = await chatCompletion(profile, { system, messages: [{ role: 'user', content: user }], maxTokens: Math.max(profile.maxTokens, feedReplyTokens(planned)) })
      const written = parseFeedReply(reply, planned)
      return { drafts: draftPosts(content, state, planned, written, framingFor(comfy.get(), 'photo')), shortfall: feedShortfall(content, reply, planned, written) }
    } catch (error) {
      return { drafts: [], error: (error as Error).message }
    }
  })
  // Never fails: one selfie, drawn on ComfyUI with the photo workflow and filed with the author's photos.
  ipcMain.handle(IPC.feedPicture, async (_event, raw: unknown): Promise<FeedPictureResponse> => {
    const { authorId, name, prompt } = FeedPictureRequestSchema.parse(raw)
    // Made by the game as it is played, not by the editor: it goes with the player's own files whatever is being edited.
    const made = await generateArt(comfy.get(), packDir, userDir, { kind: 'photo', subjectId: authorId, name, workflow: '', positive: prompt, negative: '', ...sizeFor(comfy.get(), 'photo') })
    return made.ok ? { image: made.path } : { image: null, error: made.message }
  })

  // Never fails: without an LLM the plan is read off the names and places in the player's words.
  ipcMain.handle(IPC.planOuting, async (_event, raw: unknown): Promise<PlanOutingResponse> => {
    const { state, text } = PlanOutingRequestSchema.parse(raw)
    // The content as this game reads it, with the player's name where the content wrote the token.
    const content = readBy(state)
    try {
      const { system, user } = buildOutingPrompt(content, state, text)
      const { reply } = await completeWithFallback(settings.get(), false, {
        system,
        messages: [{ role: 'user', content: user }],
        temperature: SUMMARY_TEMPERATURE
      })
      // Something typed that is going to an event on today keeps the event's hours.
      return { outing: asEventOuting(content, state, parseOuting(reply, content, state, text)) }
    } catch (error) {
      return { outing: asEventOuting(content, state, fallbackOuting(content, state, text)), error: (error as Error).message }
    }
  })

  // Never fails: a fight below begins whether or not anyone has anything to say about it.
  ipcMain.handle(IPC.banter, async (_event, raw: unknown): Promise<BanterResponse> => {
    const { state, moment } = BanterRequestSchema.parse(raw)
    const content = readBy(state)
    if (!banterDue(content, state, moment)) return { lines: [] }
    try {
      const { system, user } = buildBanterPrompt(content, state, moment)
      const { reply } = await completeWithFallback(settings.get(), false, { system, messages: [{ role: 'user', content: user }] })
      return { lines: parseBanter(reply, content, state) }
    } catch {
      return { lines: [] }
    }
  })

  // Never fails: the moment plays whether or not anyone has anything to say.
  ipcMain.handle(IPC.momentLines, async (_event, raw: unknown): Promise<BanterResponse> => {
    const { state, ids, moment, history } = MomentLinesRequestSchema.parse(raw)
    const content = readBy(state)
    try {
      const { system, user } = buildMomentPrompt(content, state, ids, moment, history)
      const { reply } = await completeWithFallback(settings.get(), false, { system, messages: [{ role: 'user', content: user }] })
      return { lines: parseMomentLines(reply, content, ids) }
    } catch {
      return { lines: [] }
    }
  })

  // Fails when the LLM cannot be reached or chooses nothing he can take: there is no guessing a term's courses from his words alone.
  ipcMain.handle(IPC.pickCourses, async (_event, raw: unknown): Promise<CoursePick> => {
    const { state, text } = PickCoursesRequestSchema.parse(raw)
    const content = readBy(state)
    const { system, user } = buildCoursePickPrompt(content, state, text)
    const { reply } = await completeWithFallback(settings.get(), false, { system, messages: [{ role: 'user', content: user }], temperature: SUMMARY_TEMPERATURE })
    return parseCoursePick(reply, content, state)
  })

  // Never fails: a scene that can't be summarised by the LLM still leaves a plain memory.
  ipcMain.handle(IPC.summarize, async (_event, raw: unknown): Promise<SummarizeResponse> => {
    const request = SceneRequestSchema.parse(raw)
    // The content as this game reads it, with the player's name where the content wrote the token.
    const content = readBy(request.state)
    let failure: string | undefined
    // What he paid for is worked out alongside, from what was said. No answer is no spending: he is never charged on a guess.
    const spending = (async (): Promise<Spending | undefined> => {
      if (!request.scene.messages.some((m) => m.role === 'user')) return undefined
      try {
        const { system, user } = buildSpendingPrompt(content, request.state, request.scene)
        // Once the scene is over the Main LLM is asked again, whichever wrote the scene: the NSFW one only if it declines.
        const { reply } = await completeWithFallback(settings.get(), false, { system, messages: [{ role: 'user', content: user }], temperature: SUMMARY_TEMPERATURE })
        return parseSpending(reply, request.state.player.money)
      } catch {
        return undefined
      }
    })()
    // Every love interest in the scene keeps her own memory of it, written from her side. An NPC keeps none: nothing is asked of the LLM for one.
    const written = await Promise.all(
      (request.scene.npc ? [] : sceneWitnesses(request.scene)).map(async (forId): Promise<[string, Summary]> => {
        const input = { content: request.scene.npc ? withNpc(content, request.scene.loveInterestId) : inMasks(content, request.scene, false), ...request, forId }
        try {
          const { system, user } = buildSummaryPrompt(input)
          // The same for the memories: the Main LLM first, and the NSFW one for a scene it will not go over.
          const { reply } = await completeWithFallback(settings.get(), false, {
            system,
            messages: [{ role: 'user', content: user }],
            temperature: SUMMARY_TEMPERATURE
          })
          const read = parseSummary(reply)
          const feels = !input.scene.npc && request.state.relationships[forId] !== undefined
          // A memory is always kept, and a love interest always comes away feeling something.
          // Sex is counted when she says it happened, or when she conceived in the scene.
          const intimate = feels && (read.intimate === true || input.scene.conceived.includes(forId))
          return [forId, { memory: read.memory || fallbackSummary(input), level: read.memory ? read.level : undefined, feelings: feels ? (read.feelings ?? PLAIN_FEELINGS) : undefined, intimate, learned: feels ? read.learned : undefined, rapport: feels ? read.rapport : undefined }]
        } catch (error) {
          failure = (error as Error).message
          const feels = !input.scene.npc && request.state.relationships[forId] !== undefined
          return [forId, { memory: fallbackSummary(input), feelings: feels ? PLAIN_FEELINGS : undefined }]
        }
      })
    )
    return {
      memories: Object.fromEntries(written.map(([id, summary]) => [id, summary.memory])),
      levels: Object.fromEntries(written.map(([id, summary]) => [id, summary.level ?? 'normal'])),
      feelings: Object.fromEntries(written.flatMap(([id, summary]) => (summary.feelings ? [[id, summary.feelings]] : []))),
      intimate: written.filter(([, summary]) => summary.intimate === true).map(([id]) => id),
      revealed: sceneRevelations(content, request.state, written.map(([id, summary]) => ({ id, learned: summary.learned ?? [] }))),
      rapport: sceneRapport(request.state, sceneWitnesses(request.scene), written.map(([id, summary]) => ({ id, rapport: summary.rapport ?? [] }))),
      spending: await spending,
      error: failure
    }
  })
}

app.whenReady().then(() => {
  // The scene's text box asks the spell checker word by word, and draws its own marks: it is switched on here, as a
  // field that leaves the browser's own checking off would never wake it.
  session.defaultSession.setSpellCheckerEnabled(true)
  const addonDir = join(app.getPath('userData'), 'addons')
  const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'), keyCipher())
  const inLanguage = useLanguage(settings.get().language)
  let loaded: { content: ContentPack; info: EditorInfo }
  try {
    // Run from its source, the game is being written: the editor changes the base game itself, and add-ons are left out of it.
    // (BREEDHAVEN_ADDONS=1 runs it as a player has it, add-ons and all.) A packaged game keeps what the user makes apart, as add-ons.
    const authoring = !app.isPackaged && process.env['BREEDHAVEN_ADDONS'] !== '1'
    const { languageDir } = inLanguage
    loaded = authoring ? loadBase(contentDir(), languageDir) : loadWithAddons(contentDir(), addonDir, languageDir)
    // A player's own characters keep their classes across an update of the game: a term laid out before it is laid out again.
    if (!authoring && rebuildCatalogue(contentDir(), addonDir, loaded.content, false)) loaded = loadWithAddons(contentDir(), addonDir, languageDir)
  } catch (error) {
    dialog.showErrorBox(t('llm.main.loadFailed'), (error as Error).message)
    app.quit()
    return
  }

  serveContentAssets(contentDir(), addonDir)
  const saves = new SaveStore(join(app.getPath('userData'), 'saves'))
  const comfy = new ComfyStore(join(app.getPath('userData'), 'comfy.json'), contentDir())
  const civitaiKey = new CivitaiKeyStore(join(app.getPath('userData'), 'civitai.json'), keyCipher())
  registerIpc(loaded, contentDir(), settings, saves, comfy, civitaiKey, addonDir, inLanguage)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

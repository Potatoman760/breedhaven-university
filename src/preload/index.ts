import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { RendererApi } from '../shared/types'

const api: RendererApi = {
  getContent: () => ipcRenderer.invoke(IPC.getContent),
  chat: (request) => ipcRenderer.invoke(IPC.chat, request),
  cancelChat: () => ipcRenderer.invoke(IPC.cancelChat),
  onSceneMoving: (listener) => {
    const heard = (_event: unknown, where: string) => listener(where)
    ipcRenderer.on(IPC.chatMoving, heard)
    return () => ipcRenderer.removeListener(IPC.chatMoving, heard)
  },
  summarize: (request) => ipcRenderer.invoke(IPC.summarize, request),
  generateEvents: (request) => ipcRenderer.invoke(IPC.generateEvents, request),
  planOuting: (request) => ipcRenderer.invoke(IPC.planOuting, request),
  pickCourses: (request) => ipcRenderer.invoke(IPC.pickCourses, request),
  banter: (request) => ipcRenderer.invoke(IPC.banter, request),
  courier: (request) => ipcRenderer.invoke(IPC.courier, request),
  feed: (request) => ipcRenderer.invoke(IPC.feed, request),
  feedPicture: (request) => ipcRenderer.invoke(IPC.feedPicture, request),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (update) => ipcRenderer.invoke(IPC.saveSettings, update),
  testConnection: (profileId) => ipcRenderer.invoke(IPC.testConnection, profileId),
  listModels: (request) => ipcRenderer.invoke(IPC.listModels, request),
  listSaves: () => ipcRenderer.invoke(IPC.listSaves),
  saveGame: (request) => ipcRenderer.invoke(IPC.saveGame, request),
  loadGame: (slotId) => ipcRenderer.invoke(IPC.loadGame, slotId),
  deleteSave: (slotId) => ipcRenderer.invoke(IPC.deleteSave, slotId),
  renameSave: (request) => ipcRenderer.invoke(IPC.renameSave, request),
  editor: {
    info: () => ipcRenderer.invoke(IPC.editorInfo),
    saveLoveInterest: (loveInterest) => ipcRenderer.invoke(IPC.editorSaveLoveInterest, loveInterest),
    deleteLoveInterest: (id) => ipcRenderer.invoke(IPC.editorDeleteLoveInterest, id),
    draftLoveInterest: (idea) => ipcRenderer.invoke(IPC.editorDraftLoveInterest, idea),
    saveTrait: (trait) => ipcRenderer.invoke(IPC.editorSaveTrait, trait),
    deleteTrait: (id) => ipcRenderer.invoke(IPC.editorDeleteTrait, id),
    saveCatalogue: (catalogue) => ipcRenderer.invoke(IPC.editorSaveCatalogue, catalogue),
    saveLocation: (location) => ipcRenderer.invoke(IPC.editorSaveLocation, location),
    deleteLocation: (id) => ipcRenderer.invoke(IPC.editorDeleteLocation, id),
    saveEvent: (event) => ipcRenderer.invoke(IPC.editorSaveEvent, event),
    deleteEvent: (id) => ipcRenderer.invoke(IPC.editorDeleteEvent, id),
    draftEvents: () => ipcRenderer.invoke(IPC.editorDraftEvents),
    saveJob: (job) => ipcRenderer.invoke(IPC.editorSaveJob, job),
    deleteJob: (id) => ipcRenderer.invoke(IPC.editorDeleteJob, id),
    saveSociety: (society) => ipcRenderer.invoke(IPC.editorSaveSociety, society),
    deleteSociety: (id) => ipcRenderer.invoke(IPC.editorDeleteSociety, id),
    savePlayer: (newGame) => ipcRenderer.invoke(IPC.editorSavePlayer, newGame),
    resetPlayer: () => ipcRenderer.invoke(IPC.editorResetPlayer),
    importAsset: (request) => ipcRenderer.invoke(IPC.editorImportAsset, request),
    readPicture: (path) => ipcRenderer.invoke(IPC.editorReadPicture, path),
    saveOptimized: (picture) => ipcRenderer.invoke(IPC.editorSaveOptimized, picture),
    openFolder: () => ipcRenderer.invoke(IPC.editorOpenFolder)
  },
  comfy: {
    getSettings: () => ipcRenderer.invoke(IPC.comfyGetSettings),
    saveSettings: (settings) => ipcRenderer.invoke(IPC.comfySaveSettings, settings),
    test: (baseUrl) => ipcRenderer.invoke(IPC.comfyTest, baseUrl),
    workflows: () => ipcRenderer.invoke(IPC.comfyWorkflows),
    bundle: () => ipcRenderer.invoke(IPC.comfyBundle),
    checkBundle: () => ipcRenderer.invoke(IPC.comfyBundleCheck),
    downloads: () => ipcRenderer.invoke(IPC.comfyDownloads),
    chooseModelsDir: () => ipcRenderer.invoke(IPC.comfyChooseModelsDir),
    setCivitaiKey: (key) => ipcRenderer.invoke(IPC.comfySetCivitaiKey, key),
    downloadModel: (file) => ipcRenderer.invoke(IPC.comfyDownloadModel, file),
    cancelDownload: () => ipcRenderer.invoke(IPC.comfyCancelDownload),
    onDownloadProgress: (listener) => {
      const heard = (_event: unknown, progress: Parameters<typeof listener>[0]) => listener(progress)
      ipcRenderer.on(IPC.comfyDownloadProgress, heard)
      return () => ipcRenderer.removeListener(IPC.comfyDownloadProgress, heard)
    },
    generate: (request) => ipcRenderer.invoke(IPC.comfyGenerate, request),
    generateVideo: (request) => ipcRenderer.invoke(IPC.comfyGenerateVideo, request),
    cancel: () => ipcRenderer.invoke(IPC.comfyCancel),
    cutout: (request) => ipcRenderer.invoke(IPC.comfyCutout, request)
  }
}

contextBridge.exposeInMainWorld('api', api)

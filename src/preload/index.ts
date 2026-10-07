import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { RendererApi } from '../shared/types'

const api: RendererApi = {
  getContent: () => ipcRenderer.invoke(IPC.getContent),
  chat: (request) => ipcRenderer.invoke(IPC.chat, request),
  summarize: (request) => ipcRenderer.invoke(IPC.summarize, request),
  generateEvents: (request) => ipcRenderer.invoke(IPC.generateEvents, request),
  planOuting: (request) => ipcRenderer.invoke(IPC.planOuting, request),
  courier: (request) => ipcRenderer.invoke(IPC.courier, request),
  feed: (request) => ipcRenderer.invoke(IPC.feed, request),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (update) => ipcRenderer.invoke(IPC.saveSettings, update),
  testConnection: (profileId) => ipcRenderer.invoke(IPC.testConnection, profileId),
  listModels: (request) => ipcRenderer.invoke(IPC.listModels, request),
  listSaves: () => ipcRenderer.invoke(IPC.listSaves),
  saveGame: (request) => ipcRenderer.invoke(IPC.saveGame, request),
  loadGame: (slotId) => ipcRenderer.invoke(IPC.loadGame, slotId),
  deleteSave: (slotId) => ipcRenderer.invoke(IPC.deleteSave, slotId),
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
    writeCourseWording: (courses) => ipcRenderer.invoke(IPC.editorWriteCourseWording, courses),
    importAsset: (request) => ipcRenderer.invoke(IPC.editorImportAsset, request),
    openFolder: () => ipcRenderer.invoke(IPC.editorOpenFolder)
  },
  comfy: {
    getSettings: () => ipcRenderer.invoke(IPC.comfyGetSettings),
    saveSettings: (settings) => ipcRenderer.invoke(IPC.comfySaveSettings, settings),
    test: (baseUrl) => ipcRenderer.invoke(IPC.comfyTest, baseUrl),
    chooseFolder: () => ipcRenderer.invoke(IPC.comfyChooseFolder),
    workflows: () => ipcRenderer.invoke(IPC.comfyWorkflows),
    generate: (request) => ipcRenderer.invoke(IPC.comfyGenerate, request),
    cancel: () => ipcRenderer.invoke(IPC.comfyCancel),
    cutout: (request) => ipcRenderer.invoke(IPC.comfyCutout, request)
  }
}

contextBridge.exposeInMainWorld('api', api)

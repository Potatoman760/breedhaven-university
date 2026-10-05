import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { RendererApi } from '../shared/types'

const api: RendererApi = {
  getContent: () => ipcRenderer.invoke(IPC.getContent),
  chat: (request) => ipcRenderer.invoke(IPC.chat, request),
  summarize: (request) => ipcRenderer.invoke(IPC.summarize, request),
  generateEvents: (request) => ipcRenderer.invoke(IPC.generateEvents, request),
  generateCourses: () => ipcRenderer.invoke(IPC.generateCourses),
  planOuting: (request) => ipcRenderer.invoke(IPC.planOuting, request),
  courier: (request) => ipcRenderer.invoke(IPC.courier, request),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (update) => ipcRenderer.invoke(IPC.saveSettings, update),
  testConnection: (profileId) => ipcRenderer.invoke(IPC.testConnection, profileId),
  listModels: (request) => ipcRenderer.invoke(IPC.listModels, request),
  listSaves: () => ipcRenderer.invoke(IPC.listSaves),
  saveGame: (request) => ipcRenderer.invoke(IPC.saveGame, request),
  loadGame: (slotId) => ipcRenderer.invoke(IPC.loadGame, slotId),
  deleteSave: (slotId) => ipcRenderer.invoke(IPC.deleteSave, slotId)
}

contextBridge.exposeInMainWorld('api', api)

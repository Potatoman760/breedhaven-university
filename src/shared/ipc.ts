// Kept free of runtime imports: the sandboxed preload script bundles this file.
export const IPC = {
  chat: 'ai:chat',
  summarize: 'ai:summarize',
  generateEvents: 'ai:generateEvents',
  generateCourses: 'ai:generateCourses',
  planOuting: 'ai:planOuting',
  courier: 'ai:courier',
  getContent: 'content:get',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  testConnection: 'settings:test',
  listModels: 'settings:listModels',
  listSaves: 'saves:list',
  saveGame: 'saves:save',
  loadGame: 'saves:load',
  deleteSave: 'saves:delete'
} as const

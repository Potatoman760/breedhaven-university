import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ComfyBundleSettingsSchema, defaultsFor } from '../../shared/comfy'
import { bundleDir, readBundleSettings } from './bundle'
import { loadWorkflows, resolveWorkflow, unusedVideoWorkflows } from './workflows'

const PACK_DIR = join(__dirname, '../../../content/default')
const RTX = 'minimax h3 eros RTX.json'
const AMD = 'minimax h3 eros AMD.json'

describe('the clip workflows the game ships', () => {
  const shipped = readBundleSettings(PACK_DIR)
  const { loaded } = loadWorkflows(bundleDir(PACK_DIR), shipped.overrides)

  it('has one for each kind of graphics card, each able to make a clip', () => {
    for (const file of [RTX, AMD]) expect(loaded.find((one) => one.file === file)?.bindings.firstFrame).not.toBeNull()
  })

  it('makes clips on RTX until a computer chooses otherwise', () => {
    expect(resolveWorkflow(loaded, '', 'video', defaultsFor(shipped)).workflow?.file).toBe(RTX)
    expect(resolveWorkflow(loaded, '', 'video', defaultsFor({ ...shipped, videoWorkflow: AMD })).workflow?.file).toBe(AMD)
  })

  it('leaves the other card’s workflow out of what is needed', () => {
    expect(unusedVideoWorkflows(bundleDir(PACK_DIR), shipped)).toEqual([AMD])
    expect(unusedVideoWorkflows(bundleDir(PACK_DIR), { ...shipped, videoWorkflow: AMD })).toEqual([RTX])
  })

  it('never writes a computer’s choice into the game’s own settings', () => {
    expect(ComfyBundleSettingsSchema.parse({ ...shipped, videoWorkflow: AMD })).not.toHaveProperty('videoWorkflow')
  })
})

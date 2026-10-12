import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { generateImage, uploadImage } from './client'

/** A stand-in for ComfyUI: takes an upload, queues a job, and says the job saved whatever `outputs` holds. */
function fakeComfy(outputs: unknown): Promise<{ url: string; server: Server; uploads: string[] }> {
  const uploads: string[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const json = (body: unknown) => response.setHeader('Content-Type', 'application/json').end(JSON.stringify(body))
      const path = request.url ?? ''
      if (path === '/upload/image') {
        uploads.push(Buffer.concat(chunks).toString('latin1'))
        return json({ name: 'frame.png', subfolder: '', type: 'input' })
      }
      if (path === '/prompt') return json({ prompt_id: 'job' })
      if (path === '/history/job') return json({ job: { outputs, status: { status_str: 'success', completed: true } } })
      if (path.startsWith('/view?')) return response.end(`bytes of ${new URL(path, 'http://x').searchParams.get('filename')}`)
      response.statusCode = 404
      response.end()
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, uploads })))
}

describe('making a clip on ComfyUI', () => {
  let running: Server | null = null
  afterEach(() => running?.close())

  it('hands over the picture it starts from, and is told what ComfyUI filed it under', async () => {
    const { url, server, uploads } = await fakeComfy({})
    running = server
    expect(await uploadImage(url, Buffer.from('PNGDATA'), 'breedhaven-first-frame.png')).toEqual({ name: 'frame.png', message: '' })
    expect(uploads[0]).toContain('name="image"; filename="breedhaven-first-frame.png"')
    expect(uploads[0]).toContain('PNGDATA')
    expect(uploads[0]).toContain('name="overwrite"')
  })

  it('takes the clip a video node saved, and not the preview picture beside it', async () => {
    const saved = { '20': { gifs: [{ filename: 'clip_00001.png', subfolder: 'x', type: 'output' }, { filename: 'clip_00001-audio.mp4', subfolder: 'x', type: 'output' }] } }
    const { url, server } = await fakeComfy(saved)
    running = server
    const made = await generateImage({ baseUrl: url, prompt: {}, outputNode: '20', wants: 'video', timeoutMs: 5_000 })
    expect(made).toMatchObject({ ok: true, extension: 'mp4' })
    expect(made.bytes?.toString()).toBe('bytes of clip_00001-audio.mp4')
    // Asked for a picture, the same run has none to give: a clip is not one.
    expect(await generateImage({ baseUrl: url, prompt: {}, outputNode: '20', timeoutMs: 5_000 })).toMatchObject({ ok: false })
  })

  it('says so when the workflow saved no clip', async () => {
    const { url, server } = await fakeComfy({ '9': { images: [{ filename: 'out.png', subfolder: '', type: 'output' }] } })
    running = server
    const made = await generateImage({ baseUrl: url, prompt: {}, outputNode: null, wants: 'video', timeoutMs: 5_000 })
    expect(made.ok).toBe(false)
    expect(made.message).toContain('.mp4 or .webm')
    expect(await generateImage({ baseUrl: url, prompt: {}, outputNode: null, timeoutMs: 5_000 })).toMatchObject({ ok: true, extension: 'png' })
  })
})

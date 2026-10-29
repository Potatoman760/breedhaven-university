/**
 * Requests to an endpoint that takes only so many at once wait their turn here, first come first served. Each address
 * has its own line, shared by every profile that sends to it.
 */

interface Lane {
  /** The requests going now. */
  running: number
  /** Those waiting, each to be let go when a request ahead of it is done. */
  waiting: (() => void)[]
}

const lanes = new Map<string, Lane>()

/**
 * Runs `send` once fewer than `limit` requests to `address` are going, waiting until then if need be. With no limit it
 * runs at once. A request whose `signal` aborts while it waits leaves the line, and fails with the signal's reason.
 */
export async function inTurn<T>(address: string, limit: number | undefined, signal: AbortSignal | undefined, send: () => Promise<T>): Promise<T> {
  if (!limit) return send()
  const lane = lanes.get(address) ?? { running: 0, waiting: [] }
  lanes.set(address, lane)
  signal?.throwIfAborted()
  if (lane.running < limit) lane.running++
  else {
    // Its place is handed to it by the request it waits on, which leaves `running` as it is: nothing can slip in between.
    await new Promise<void>((resolve, reject) => {
      const go = () => {
        signal?.removeEventListener('abort', leave)
        resolve()
      }
      const leave = () => {
        const at = lane.waiting.indexOf(go)
        if (at >= 0) lane.waiting.splice(at, 1)
        reject(signal?.reason)
      }
      lane.waiting.push(go)
      signal?.addEventListener('abort', leave, { once: true })
    })
  }
  try {
    return await send()
  } finally {
    const next = lane.waiting.shift()
    if (next) next()
    else lane.running--
  }
}

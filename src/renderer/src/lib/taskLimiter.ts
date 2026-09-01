/** 串行/限并发队列；release 必须调用一次。 */
export function createLimiter(max: number): () => Promise<() => void> {
  let active = 0
  const queue: Array<() => void> = []
  return function acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const run = (): void => {
        active++
        let released = false
        resolve(() => {
          if (released) return
          released = true
          active--
          const next = queue.shift()
          if (next) next()
        })
      }
      if (active < max) run()
      else queue.push(run)
    })
  }
}

import { spawn } from 'node-pty'

const MARKER = 'KIMI_PACKAGED_PTY_OK'

export async function runPackagedPtySmoke(
  timeoutMs = 10_000,
  spawnPty: typeof spawn = spawn
): Promise<void> {
  const shell = process.platform === 'win32'
    ? process.env.COMSPEC ?? 'powershell.exe'
    : '/bin/sh'
  const terminal = spawnPty(shell, [], {
    name: 'xterm-256color',
    cwd: process.cwd(),
    cols: 80,
    rows: 24,
    env: Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
    )
  })

  await new Promise<void>((resolve, reject) => {
    let text = ''
    let settled = false
    let markerSeen = false
    let killRequested = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      dataSubscription.dispose()
      exitSubscription.dispose()
      if (error === undefined) resolve()
      else reject(error)
    }
    const dataSubscription = terminal.onData((data) => {
      text = `${text}${data}`.slice(-16_384)
      if (!markerSeen && text.includes(MARKER)) {
        markerSeen = true
        dataSubscription.dispose()
        if (!killRequested) {
          killRequested = true
          try {
            terminal.kill()
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)))
          }
        }
      }
    })
    const exitSubscription = terminal.onExit((event) => {
      if (markerSeen) finish()
      else finish(new Error(`Packaged node-pty exited before marker (code ${event.exitCode})`))
    })
    const timer = setTimeout(() => {
      finish(new Error(`Packaged node-pty did not produce ${MARKER} within ${timeoutMs}ms`))
    }, timeoutMs)
    const command = process.platform === 'win32'
      ? `echo ${MARKER}\r`
      : `printf '${MARKER}\\n'\r`
    terminal.write(command)
  })
}

export { MARKER as PACKAGED_PTY_SMOKE_MARKER }

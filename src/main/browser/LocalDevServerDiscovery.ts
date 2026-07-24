const DEFAULT_DEV_PORTS = [3000, 4173, 4200, 5000, 5173, 8000, 8080, 8787]

export async function discoverLocalDevServers(ports: number[] = DEFAULT_DEV_PORTS): Promise<string[]> {
  const safePorts = [...new Set(ports)].filter((port) => Number.isInteger(port) && port >= 1 && port <= 65_535)
  const results = await Promise.all(safePorts.map(async (port) => {
    const url = `http://127.0.0.1:${port}/`
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(600)
      })
      return response.status < 500 ? `http://localhost:${port}/` : null
    } catch {
      return null
    }
  }))
  return results.filter((value): value is string => value !== null)
}

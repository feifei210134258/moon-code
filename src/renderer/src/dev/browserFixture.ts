import type { BrowserNetworkDetails, BrowserViewState } from '@shared/contracts'

export const browserFixtureState: BrowserViewState = {
  url: 'preview://workspace-1/dist/index.html',
  title: 'Moon Code Preview',
  loading: false,
  canGoBack: true,
  canGoForward: false,
  visible: true,
  viewport: { mode: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  consoleEntries: [
    { id: 'c1', level: 'info', text: 'Preview ready in 128 ms', source: 'preview://workspace-1/app.js', line: 18, timestamp: 1 },
    { id: 'c2', level: 'warning', text: 'Using development configuration', source: 'preview://workspace-1/config.js', line: 4, timestamp: 2 }
  ],
  networkEntries: [
    {
      id: 'n1', requestId: '1', url: 'preview://workspace-1/dist/index.html', method: 'GET', status: 200,
      type: 'Document', mimeType: 'text/html', durationMs: 42, size: 4180, failed: false, errorText: null
    },
    {
      id: 'n2', requestId: '2', url: 'preview://workspace-1/assets/app.js', method: 'GET', status: 200,
      type: 'Script', mimeType: 'text/javascript', durationMs: 18, size: 18420, failed: false, errorText: null
    }
  ],
  error: null
}

export const browserFixtureDetails: BrowserNetworkDetails = {
  requestId: '2',
  requestHeaders: { Accept: '*/*', Authorization: '[redacted]' },
  responseHeaders: { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' },
  body: 'console.log("Preview ready")',
  bodyTruncated: false,
  bodyUnavailableReason: null
}

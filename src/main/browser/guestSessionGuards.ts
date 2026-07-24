import type {
  DownloadItem,
  Event,
  BeforeSendResponse,
  OnBeforeSendHeadersListenerDetails,
  Session,
  WebContents
} from 'electron'

type PermissionHandler = NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>
type PermissionCheckHandler = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>

type DownloadHandler = (event: Event, item: DownloadItem, webContents: WebContents) => void
type BeforeSendHeadersHandler = (
  details: OnBeforeSendHeadersListenerDetails,
  callback: (response: BeforeSendResponse) => void
) => void

export function registerGuestSessionGuards(
  contents: Pick<WebContents, 'id' | 'session'>,
  onDownloadBlocked: () => void,
  authorizeRequest: (url: string) => Record<string, string> | null
): () => void {
  const guestSession: Session = contents.session
  const denyPermission: PermissionHandler = (_contents, _permission, callback) => callback(false)
  const denyPermissionCheck: PermissionCheckHandler = () => false
  const preventDownload: DownloadHandler = (event, _item, downloadContents) => {
    if (downloadContents.id !== contents.id) return
    event.preventDefault()
    onDownloadBlocked()
  }
  const addPreviewAuthorization: BeforeSendHeadersHandler = (details, callback) => {
    const authorization = authorizeRequest(details.url)
    if (authorization === null) {
      callback({ requestHeaders: details.requestHeaders })
      return
    }
    const requestHeaders = { ...details.requestHeaders }
    for (const authorizedName of Object.keys(authorization)) {
      for (const existingName of Object.keys(requestHeaders)) {
        if (existingName.toLowerCase() === authorizedName.toLowerCase()) delete requestHeaders[existingName]
      }
    }
    callback({ requestHeaders: { ...requestHeaders, ...authorization } })
  }

  guestSession.setPermissionRequestHandler(denyPermission)
  guestSession.setPermissionCheckHandler(denyPermissionCheck)
  guestSession.on('will-download', preventDownload)
  guestSession.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, addPreviewAuthorization)

  let active = true
  return () => {
    if (!active) return
    active = false
    guestSession.setPermissionRequestHandler(null)
    guestSession.setPermissionCheckHandler(null)
    guestSession.off('will-download', preventDownload)
    guestSession.webRequest.onBeforeSendHeaders(null)
  }
}

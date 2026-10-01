export type ApiErrorCode =
  | 'NETWORK'         // fetch threw before getting a response (offline, DNS, CORS)
  | 'TIMEOUT'         // AbortController fired the request deadline (90s; 330s for sync/archive)
  | 'HTML_RESPONSE'   // backend returned HTML (typically a missing-doGet or login-redirect)
  | 'INVALID_JSON'    // 2xx body wasn't valid JSON
  | 'UNAUTHORIZED'    // HTTP 401
  | 'FORBIDDEN'       // HTTP 403 (auth email mismatch, owner mismatch)
  | 'VALIDATION_FAILED' // backend returned {success:false, error:'VALIDATION_FAILED'}
  | 'SERVER'          // HTTP 5xx
  | 'BACKEND'         // {success:false} with an arbitrary error string
  | 'INVALID_DEPLOYMENT_URL' // stored URL is not an Apps Script /exec URL; request never sent
  | 'UNKNOWN';

export function mapStatusToCode(status: number | undefined, payload: unknown): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status !== undefined && status >= 500) return 'SERVER';
  if (payload && typeof payload === 'object' && 'error' in payload && (payload as { error?: string }).error === 'VALIDATION_FAILED') {
    return 'VALIDATION_FAILED';
  }
  return 'BACKEND';
}

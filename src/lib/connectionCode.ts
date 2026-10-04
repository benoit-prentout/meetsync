import { isAppsScriptExecUrl } from './deploymentUrl';

export type ConnectionCode = { url: string; scriptId?: string };

/**
 * Decodes the code shown by the template's "Connect extension" menu
 * (Code.gs makeConnectionCode): web-safe base64 of {"v":1,"url":"…/exec","scriptId":"…"}.
 * Returns null for anything that is not a valid v1 code, so callers never trust a bad URL.
 */
export function decodeConnectionCode(input: string): ConnectionCode | null {
  try {
    const b64 = input.trim().replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data?.v !== 1 || typeof data.url !== 'string') return null;
    if (!isAppsScriptExecUrl(data.url) || !new URL(data.url).pathname.endsWith('/exec')) return null;
    const { scriptId } = data;
    if (scriptId !== undefined && (typeof scriptId !== 'string' || scriptId.length < 20)) return null;
    return { url: data.url, scriptId };
  } catch {
    return null;
  }
}

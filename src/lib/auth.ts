// Two tokens, never mixed:
// - backend token: openid + email only. Sent as ?token= to the Apps Script web app (api.ts),
//   which only uses it to verify the caller's identity.
// - deploy token: the manifest scopes (script.projects, script.deployments). Only for
//   deployApi.ts → script.googleapis.com; never sent to the deployment URL.
const BACKEND_SCOPES = ['openid', 'email'];

function getToken(details: chrome.identity.TokenDetails): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(details, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'No auth token received'));
      } else {
        resolve(token);
      }
    });
  });
}

/** Narrow token for api.ts calls to the Apps Script web app. */
export const getBackendToken = (interactive = false) =>
  getToken({ interactive, scopes: BACKEND_SCOPES });

/** Full manifest-scope token — ONLY for deployApi.ts (script.googleapis.com). */
export const getDeployToken = (interactive = false) => getToken({ interactive });

function removeCachedToken(token: string): Promise<void> {
  return new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, () => resolve()));
}

/** Evict both cached tokens (sign-out, re-auth, 401). Each is looked up silently and removed by its exact string. */
export async function clearCachedTokens(): Promise<void> {
  await Promise.all(
    [getBackendToken(), getDeployToken()].map((p) => p.then(removeCachedToken, () => {})),
  );
}

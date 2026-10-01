const EXEC_PATH = /^\/(a\/macros\/[^/]+|macros)\/s\/[A-Za-z0-9_-]+\/(exec|dev)$/;

/** True only for https://script.google.com/[a/macros/<domain>/|macros/]s/<id>/(exec|dev) — the only place we send the token. */
export function isAppsScriptExecUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  // `host` includes any non-default port, so this also rejects :8443 etc.
  return (
    u.protocol === 'https:' &&
    u.host === 'script.google.com' &&
    !u.username &&
    !u.password &&
    EXEC_PATH.test(u.pathname)
  );
}

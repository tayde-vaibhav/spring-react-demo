import { createHash } from 'node:crypto'
import type { ConfigEnv } from 'vite'

// Reviewed @vitejs/plugin-react bootstrap, not arbitrary inline HTML. Changes to
// the installed template fail closed until the bootstrap and tests are reviewed.
export const REVIEWED_REFRESH_TEMPLATE = `import { injectIntoGlobalHook } from "__BASE__@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;`

export function developmentSecurityHeaders(
  { command, mode, isPreview }: Pick<ConfigEnv, 'command' | 'mode' | 'isPreview'>,
  installedRefreshTemplate: string,
): Record<string, string> | undefined {
  if (command !== 'serve' || mode !== 'development' || isPreview) return undefined
  if (installedRefreshTemplate !== REVIEWED_REFRESH_TEMPLATE) {
    throw new Error('React Refresh bootstrap changed; review the development CSP before starting Vite.')
  }
  const bootstrap = REVIEWED_REFRESH_TEMPLATE.replace('__BASE__', '/')
  const hash = createHash('sha256').update(bootstrap, 'utf8').digest('base64')
  return {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src 'self' 'sha256-${hash}'`,
      "script-src-attr 'none'",
      // Dev-only compatibility: Emotion/MUI style elements and chart styles.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self' ws://localhost:5173",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-src 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  }
}

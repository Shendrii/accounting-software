const AUTH_PUBLIC_PATHS = new Set(['/login', '/signup', '/auth/callback', '/invite', '/verify-email', '/reset-password']);

export function isPreviewPath(pathname: string): boolean {
  return pathname === '/reports-preview' || pathname.startsWith('/portfolio-preview');
}

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/' || isPreviewPath(pathname)) return true;
  return AUTH_PUBLIC_PATHS.has(pathname);
}

/** Hide the live SideNav / profile (preview routes supply their own shell). */
export function hideAppChrome(pathname: string, authenticated: boolean): boolean {
  if (isPreviewPath(pathname)) return true;
  if (pathname === '/' && !authenticated) return true;
  return AUTH_PUBLIC_PATHS.has(pathname);
}

/** Hide Ask AI on marketing/auth pages. Preview product shots keep the live chatbot. */
export function hideLiveAiChat(pathname: string, authenticated: boolean): boolean {
  return AUTH_PUBLIC_PATHS.has(pathname) || (!authenticated && !isPreviewPath(pathname));
}

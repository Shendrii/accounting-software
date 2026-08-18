const AUTH_PUBLIC_PATHS = new Set(['/login', '/signup', '/auth/callback', '/invite']);

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/reports-preview') return true;
  if (pathname.startsWith('/portfolio-preview')) return true;
  return AUTH_PUBLIC_PATHS.has(pathname);
}

/** Hide the live SideNav / profile / AI chrome (preview routes supply their own shell). */
export function hideAppChrome(pathname: string, authenticated: boolean): boolean {
  if (pathname === '/reports-preview') return true;
  if (pathname.startsWith('/portfolio-preview')) return true;
  if (pathname === '/' && !authenticated) return true;
  return AUTH_PUBLIC_PATHS.has(pathname);
}

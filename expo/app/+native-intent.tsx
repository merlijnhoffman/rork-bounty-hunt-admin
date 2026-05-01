export function redirectSystemPath({
  path,
  initial,
}: { path: string; initial: boolean }) {
  try {
    console.log('[NativeIntent] redirectSystemPath', { path, initial });

    if (!path || typeof path !== 'string') {
      return '/';
    }

    const knownRoutes = [
      '/',
      '/login',
      '/access-denied',
      '/dashboard',
      '/create-event',
      '/event-detail',
      '/edit-event',
      '/edit-clue',
      '/live-players',
      '/modal',
    ];

    let normalized = path;
    try {
      if (path.includes('://')) {
        const url = new URL(path);
        normalized = url.pathname + url.search + url.hash;
      }
    } catch (e) {
      console.log('[NativeIntent] URL parse failed, using raw path', e);
    }

    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }

    const base = normalized.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';

    const isKnown = knownRoutes.some((route) => {
      if (route === '/') return base === '/';
      return base === route || base.startsWith(route + '/');
    });

    if (!isKnown) {
      console.log('[NativeIntent] Unknown path, redirecting to /', { base });
      return '/';
    }

    return normalized;
  } catch (error) {
    console.log('[NativeIntent] Error, redirecting to /', error);
    return '/';
  }
}

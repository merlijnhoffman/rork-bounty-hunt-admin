export function redirectSystemPath({
  path,
  initial,
}: { path: string; initial: boolean }) {
  try {
    if (__DEV__) console.log('[NativeIntent] redirectSystemPath', { path, initial });

    if (!path || typeof path !== 'string') {
      return '/';
    }

    let normalized = path;
    try {
      if (path.includes('://')) {
        const url = new URL(path);
        normalized = url.pathname + url.search + url.hash;
      }
    } catch (e) {
      if (__DEV__) console.log('[NativeIntent] URL parse failed, using raw path', e);
    }

    normalized = normalized.replace(/^\/--\//, '/');

    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }

    if (__DEV__) console.log('[NativeIntent] resolved', { normalized });
    return normalized;
  } catch (error) {
    if (__DEV__) console.log('[NativeIntent] Error, falling back to /', error);
    return '/';
  }
}

export const PUBLIC_DIRECTORY_PATH = '/businesses';

export function businessPath(id) {
  return `${PUBLIC_DIRECTORY_PATH}/view/${encodeURIComponent(id)}`;
}

export function publicBusinessRoute(pathname) {
  const path = pathname.replace(/\/$/, '');
  if (path === PUBLIC_DIRECTORY_PATH) return { type: 'directory' };
  if (path === `${PUBLIC_DIRECTORY_PATH}/promotions`) return { type: 'promotions' };
  if (!path.startsWith(`${PUBLIC_DIRECTORY_PATH}/`)) return null;
  const match = path.match(/^\/businesses\/view\/([^/]+)$/);
  try {
    const id = match && decodeURIComponent(match[1]);
    if (id && !/[\u0000-\u001f/]/.test(id) && !['.', '..'].includes(id)) return { type: 'business', id };
  } catch { /* Invalid URL encoding is an unavailable page, never an App route. */ }
  return { type: 'missing' };
}

export function directoryQuery({ city, search = '', category = '', service = '' }) {
  const params = new URLSearchParams({ city });
  if (search) params.set('q', search);
  if (category) params.set('category', category);
  if (category && service) params.set('service', service);
  return `?${params}`;
}

export function businessShareUrl(id, origin = window.location.origin) {
  return new URL(businessPath(id), origin).href;
}

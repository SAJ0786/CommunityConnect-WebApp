export function validCityPreview(preview) {
  const city = preview?.city;
  if (!preview?.placeId || !preview?.fingerprint || !city?.label || !city?.id) return false;
  if (!Number.isFinite(city.latitude) || city.latitude < -45 || city.latitude > -9 || !Number.isFinite(city.longitude) || city.longitude < 110 || city.longitude > 155) return false;
  if (!city.timeZone?.startsWith('Australia/')) return false;
  try { new Intl.DateTimeFormat('en-AU', { timeZone: city.timeZone }); return true; } catch { return false; }
}
export function createCityManagement(call, { enabled = false } = {}) {
  const invoke = async (name, data) => {
    if (!enabled) throw new Error('City management is not enabled for this release.');
    return (await call(name, data)).data;
  };
  return {
    search: input => invoke('searchCatalogueCities', { input }),
    preview: placeId => invoke('previewCatalogueCity', { placeId }),
    add: (preview, code) => {
      if (!validCityPreview(preview) || !/^[A-Z0-9]{2,6}$/.test(code)) throw new Error('Review valid coordinates, timezone and a short code before adding.');
      return invoke('addCatalogueCity', { placeId: preview.placeId, fingerprint: preview.fingerprint, code });
    },
  };
}

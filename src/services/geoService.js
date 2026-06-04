export function distanceKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some(v => v === undefined || v === null || v === '')) return null;
  const R = 6371;
  const rad = d => Number(d) * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getCurrentPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) rej(new Error('Geolocation is not supported'));
    navigator.geolocation.getCurrentPosition(
      p => res({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      rej,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

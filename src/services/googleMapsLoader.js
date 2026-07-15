const MAPS_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY || '';
const SCRIPT_ID = 'google-maps-script';

export function hasGoogleMapsKey() {
  return Boolean(MAPS_KEY);
}

export function loadGoogleMapsScript() {
  if (!MAPS_KEY) return false;
  if (window.google?.maps) return true;
  if (document.getElementById(SCRIPT_ID)) return true;

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places`;
  document.head.appendChild(script);
  return true;
}

export function waitForGoogleMaps(cb, attempts = 0) {
  if (window.google?.maps) {
    cb();
    return;
  }
  if (attempts > 100) {
    console.warn('Google Maps failed to load after 10s');
    return;
  }
  setTimeout(() => waitForGoogleMaps(cb, attempts + 1), 100);
}

export function waitForGooglePlaces(cb, attempts = 0) {
  if (window.google?.maps?.places?.Autocomplete) {
    cb();
    return;
  }
  if (attempts > 100) {
    console.warn('Google Places failed to load after 10s');
    return;
  }
  setTimeout(() => waitForGooglePlaces(cb, attempts + 1), 100);
}

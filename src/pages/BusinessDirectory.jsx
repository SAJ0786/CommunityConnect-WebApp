import { Grid2X2, Clock, MapPin, Heart, Clock3, Tags } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { businessDiscovery, requestBusinessLocation } from '../utils/businessDiscovery.mjs';
import { filterPublicBusinesses } from '../utils/publicBusinesses.mjs';
import { cityLabel } from '../utils/cities';
import { directoryQuery, PUBLIC_DIRECTORY_PATH } from '../utils/businessRoutes.mjs';
import { usePublicBusinesses } from '../utils/usePublicDirectory';

import CitySelector from '../components/CitySelector';
import PagePanel from '../components/PagePanel';
import BrowseStrip from '../components/BrowseStrip';
import BusinessBrowseCard from '../components/BusinessBrowseCard';
import { BUSINESS_CATEGORIES } from '../business/categories.mjs';
import { businessOpenNow } from '../utils/browseFilters.mjs';
const QUICK_FILTERS = [
  { value: '', label: 'All', Icon: Grid2X2, tone: 'blue' },
  { value: 'open', label: 'Open now', Icon: Clock, tone: 'green' },
  { value: 'near', label: 'Near me', Icon: MapPin, tone: 'purple', hint: 'Nearest businesses first in your selected city.' },
  { value: 'saved', label: 'Favourites', Icon: Heart, tone: 'rose', disabled: true, hint: 'Account favourites are on hold in this preview.' },
  { value: 'recent', label: 'Recently added', Icon: Clock3, tone: 'amber', hint: 'Published in the last 30 days, newest first.' },
];

// Presentational export also supports deterministic offline component testing.
export function BusinessDirectoryView({ businesses, loading, error, fromCache, selectedCity, setSelectedCity, onRetry, requestLocation = requestBusinessLocation, savedIds = null, onOpenBusiness, onPromotions, categoryCatalogue = BUSINESS_CATEGORIES, showPagePanel = true }) {
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [category, setCategory] = useState(() => new URLSearchParams(window.location.search).get('category') || '');
  const [quick, setQuick] = useState('');
  const [service, setService] = useState(() => new URLSearchParams(window.location.search).get('service') || '');
  const [location, setLocation] = useState(null);
  const [locationNote, setLocationNote] = useState('');
  const locationRequest = useRef(0);
  useEffect(() => () => { locationRequest.current += 1; }, []);
  useEffect(() => { locationRequest.current += 1; setLocationNote(''); }, [selectedCity]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const previousCity = useRef(selectedCity);
  useEffect(() => { if (previousCity.current !== selectedCity) { setService(''); previousCity.current = selectedCity; } }, [selectedCity]);
  const cityBusinesses = useMemo(() => businesses.filter(row => row.city === selectedCity), [businesses, selectedCity]);
  const categories = useMemo(() => [...new Set(cityBusinesses.flatMap(row => row.categories))].sort(), [cityBusinesses]);
  const categoryItems = [
    { value: '', label: 'All', icon: '✦' },
    ...categoryCatalogue.map(item => ({ value: item.label, label: item.label, icon: item.icon })),
    ...categories.filter(name => !categoryCatalogue.some(item => item.label === name || item.id === name))
      .map(name => ({ value: name, label: name, icon: '🏪' })),
  ];
  const effectiveCategory = categoryItems.some(item => item.value === category) ? category : '';
  const selectedCategory = categoryCatalogue.find(item => item.label === effectiveCategory);
  const services = selectedCategory?.subcategories.map(item => item.label) || [];
  const effectiveService = services.includes(service) ? service : '';
  const openStates = new Map(cityBusinesses.map(row => [row.id, businessOpenNow(row, now)]));
  const matching = useMemo(() => filterPublicBusinesses(businesses, { city: selectedCity, category: effectiveCategory, search }),
    [businesses, selectedCity, effectiveCategory, search]);
  const filtered = businessDiscovery(matching.filter(row => (quick !== 'open' || openStates.get(row.id) === true)
    && (quick !== 'saved' || savedIds?.includes(row.id))
    && (!effectiveService || row.services.includes(effectiveService))), { filter:quick, location, now:now.getTime() });
  const clearFilters = () => { locationRequest.current += 1; setLocationNote(''); setSearch(''); setCategory(''); setService(''); setQuick(''); };
  const chooseQuick = async value => {
    const request = ++locationRequest.current;
    setLocationNote('');
    if (!value) { clearFilters(); return; }
    if (value !== 'near') { setQuick(value); return; }
    if (!cityBusinesses.some(row => row.coordinates)) { setLocationNote('These listings do not have public locations available yet. Try another city.'); return; }
    if (location) { setQuick('near'); return; }
    setLocationNote('Waiting for your location permission…');
    try {
      const point = await requestLocation();
      if (request !== locationRequest.current) return;
      setLocation(point); setQuick('near'); setLocationNote('');
    } catch (error) { if (request === locationRequest.current) setLocationNote(error.message || 'Location could not be accessed.'); }
  };
  const returnQuery = directoryQuery({ city: selectedCity, category: effectiveCategory, service: effectiveService, search });
  useEffect(() => {
    if (window.location.pathname.replace(/\/$/, '') === PUBLIC_DIRECTORY_PATH && !loading && !error) {
      window.history.replaceState(window.history.state, '', PUBLIC_DIRECTORY_PATH + returnQuery);
    }
  }, [returnQuery, loading, error]);

  return (
    <main className="business-directory" aria-labelledby={showPagePanel ? 'business-directory-title' : undefined} aria-label={showPagePanel ? undefined : 'Business directory results'}>
      {showPagePanel && <PagePanel headingId="business-directory-title" title="Business Directory" subtitle="Discover and support your local community."/>}
      <header className="business-browse-header">
        <div className="business-browse-city"><CitySelector label="Your city" value={selectedCity}
          onChange={value => { setSelectedCity(value); setCategory(''); setService(''); }} /></div>
      </header>
      <div className="business-browse-search">
        <label>Search businesses or services
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Business name, service or suburb" />
        </label>
      </div>
      <h2 className="browse-heading">Quick access</h2>
      <BrowseStrip label="Business filters" tiles items={QUICK_FILTERS.map(item => item.value === 'saved' && savedIds ? { ...item, disabled: false, hint: 'Businesses saved to your account.' } : item)} value={quick}
        onChange={chooseQuick} />
      {locationNote && <p className="browse-note" role="status">{locationNote}</p>}
      {quick === 'near' && <p className="browse-note">Nearest first in your selected city. Distances are approximate; listings without public coordinates are omitted. Your location stays in this tab.</p>}
      {quick === 'recent' && <p className="browse-note">Added in the last 30 days, newest first. Listings without a publication date are omitted.</p>}
      <h2 className="browse-heading">Browse businesses</h2>
      <BrowseStrip label="Business categories" items={categoryItems} categories value={effectiveCategory}
        onChange={value => { setCategory(value); setService(''); }} />
      {selectedCategory && <label className="business-service-filter">Select service
        <select value={effectiveService} onChange={event => setService(event.target.value)}>
          <option value="">All {selectedCategory.label}</option>
          {services.map(label => <option key={label} value={label}>{label}</option>)}
        </select>
      </label>}
      <p><a className="directory-link" onClick={onPromotions ? event => { event.preventDefault(); onPromotions(); } : undefined} href={PUBLIC_DIRECTORY_PATH + '/promotions' + directoryQuery({ city: selectedCity })}><Tags size={18} aria-hidden="true" /><span>Explore current promotions</span></a></p>
      {loading ? <p role="status" className="directory-state">Loading the business directory…</p>
        : error ? <div role="alert" className="directory-state directory-error">
          <h2>We couldn’t load the directory</h2>
          <p>Please check your connection and try again. Your account has not been changed.</p>
          <button type="button" onClick={onRetry}>Try again</button>
        </div> : <>
          {fromCache && <p role="status" className="directory-scope">Waiting for a server connection. Saved listings may be out of date.</p>}
          <p role="status" className="directory-count">{filtered.length} {filtered.length === 1 ? 'business' : 'businesses'} in {cityLabel(selectedCity).replace(', Australia', '')}</p>
          {!filtered.length ? <div className="directory-state">
            <h2>{search || effectiveCategory || quick || service ? 'No matching businesses' : fromCache ? 'No saved listings for this city' : 'No published businesses in this city yet'}</h2>
            <p>{search || effectiveCategory || quick || service ? 'Try another name, service or category.' : 'Choose another city or check again later.'}</p>
            {(search || effectiveCategory || quick || service) && <button type="button" onClick={clearFilters}>Clear filters</button>}
          </div> : <div className="directory-grid">
            {filtered.map(business => <BusinessBrowseCard key={selectedCity + ':' + business.id}
              business={business} onOpen={onOpenBusiness} returnQuery={returnQuery} openNow={openStates.get(business.id)} distance={quick === 'near' ? business.distanceKm : null} />)}
          </div>}
        </>}
    </main>
  );
}

export default function BusinessDirectory(props) {
  const state = usePublicBusinesses();
  return <BusinessDirectoryView {...props} {...state} />;
}

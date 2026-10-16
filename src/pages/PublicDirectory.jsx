import React, { useEffect, useState } from 'react';
import { PROMOTION_AUDIENCE_ENABLED } from '../config/releaseGates.mjs';
import { Store, Tags, CalendarDays } from 'lucide-react';
import BottomNav from '../components/BottomNav';
import AccountMenu from '../components/AccountMenu';
import CitySelector from '../components/CitySelector';
import { BusinessDirectoryView } from './BusinessDirectory';
import PublicBusinessPage from './PublicBusinessPage';
import PublicPromotionList from '../components/PublicPromotionList';
import { usePublicBusinesses, usePublicPromotions, usePromotionDay } from '../utils/usePublicDirectory';
import { activePublicPromotions } from '../utils/publicPromotions.mjs';
import { directoryQuery, PUBLIC_DIRECTORY_PATH } from '../utils/businessRoutes.mjs';
import { cityLabel, normalizeCity } from '../utils/cities';
import { saveExperience } from '../config/experiences.mjs';
import '../styles/directory.css';

export default function PublicDirectory({ route }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const signIn = () => { saveExperience(window.sessionStorage, 'businesses'); window.location.assign('/'); };
  const params = new URLSearchParams(window.location.search);
  const [city, setCity] = useState(() => normalizeCity(params.get('city') || 'sydney'));
  const listings = usePublicBusinesses();
  const offers = usePublicPromotions();
  const today = usePromotionDay();
  const rows = activePublicPromotions(offers.promotions, listings.businesses, route.type === 'business' ? { businessId: route.id, today } : { city, today });
  const promotionState = { ...offers, rows, fromCache: offers.fromCache || listings.fromCache };
  const returnQuery = params.has('city') ? directoryQuery({ city, search: params.get('q') || '', category: params.get('category') || '', service: params.get('service') || '' }) : '';
  useEffect(() => {
    if (route.type === 'promotions') window.history.replaceState(window.history.state, '', `${PUBLIC_DIRECTORY_PATH}/promotions${directoryQuery({ city })}`);
  }, [city, route.type]);
  useEffect(() => {
    if (route.type !== 'business') document.title = `${route.type === 'promotions' ? 'Promotions' : 'Business Directory'} | Community Connect Australia`;
  }, [route.type]);
  return <div className="app-shell public-directory-shell">
    <header className="public-directory-header"><a href="/" className="public-directory-brand">Community Connect Australia</a>
      <nav aria-label="Public directory"><a href={PUBLIC_DIRECTORY_PATH + directoryQuery({ city })} aria-current={route.type === 'directory' ? 'page' : undefined}><Store size={18} aria-hidden="true" /><span>Businesses</span></a><a href={`${PUBLIC_DIRECTORY_PATH}/promotions${directoryQuery({ city })}`} aria-current={route.type === 'promotions' ? 'page' : undefined}><Tags size={18} aria-hidden="true" /><span>Promotions</span></a><a href="/" onClick={() => saveExperience(window.sessionStorage, 'events')}><CalendarDays size={18} aria-hidden="true" /><span>Events</span></a></nav>
    <button className="cc-header-menu" onClick={() => setMenuOpen(true)}>Menu</button></header>
    {route.type === 'directory' ? <BusinessDirectoryView {...listings} selectedCity={city} setSelectedCity={setCity} />
      : route.type === 'promotions' ? <main className="business-directory" aria-labelledby="promotions-title">
        <section className="directory-hero"><div><p className="directory-eyebrow">{PROMOTION_AUDIENCE_ENABLED ? 'Local and Australia-wide offers' : 'Local business offers'}</p><h1 id="promotions-title">Current promotions</h1><p>Explore offers in {cityLabel(city).replace(', Australia', '')}{PROMOTION_AUDIENCE_ENABLED ? ' and approved Australia-wide promotions' : ''}. Open a business to see full details and conditions.</p></div>
          <div className="directory-city"><CitySelector label="Your city" value={city} onChange={setCity} /></div>
        </section>
        <section className="directory-promotions" aria-label="Business promotions"><PublicPromotionList {...promotionState} loading={offers.loading || listings.loading} error={offers.error || listings.error} onRetry={() => { offers.onRetry(); listings.onRetry(); }} returnQuery={directoryQuery({ city })}/></section>
      </main>
      : <PublicBusinessPage {...listings} business={route.type === 'business' ? listings.businesses.find(business => business.id === route.id) : null} promotionState={promotionState} returnQuery={returnQuery} />}
    <footer className="directory-footer">Community Connect Australia · Business information and offers are supplied by listing owners.</footer>
    <BottomNav directory isGuest page={route.type === 'promotions' ? 'promotions' : 'home'} onOpenMenu={() => setMenuOpen(true)} setPage={key => window.location.assign(PUBLIC_DIRECTORY_PATH + (key === 'promotions' ? '/promotions' : '') + directoryQuery({ city }))}/>
    <AccountMenu directory isGuest open={menuOpen} onClose={() => setMenuOpen(false)} onSignOut={signIn}/>
  </div>;
}

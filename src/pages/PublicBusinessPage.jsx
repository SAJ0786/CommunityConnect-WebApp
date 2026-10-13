import React, { useEffect, useState } from 'react';
import { ArrowLeft, Share2, Link2 } from 'lucide-react';
import BusinessContactLinks from '../components/BusinessContactLinks';
import PublicPromotionList from '../components/PublicPromotionList';
import { BusinessLogo, BusinessCover } from '../components/BusinessIdentity';
import { businessShareUrl, directoryQuery, PUBLIC_DIRECTORY_PATH } from '../utils/businessRoutes.mjs';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function ShareBusiness({ business }) {
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState(false);
  const url = businessShareUrl(business.id);
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setMessage('Business link copied.'); setManual(false);
    } catch { setManual(true); setMessage('Select and copy this business link.'); }
  };
  const share = async () => {
    if (!navigator.share) return copy();
    try { await navigator.share({ title: business.name, text: `Explore ${business.name} on Community Connect Australia`, url }); setMessage('Share options opened.'); }
    catch (error) { if (error.name !== 'AbortError') await copy(); }
  };
  return <div className="directory-share">
    <div className="directory-contacts"><button onClick={share}><Share2 size={19} aria-hidden="true" /><span>Share business</span></button><button className="btn-light" onClick={copy}><Link2 size={19} aria-hidden="true" /><span>Copy link</span></button></div>
    <p role="status" className="directory-scope">{message}</p>
    {manual && <label>Business link<input readOnly value={url} onFocus={event => event.target.select()} /></label>}
  </div>;
}

export default function PublicBusinessPage({ business, loading, error, fromCache, onRetry, promotionState, returnQuery = '', embedded = false }) {
  const Container = embedded ? 'section' : 'main';
  useEffect(() => {
    const previous = document.title;
    document.title = `${business?.name || 'Business Directory'} | Community Connect Australia`;
    if (business && window.location.hash === '#promotions') requestAnimationFrame(() => document.getElementById('promotions')?.scrollIntoView());
    return () => { document.title = previous; };
  }, [business?.id, business?.name]);
  const back = PUBLIC_DIRECTORY_PATH + (returnQuery || (business ? directoryQuery({ city: business.city }) : ''));
  return <Container className="business-directory" aria-labelledby="business-title">
    <p><a className="directory-link" href={back}><ArrowLeft size={18} aria-hidden="true" /><span>Back to businesses</span></a></p>
    {loading ? <p role="status" className="directory-state">Loading business…</p>
      : error ? <div role="alert" className="directory-state directory-error"><h1 id="business-title">Business unavailable</h1><p>We couldn’t load this business. Please check your connection and try again.</p><button onClick={onRetry}>Try again</button></div>
      : !business ? <div className="directory-state"><h1 id="business-title">{fromCache ? 'Business not available offline' : 'Business not available'}</h1><p>{fromCache ? 'Reconnect to check this listing.' : 'This link may be incorrect, or the listing may no longer be public.'}</p>{fromCache && <button onClick={onRetry}>Try again</button>}</div>
      : <>
        {fromCache && <p role="status" className="directory-scope">Showing a saved listing. Reconnect to confirm current details.</p>}
        <section className="directory-detail-hero">
          <BusinessCover business={business} />
          <div className="directory-hero"><div>
            <div className="directory-card-top"><BusinessLogo business={business} /></div>
            <p className="directory-eyebrow">{business.categories.join(' · ') || 'Local business'}</p>
            <h1 id="business-title">{business.name}</h1><p>{business.address || 'Location details not supplied'}</p>
          </div></div>
        </section>
        <BusinessContactLinks business={business} />
        <ShareBusiness key={business.id} business={business}/>
        <div className="directory-grid directory-detail-grid">
          <section className="directory-card"><h2>About this business</h2><p className="directory-description">{business.description || 'Contact the business for more information.'}</p>
            {!!business.services.length && <><h3>Services</h3><ul className="directory-services">{business.services.map(service => <li key={service}>{service}</li>)}</ul></>}
            {business.abnVerified && <p className="directory-verification">ABN checked. This is not an endorsement or verification of licences, insurance or service quality.</p>}
          </section>
          <section className="directory-card"><h2>Opening hours</h2><dl className="directory-hours">{DAYS.map((day, i) => <div key={day}><dt>{day}</dt><dd>{business.hours[i]}</dd></div>)}</dl><p className="directory-scope">Hours are supplied by the business. Confirm holiday hours before visiting.</p></section>
        </div>
        <section id="promotions" className="directory-promotions" aria-labelledby="business-promotions-title"><h2 id="business-promotions-title">Current promotions</h2><PublicPromotionList {...promotionState} details /></section>
      </>}
  </Container>;
}

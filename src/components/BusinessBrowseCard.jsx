import React from 'react';
import { ChevronDown, Store } from 'lucide-react';
import BusinessContactLinks from './BusinessContactLinks';
import { businessPath } from '../utils/businessRoutes.mjs';
import { businessCategory, BusinessLogo } from './BusinessIdentity';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export default function BusinessBrowseCard({ business, returnQuery, openNow, distance = null, onOpen }) {
  const category = businessCategory(business);
  return <article className="directory-card directory-browse-card">
    <details>
      <summary aria-label={`Details for ${business.name}`}>
        <span className="business-card-logo">
          <BusinessLogo business={business} className="business-card-logo-image" />
        </span>
        <span className="business-card-caption">
          <strong>{business.name}</strong>
          <span>{category?.label || business.categories[0] || 'Local business'}</span>
          <small>{business.suburb}{business.suburb && openNow != null ? ' · ' : ''}
            {openNow != null && <span className={openNow ? 'business-open' : ''}>{openNow ? 'Open now' : 'Closed'}</span>}
          </small>
          {Number.isFinite(distance) && <small>About {distance < .1 ? '0.1' : distance.toFixed(1)} km away</small>}
        </span>
        <ChevronDown size={18} className="business-card-chevron" aria-hidden="true" />
      </summary>
      <div className="business-card-expanded">
        <h2>{business.name}</h2>
        <p className="directory-description">{business.description}</p>
        <p className="directory-address">{business.address || 'Location details not supplied'}</p>
        {!!business.services.length && <p><strong>Services:</strong> {business.services.join(', ')}</p>}
        <BusinessContactLinks business={business} />
        <a className="directory-link" onClick={onOpen ? event => { event.preventDefault(); onOpen(business.id); } : undefined} href={businessPath(business.id) + returnQuery}><Store size={18} aria-hidden="true" /><span>View {business.name}</span></a>
        {business.abnVerified && <p className="directory-verification">ABN checked. This is not an endorsement or verification of licences, insurance or service quality.</p>}
        <h3>Opening hours</h3>
        <dl className="directory-hours">{DAYS.map((day, i) => <div key={day}><dt>{day}</dt><dd>{business.hours[i] || 'Not supplied'}</dd></div>)}</dl>
        <p className="directory-scope">Hours are supplied by the business. Confirm holiday hours before visiting.</p>
      </div>
    </details>
  </article>;
}

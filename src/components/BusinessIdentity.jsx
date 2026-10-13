import React from 'react';
import { Store } from 'lucide-react';
import { BUSINESS_CATEGORIES } from '../business/categories.mjs';
import { PublicImage } from './PublicPromotionList';

export function businessCategory(business) {
  return BUSINESS_CATEGORIES.find(item => (business.categories || []).some(value => value === item.id || value === item.label));
}

export function BusinessLogo({ business, className = 'directory-logo' }) {
  const category = businessCategory(business);
  return <PublicImage src={business.logoUrl} className={className}
    fallback={<span className={`${className} business-category-logo`} role="img" aria-label={`${category?.label || 'Business'} category icon`}>
      <span aria-hidden="true">{category?.icon || '🏪'}</span>
    </span>} />;
}

export function BusinessWallpaper({ business }) {
  const category = businessCategory(business);
  const services = (business.services || []).filter(Boolean);
  return <div className="business-wallpaper">
    <Store className="business-wallpaper-art" size={180} strokeWidth={.7} aria-hidden="true" />
    <div className="business-wallpaper-copy">
      <div className="business-wallpaper-category"><span aria-hidden="true">{category?.icon || '🏪'}</span><span>{category?.label || business.categories?.[0] || 'Local business'}</span></div>
      <p className="business-wallpaper-name">{business.name}</p>
      {services.length > 0 && <ul aria-label="Featured services">{services.slice(0,4).map(service => <li key={service}>{service}</li>)}{services.length > 4 && <li>+{services.length - 4} more services</li>}</ul>}
    </div>
  </div>;
}

export function BusinessCover({ business }) {
  return <PublicImage src={business.coverUrl} className="directory-cover" fallback={<BusinessWallpaper business={business} />} />;
}

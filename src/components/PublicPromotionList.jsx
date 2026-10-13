import React from 'react';
import { Tag } from 'lucide-react';
import { businessPath } from '../utils/businessRoutes.mjs';

export function PublicImage({ src, alt = '', className = '', fallback = null }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img src={src} alt={alt} className={className} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : fallback;
}

export default function PublicPromotionList({ rows, loading, error, fromCache, onRetry, details = false, returnQuery = '' }) {
  if (loading) return <p role="status" className="directory-state">Loading promotions…</p>;
  if (error) return <div role="alert" className="directory-state directory-error"><h2>Promotions unavailable</h2><p>We couldn’t load offers. Please try again.</p><button onClick={onRetry}>Retry promotions</button></div>;
  return <>
    {fromCache && <p role="status" className="directory-scope">Saved promotions may be out of date. Reconnect to confirm availability.</p>}
    {!rows.length ? <div className="directory-state"><h2>{fromCache ? 'No saved active promotions' : 'No active promotions'}</h2><p>Check back later for new business offers.</p></div>
      : <div className="directory-grid">{rows.map(promotion => <article key={promotion.id} className="directory-card directory-promotion">
        <PublicImage src={promotion.imageUrl} className="directory-promotion-image" />
        <p className="directory-eyebrow">{promotion.boosted ? 'Sponsored offer' : 'Business-supplied offer'}</p>
        <h3>{promotion.title}</h3>
        {promotion.discountText && <p className="directory-offer">{promotion.discountText}</p>}
        <p className="directory-description">{promotion.briefText}</p>
        {details ? <><h4>Details and conditions</h4><p className="directory-description">{promotion.fullDetails || 'Contact the business for conditions.'}</p></>
          : <a className="directory-link" href={businessPath(promotion.businessId) + returnQuery + '#promotions'}><Tag size={18} aria-hidden="true" /><span>View offer at {promotion.business.name}</span></a>}
        <p className="directory-scope">{promotion.startDate ? `From ${promotion.startDate}` : 'Start date not supplied'} · {promotion.endDate ? `Ends ${promotion.endDate}` : 'No end date supplied'}</p>
      </article>)}</div>}
  </>;
}

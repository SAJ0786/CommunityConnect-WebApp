import React from 'react';
import { Phone, Mail, Globe, MapPin, MessageCircle, Facebook, Instagram } from 'lucide-react';

function XLogo(props) {
  return <svg viewBox="0 0 24 24" fill="none" {...props}><path d="M4 3h4l12 18h-4L4 3ZM20 3 4 21" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
}
const SOCIAL = { facebook: { label:'Facebook', Icon:Facebook }, instagram: { label:'Instagram', Icon:Instagram }, x: { label:'X', Icon:XLogo } };

export default function BusinessContactLinks({ business }) {
  const links = [
    business.phone && { label:'Call business', href:`tel:${business.phone}`, Icon:Phone, tone:'phone' },
    business.email && { label:'Email business', href:`mailto:${encodeURIComponent(business.email)}`, Icon:Mail, tone:'email' },
    business.whatsapp && { label:'WhatsApp', href:`https://wa.me/${business.whatsapp}`, Icon:MessageCircle, tone:'whatsapp', external:true },
    business.website && { label:'Visit website', href:business.website, Icon:Globe, tone:'website', external:true },
    business.address && { label:'View location', href:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address)}`, Icon:MapPin, tone:'location', external:true },
    ...Object.entries(business.social || {}).filter(([name,url]) => SOCIAL[name] && url).map(([name,href]) => ({ ...SOCIAL[name], href, tone:name, external:true })),
  ].filter(Boolean);
  return <div className="directory-contacts">{links.map(({label,href,Icon,tone,external}) => <a key={label}
    className={`directory-contact-link directory-contact-${tone}`} href={href}
    target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
    <span className="directory-contact-icon"><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span>
    <span>{label}</span>
  </a>)}</div>;
}

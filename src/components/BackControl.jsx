import React from 'react';
import { ArrowLeft, ChevronLeft } from 'lucide-react';
import '../styles/back-control.css';

export default function BackControl({ onClick, href, label = 'Back', disabled = false, media = false, floating = false }) {
  const ios = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const Icon = ios ? ChevronLeft : ArrowLeft;
  const content = <Icon size={ios ? 30 : 24} aria-hidden="true" />;
  const className = ['cc-back-control', media && 'cc-back-control--media', floating && 'cc-back-control--floating'].filter(Boolean).join(' ');
  return href ? <a className={className} href={href} onClick={onClick} aria-label={label}>{content}</a>
    : <button type="button" className={className} onClick={onClick} disabled={disabled} aria-label={label}>{content}</button>;
}

import React from 'react';

export default function BrandWordmark({ className = '', showRule = true }) {
  const classes = ['brand-wordmark', className].filter(Boolean).join(' ');
  const renderLine = (text, lineClass) => (
    <span className={`brand-wordmark__line ${lineClass}`} aria-hidden="true">
      {text.split('').map((letter, index) => (
        <span key={`${letter}-${index}`}>{letter}</span>
      ))}
    </span>
  );

  return (
    <div className={classes} aria-label="Community Events Australia">
      {renderLine('Community', 'brand-wordmark__community')}
      {renderLine('Events', 'brand-wordmark__events')}
      {renderLine('Australia', 'brand-wordmark__australia')}
      {showRule && <span className="brand-wordmark__rule" aria-hidden="true" />}
    </div>
  );
}

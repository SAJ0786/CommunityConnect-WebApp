import React, { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import '../styles/horizontal-strip.css';

export default function HorizontalStrip({ children, label = 'Options', className = '', ...props }) {
  const frame = useRef(null), viewport = useRef(null), id = useId();
  const [bounds, setBounds] = useState({ overflow: false, previous: false, next: false });
  const measure = useCallback(() => {
    const node = viewport.current, shell = frame.current;
    if (!node || !shell) return;
    const overflow = node.scrollWidth > shell.clientWidth + 2;
    const next = { overflow, previous: overflow && node.scrollLeft > 2,
      next: overflow && node.scrollLeft + node.clientWidth < node.scrollWidth - 2 };
    setBounds(current => Object.keys(next).every(key => current[key] === next[key]) ? current : next);
  }, []);
  useLayoutEffect(() => {
    measure();
    if (!viewport.current || !frame.current) return undefined;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    [frame.current, viewport.current, ...viewport.current.children].forEach(node => observer?.observe(node));
    window.addEventListener('resize', measure);
    let active = true;
    document.fonts?.ready.then(() => { if (active) measure(); });
    return () => { active = false; observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [children, measure]);
  const move = direction => viewport.current?.scrollBy({ left: direction * Math.max(44, viewport.current.clientWidth * 0.8),
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return <div ref={frame} className={`cc-overflow-strip${bounds.overflow ? ' cc-overflow-strip--scrollable' : ''}`}>
    {bounds.overflow && <span className="cc-strip-edge">{bounds.previous && <button type="button" aria-label={`Scroll left: ${label}`} aria-controls={id} onClick={() => move(-1)}><ChevronLeft size={22} aria-hidden="true"/></button>}</span>}
    <div {...props} ref={viewport} id={id} className={className} role="group" aria-label={label} onScroll={measure}>{children}</div>
    {bounds.overflow && <span className="cc-strip-edge">{bounds.next && <button type="button" aria-label={`Scroll right: ${label}`} aria-controls={id} onClick={() => move(1)}><ChevronRight size={22} aria-hidden="true"/></button>}</span>}
  </div>;
}

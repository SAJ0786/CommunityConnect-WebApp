import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, MapPin } from 'lucide-react';
import { CITY_OPTIONS, cityLabel, cityCatalogueRevision, subscribeCityCatalogue } from '../utils/cities';
import '../styles/browse.css';

export default function CitySelector({ value, onChange, compact = false, label = 'Events location', options = CITY_OPTIONS, showPin = true }) {
  useSyncExternalStore(subscribeCityCatalogue, cityCatalogueRevision, cityCatalogueRevision);
  const id = useId();
  const trigger = useRef(null);
  const menu = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({});
  const selected = options.findIndex(city => city.value === value);
  const caption = city => (city?.label || cityLabel(value)).replace(', Australia', '');
  const show = () => { setActive(Math.max(0, selected)); setOpen(true); };
  const choose = index => {
    if (!options[index]) return;
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = trigger.current.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 248), window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upwards = below < 300 && above > below;
      setPosition({ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        maxHeight: Math.max(100, Math.min(390, upwards ? above : below)),
        ...(upwards ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) });
    };
    const outside = event => {
      if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);
  useEffect(() => {
    if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const onKeyDown = event => {
    if (event.key === 'Escape' || event.key === 'Tab') { setOpen(false); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(); return; }
      setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(active); else show();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const match = options.findIndex(city => city.label.toLowerCase().startsWith(event.key.toLowerCase()));
      if (match >= 0) { event.preventDefault(); setOpen(true); setActive(match); }
    }
  };

  return <>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined}
      className={`city-picker${showPin ? '' : ' choice-picker'}${compact ? ' city-picker-compact' : ''}`} onKeyDown={onKeyDown}
      onClick={() => open ? setOpen(false) : show()}>
      {showPin && <MapPin size={20} aria-hidden="true" />}<span>{caption(options[selected])}</span>
      <ChevronDown size={18} className={open ? 'city-chevron-open' : ''} aria-hidden="true" />
    </button>
    {open && createPortal(<ul ref={menu} id={id} role="listbox" aria-label={label} className="city-picker-menu" style={position}>
      {options.map((city, index) => <li key={city.value} id={`${id}-${index}`} role="option"
        aria-selected={city.value === value} data-index={index} className={index === active ? 'city-option-active' : ''}
        onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
        {showPin && <MapPin size={17} aria-hidden="true" />}<span>{caption(city)}</span>
        {city.value === value && <Check size={18} aria-hidden="true" />}
      </li>)}
    </ul>, document.body)}
  </>;
}

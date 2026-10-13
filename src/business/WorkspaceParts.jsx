import React, { useId, useRef, useState } from 'react';
import { useDialogFocus } from '../utils/useDialogFocus';
import { statusLabel } from './workspaceModel.mjs';
import { safeWebsite } from '../utils/publicBusinesses.mjs';
import { validateBusinessImage } from '../services/directory/images.mjs';

export const Badge = ({ status }) => <span className={`bw-badge bw-${status}`}>{statusLabel(status)}</span>;
export const Panel = ({ title, children, className = '' }) => <section className={`bw-panel ${className}`}>{title && <h2>{title}</h2>}{children}</section>;
export function Field({ label, children, hint }) {
  const id = useId();
  const labelId = `${id}-label`, hintId = `${id}-hint`;
  // Name controls from the caption only, not option text, values or hints.
  const fields = React.Children.map(children, child => {
    if (!React.isValidElement(child) || !['input', 'select', 'textarea'].includes(child.type)) return child;
    return React.cloneElement(child, {
      'aria-labelledby': child.props['aria-labelledby'] || labelId,
      'aria-describedby': [child.props['aria-describedby'], hint ? hintId : null].filter(Boolean).join(' ') || undefined,
    });
  });
  return <label className="bw-field"><span id={labelId}>{label}</span>{fields}{hint && <small id={hintId}>{hint}</small>}</label>;
}
export const Check = ({ children, ...props }) => <label className="bw-check"><input type="checkbox" {...props}/><span>{children}</span></label>;
export function Empty({ title, children }) { return <div className="bw-empty"><h2>{title}</h2>{children}</div>; }
export function Metrics({ items }) { return <div className="bw-metrics">{items.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>; }
export function ErrorSummary({ errors }) {
  const ref = useRef(null);
  const errorText = Object.values(errors).join('\n');
  React.useEffect(() => { if (errorText) { ref.current?.focus({ preventScroll: true }); ref.current?.scrollIntoView({ block: 'center' }); } }, [errorText]);
  return Object.keys(errors).length ? <div ref={ref} tabIndex={-1} className="bw-error" role="alert"><strong>Please check these details</strong><ul>{Object.values(errors).map(error => <li key={error}>{error}</li>)}</ul></div> : null;
}

export function ConfirmDialog({ title, description, requireReason = false, confirmLabel = 'Confirm', children, onClose, onConfirm }) {
  const ref = useRef(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useDialogFocus(ref, true, busy ? null : onClose);
  return <div className="bw-overlay"><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bw-dialog-title" className="bw-dialog">
    <h2 id="bw-dialog-title">{title}</h2><p>{description}</p>{children}
    {requireReason && <Field label="Reason"><textarea value={reason} maxLength={2500} onChange={event => setReason(event.target.value)}/></Field>}
    {error && <p role="alert" className="bw-error">{error}</p>}
    <div className="bw-actions"><button disabled={busy || requireReason && reason.trim().length < 10} onClick={async () => { setBusy(true); setError(''); try { await onConfirm(reason.trim()); onClose(); } catch (error) { setError(error.message || 'Please try again.'); } finally { setBusy(false); } }}>{busy ? 'Working…' : confirmLabel}</button><button className="btn-light" disabled={busy} onClick={onClose}>Cancel</button></div>
  </section></div>;
}

export function ImagePicker({ label, value, existingUrl, onChange }) {
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  React.useEffect(() => { if (!(value instanceof Blob)) { setUrl(''); return; } const next = URL.createObjectURL(value); setUrl(next); return () => URL.revokeObjectURL(next); }, [value]);
  const previewUrl = url || safeWebsite(existingUrl);
  return <div><Field label={label} hint="Optional PNG, JPEG or WebP, smaller than 5 MB."><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files[0]; if (!file) return; try { validateBusinessImage(file); } catch (error) { setError(error.message); event.target.value = ''; return; } setError(''); onChange(file); }}/></Field>{previewUrl && <img className="bw-image-preview" src={previewUrl} alt={`${label} preview`}/>} {(value || existingUrl) && <button type="button" className="btn-light" onClick={() => onChange(null)}>Remove {label.toLowerCase()}</button>}{error && <p role="alert" className="bw-error">{error}</p>}</div>;
}

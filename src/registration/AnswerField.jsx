import React, { useId } from 'react';
export default function AnswerField({ field, value, error, onChange, readOnly = false }) {
  const change = next => { if (!readOnly) onChange?.(next); };
  const id = useId();
  const common = { id, 'aria-describedby': `${id}-help ${id}-error`, 'aria-invalid': Boolean(error), 'aria-required': !readOnly && field.required, 'aria-readonly': readOnly, readOnly };
  const title = `${field.label}${field.required ? ' *' : ''}`;
  if (['radio', 'checkboxes'].includes(field.type)) return <div className="registration-answer" data-field-type={field.type}>
    <fieldset aria-describedby={`${id}-help ${id}-error`} aria-invalid={Boolean(error)}>
      <legend>{title}</legend>
      {field.description && <p id={`${id}-help`} className="small">{field.description}</p>}
      <p className="small registration-choice-hint">{readOnly ? 'Saved selection · Read only' : field.type === 'radio' ? 'Choose one option' : 'Select all that apply'}</p>
      {field.options.map(option => <label className="registration-check" key={option}><input type={field.type === 'radio' ? 'radio' : 'checkbox'} name={id} disabled={readOnly} required={!readOnly && field.type === 'radio' && field.required} checked={field.type === 'radio' ? value === option : Array.isArray(value) && value.includes(option)} onChange={e => change(field.type === 'radio' ? option : e.target.checked ? [...(Array.isArray(value) ? value : []), option] : (value || []).filter(v => v !== option))}/><span>{option}</span></label>)}
    </fieldset>
    {error && <p id={`${id}-error`} role="alert">{error}</p>}
  </div>;
  return <div className="registration-answer" data-field-type={field.type}><label htmlFor={id}>{title}</label><p id={`${id}-help`} className="small">{field.description}</p>
    {field.type === 'textarea' ? <textarea {...common} value={value || ''} maxLength={2000} onChange={e => change(e.target.value)}/>
      : field.type === 'select' ? <select {...common} disabled={readOnly} value={value || ''} onChange={e => change(e.target.value)}><option value="">Choose an option</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
      : field.type === 'consent' ? <><p className="registration-terms">{field.terms}</p><label className="registration-check"><input {...common} disabled={readOnly} type="checkbox" checked={value === true} onChange={e => change(e.target.checked)}/>I agree to these terms and conditions</label></>
      : <input {...common} type={{ email: 'email', phone: 'tel', number: 'number', date: 'date' }[field.type] || 'text'} step={field.type === 'number' ? 'any' : undefined} value={value ?? ''} maxLength={2000} onChange={e => change(e.target.value)}/>}
    {error && <p id={`${id}-error`} role="alert">{error}</p>}
  </div>;
}

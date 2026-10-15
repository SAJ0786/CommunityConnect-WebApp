import React, { useId } from 'react';
export default function AnswerField({ field, value, error, onChange }) {
  const id = useId();
  const common = { id, 'aria-describedby': `${id}-help ${id}-error`, 'aria-invalid': Boolean(error), 'aria-required': field.required };
  const title = `${field.label}${field.required ? ' *' : ''}`;
  return <div className="registration-answer"><label htmlFor={id}>{title}</label><p id={`${id}-help`} className="small">{field.description}</p>
    {field.type === 'textarea' ? <textarea {...common} value={value || ''} maxLength={2000} onChange={e => onChange(e.target.value)}/>
      : field.type === 'select' ? <select {...common} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">Choose an option</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
      : field.type === 'consent' ? <><p className="registration-terms">{field.terms}</p><label className="registration-check"><input {...common} type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)}/>I agree to these terms and conditions</label></>
      : ['radio', 'checkboxes'].includes(field.type) ? <fieldset id={id} aria-describedby={`${id}-help ${id}-error`}><legend>{title} — choose {field.type === 'radio' ? 'one' : 'all that apply'}</legend>{field.options.map(option => <label className="registration-check" key={option}><input type={field.type === 'radio' ? 'radio' : 'checkbox'} name={id} checked={field.type === 'radio' ? value === option : Array.isArray(value) && value.includes(option)} onChange={e => onChange(field.type === 'radio' ? option : e.target.checked ? [...(Array.isArray(value) ? value : []), option] : (value || []).filter(v => v !== option))}/>{option}</label>)}</fieldset>
      : <input {...common} type={{ email: 'email', phone: 'tel', number: 'number', date: 'date' }[field.type] || 'text'} step={field.type === 'number' ? 'any' : undefined} value={value ?? ''} maxLength={2000} onChange={e => onChange(e.target.value)}/>}
    {error && <p id={`${id}-error`} role="alert">{error}</p>}
  </div>;
}

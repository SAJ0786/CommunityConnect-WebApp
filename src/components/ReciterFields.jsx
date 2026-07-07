import React from 'react';

const RECITER_TYPES = [
  'Reciter', 'Zakir', 'Peshkhani',
  'Soz', 'Salam', 'Manqebat', 'Noha', 'Marsiya',
  'Custom',
];

export default function ReciterFields({ reciters, setReciters }) {
  const update = (i, field, value) => {
    const next = [...reciters];
    next[i] = { ...next[i], [field]: value };
    setReciters(next);
  };

  return (
    <div>
      <label>Reciters</label>
      {reciters.map((r, i) => (
        <div key={i} style={{
          background: 'var(--teal-l,#f0fdf4)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 10,
        }}>
          {/* Row 1: Type selector */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: '0.75rem', marginBottom: 4, display: 'block' }}>Type</label>
            <select value={r.type} onChange={e => update(i, 'type', e.target.value)}>
              {RECITER_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* Row 2: Custom type name — only when Custom selected */}
          {r.type === 'Custom' && (
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: '0.75rem', marginBottom: 4, display: 'block' }}>Custom Type Name</label>
              <input
                value={r.customType || ''}
                onChange={e => update(i, 'customType', e.target.value)}
                placeholder="e.g. Rubai, Qasida, Nauha…"
              />
            </div>
          )}

          {/* Row 3: Reciter name */}
          <div style={{ marginBottom: 4 }}>
            <label style={{ fontSize: '0.75rem', marginBottom: 4, display: 'block' }}>Reciter Name</label>
            <input
              value={r.name}
              onChange={e => update(i, 'name', e.target.value)}
              placeholder="Full name"
            />
          </div>

          {/* Remove button */}
          <button
            type="button"
            className="btn-danger"
            style={{ fontSize: '0.75rem', padding: '5px 12px', marginTop: 4 }}
            onClick={() => setReciters(reciters.filter((_, x) => x !== i))}>
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn-light"
        onClick={() => setReciters([...reciters, { type: 'Reciter', name: '' }])}>
        + Add Reciter
      </button>
    </div>
  );
}

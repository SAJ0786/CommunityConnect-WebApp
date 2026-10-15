import React from 'react';
export const venue = { fullAddress:'1 Fictional Street, Parramatta NSW', suburb:'Parramatta', state:'NSW', postcode:'2150', latitude:-33.8, longitude:151 };
export default function Address({ onChange }) { return <button type="button" onClick={() => onChange(venue)}>Select fictional private venue</button>; }

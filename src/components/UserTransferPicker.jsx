import React, { useEffect, useState } from 'react';
import { userMatchesSearch } from '../utils/adminUserSearch.mjs';

const memberName = member => member.fullName || member.displayName || member.name || member.email || member.phone || member.phoneNumber || 'Member';
export default function UserTransferPicker({ users = [], value = '', onChange, disabled = false }) {
  const [query, setQuery] = useState('');
  const selected = users.find(member => member.id === value);
  const selectedName = selected ? memberName(selected) : '';
  useEffect(() => { if (selectedName) setQuery(selectedName); }, [value, selectedName]);
  useEffect(() => { if (value && !selected) onChange(''); }, [value, selected]);
  const matches = query.trim().length >= 2 && !selected ? users.filter(member => userMatchesSearch(member, query)) : [];
  return <div style={{marginBottom:12}}>
    <label>New organiser
      <input type="search" autoComplete="off" placeholder="Search by name, phone number or email" value={query} disabled={disabled}
        onChange={event => {setQuery(event.target.value);if(value)onChange('');}} style={{width:'100%'}}/>
    </label>
    {selected ? <p role="status" className="small">Selected: <strong>{selectedName}</strong>{selected.email ? ` · ${selected.email}` : ''}{selected.phone || selected.phoneNumber ? ` · ${selected.phone || selected.phoneNumber}` : ''} <button type="button" className="btn-light" disabled={disabled} onClick={()=>{onChange('');setQuery('');}}>Change</button></p>
      : query.trim().length < 2 ? <p className="small">Type at least two characters to find a member.</p>
      : <><div aria-label="Matching members" style={{display:'grid',gap:4,maxHeight:280,overflowY:'auto'}}>
        {matches.slice(0,8).map(member=><button type="button" className="btn-light" key={member.id} disabled={disabled} onClick={()=>{setQuery(memberName(member));onChange(member.id);}} style={{textAlign:'left',padding:12,whiteSpace:'normal'}}>
          <strong>{memberName(member)}</strong><span className="small" style={{display:'block'}}>{[member.email,member.phone || member.phoneNumber || member.mobile || member.mobileNumber].filter(Boolean).join(' · ')}</span>
        </button>)}
      </div><p role="status" className="small">{!matches.length?'No matching active members.':matches.length>8?'Showing eight matches. Keep typing to narrow the results.':`${matches.length} matching member${matches.length===1?'':'s'}. Select one below the search field.`}</p></>}
  </div>;
}

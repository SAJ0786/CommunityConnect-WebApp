import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DirectoryWorkspace from '../../src/business/DirectoryWorkspace';
import { freshData, applyDemoAction, address } from './model.mjs';
import { freshOperations } from './operations.mjs';
import AppRouter from '../../src/AppRouter';
import '../../src/styles/theme.css';
import './preview.css';
function Preview() {
  const [data,setData] = useState(() => { try { const saved=JSON.parse(sessionStorage.getItem('directory-workspace-demo')); return saved ? {...freshOperations(),...saved} : freshData(); } catch { return freshData(); } });
  const current = useRef(data); current.current = data;
  const [role,setRole] = useState('user'), [status,setStatus] = useState('ready'), [fail,setFail] = useState(false), [version,setVersion] = useState(0);
  const profile = role === 'guest' ? null : { uid: 'review-member', fullName: 'Example Member', email:'member@example.test', role, defaultCity: 'sydney', adminCity: 'sydney' };
  const store = next => { current.current = next; setData(next); sessionStorage.setItem('directory-workspace-demo',JSON.stringify(next)); };
  const onAction = async (type,payload) => {
    await new Promise(resolve => setTimeout(resolve,100));
    if (fail) { setFail(false); throw new Error('Simulated save failure. Your changes have not been applied.'); }
    const { next,result } = applyDemoAction(current.current,type,payload,profile); store(next); return result;
  };
  const visible = status === 'empty' ? Object.fromEntries(Object.keys(data).map(key => [key,[]])) : data;
  return <><aside className="workspace-preview-bar"><strong>Offline UI review</strong><span>Synthetic data only · actions stay in this tab · no Firebase</span><label>Preview role<select aria-label="Preview role" value={role} onChange={event => { setRole(event.target.value); setVersion(value => value + 1); }}>{['user','admin','superAdmin','guest'].map(value => <option key={value}>{value}</option>)}</select></label><label>Preview state<select aria-label="Preview state" value={status} onChange={event => setStatus(event.target.value)}>{['ready','loading','error','empty','cached'].map(value => <option key={value}>{value}</option>)}</select></label><label><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)}/>Fail next action</label><button onClick={() => { store(freshData()); setStatus('ready'); setVersion(value => value + 1); }}>Reset sample data</button><a href="http://127.0.0.1:5182/">Events UI review</a><a href="/">Member workspace</a><a href="/businesses">Public browsing</a></aside>
    {location.pathname.startsWith('/businesses') ? <AppRouter/> : <DirectoryWorkspace key={version} data={visible} profile={profile} onAction={onAction} status={status} onRetry={() => setStatus('ready')} findAddresses={async () => [address]} lookupAbn={async () => ({ active: true, name: 'Synthetic ABR lookup — Example Trading Name' })}/>}
  </>;
}
createRoot(document.getElementById('root')).render(<Preview/>);

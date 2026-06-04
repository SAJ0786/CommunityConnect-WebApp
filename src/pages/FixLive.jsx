// One-time fix page - clears all stale isLive flags
import React, { useEffect, useState } from 'react';

export default function FixLive() {
  const [status, setStatus] = useState('Clearing stale live events…');

  useEffect(() => {
    const fix = async () => {
      try {
        const { getDocs, collection, query, where, doc, updateDoc, serverTimestamp } 
          = await import('firebase/firestore');
        const { db } = await import('../firebase/firebase');
        const snap = await getDocs(query(
          collection(db, 'events'), where('isLive', '==', true)
        ));
        if (snap.empty) { setStatus('✅ No stale live events found.'); return; }
        await Promise.all(snap.docs.map(d => 
          updateDoc(doc(db, 'events', d.id), {
            isLive: false, liveUrl: null, updatedAt: serverTimestamp()
          })
        ));
        setStatus(`✅ Cleared ${snap.size} stale live event(s). You can close this.`);
      } catch (e) { setStatus('❌ Error: ' + e.message); }
    };
    fix();
  }, []);

  return (
    <div className="card" style={{ margin: 20, textAlign: 'center', padding: 30 }}>
      <p style={{ fontSize: 16, fontWeight: 700 }}>{status}</p>
    </div>
  );
}

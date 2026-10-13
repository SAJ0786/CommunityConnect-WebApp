import React from 'react';
export default function LegacyFixture() {
  window.__legacyMounted = true;
  return <main><h1>Existing Events route preserved</h1><p>This fixture does not load sign-in or Firebase.</p><a href="/businesses">Open Business Directory</a></main>;
}

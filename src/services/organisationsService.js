// ─── Organisations Service ────────────────────────────────────────────────────
// Organisations are stored in Firestore under the `organisations` collection.
// Each document has: name, slug, location, logoBase64, createdAt
// The imageService reads from this collection dynamically so new orgs
// show their logo on event cards without any code changes.

import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, updateDoc, query, where }
  from 'firebase/firestore';
import { db } from '../firebase/firebase';

// Import bundled logos for seeding
import logoUrl_community from '../assets/fallback_community.png';
import logoUrl_muhammadi from '../assets/fallback_muhammadi.png';
import logoUrl_imamhasan from '../assets/fallback_imamhasan.png';
import logoUrl_alamdar   from '../assets/fallback_alamdar.png';

const COL = 'organisations';

// Built-in organisations — seeded into Firestore so they appear in the admin panel
const BUILT_IN_ORGS = [
  { name: 'Community Events Australia', slug: 'community',  location: 'Australia',      logoUrl: logoUrl_community },
  { name: 'Muhammadi Welfare Association', slug: 'muhammadi', location: 'Kemps Creek, NSW', logoUrl: logoUrl_muhammadi },
  { name: 'Imam Hasan Centre',          slug: 'imamhasan', location: 'Australia',      logoUrl: logoUrl_imamhasan },
  { name: 'Alamdar Granville',          slug: 'alamdar',   location: 'Granville, NSW', logoUrl: logoUrl_alamdar   },
];

// Convert an imported asset URL to base64 data-URI
async function assetToBase64(url) {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
  } catch { return ''; }
}

// Seed built-in orgs into Firestore if they don't already exist.
// Called once when the Orgs tab opens.
export async function seedBuiltInOrgs() {
  try {
    for (const org of BUILT_IN_ORGS) {
      const existing = await getDocs(query(collection(db, COL), where('slug', '==', org.slug)));
      if (existing.empty) {
        const logoBase64 = await assetToBase64(org.logoUrl);
        await addDoc(collection(db, COL), {
          name:       org.name,
          slug:       org.slug,
          location:   org.location,
          logoBase64,
          builtIn:    true,   // flag so UI can distinguish built-in from custom
          createdAt:  serverTimestamp(),
        });
      }
    }
  } catch (e) {
    console.warn('seedBuiltInOrgs:', e.message);
  }
}


// Load all organisations from Firestore
export async function getOrganisations() {
  try {
    const snap = await getDocs(collection(db, COL));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

// Add a new organisation (logoBase64 is a data-URI string)
export async function addOrganisation({ name, slug, location, logoBase64 }) {
  if (!name || !slug) throw new Error('Name and slug are required');
  const cleanSlug = slug.trim().toLowerCase();
  const existing = await getDocs(query(collection(db, COL), where('slug', '==', cleanSlug)));
  if (!existing.empty) throw new Error(`Organisation ID "${cleanSlug}" is already used. Please choose a unique ID.`);
  return addDoc(collection(db, COL), {
    name:        name.trim(),
    slug:        cleanSlug,
    location:    (location || '').trim(),
    logoBase64:  logoBase64 || '',
    createdAt:   serverTimestamp(),
  });
}

// Update an existing organisation
export async function updateOrganisation(id, fields) {
  if (fields.slug) {
    const cleanSlug = fields.slug.trim().toLowerCase();
    const existing = await getDocs(query(collection(db, COL), where('slug', '==', cleanSlug)));
    const duplicate = existing.docs.find(item => item.id !== id);
    if (duplicate) throw new Error(`Organisation ID "${cleanSlug}" is already used. Please choose a unique ID.`);
    fields = { ...fields, slug: cleanSlug };
  }
  return updateDoc(doc(db, COL, id), { ...fields, updatedAt: serverTimestamp() });
}

// Delete an organisation
export async function deleteOrganisation(id) {
  return deleteDoc(doc(db, COL, id));
}

// Convert a File to a base64 data-URI (compressed for storage)
export function fileToBase64(file, maxDim = 400, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else                  { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

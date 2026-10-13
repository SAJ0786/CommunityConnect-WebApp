import { BUSINESS_CATEGORIES } from '../../business/categories.mjs';
import { categoryAddition, cleanCategoryName, categorySlug } from '../../business/operationsModel.mjs';

// Same settings/businessCategories schema as the native category administrator.
export function mergeDirectoryCategories(data = {}) {
  const custom = Array.isArray(data.customCategories) ? data.customCategories : [];
  const services = Array.isArray(data.customSubcategories) ? data.customSubcategories : [];
  const categories = new Map(BUSINESS_CATEGORIES.map(row => [row.id, { ...row, subcategories: [...row.subcategories] }]));
  for (const row of custom) {
    const id = cleanCategoryName(row?.id) || categorySlug(row?.label), label = cleanCategoryName(row?.label);
    if (id && label && !categories.has(id)) categories.set(id, { id, label, icon: cleanCategoryName(row.icon) || '🏷️', custom: true, subcategories: [] });
  }
  for (const row of services) {
    const category = categories.get(row?.categoryId);
    const id = cleanCategoryName(row?.id) || categorySlug(row?.label), label = cleanCategoryName(row?.label);
    if (category && id && label && !category.subcategories.some(item => item.id === id)) category.subcategories.push({ id, label, custom: true });
  }
  return [...categories.values()];
}

export async function addDirectoryCategory({ db, sdk, user, payload, service, assertOpen }) {
  const reference = sdk.doc(db, 'settings', 'businessCategories');
  await sdk.runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    assertOpen();
    const data = snapshot.exists() ? snapshot.data() : {};
    const addition = categoryAddition(mergeDirectoryCategories(data), payload, service);
    const { custom, subcategories, ...fields } = addition;
    const key = service ? 'customSubcategories' : 'customCategories';
    transaction.set(reference, { [key]: [...(Array.isArray(data[key]) ? data[key] : []), {
      ...fields, addedByUid: user.uid, addedAt: new Date().toISOString(),
    }], updatedAt: sdk.serverTimestamp() }, { merge: true });
  });
}

export function filterHijriObservances(items, { search = '', categories = [], currentMonth } = {}) {
  const query = search.trim().toLowerCase();
  return items.filter(item => item.enabled !== false)
    .filter(item => categories.length ? categories.includes(item.category) : true)
    .filter(item => query ? `${item.name || ''} ${item.notes || ''} ${item.category || ''}`.toLowerCase().includes(query) : true)
    .filter(item => query || categories.length || Number(item.month) === Number(currentMonth));
}

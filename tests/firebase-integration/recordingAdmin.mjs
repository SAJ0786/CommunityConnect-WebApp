// In-memory Admin SDK contract, not a permissions or transaction-concurrency emulator.
export function recordingAdmin(initial) {
  class Timestamp {
    constructor(millis) { this.millis = millis; }
    toMillis() { return this.millis; }
    toDate() { return new Date(this.millis); }
    static now() { return new Timestamp(Date.now()); }
  }
  const clone = value => {
    if (value instanceof Timestamp) return new Timestamp(value.millis);
    if (value instanceof Date) return new Date(value);
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
  };
  const records = new Map(Object.entries(clone(initial)));
  const authUsers = new Map(Object.entries(initial).filter(([key]) => key.startsWith('users/')).map(([key, value]) => [key.slice(6), { disabled: value.isActive === false }]));
  let sequence = 0;
  const snapshot = ref => ({ id: ref.id, ref, exists: records.has(ref.path), data: () => clone(records.get(ref.path)) });
  const resolve = (value, old) => {
    if (value?.increment !== undefined) return Number(old || 0) + value.increment;
    if (Array.isArray(value) || value instanceof Date || value instanceof Timestamp || value === null || typeof value !== 'object') return clone(value);
    return Object.fromEntries(Object.entries(value).map(([key, next]) => [key, resolve(next, old?.[key])]));
  };
  const apply = (ref, value, options) => {
    const previous = records.get(ref.path);
    const next = resolve(value, previous);
    records.set(ref.path, options?.merge ? { ...previous, ...next } : next);
  };
  const collection = (path, filters = [], ordering = '', cursor = '', maximum = Infinity) => ({ path, doc: (id = `generated-${++sequence}`) => document(`${path}/${id}`),
    async get() {
      let docs = [...records.keys()].filter(key => key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1)
        .map(key => snapshot(document(key))).filter(item => filters.every(([key, op, value]) => {
          const actual = key === '__name__' ? item.id : item.data()[key];
          return op === 'in' ? value.includes(actual) : actual === value;
        }));
      if (ordering) docs.sort((a, b) => a.id.localeCompare(b.id));
      docs = docs.filter(item => !cursor || item.id > cursor).slice(0, maximum);
      return { docs, size: docs.length, empty: !docs.length };
    },
    where: (key, op, value) => collection(path, [...filters, [key, op, value]], ordering, cursor, maximum),
    orderBy: field => collection(path, filters, field, cursor, maximum),
    startAfter: id => collection(path, filters, ordering, id, maximum),
    limit: count => collection(path, filters, ordering, cursor, count),
  });
  const document = path => ({ path, id: path.split('/').at(-1), get: async () => snapshot(document(path)),
    set: async (value, options) => apply(document(path), value, options),
    collection: name => collection(`${path}/${name}`) });
  const db = { collection, batch() {
    const writes = [];
    const batch = { set: (...args) => { writes.push(['set', args]); return batch; },
      update: (...args) => { writes.push(['update', args]); return batch; },
      delete: ref => { writes.push(['delete', [ref]]); return batch; },
      async commit() {
        for (const [kind, [ref]] of writes) if (kind === 'update' && !records.has(ref.path)) throw new Error('Not found');
        for (const [kind, [ref, value, options]] of writes) {
          if (kind === 'delete') records.delete(ref.path); else apply(ref, value, kind === 'update' ? { merge: true } : options);
        }
      } };
    return batch;
  }, async runTransaction(callback) {
    const writes = [];
    const transaction = { get: ref => ref.get(), getAll: (...refs) => Promise.all(refs.map(ref => ref.get())), set: (...args) => writes.push(['set', args]),
      update: (...args) => writes.push(['update', args]), delete: ref => writes.push(['delete', [ref]]),
      create: (...args) => writes.push(['create', args]) };
    const result = await callback(transaction);
    for (const [kind, [ref]] of writes) {
      if (kind === 'create' && records.has(ref.path)) throw new Error('Already exists');
      if (kind === 'update' && !records.has(ref.path)) throw new Error('Not found');
    }
    for (const [kind, [ref, value, options]] of writes) {
      if (kind === 'delete') records.delete(ref.path); else apply(ref, value, kind === 'update' ? { merge: true } : options);
    }
    return result;
  } };
  const admin = { firestore: { Timestamp, FieldValue: { serverTimestamp: () => new Date(), increment: increment => ({ increment }) } },
    auth: () => ({ updateUser: async (uid, fields) => {
      if (!authUsers.has(uid)) throw new Error('Auth user not found');
      authUsers.set(uid, { ...authUsers.get(uid), ...fields });
      return authUsers.get(uid);
    } }) };
  return { db, admin, records, authUsers };
}

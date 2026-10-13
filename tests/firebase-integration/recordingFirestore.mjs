// Transport contract double. This does NOT evaluate Firestore security rules.
export function recordingFirestore(initial = {}) {
  const records = new Map(Object.entries(structuredClone(initial))), writes = [], listeners = new Set();
  let sequence = 0;
  const reference = (first, ...parts) => ({ path: [first?.path, ...parts].filter(Boolean).join('/') });
  const field = (data, path) => path.split('.').reduce((value, key) => value?.[key], data);
  const snapshot = ref => ({ id: ref.path.split('/').at(-1), ref, exists: () => records.has(ref.path), data: () => structuredClone(records.get(ref.path)), metadata: { fromCache: false } });
  const querySnapshot = target => {
    const depth = target.path.split('/').length + 1;
    let docs = [...records.keys()].filter(path => path.startsWith(target.path + '/') && path.split('/').length === depth).map(path => snapshot({ path }));
    for (const constraint of target.constraints || []) {
      if (constraint.kind === 'where') docs = docs.filter(doc => constraint.op === 'array-contains' ? field(doc.data(), constraint.key)?.includes(constraint.value) : field(doc.data(), constraint.key) === constraint.value);
      if (constraint.kind === 'orderBy') docs.sort((a,b) => {
        const left = field(a.data(),constraint.key), right = field(b.data(),constraint.key);
        return (left < right ? -1 : left > right ? 1 : 0) * (constraint.direction === 'desc' ? -1 : 1);
      });
      if (constraint.kind === 'limit') docs = docs.slice(0,constraint.count);
    }
    return { docs, size: docs.length, metadata: { fromCache: false } };
  };
  const emit = () => listeners.forEach(item => queueMicrotask(() => { if (listeners.has(item)) item.next(item.target.document ? snapshot(item.target) : querySnapshot(item.target)); }));
  const apply = (kind, ref, value, options) => {
    writes.push({ kind, path: ref.path, value: structuredClone(value) });
    if (kind === 'delete') { records.delete(ref.path); return; }
    const current = kind === 'update' || options?.merge ? structuredClone(records.get(ref.path) || {}) : {};
    for (const [key, val] of Object.entries(value)) {
      const parts = key.split('.'), last = parts.pop(); let dest = current;
      for (const part of parts) dest = dest[part] ||= {};
      dest[last] = val?.transform === 'union' ? [...new Set([...(dest[last] || []), ...val.values])]
        : val?.transform === 'remove' ? (dest[last] || []).filter(item => !val.values.includes(item))
          : val?.transform === 'increment' ? Number(dest[last] || 0) + val.value : val;
    }
    records.set(ref.path, current);
  };
  const sdk = {
    collection: reference,
    doc: (first, ...parts) => ({ ...reference(first, ...(parts.length ? parts : [`new-${++sequence}`])), document: true }),
    where: (key, op, value) => ({ kind: 'where', key, op, value }), orderBy: (key, direction) => ({ kind: 'orderBy', key, direction }),
    limit: count => ({kind:'limit',count}),
    query: (ref, ...constraints) => ({ ...ref, constraints }),
    getDoc: async ref => snapshot(ref), getDocFromServer: async ref => snapshot(ref),
    getDocs: async target => querySnapshot(target), getDocsFromServer: async target => querySnapshot(target),
    serverTimestamp: () => new Date(), arrayUnion: (...values) => ({ transform: 'union', values }),
    arrayRemove: (...values) => ({ transform: 'remove', values }), increment: value => ({ transform: 'increment', value }),
    addDoc: async (parent, value) => { const ref = sdk.doc(parent); apply('set', ref, value); emit(); return { ...ref, id: ref.path.split('/').at(-1) }; },
    updateDoc: async (ref, value) => { apply('update', ref, value); emit(); },
    writeBatch: () => {
      const commands = []; const batch = {};
      for (const kind of ['set', 'update', 'delete']) batch[kind] = (...args) => { commands.push([kind, ...args]); return batch; };
      batch.commit = async () => { commands.forEach(args => apply(...args)); emit(); };
      return batch;
    },
    runTransaction: async (_, update) => {
      const batch = sdk.writeBatch();
      const transaction = { ...batch, get: sdk.getDoc };
      const result = await update(transaction);
      await batch.commit();
      return result;
    },
    onSnapshot: (target, options, next, error) => {
      if (typeof options === 'function') { error = next; next = options; }
      const item = { target, next, error }; listeners.add(item); emit();
      return () => listeners.delete(item);
    },
  };
  return { sdk, records, writes, listeners, emit };
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'beiwatch.compare';
export const COMPARE_LIMIT = 4;

const CompareContext = createContext(null);

// Per-browser basket: only product ids are stored, details are fetched fresh on the compare page
function readStoredIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(ids) ? ids.filter(Number.isInteger).slice(0, COMPARE_LIMIT) : [];
  } catch {
    return [];
  }
}

export function CompareProvider({ children }) {
  const [ids, setIds] = useState(readStoredIds);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Storage can be blocked (private mode); the basket still works for this visit
    }
  }, [ids]);

  const add = useCallback((id) => {
    setIds((prev) => (prev.includes(id) || prev.length >= COMPARE_LIMIT ? prev : [...prev, id]));
  }, []);

  const remove = useCallback((id) => setIds((prev) => prev.filter((x) => x !== id)), []);

  const clear = useCallback(() => setIds([]), []);

  // Used when a shared comparison link opens: the link's products replace the basket
  const replace = useCallback((next) => setIds(next.filter(Number.isInteger).slice(0, COMPARE_LIMIT)), []);

  const value = useMemo(
    () => ({
      ids,
      add,
      remove,
      clear,
      replace,
      has: (id) => ids.includes(id),
      full: ids.length >= COMPARE_LIMIT,
      limit: COMPARE_LIMIT,
    }),
    [ids, add, remove, clear, replace]
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export const useCompare = () => useContext(CompareContext);

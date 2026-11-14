import { useEffect, useState } from "react";

export default function useDebouncedSearch(query, loader, { enabled = true, minLength = 1, reload = 0 } = {}) {
  const [state, setState] = useState({ data: null, loading: false, error: "" });
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const q = query.trim();
    const ready = enabled && q.length >= minLength;
    setState({ data: null, loading: ready, error: "" });
    if (!ready) return () => controller.abort();
    const timer = setTimeout(async () => {
      try {
        const data = await loader(q, { signal: controller.signal });
        if (active) setState({ data, loading: false, error: "" });
      } catch (failure) {
        if (active && failure.name !== "AbortError") setState({ data: null, loading: false, error: failure.message });
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, loader, enabled, minLength, reload]);
  return state;
}

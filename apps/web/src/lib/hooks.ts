import { useCallback, useEffect, useRef, useState } from 'react';

interface ResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useResource<T>(key: string, load: () => Promise<T>): ResourceState<T> & { reload: () => void; setData: (value: T | null) => void } {
  const [state, setState] = useState<ResourceState<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    loadRef
      .current()
      .then((data) => {
        if (alive) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const message = error instanceof Error ? error.message : 'Could not load this right now.';
        setState((current) => ({ data: current.data, error: message, loading: false }));
      });
    return () => {
      alive = false;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  const setData = useCallback((value: T | null) => setState((current) => ({ ...current, data: value })), []);
  return { ...state, reload, setData };
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

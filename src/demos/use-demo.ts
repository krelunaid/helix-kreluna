import { useEffect, useRef, useState } from "react";

export function useDemoClock() {
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const id of timers.current) window.clearTimeout(id);
    };
  }, []);

  function later(ms: number, fn: () => void) {
    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(fn, reduced ? 40 : ms);
    timers.current.push(id);
    return id;
  }

  function clearTimers() {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }

  return { later, clearTimers };
}

export function useDemoState<T>(initial: T) {
  const [state, setState] = useState(initial);
  const clock = useDemoClock();

  function patch(next: Partial<T>) {
    setState((current) => ({ ...current, ...next }));
  }

  function reset(notice?: Partial<T>) {
    clock.clearTimers();
    setState({ ...initial, ...notice });
  }

  return { state, setState, patch, reset, later: clock.later, clearTimers: clock.clearTimers };
}

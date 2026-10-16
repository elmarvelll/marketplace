// src/app/_components/use-load.ts
//
// One explicit state model for "fetch something for this page", so a list is never shown as empty before the
// backend has actually said so:
//   { status: "loading" }                    request in flight (initial load, retry, or new params)
//   { status: "success", data }              the backend answered — `data` may be an empty list, which is then real
//   { status: "error", httpStatus? }        network error, timeout or non-2xx: NOT an empty list; offer retry()
//                                            (httpStatus is set when the server answered, e.g. 404)
//
// `key` identifies the request (URL + params). When it changes, the previous request's answer is ignored and the
// state goes back to loading. The loader is read through a ref, so callers can pass an inline function.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";

export type LoadState<T> = { status: "loading" } | { status: "success"; data: T } | { status: "error"; httpStatus?: number };

export function useLoad<T>(key: string, loader: () => Promise<T>): LoadState<T> & { retry: () => void } {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setState({ status: "loading" });
      try {
        const data = await loaderRef.current();
        if (!cancelled) setState({ status: "success", data });
      } catch (err) {
        if (!cancelled) setState({ status: "error", httpStatus: isAxiosError(err) ? err.response?.status : undefined });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

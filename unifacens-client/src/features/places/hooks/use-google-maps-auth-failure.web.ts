import { useSyncExternalStore } from "react";

type MapsWindow = Window & { gm_authFailure?: () => void };
const listeners = new Set<() => void>();
let failed = false;
let previousCallback: (() => void) | undefined;

function handleAuthFailure() {
  failed = true;
  for (const listener of listeners) listener();
  previousCallback?.();
}

function subscribe(listener: () => void) {
  const mapsWindow = window as MapsWindow;
  if (listeners.size === 0) {
    previousCallback = mapsWindow.gm_authFailure;
    mapsWindow.gm_authFailure = handleAuthFailure;
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (mapsWindow.gm_authFailure === handleAuthFailure) {
        if (previousCallback) mapsWindow.gm_authFailure = previousCallback;
        else delete mapsWindow.gm_authFailure;
      }
      previousCallback = undefined;
    }
  };
}

// Share Google's global authorization event across the campus and picker maps.
// Unsubscribing the last consumer restores any callback installed before ours.
export function useGoogleMapsAuthFailure() {
  return useSyncExternalStore(
    subscribe,
    () => failed,
    () => false,
  );
}

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "kalitedb-dark-mode";

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function applyDarkMode(enabled: boolean) {
  if (enabled) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
}

/** Sayfa yüklendiğinde localStorage'dan dark mode durumunu uygula */
export function initDarkMode() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "true") {
    document.documentElement.classList.add("dark");
  }
}

export function useDarkMode() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot);

  const toggle = useCallback(() => {
    applyDarkMode(!getSnapshot());
  }, []);

  return { isDark, toggle } as const;
}

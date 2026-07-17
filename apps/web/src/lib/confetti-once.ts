const STORAGE_PREFIX = "kalitedb.confettiShown.";

/** localStorage'da kalıcı olarak işaretlenmiş bir konfeti anahtarı daha önce patladı mı? */
export function hasConfettiFired(key: string): boolean {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

export function markConfettiFired(key: string): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, "1");
  } catch {
    // localStorage kullanılamıyorsa (gizli mod vb.) sessizce yut
  }
}

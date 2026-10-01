// Projects are scoped to an anonymous per-browser key. There are no accounts:
// whoever holds the key sees the projects, so the key is only ever shared on
// purpose (the "copy link for another device" flow).

const STORAGE_KEY = "fabware.owner";
const OWNER_PARAM = "owner";
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

// Used for the rest of the session when localStorage is unavailable
// (private mode, blocked site data, sandboxed frames).
let memoryKey: string | null = null;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(key: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Storage unavailable: the in-memory key carries the session.
  }
}

function generateKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // randomUUID is missing on insecure origins. Same shape, same alphabet.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** This browser's owner key, created on first use. Never throws. */
export function getOwnerKey(): string {
  const stored = readStored();
  if (stored) {
    memoryKey = stored;
    return stored;
  }
  if (!memoryKey) memoryKey = generateKey();
  writeStored(memoryKey);
  return memoryKey;
}

/** Take over another browser's key. Malformed keys are ignored. */
export function adoptOwnerKey(key: string): void {
  const trimmed = key.trim();
  if (!KEY_PATTERN.test(trimmed)) return;
  memoryKey = trimmed;
  writeStored(trimmed);
}

/**
 * If the URL carries `?owner=<key>`, adopt it and strip the param so the key
 * does not linger in the address bar or get copied by accident. Other params,
 * the path, and the hash are kept.
 */
export function consumeOwnerParam(): void {
  if (typeof window === "undefined") return;
  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return;
  }
  const key = url.searchParams.get(OWNER_PARAM);
  if (key === null) return;
  adoptOwnerKey(key);
  url.searchParams.delete(OWNER_PARAM);
  try {
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Leaving the param in place is harmless.
  }
}

/** A studio link that opens this browser's projects on another device. */
export function deviceLink(): string {
  const base = import.meta.env.BASE_URL.replace(/^\/+|\/+$/g, "");
  const path = base ? `/${base}/studio` : "/studio";
  return `${window.location.origin}${path}?${OWNER_PARAM}=${encodeURIComponent(getOwnerKey())}`;
}

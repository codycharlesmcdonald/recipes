// Everything the site keeps on the device goes through here. Keys are prefixed "grub.". Each value is stored
// with a format number, so a later version can read it or drop it. A browser with storage switched off still
// works for the visit: what would have been saved is held in memory instead.

export const PREFIX = "grub.";

export function makeStore(backend) {
  const memory = new Map(); // the last value written this visit, as text
  const unsaved = new Set(); // keys whose last write did not reach the backend

  function raw(key) {
    if (!unsaved.has(key)) {
      try {
        const text = backend.getItem(PREFIX + key);
        if (text !== null && text !== undefined) return text;
      } catch { /* storage is off or broken; fall through to memory */ }
    }
    return memory.has(key) ? memory.get(key) : null;
  }

  return {
    get(key, format, fallback) {
      const text = raw(key);
      if (text === null) return fallback;
      try {
        const box = JSON.parse(text);
        if (box && typeof box === "object" && box.v === format && "data" in box) return box.data;
      } catch { /* not ours, or damaged */ }
      return fallback;
    },
    set(key, format, data) {
      const text = JSON.stringify({ v: format, data });
      memory.set(key, text);
      try { backend.setItem(PREFIX + key, text); unsaved.delete(key); return true; }
      catch { unsaved.add(key); return false; }
    },
    remove(key) {
      memory.delete(key);
      try { backend.removeItem(PREFIX + key); unsaved.delete(key); return true; }
      catch { unsaved.add(key); return false; } // stays gone for the visit even if the old value is still stored
    },
    keeps() {
      // true when what the site saves will still be there after the page is closed: a small write goes through
      // right now, and nothing from this visit is still waiting to be written. A write that was refused earlier
      // is tried again first, so once the browser saves again everything from the visit is really kept.
      try {
        for (const key of [...unsaved]) {
          if (memory.has(key)) backend.setItem(PREFIX + key, memory.get(key)); else backend.removeItem(PREFIX + key);
          unsaved.delete(key);
        }
        backend.setItem(PREFIX + "check", "1"); backend.removeItem(PREFIX + "check"); return true;
      } catch { return false; }
    },
  };
}

function deviceStorage() {
  // reading window.localStorage can itself throw when storage is blocked
  try { return window.localStorage; } catch { return null; }
}

const missing = { getItem() { throw new Error("no storage"); }, setItem() { throw new Error("no storage"); }, removeItem() { throw new Error("no storage"); } };

export const store = makeStore(deviceStorage() || missing);

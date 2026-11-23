// Everything the site keeps on the device goes through here. Keys are prefixed "grub.". Each value is stored
// with a format number, so a later version can read it or drop it. A browser with storage switched off still
// works for the visit: what would have been saved is held in memory instead.

export const PREFIX = "grub.";

function unbox(text, format, fallback) {
  // a stored value's data, when it is in the format asked for
  if (text === null || text === undefined) return fallback;
  try {
    const box = JSON.parse(text);
    if (box && typeof box === "object" && box.v === format && "data" in box) return box.data;
  } catch { /* not ours, or damaged */ }
  return fallback;
}

function noRoom(e) {
  // the browser saves things, but this one does not fit in the room left (each browser has its own name for it)
  return Boolean(e) && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014);
}

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
      return unbox(raw(key), format, fallback);
    },
    saved(key, format, fallback) {
      // what the device itself holds, leaving out anything held for this visit only
      let text = null;
      try { text = backend.getItem(PREFIX + key); } catch { /* storage is off */ }
      return unbox(text, format, fallback);
    },
    set(key, format, data) {
      const text = JSON.stringify({ v: format, data });
      memory.set(key, text);
      try { backend.setItem(PREFIX + key, text); unsaved.delete(key); return true; }
      catch { unsaved.add(key); return false; }
    },
    put(key, format, data) {
      // set, for a value that must never be half kept, saying what happened: "kept"; "full" when the browser
      // saves things but refused this one (there is no room left for it), and nothing changed, not even for the
      // visit; "visit" when the browser is not saving anything, so it is held for the visit only.
      // A browser out of room says so by the error's name. That is "full" even when not one more character
      // fits (a draft saved on every key can use up the last of the room), so a value that did not fit is never
      // held for the visit, where a later write would put it over what another tab kept meanwhile.
      const text = JSON.stringify({ v: format, data });
      try { backend.setItem(PREFIX + key, text); memory.set(key, text); unsaved.delete(key); return "kept"; }
      catch (e) { if (noRoom(e)) return "full"; }
      try { backend.setItem(PREFIX + "check", "1"); backend.removeItem(PREFIX + "check"); return "full"; }
      catch { /* storage is off */ }
      memory.set(key, text); unsaved.add(key); return "visit";
    },
    formatOf(key) {
      // the format number a stored value was written in: null when nothing is stored, -1 when it is not ours
      const text = raw(key);
      if (text === null) return null;
      try {
        const box = JSON.parse(text);
        if (box && typeof box === "object" && Number.isInteger(box.v)) return box.v;
      } catch { /* damaged */ }
      return -1;
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

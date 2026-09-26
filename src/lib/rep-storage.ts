"use client";

// The rep on this phone, remembered between visits. Shared by the QR flow and the fit list.
// Only on the rep's own phone (localStorage); nothing here is private office data.

export type SavedRep = {
  id: string | null;
  name: string;
  company: string;
  email: string;
  drugIds?: string[]; // their products, picked once on the fit list
  savedOfficeIds?: string[]; // offices they go back to, pinned at the top of the fit list
};

export const EMPTY_REP: SavedRep = { id: null, name: "", company: "", email: "" };

const REP_KEY = "knock.rep";

export function loadRep(): SavedRep | null {
  try {
    const saved = localStorage.getItem(REP_KEY);
    return saved ? (JSON.parse(saved) as SavedRep) : null;
  } catch {
    return null;
  }
}

export function saveRep(rep: SavedRep | null) {
  try {
    if (rep) localStorage.setItem(REP_KEY, JSON.stringify(rep));
    else localStorage.removeItem(REP_KEY);
  } catch {
    // Private browsing: the rep just types their details again next time.
  }
}

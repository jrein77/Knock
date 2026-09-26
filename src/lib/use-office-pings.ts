"use client";

import { useEffect } from "react";
import { officeChannel } from "./office-channel";
import { supabase } from "./supabase/browser";

// One realtime channel per office, shared by every component on the page.
// (supabase-js returns the same channel for the same name, so components can't each own one.)
const listenersByOffice = new Map<string, Set<() => void>>();

function listenersFor(officeId: string): Set<() => void> {
  let listeners = listenersByOffice.get(officeId);
  if (!listeners) {
    const created = new Set<() => void>();
    listeners = created;
    listenersByOffice.set(officeId, created);
    supabase
      .channel(officeChannel(officeId))
      .on("broadcast", { event: "changed" }, () => created.forEach((listener) => listener()))
      .subscribe();
  }
  return listeners;
}

// Calls `onChange` once now, then every time the server pings this office.
export function useOfficePings(officeId: string, onChange: () => void) {
  useEffect(() => {
    const listeners = listenersFor(officeId);
    listeners.add(onChange);
    onChange();
    return () => {
      listeners.delete(onChange);
    };
  }, [officeId, onChange]);
}

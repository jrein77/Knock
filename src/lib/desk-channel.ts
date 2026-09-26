// The realtime broadcast channel an office's desk listens on for "something changed" pings.
export function deskChannel(officeId: string) {
  return `desk:${officeId}`;
}

// The realtime broadcast channel for one office. The server pings it whenever that
// office's requests or Door Sign change; the ping carries no data.
export function officeChannel(officeId: string) {
  return `office:${officeId}`;
}

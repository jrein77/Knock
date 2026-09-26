// Straight-line distance in miles between two points (the haversine formula).
export function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

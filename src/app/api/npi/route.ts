// Look up an NPI number in the public NPI Registry (CMS) to pre-fill setup.
// Server-side so the browser never talks to a third party. Gives up after 4 seconds;
// setup works fine without it.

const REGISTRY_URL = "https://npiregistry.cms.hhs.gov/api/?version=2.1&number=";

type RegistryResult = {
  enumeration_type: "NPI-1" | "NPI-2";
  basic: { organization_name?: string; first_name?: string; last_name?: string };
  taxonomies?: { desc: string; primary: boolean }[];
  addresses?: {
    address_purpose: string;
    address_1: string;
    city: string;
    state: string;
    postal_code: string;
  }[];
};

// "PEACHTREE FAMILY MEDICINE" -> "Peachtree Family Medicine"
function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export async function GET(request: Request) {
  const number = new URL(request.url).searchParams.get("number") ?? "";
  if (!/^\d{10}$/.test(number)) {
    return Response.json({ error: "An NPI number is 10 digits." }, { status: 400 });
  }

  let result: RegistryResult | undefined;
  try {
    const response = await fetch(REGISTRY_URL + number, { signal: AbortSignal.timeout(4000) });
    const data = await response.json();
    result = data.results?.[0];
  } catch {
    return Response.json({ error: "The NPI Registry didn't answer. You can type it in." }, { status: 502 });
  }
  if (!result) {
    return Response.json({ error: "No match for that NPI number." }, { status: 404 });
  }

  const { basic } = result;
  const name =
    result.enumeration_type === "NPI-2"
      ? titleCase(basic.organization_name ?? "")
      : `Dr. ${titleCase(`${basic.first_name ?? ""} ${basic.last_name ?? ""}`.trim())}`;
  const specialty =
    result.taxonomies?.find((t) => t.primary)?.desc ?? result.taxonomies?.[0]?.desc ?? null;
  const location =
    result.addresses?.find((a) => a.address_purpose === "LOCATION") ?? result.addresses?.[0];
  const address = location
    ? `${titleCase(location.address_1)}, ${titleCase(location.city)}, ${location.state} ${location.postal_code.slice(0, 5)}`
    : null;

  return Response.json({ npi: number, name, specialty, address });
}

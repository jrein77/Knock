import QRCode from "qrcode";

// A QR code for `url`, drawn as an SVG on the server. Scales to its container.
export async function QrCode({ url, className = "" }: { url: string; className?: string }) {
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return (
    <div
      role="img"
      aria-label={`QR code for ${url}`}
      className={`[&>svg]:h-auto [&>svg]:w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

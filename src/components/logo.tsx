// The Knock wordmark: "Knock" with three strokes coming off the "k", like a knock on a door.
// Drawn in the current text color, so it works on any background.
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 190" role="img" aria-label="Knock" className={className}>
      <text
        x="4"
        y="170"
        fill="currentColor"
        fontFamily="var(--font-geist-sans), Arial, sans-serif"
        fontSize="160"
        fontWeight="800"
        letterSpacing="-7"
      >
        Knock
      </text>
      {/* Three strokes fanning out from the corner of the "k". */}
      <g stroke="currentColor" strokeWidth="16" strokeLinecap="round">
        <line x1="477" y1="55" x2="486" y2="12" />
        <line x1="495" y1="65" x2="528" y2="36" />
        <line x1="504" y1="83" x2="547" y2="77" />
      </g>
    </svg>
  );
}

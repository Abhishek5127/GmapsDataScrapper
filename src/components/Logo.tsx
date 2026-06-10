/**
 * App logo — the MapHarvest app icon, shared with the extension icon & favicon.
 * Sourced from public/icons (downsized from app-icon-source.png).
 */
export function Logo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/icons/icon128.png"
      alt="MapHarvest"
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

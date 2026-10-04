import { useId } from 'react';

/** The SaveSmart mark: a cart carrying a ₹, with a savings check. Same drawing as /icon.svg. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="SaveSmart">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10B981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
      <path d="M10 17h6l4.5 22h24.5l4.5-16H18.5" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="47" r="3.6" fill="#fff" />
      <circle cx="41" cy="47" r="3.6" fill="#fff" />
      <path d="M28.6 27.2h9.2M28.6 30.3h9.2M31 27.2c4.3 0 4.3 6.3 0 6.3h-1.8l5.4 3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="13" r="8.5" fill="#FBBF24" />
      <path d="M46.2 13.2l2.7 2.7 5-5.4" fill="none" stroke="#064E3B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Full logo: mark + wordmark. */
export function Logo({ size = 32, showTagline = false }: { size?: number; showTagline?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="font-extrabold tracking-tight" style={{ fontSize: size * 0.62 }}>
          Save<span className="text-brand">Smart</span>
        </span>
        {showTagline && <span className="mt-1 text-[11px] font-medium text-muted">Shop smarter. Save more.</span>}
      </span>
    </span>
  );
}

import { useId } from "react";

export function AppStoreMark({ className }: { className?: string }) {
  const id = useId();
  const g = `${id}-as`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={g} x1="6" y1="2" x2="26" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5AC8FA" />
          <stop offset=".45" stopColor="#1A73E8" />
          <stop offset="1" stopColor="#0A4CDB" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${g})`} />
      <path
        fill="#fff"
        d="M16 7.2 13.4 12.2 16 16.8l2.6-4.6L16 7.2zm-6.4 1.4 2.2-.1 7.1 12.7h-4.4L9.6 8.6zm12.8 0L17.5 21.2h4.4l4.5-12.7-4z"
      />
      <path fill="#fff" opacity=".92" d="M8.4 22.4h15.2l1.1 2.2H7.3z" />
    </svg>
  );
}

export function PlayStoreMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0F172A" />
      <path fill="#EA4335" d="M8.2 6.4 19.6 16 8.2 25.6V6.4z" />
      <path fill="#FBBC04" d="M19.6 16 8.2 25.6l13.2-3.4L19.6 16z" />
      <path fill="#34A853" d="M24.8 18.2 19.6 16l-11.4 9.6 16.6-7.4z" />
      <path fill="#4285F4" d="M8.2 6.4 19.6 16l5.2-2.2L8.2 6.4z" />
      <path fill="#fff" d="M10.1 9.2v13.6L21.4 16 10.1 9.2z" opacity=".15" />
    </svg>
  );
}

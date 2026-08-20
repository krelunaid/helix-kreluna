/** Official-style store badges (Apple / Google marketing marks). */

export function AppStoreMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 135 40" className={className} role="img" aria-label="App Store">
      <rect width="135" height="40" rx="6" fill="#000" />
      <path
        fill="#fff"
        d="M19.6 8.4c1.05-1.27 1.76-3.04 1.56-4.8-1.51.06-3.33 1-4.41 2.28-1 .1.15 2.94-1.59 4.67 1.68.13 3.4-.85 4.44-2.15zm.16 2.02c-2.5-.15-4.62 1.41-5.81 1.41-1.2 0-3.04-1.34-5.01-1.3-2.58.04-4.96 1.5-6.28 3.81-2.68 4.65-.69 11.53 1.92 15.31 1.27 1.85 2.79 3.92 4.78 3.85 1.91-.08 2.64-1.24 4.95-1.24s2.96 1.24 5 1.2c2.07-.03 3.38-1.88 4.64-3.74 1.46-2.13 2.06-4.2 2.09-4.3-.05-.02-4.02-1.54-4.06-6.11-.03-3.83 3.13-5.66 3.27-5.75-1.79-2.63-4.56-2.92-5.49-2.99z"
      />
      <text x="34" y="15" fill="#fff" fontFamily="system-ui, -apple-system, sans-serif" fontSize="8" letterSpacing=".3">
        Download on the
      </text>
      <text x="34" y="30" fill="#fff" fontFamily="system-ui, -apple-system, sans-serif" fontSize="16" fontWeight="600">
        App Store
      </text>
    </svg>
  );
}

export function PlayStoreMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 135 40" className={className} role="img" aria-label="Google Play">
      <rect width="135" height="40" rx="6" fill="#000" />
      <path fill="#EA4335" d="M9.2 8.1 20.1 20 9.2 31.9V8.1z" />
      <path fill="#FBBC04" d="M20.1 20 9.2 31.9l12.4-3.2L20.1 20z" />
      <path fill="#34A853" d="m24.9 22.1-4.8-2.1-10.9 9.9 15.7-7.8z" />
      <path fill="#4285F4" d="M9.2 8.1 20.1 20l4.8-2.1L9.2 8.1z" />
      <text x="34" y="15" fill="#fff" fontFamily="system-ui, Roboto, sans-serif" fontSize="7" letterSpacing=".8">
        GET IT ON
      </text>
      <text x="34" y="30" fill="#fff" fontFamily="system-ui, Roboto, sans-serif" fontSize="15" fontWeight="500">
        Google Play
      </text>
    </svg>
  );
}

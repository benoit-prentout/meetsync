interface MeetSyncMarkProps {
  size?: number;
  className?: string;
}

export function MeetSyncMark({ size = 24, className }: MeetSyncMarkProps) {
  const radius = Math.round(size * 0.22);
  const glyphSize = Math.round(size * 0.62);
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: 'linear-gradient(135deg, #1a73e8 0%, #4285f4 60%, #34a853 140%)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width={glyphSize}
        height={glyphSize}
        viewBox="0 0 24 24"
        fill="white"
        aria-hidden="true"
      >
        <path d="M15 8v8H5V8h10m1-2H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4V7c0-.55-.45-1-1-1z" />
      </svg>
    </div>
  );
}

export function VesperMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`vesper-lockup ${compact ? "compact" : ""}`}
      aria-label="VesperFrame"
    >
      <span className="vesper-symbol" aria-hidden="true">
        <i />
        <b>V</b>
      </span>
      {!compact && <span>VesperFrame</span>}
    </span>
  );
}

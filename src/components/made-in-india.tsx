/** "Made in India" mark with a small inline tricolour flag (no emoji dependency, renders on every OS). */
export function MadeInIndia({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`} data-testid="made-in-india">
      <svg width="16" height="11" viewBox="0 0 16 11" role="img" aria-label="Flag of India" className="rounded-[2px] shadow-[0_0_0_0.5px_rgba(0,0,0,0.25)]">
        <rect width="16" height="3.67" fill="#FF9933" />
        <rect y="3.67" width="16" height="3.66" fill="#FFFFFF" />
        <rect y="7.33" width="16" height="3.67" fill="#138808" />
        <circle cx="8" cy="5.5" r="1.35" fill="none" stroke="#000080" strokeWidth="0.45" />
        <circle cx="8" cy="5.5" r="0.25" fill="#000080" />
      </svg>
      <span>Made in India</span>
    </span>
  )
}

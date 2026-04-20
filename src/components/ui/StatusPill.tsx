type StatusPillProps = {
  label: string
  tone?: 'warning' | 'success'
}

export function StatusPill({
  label,
  tone = 'warning',
}: StatusPillProps) {
  return <span className={`status-pill status-pill--${tone}`}>{label}</span>
}

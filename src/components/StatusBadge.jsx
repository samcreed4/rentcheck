import { REQUEST_STATUSES } from '../utils/categories'

export default function StatusBadge({ status }) {
  const info = REQUEST_STATUSES[status] ?? { label: status, className: 'bg-slate-100 text-slate-700' }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${info.className}`}
    >
      {info.label}
    </span>
  )
}

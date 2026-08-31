import { formatDateTime } from '../utils/formatDate'

const EVENT_ICONS = {
  submitted: '📝',
  landlord_notified: '📧',
  sms_sent: '📱',
  status_changed: '🔄',
  rated: '⭐',
  default: '•',
}

export default function Timeline({ events }) {
  if (!events?.length) {
    return <p className="text-sm text-slate-400">No activity yet.</p>
  }

  return (
    <ol className="relative border-l-2 border-slate-100 pl-5">
      {events.map((event) => (
        <li key={event.id} className="mb-6 last:mb-0">
          <span className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm ring-2 ring-slate-100">
            {EVENT_ICONS[event.event_type] ?? EVENT_ICONS.default}
          </span>
          <p className="text-sm font-medium text-slate-800">{event.message}</p>
          <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(event.created_at)}</p>
        </li>
      ))}
    </ol>
  )
}

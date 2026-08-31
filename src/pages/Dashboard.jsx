import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import Spinner from '../components/Spinner'
import { formatDateTime } from '../utils/formatDate'

export default function Dashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [hasProperty, setHasProperty] = useState(true)
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      const { data: property } = await supabase
        .from('properties')
        .select('id')
        .eq('renter_id', user.id)
        .maybeSingle()

      if (!active) return

      if (!property) {
        setHasProperty(false)
        setLoading(false)
        return
      }

      const { data, error: requestsError } = await supabase
        .from('maintenance_requests')
        .select('id, category, description, status, photo_url, created_at, resolved_at')
        .eq('renter_id', user.id)
        .order('created_at', { ascending: false })

      if (!active) return

      if (requestsError) {
        setError(requestsError.message)
      } else {
        setRequests(data ?? [])
      }
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [user.id])

  const filtered = requests.filter((r) => filter === 'all' || r.status === filter)

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-brand-600">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!hasProperty) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <h2 className="text-lg font-bold text-slate-900">Welcome to RentCheck</h2>
        <p className="mt-2 text-sm text-slate-500">
          Add your address and landlord contact info to start submitting maintenance requests.
        </p>
        <Link to="/onboarding" className="btn-primary mt-5 inline-flex">
          Get started
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Your requests</h1>
          <p className="mt-1 text-sm text-slate-500">Track every maintenance request and its status.</p>
        </div>
        <Link to="/requests/new" className="btn-primary shrink-0">
          + New request
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          ['all', 'All'],
          ['submitted', 'Submitted'],
          ['in_progress', 'In Progress'],
          ['resolved', 'Resolved'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === value
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          No requests {filter !== 'all' ? `with status "${filter.replace('_', ' ')}"` : 'yet'}.
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((request) => (
            <li key={request.id}>
              <Link
                to={`/requests/${request.id}`}
                className="card flex items-center gap-4 p-4 transition-shadow hover:shadow-md"
              >
                {request.photo_url ? (
                  <img
                    src={request.photo_url}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
                      <path
                        d="M4 7h3l2-2h6l2 2h3v12H4V7Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-slate-900">{request.category}</h3>
                    <StatusBadge status={request.status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-500">{request.description}</p>
                  <p className="mt-1 text-xs text-slate-400">Submitted {formatDateTime(request.created_at)}</p>
                </div>

                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-slate-300">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

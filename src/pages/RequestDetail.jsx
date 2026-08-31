import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import Timeline from '../components/Timeline'
import StarRating from '../components/StarRating'
import Spinner from '../components/Spinner'
import { formatDateTime } from '../utils/formatDate'

export default function RequestDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [request, setRequest] = useState(null)
  const [landlord, setLandlord] = useState(null)
  const [events, setEvents] = useState([])
  const [rating, setRating] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resolving, setResolving] = useState(false)

  const [ratingValue, setRatingValue] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)

  const load = useCallback(async () => {
    setError('')

    const { data: requestData, error: requestError } = await supabase
      .from('maintenance_requests')
      .select(
        'id, category, description, photo_url, status, created_at, resolved_at, property_id, property:properties ( landlords ( id, name, email, phone ) )',
      )
      .eq('id', id)
      .eq('renter_id', user.id)
      .single()

    if (requestError) {
      setError('Request not found.')
      setLoading(false)
      return
    }

    setRequest(requestData)
    const landlordData = Array.isArray(requestData.property?.landlords)
      ? requestData.property.landlords[0]
      : requestData.property?.landlords
    setLandlord(landlordData ?? null)

    const [{ data: eventsData }, { data: ratingData }] = await Promise.all([
      supabase
        .from('request_events')
        .select('id, event_type, message, created_at')
        .eq('request_id', id)
        .order('created_at', { ascending: true }),
      supabase.from('ratings').select('id, rating, comment, created_at').eq('request_id', id).maybeSingle(),
    ])

    setEvents(eventsData ?? [])
    setRating(ratingData ?? null)
    setLoading(false)
  }, [id, user.id])

  useEffect(() => {
    load()
  }, [load])

  async function handleMarkResolved() {
    setResolving(true)
    setError('')
    const { error: updateError } = await supabase
      .from('maintenance_requests')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id)
    setResolving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    load()
  }

  async function handleSubmitRating(e) {
    e.preventDefault()
    if (!landlord) {
      setError('No landlord is on file for this request yet — add one in Property & Landlord first.')
      return
    }
    if (!ratingValue) {
      setError('Select a star rating first.')
      return
    }
    setSubmittingRating(true)
    setError('')

    const { error: ratingError } = await supabase.from('ratings').insert({
      request_id: id,
      landlord_id: landlord.id,
      renter_id: user.id,
      rating: ratingValue,
      comment: ratingComment.trim() || null,
    })

    setSubmittingRating(false)

    if (ratingError) {
      setError(ratingError.message)
      return
    }

    load()
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-brand-600">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (error && !request) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <p className="text-slate-600">{error}</p>
        <button onClick={() => navigate('/')} className="btn-secondary mt-4 inline-flex">
          Back to requests
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Back to requests
      </Link>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{request.category}</h1>
            <p className="mt-1 text-xs text-slate-400">Submitted {formatDateTime(request.created_at)}</p>
          </div>
          <StatusBadge status={request.status} />
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{request.description}</p>

        {request.photo_url && (
          <img
            src={request.photo_url}
            alt="Maintenance request"
            className="mt-4 max-h-96 w-full rounded-lg object-cover"
          />
        )}

        {landlord && (
          <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">Landlord:</span> {landlord.name} &middot; {landlord.email}
            {landlord.phone ? ` · ${landlord.phone}` : ''}
          </div>
        )}

        {request.status !== 'resolved' && (
          <button onClick={handleMarkResolved} disabled={resolving} className="btn-primary mt-5">
            {resolving && <Spinner className="h-4 w-4" />}
            Mark as resolved
          </button>
        )}
      </div>

      {request.status === 'resolved' && (
        <div className="card mt-4 p-6">
          <h2 className="text-sm font-bold text-slate-900">Rate your landlord</h2>
          {rating ? (
            <div className="mt-3">
              <StarRating value={rating.rating} readOnly />
              {rating.comment && <p className="mt-2 text-sm text-slate-600">{rating.comment}</p>}
              <p className="mt-1 text-xs text-slate-400">Rated {formatDateTime(rating.created_at)}</p>
            </div>
          ) : !landlord ? (
            <p className="mt-3 text-sm text-slate-500">
              No landlord is on file for this request yet — add one in Property &amp; Landlord to rate them.
            </p>
          ) : (
            <form onSubmit={handleSubmitRating} className="mt-3 space-y-3">
              <StarRating value={ratingValue} onChange={setRatingValue} />
              <textarea
                className="input"
                rows={3}
                placeholder="Optional comment about how this request was handled"
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
              />
              <button type="submit" disabled={submittingRating} className="btn-primary">
                {submittingRating && <Spinner className="h-4 w-4" />}
                Submit rating
              </button>
            </form>
          )}
        </div>
      )}

      <div className="card mt-4 p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-900">Timeline</h2>
        <Timeline events={events} />
      </div>
    </div>
  )
}

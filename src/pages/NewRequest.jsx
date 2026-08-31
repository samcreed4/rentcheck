import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, PHOTO_BUCKET } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { REQUEST_CATEGORIES } from '../utils/categories'
import Spinner from '../components/Spinner'

export default function NewRequest() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [propertyId, setPropertyId] = useState(null)
  const [checking, setChecking] = useState(true)
  const [category, setCategory] = useState(REQUEST_CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadProperty() {
      const { data } = await supabase
        .from('properties')
        .select('id')
        .eq('renter_id', user.id)
        .maybeSingle()
      if (active) {
        setPropertyId(data?.id ?? null)
        setChecking(false)
      }
    }
    loadProperty()
    return () => {
      active = false
    }
  }, [user.id])

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) {
      setPhotoFile(null)
      setPhotoPreview(null)
      return
    }
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!propertyId) {
      setError('Add your address and landlord info before submitting a request.')
      return
    }
    if (!description.trim()) {
      setError('Please describe the issue.')
      return
    }

    setSubmitting(true)

    try {
      let photoUrl = null

      if (photoFile) {
        const ext = photoFile.name.split('.').pop()
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, photoFile, { cacheControl: '3600', upsert: false })

        if (uploadError) throw uploadError

        const { data: publicUrlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
        photoUrl = publicUrlData.publicUrl
      }

      const { data: request, error: insertError } = await supabase
        .from('maintenance_requests')
        .insert({
          renter_id: user.id,
          property_id: propertyId,
          category,
          description: description.trim(),
          photo_url: photoUrl,
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Notifying the landlord happens server-side now: a Supabase Database
      // Webhook (see supabase/migrations/0005_notify_landlord_webhook.sql)
      // calls the notify-landlord edge function whenever a row lands in
      // maintenance_requests, so it fires reliably even if the renter closes
      // this tab immediately. Don't also call it from here — that would
      // text the landlord twice.

      navigate(`/requests/${request.id}`, { replace: true })
    } catch (err) {
      setError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-brand-600">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!propertyId) {
    return (
      <div className="card mx-auto max-w-xl p-6 text-center">
        <p className="text-slate-600">Add your address and landlord info before submitting a request.</p>
        <Link to="/onboarding" className="btn-primary mt-4 inline-flex">
          Add property details
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">New maintenance request</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your landlord will get a text message once this is submitted.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5 p-6">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <select
            id="category"
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {REQUEST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            required
            rows={5}
            className="input"
            placeholder="Describe the issue in detail — what's wrong, where it is, and when it started."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="photo">
            Photo (optional)
          </label>
          <input
            id="photo"
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
          />
          {photoPreview && (
            <img
              src={photoPreview}
              alt="Selected photo preview"
              className="mt-3 h-40 w-full rounded-lg object-cover"
            />
          )}
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting && <Spinner className="h-4 w-4" />}
          Submit request
        </button>
      </form>
    </div>
  )
}

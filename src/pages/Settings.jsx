import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'

export default function Settings() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [propertyId, setPropertyId] = useState(null)
  const [landlordId, setLandlordId] = useState(null)
  const [form, setForm] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      const { data: property, error: propertyError } = await supabase
        .from('properties')
        .select('id, address_line1, address_line2, city, state, postal_code, landlords ( id, name, email, phone )')
        .eq('renter_id', user.id)
        .maybeSingle()

      if (!active) return

      if (propertyError) {
        setError(propertyError.message)
        setLoading(false)
        return
      }

      if (!property) {
        setForm(null)
        setLoading(false)
        return
      }

      const landlord = Array.isArray(property.landlords) ? property.landlords[0] : property.landlords

      setPropertyId(property.id)
      setLandlordId(landlord?.id ?? null)
      setForm({
        addressLine1: property.address_line1 ?? '',
        addressLine2: property.address_line2 ?? '',
        city: property.city ?? '',
        state: property.state ?? '',
        postalCode: property.postal_code ?? '',
        landlordName: landlord?.name ?? '',
        landlordEmail: landlord?.email ?? '',
        landlordPhone: landlord?.phone ?? '',
        // Not persisted anywhere yet, so this always starts unchecked —
        // re-confirm consent any time the landlord phone number is saved.
        landlordSmsConsent: false,
      })
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [user.id])

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (form.landlordPhone && !form.landlordSmsConsent) {
      setError(
        'Please confirm your landlord has agreed to receive text notifications, or leave the phone field blank.',
      )
      return
    }

    setSaving(true)

    const { error: propertyError } = await supabase
      .from('properties')
      .update({
        address_line1: form.addressLine1,
        address_line2: form.addressLine2 || null,
        city: form.city,
        state: form.state,
        postal_code: form.postalCode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', propertyId)

    if (propertyError) {
      setSaving(false)
      setError(propertyError.message)
      return
    }

    // If an earlier onboarding attempt saved the property but failed before
    // creating a landlord row (e.g. the RLS issue this app can hit), there
    // may be no landlord row yet — insert one instead of updating.
    const { data: landlordRow, error: landlordError } = landlordId
      ? await supabase
          .from('landlords')
          .update({
            name: form.landlordName,
            email: form.landlordEmail,
            phone: form.landlordPhone || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', landlordId)
          .select()
          .single()
      : await supabase
          .from('landlords')
          .insert({
            property_id: propertyId,
            name: form.landlordName,
            email: form.landlordEmail,
            phone: form.landlordPhone || null,
          })
          .select()
          .single()

    setSaving(false)

    if (landlordError) {
      setError(landlordError.message)
      return
    }

    setLandlordId(landlordRow.id)
    setSuccess('Saved.')
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-brand-600">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!form) {
    return (
      <div className="card mx-auto max-w-xl p-6 text-center">
        <p className="text-slate-600">You haven&apos;t added your address and landlord info yet.</p>
        <Link to="/onboarding" className="btn-primary mt-4 inline-flex">
          Add property details
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Property &amp; Landlord</h1>
        <p className="mt-1 text-sm text-slate-500">Update your address and landlord contact info.</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6 p-6">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
            {success}
          </div>
        )}

        <fieldset className="space-y-4">
          <legend className="text-sm font-bold text-slate-900">Your address</legend>

          <div>
            <label className="label" htmlFor="addressLine1">
              Address line 1
            </label>
            <input
              id="addressLine1"
              required
              className="input"
              value={form.addressLine1}
              onChange={update('addressLine1')}
            />
          </div>

          <div>
            <label className="label" htmlFor="addressLine2">
              Address line 2 (optional)
            </label>
            <input
              id="addressLine2"
              className="input"
              value={form.addressLine2}
              onChange={update('addressLine2')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="city">
                City
              </label>
              <input id="city" required className="input" value={form.city} onChange={update('city')} />
            </div>
            <div>
              <label className="label" htmlFor="state">
                State
              </label>
              <input id="state" required className="input" value={form.state} onChange={update('state')} />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="postalCode">
              ZIP / Postal code
            </label>
            <input
              id="postalCode"
              required
              className="input"
              value={form.postalCode}
              onChange={update('postalCode')}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-slate-100 pt-6">
          <legend className="text-sm font-bold text-slate-900">Landlord contact</legend>

          <div>
            <label className="label" htmlFor="landlordName">
              Landlord / property manager name
            </label>
            <input
              id="landlordName"
              required
              className="input"
              value={form.landlordName}
              onChange={update('landlordName')}
            />
          </div>

          <div>
            <label className="label" htmlFor="landlordEmail">
              Landlord email
            </label>
            <input
              id="landlordEmail"
              type="email"
              required
              className="input"
              value={form.landlordEmail}
              onChange={update('landlordEmail')}
            />
          </div>

          <div>
            <label className="label" htmlFor="landlordPhone">
              Landlord phone (optional)
            </label>
            <input
              id="landlordPhone"
              type="tel"
              className="input"
              value={form.landlordPhone}
              onChange={update('landlordPhone')}
            />
            <p className="mt-1 text-xs text-slate-400">
              We'll text this number when you submit a maintenance request.
            </p>
          </div>

          {form.landlordPhone && (
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
              <input
                id="landlordSmsConsent"
                type="checkbox"
                required
                checked={form.landlordSmsConsent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, landlordSmsConsent: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="landlordSmsConsent" className="text-xs text-slate-600">
                I confirm my landlord has agreed to receive text message notifications from
                RentCheck about the maintenance requests I submit.
              </label>
            </div>
          )}
        </fieldset>

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving && <Spinner className="h-4 w-4" />}
          Save changes
        </button>
      </form>
    </div>
  )
}

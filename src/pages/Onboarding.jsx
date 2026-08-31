import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'

const emptyForm = {
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  landlordName: '',
  landlordEmail: '',
  landlordPhone: '',
}

export default function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyForm)
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function checkExisting() {
      const { data, error: checkError } = await supabase
        .from('properties')
        .select('id')
        .eq('renter_id', user.id)
        .maybeSingle()

      if (!active) return

      if (checkError) {
        // Don't silently fall through to an empty form when this query
        // fails (e.g. an RLS/permissions misconfiguration) — that's what
        // makes the app look like it's "looping" back to onboarding: the
        // form re-submits, the insert fails the same way, and nothing is
        // ever saved. Surface it instead.
        setError(
          `Couldn't check your existing property (${checkError.message}). ` +
            'This usually means a Supabase row-level security policy or table ' +
            'permission needs fixing — see supabase/migrations/0002_fix_rls_policies.sql.',
        )
        setChecking(false)
        return
      }

      if (data) {
        navigate('/settings', { replace: true })
        return
      }

      setChecking(false)
    }
    checkExisting()
    return () => {
      active = false
    }
  }, [user.id, navigate])

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .insert({
        renter_id: user.id,
        address_line1: form.addressLine1,
        address_line2: form.addressLine2 || null,
        city: form.city,
        state: form.state,
        postal_code: form.postalCode,
      })
      .select()
      .single()

    if (propertyError) {
      setSaving(false)
      setError(propertyError.message)
      return
    }

    const { error: landlordError } = await supabase.from('landlords').insert({
      property_id: property.id,
      name: form.landlordName,
      email: form.landlordEmail,
      phone: form.landlordPhone || null,
    })

    setSaving(false)

    if (landlordError) {
      setError(landlordError.message)
      return
    }

    navigate('/', { replace: true })
  }

  if (checking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-brand-600">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Set up your rental</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add your address and landlord contact info. You can update these later in Property &amp; Landlord.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6 p-6">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
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
              placeholder="123 Main St, Apt 4B"
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
              placeholder="landlord@example.com"
            />
            <p className="mt-1 text-xs text-slate-400">
              Maintenance request notifications are sent to this address.
            </p>
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
          </div>
        </fieldset>

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving && <Spinner className="h-4 w-4" />}
          Save and continue
        </button>
      </form>
    </div>
  )
}

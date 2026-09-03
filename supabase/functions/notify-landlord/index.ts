// Supabase Edge Function: notify-landlord
//
// Fired by a Supabase Database Webhook (see supabase/migrations/0005_notify_landlord_webhook.sql)
// right after a new row is inserted into maintenance_requests — server-side,
// so it fires reliably regardless of what the client does. It looks up the
// request, property, and landlord contact info, then:
//   - sends the landlord a real SMS via Twilio (property address, category,
//     description, and a timestamp)
//   - logs a "would send" email (still a stub — see the "SEND EMAIL HERE"
//     section below to wire up a real provider)
// and records a timeline event for each on the request.
//
// This function has verify_jwt = false (see supabase/config.toml) because a
// Database Webhook call doesn't carry a user JWT — it's a server-to-server
// call from Supabase's infra. That means this HTTP endpoint is otherwise
// unauthenticated, so it checks its own shared secret instead (see
// WEBHOOK_SECRET below) to stop random internet requests from triggering
// (and billing for) real text messages.
//
// Required secrets (set these, don't put them in the frontend .env — see
// the "Deploy" section below):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_PHONE_NUMBER   (the Twilio number texts are sent FROM, E.164
//                          format, e.g. +17372324091)
//   WEBHOOK_SECRET         (any random string; must match the
//                          x-webhook-secret header the DB webhook sends —
//                          see the migration file for how that's wired up)
//
// Deploy with:
//   supabase functions deploy notify-landlord
//   supabase secrets set TWILIO_ACCOUNT_SID=xxx TWILIO_AUTH_TOKEN=xxx TWILIO_PHONE_NUMBER=+1xxxxxxxxxx WEBHOOK_SECRET=xxx
//
// Accepts either payload shape:
//   { request_id: "..." }                                   (manual/testing call)
//   { type: "INSERT", table: "...", record: { id: "..." } }  (Database Webhook payload)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')

// Best-effort normalization to E.164. Landlord phone numbers are entered
// as free text in the app (e.g. "(555) 123-4567"), but Twilio requires
// E.164 (e.g. "+15551234567"). This assumes US/Canada numbers when no
// country code is present — adjust if your landlords are elsewhere.
function toE164(rawPhone: string): string | null {
  const digits = rawPhone.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

async function sendSms(to: string, body: string): Promise<{ ok: boolean; detail: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    return { ok: false, detail: 'Twilio secrets are not configured on this project.' }
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: TWILIO_PHONE_NUMBER, Body: body }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return { ok: false, detail: `Twilio error (${res.status}): ${errText}` }
  }

  return { ok: true, detail: 'sent' }
}

// This is a Supabase Edge Function's standard entrypoint signature.
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify the shared secret if one is configured. Without WEBHOOK_SECRET
  // set, this is skipped (so the function still works before you've set it
  // up) — but you should set one before relying on this in production.
  if (WEBHOOK_SECRET) {
    const provided = req.headers.get('x-webhook-secret')
    if (provided !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } else {
    console.warn('[notify-landlord] WEBHOOK_SECRET is not set — this endpoint is unauthenticated.')
  }

  try {
    const payload = await req.json()
    const requestId = payload.request_id ?? payload.record?.id

    if (!requestId) {
      return new Response(JSON.stringify({ error: 'request_id (or record.id) is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Service-role client: bypasses RLS so the function can read/write
    // across the renter's + landlord's rows on their behalf.
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: request, error: requestError } = await supabase
      .from('maintenance_requests')
      .select(
        `
        id,
        category,
        description,
        photo_url,
        created_at,
        property:properties (
          address_line1,
          address_line2,
          city,
          state,
          postal_code,
          landlords ( name, email, phone )
        ),
        renter:profiles ( full_name, email )
      `,
      )
      .eq('id', requestId)
      .single()

    if (requestError || !request) {
      throw requestError ?? new Error('Request not found')
    }

    const landlord = request.property?.landlords?.[0] ?? request.property?.landlords
    const address = [
      request.property?.address_line1,
      request.property?.address_line2,
      [request.property?.city, request.property?.state].filter(Boolean).join(', '),
      request.property?.postal_code,
    ]
      .filter(Boolean)
      .join(', ')

    const submittedAt = new Date(request.created_at).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    // ------------------------------------------------------------------
    // SMS via Twilio
    // ------------------------------------------------------------------
    const smsBody =
      `RentCheck: New maintenance request at ${address}.\n` +
      `Category: ${request.category}\n` +
      `Description: ${request.description}\n` +
      `Submitted: ${submittedAt}\n` +
      `Reply STOP to opt out, HELP for help.`

    let smsResult: { ok: boolean; detail: string }

    if (!landlord?.phone) {
      smsResult = { ok: false, detail: 'no landlord phone number on file' }
    } else {
      const toNumber = toE164(landlord.phone)
      if (!toNumber) {
        smsResult = { ok: false, detail: `landlord phone "${landlord.phone}" isn't a recognizable number` }
      } else {
        smsResult = await sendSms(toNumber, smsBody)
      }
    }

    await supabase.from('request_events').insert({
      request_id: requestId,
      event_type: 'sms_sent',
      message: smsResult.ok
        ? `Landlord texted at ${landlord.phone}.`
        : `Landlord text not sent: ${smsResult.detail}`,
    })

    // ------------------------------------------------------------------
    // SEND EMAIL HERE
    // ------------------------------------------------------------------
    // This part is still a stub — it does not call a real email provider.
    // Swap this block for a real API call once you've picked a provider,
    // e.g. Resend:
    //
    //   const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
    //   const res = await fetch('https://api.resend.com/emails', {
    //     method: 'POST',
    //     headers: {
    //       Authorization: `Bearer ${RESEND_API_KEY}`,
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify({
    //       from: 'RentCheck <notifications@yourdomain.com>',
    //       to: emailPayload.to,
    //       subject: emailPayload.subject,
    //       text: emailPayload.body,
    //     }),
    //   })
    //   if (!res.ok) throw new Error(`Resend error: ${await res.text()}`)
    //
    // Set RESEND_API_KEY (or your provider's key) with:
    //   supabase secrets set RESEND_API_KEY=your-key
    // ------------------------------------------------------------------
    const emailPayload = {
      to: landlord?.email,
      subject: `New maintenance request: ${request.category}`,
      body:
        `${request.renter?.full_name ?? request.renter?.email} submitted a new ` +
        `maintenance request for ${address}.\n\n` +
        `Category: ${request.category}\n` +
        `Description: ${request.description}\n` +
        `Submitted: ${submittedAt}\n` +
        (request.photo_url ? `Photo: ${request.photo_url}\n` : ''),
    }
    console.log('[notify-landlord] Would send email:', emailPayload)

    const emailNotified = Boolean(landlord?.email)

    await supabase.from('request_events').insert({
      request_id: requestId,
      event_type: 'landlord_notified',
      message: emailNotified
        ? `Landlord notified at ${landlord.email} (email sending not yet configured).`
        : 'Landlord email notification skipped: no landlord email on file.',
    })

    return new Response(
      JSON.stringify({ ok: true, sms: smsResult, emailNotified, email: emailPayload }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[notify-landlord] error', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

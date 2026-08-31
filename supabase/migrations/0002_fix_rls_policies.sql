-- RentCheck: fix RLS policies on properties/landlords (and related tables)
--
-- Symptom this fixes: onboarding form insert fails with 400/403 errors on
-- /rest/v1/properties and /rest/v1/landlords, so the app never records a
-- property and keeps bouncing the renter back to the onboarding form.
--
-- Root cause: the live policies on these tables reference a column that
-- doesn't exist on them (commonly `user_id`, e.g. from Supabase's default
-- "authenticated users can CRUD their own rows" policy template), while the
-- actual column is `properties.renter_id`. Referencing a missing column in
-- a policy makes Postgres throw an "undefined_column" error, which
-- PostgREST surfaces as 400s and 403s depending on the operation.
--
-- This migration removes every existing policy on the affected tables
-- (whatever they're currently named) and recreates the correct ones, then
-- asks PostgREST to reload its schema cache. Safe to run multiple times.

-- 1. Drop all existing policies on the affected tables, regardless of name.
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'properties',
        'landlords',
        'maintenance_requests',
        'request_events',
        'ratings'
      )
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- 2. Recreate the correct policies, explicitly using the real columns.

-- properties.renter_id -> auth.uid()
create policy "Renters manage their own property"
  on public.properties for all
  using (auth.uid() = renter_id)
  with check (auth.uid() = renter_id);

-- landlords has no renter_id/user_id of its own; ownership is via its
-- parent property.
create policy "Renters manage their own landlord contact"
  on public.landlords for all
  using (
    exists (
      select 1 from public.properties p
      where p.id = landlords.property_id and p.renter_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.properties p
      where p.id = landlords.property_id and p.renter_id = auth.uid()
    )
  );

create policy "Renters manage their own requests"
  on public.maintenance_requests for all
  using (auth.uid() = renter_id)
  with check (auth.uid() = renter_id);

create policy "Renters view events for their own requests"
  on public.request_events for select
  using (
    exists (
      select 1 from public.maintenance_requests r
      where r.id = request_events.request_id and r.renter_id = auth.uid()
    )
  );

create policy "Renters insert events for their own requests"
  on public.request_events for insert
  with check (
    exists (
      select 1 from public.maintenance_requests r
      where r.id = request_events.request_id and r.renter_id = auth.uid()
    )
  );

create policy "Renters manage their own ratings"
  on public.ratings for all
  using (auth.uid() = renter_id)
  with check (auth.uid() = renter_id);

-- 3. Make sure the `authenticated` role actually has table-level privileges.
-- RLS policies only narrow rows an already-granted operation can touch —
-- without a GRANT, Postgres denies the operation outright (a 403 that no
-- policy fix can solve).
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.properties,
  public.landlords,
  public.maintenance_requests,
  public.request_events,
  public.ratings
to authenticated;

-- 4. Force PostgREST to pick up the schema/policy changes immediately
-- instead of waiting for its next automatic cache refresh (a stale cache
-- is what causes intermittent 404 "relation not found" errors right after
-- a migration).
notify pgrst, 'reload schema';

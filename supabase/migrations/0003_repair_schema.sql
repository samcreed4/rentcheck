-- RentCheck: full repair script
--
-- Use this INSTEAD of running 0001 and 0002 separately if you've hit
-- errors like "relation \"public.maintenance_requests\" does not exist" —
-- it means your project only has some of the tables (likely profiles,
-- properties, landlords) and never got the rest of 0001_init.sql applied.
--
-- This script is fully idempotent: it creates whatever tables/triggers/
-- policies are missing and leaves existing correct ones alone, no matter
-- which partial state your project is currently in. Safe to run more than
-- once.

create extension if not exists "pgcrypto";

-- ============================================================================
-- Tables (created only if missing — existing tables/data are untouched)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  renter_id uuid not null unique references public.profiles (id) on delete cascade,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.landlords (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique references public.properties (id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  renter_id uuid not null references public.profiles (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  category text not null,
  description text not null,
  photo_url text,
  status text not null default 'submitted' check (status in ('submitted', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists maintenance_requests_renter_id_idx on public.maintenance_requests (renter_id);
create index if not exists maintenance_requests_created_at_idx on public.maintenance_requests (created_at desc);

create table if not exists public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.maintenance_requests (id) on delete cascade,
  event_type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists request_events_request_id_idx on public.request_events (request_id);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.maintenance_requests (id) on delete cascade,
  landlord_id uuid not null references public.landlords (id) on delete cascade,
  renter_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Functions & triggers (create or replace — always safe to rerun)
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.handle_new_request()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.request_events (request_id, event_type, message)
  values (new.id, 'submitted', 'Request submitted.');
  return new;
end;
$$;

drop trigger if exists on_request_created on public.maintenance_requests;
create trigger on_request_created
  after insert on public.maintenance_requests
  for each row execute procedure public.handle_new_request();

create or replace function public.handle_request_status_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.request_events (request_id, event_type, message)
    values (
      new.id,
      'status_changed',
      case new.status
        when 'in_progress' then 'Status changed to In Progress.'
        when 'resolved' then 'Marked resolved by renter.'
        else 'Status changed to ' || new.status || '.'
      end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_request_status_change on public.maintenance_requests;
create trigger on_request_status_change
  after update on public.maintenance_requests
  for each row execute procedure public.handle_request_status_change();

create or replace function public.handle_new_rating()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.request_events (request_id, event_type, message)
  values (new.request_id, 'rated', 'Renter rated the landlord ' || new.rating || '/5.');
  return new;
end;
$$;

drop trigger if exists on_rating_created on public.ratings;
create trigger on_rating_created
  after insert on public.ratings
  for each row execute procedure public.handle_new_rating();

-- ============================================================================
-- Row level security: enable on every table, drop ALL existing policies
-- (whatever they're currently named), then recreate the correct ones.
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.landlords enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.request_events enable row level security;
alter table public.ratings enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles', 'properties', 'landlords',
        'maintenance_requests', 'request_events', 'ratings'
      )
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Renters manage their own property"
  on public.properties for all
  using (auth.uid() = renter_id)
  with check (auth.uid() = renter_id);

create policy "Renters manage their own landlord contact"
  on public.landlords for all
  using (exists (select 1 from public.properties p where p.id = landlords.property_id and p.renter_id = auth.uid()))
  with check (exists (select 1 from public.properties p where p.id = landlords.property_id and p.renter_id = auth.uid()));

create policy "Renters manage their own requests"
  on public.maintenance_requests for all
  using (auth.uid() = renter_id)
  with check (auth.uid() = renter_id);

create policy "Renters view events for their own requests"
  on public.request_events for select
  using (exists (select 1 from public.maintenance_requests r where r.id = request_events.request_id and r.renter_id = auth.uid()));

create policy "Renters insert events for their own requests"
  on public.request_events for insert
  with check (exists (select 1 from public.maintenance_requests r where r.id = request_events.request_id and r.renter_id = auth.uid()));

create policy "Renters manage their own ratings"
  on public.ratings for all
  using (auth.uid() = renter_id)
  with check (auth.uid() = renter_id);

-- ============================================================================
-- Table-level grants — RLS policies only narrow an already-granted
-- operation; without this, Postgres denies the operation outright.
-- ============================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.properties,
  public.landlords,
  public.maintenance_requests,
  public.request_events,
  public.ratings
to authenticated;

-- ============================================================================
-- Storage: bucket + policies for maintenance request photos
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('request-photos', 'request-photos', true)
on conflict (id) do nothing;

drop policy if exists "Renters upload their own request photos" on storage.objects;
drop policy if exists "Anyone can view request photos" on storage.objects;
drop policy if exists "Renters manage their own request photos" on storage.objects;
drop policy if exists "Renters delete their own request photos" on storage.objects;

create policy "Renters upload their own request photos"
  on storage.objects for insert
  with check (bucket_id = 'request-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Anyone can view request photos"
  on storage.objects for select
  using (bucket_id = 'request-photos');

create policy "Renters manage their own request photos"
  on storage.objects for update
  using (bucket_id = 'request-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Renters delete their own request photos"
  on storage.objects for delete
  using (bucket_id = 'request-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- Reload PostgREST's schema cache so it picks all of this up immediately.
-- ============================================================================
notify pgrst, 'reload schema';

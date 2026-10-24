-- AccessPath Phase 1: Supabase/PostGIS foundation
--
-- This migration is deliberately idempotent where Supabase-managed extensions and
-- storage objects are involved. It creates the evidence model and safe read/write
-- boundaries; state fusion and decay rules are added in Phase 5.

begin;

create extension if not exists pgcrypto;
create extension if not exists postgis with schema extensions;
create extension if not exists pg_cron;

do $$
begin
  create type public.footpath_side as enum ('L', 'R');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.segment_status as enum ('green', 'yellow', 'red', 'grey');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.observation_source as enum ('harvester', 'user', 'camera');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.review_state as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.roads (
  id uuid primary key default gen_random_uuid(),
  osm_id bigint,
  name text,
  highway_type text,
  geometry extensions.geometry(LineString, 4326) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists roads_osm_id_unique
  on public.roads (osm_id)
  where osm_id is not null;

create index if not exists roads_geometry_gist
  on public.roads using gist (geometry);

create table if not exists public.footpath_segments (
  id text primary key,
  road_id uuid not null references public.roads (id) on delete cascade,
  side public.footpath_side not null,
  segment_index integer not null check (segment_index >= 0),
  geometry extensions.geometry(LineString, 4326) not null,
  length_m double precision not null check (length_m > 0),
  status public.segment_status not null default 'grey',
  difficulty_score double precision not null default 25 check (difficulty_score >= 0 and difficulty_score <= 100),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (road_id, side, segment_index)
);

create index if not exists footpath_segments_road_side_index
  on public.footpath_segments (road_id, side, segment_index);

create index if not exists footpath_segments_geometry_gist
  on public.footpath_segments using gist (geometry);

create table if not exists public.crosswalk_links (
  id uuid primary key default gen_random_uuid(),
  from_segment_id text not null references public.footpath_segments (id) on delete cascade,
  to_segment_id text not null references public.footpath_segments (id) on delete cascade,
  geometry extensions.geometry(LineString, 4326),
  ramp_flag boolean not null default false,
  crossing_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (from_segment_id <> to_segment_id),
  unique (from_segment_id, to_segment_id)
);

create index if not exists crosswalk_links_geometry_gist
  on public.crosswalk_links using gist (geometry);

create table if not exists public.obstacle_types (
  code text primary key,
  display_name text not null,
  is_permanent boolean not null default false,
  decay_hours double precision,
  severity integer not null check (severity between 0 and 100),
  description text,
  created_at timestamptz not null default now(),
  check (decay_hours is null or decay_hours >= 0),
  check (is_permanent or decay_hours is not null)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  wheelchair_width_m double precision not null default 0.90 check (wheelchair_width_m > 0 and wheelchair_width_m < 3),
  clearance_margin_m double precision not null default 0.15 check (clearance_margin_m >= 0 and clearance_margin_m < 2),
  wheelchair_type text,
  trust_score double precision not null default 0.50 check (trust_score >= 0 and trust_score <= 1),
  consent_version text,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  segment_id text references public.footpath_segments (id) on delete set null,
  obstacle_type text references public.obstacle_types (code),
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  source public.observation_source not null,
  reporter_id uuid references auth.users (id) on delete set null,
  photo_url text,
  attribution jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null,
  heading_degrees double precision check (heading_degrees >= 0 and heading_degrees < 360),
  camera_side public.footpath_side,
  projection_confidence double precision check (projection_confidence >= 0 and projection_confidence <= 1),
  geom extensions.geography(Point, 4326),
  is_clear boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((is_clear and obstacle_type is null) or (not is_clear and obstacle_type is not null))
);

create index if not exists observations_segment_captured_index
  on public.observations (segment_id, captured_at desc);

create index if not exists observations_geom_gist
  on public.observations using gist (geom);

create table if not exists public.segment_state (
  segment_id text primary key references public.footpath_segments (id) on delete cascade,
  status public.segment_status not null default 'grey',
  difficulty_score double precision not null default 25 check (difficulty_score >= 0 and difficulty_score <= 100),
  confidence double precision not null default 0 check (confidence >= 0 and confidence <= 1),
  last_verified_at timestamptz,
  active_obstacles jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  state_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.unknown_obstacle_queue (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid references public.observations (id) on delete set null,
  segment_id text references public.footpath_segments (id) on delete set null,
  reporter_id uuid references auth.users (id) on delete set null,
  thumbnail_url text,
  suggested_label text,
  review_status public.review_state not null default 'pending',
  approved_obstacle_type text references public.obstacle_types (code),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists unknown_obstacle_queue_observation_unique
  on public.unknown_obstacle_queue (observation_id)
  where observation_id is not null;

create table if not exists public.model_versions (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  version text not null,
  artifact_path text not null,
  sha256 text not null,
  model_license text not null,
  weights_license text,
  metrics jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (model_name, version)
);

create index if not exists model_versions_active_index
  on public.model_versions (model_name, is_active, published_at desc);

insert into public.obstacle_types (
  code,
  display_name,
  is_permanent,
  decay_hours,
  severity,
  description
)
values
  ('missing_kerb_ramp', 'Missing kerb ramp', true, null, 85,
    'A kerb transition is absent or unusable for a wheelchair.'),
  ('steps', 'Steps', true, null, 100,
    'Stairs or steps block the accessible path.'),
  ('broken_footpath', 'Broken footpath', true, null, 70,
    'The walking surface is broken, collapsed, or too uneven for safe rolling.'),
  ('pole_fixed_obstacle', 'Fixed pole or utility obstacle', true, null, 60,
    'A fixed pole, cabinet, or similar object reduces or blocks clear width.'),
  ('parked_vehicle', 'Parked vehicle', false, 12, 60,
    'A vehicle temporarily occupies the footpath.'),
  ('vendor_cart', 'Vendor cart', false, 12, 45,
    'A temporary vendor cart or stall occupies the footpath.'),
  ('rubble', 'Rubble or construction material', false, 72, 50,
    'Loose rubble, building material, or construction debris blocks clear width.'),
  ('garbage', 'Garbage', false, 48, 35,
    'Garbage or waste temporarily reduces clear width.'),
  ('unknown', 'Unknown obstacle', false, 24, 40,
    'An obstacle detected by the clear-width rule that needs human review.')
on conflict (code) do update
set
  display_name = excluded.display_name,
  is_permanent = excluded.is_permanent,
  decay_hours = excluded.decay_hours,
  severity = excluded.severity,
  description = excluded.description;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists roads_set_updated_at on public.roads;
create trigger roads_set_updated_at
before update on public.roads
for each row execute function public.set_updated_at();

drop trigger if exists footpath_segments_set_updated_at on public.footpath_segments;
create trigger footpath_segments_set_updated_at
before update on public.footpath_segments
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_accesspath on auth.users;
create trigger on_auth_user_created_accesspath
after insert on auth.users
for each row execute function public.handle_new_user_profile();

create or replace function public.initialize_segment_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.segment_state (
    segment_id,
    status,
    difficulty_score,
    confidence,
    active_obstacles,
    computed_at
  )
  values (
    new.id,
    'grey',
    25,
    0,
    '[]'::jsonb,
    now()
  )
  on conflict (segment_id) do nothing;
  return new;
end;
$$;

drop trigger if exists footpath_segments_initialize_state on public.footpath_segments;
create trigger footpath_segments_initialize_state
after insert on public.footpath_segments
for each row execute function public.initialize_segment_state();

create or replace function public.phase1_healthcheck()
returns jsonb
language sql
security definer
set search_path = public, extensions, pg_catalog
as $$
  select jsonb_build_object(
    'extensions', jsonb_build_object(
      'postgis', exists (
        select 1 from pg_extension where extname = 'postgis'
      ),
      'pg_cron', exists (
        select 1 from pg_extension where extname = 'pg_cron'
      )
    ),
    'tables', (
      select coalesce(
        jsonb_object_agg(
          c.relname,
          c.relrowsecurity
        ),
        '{}'::jsonb
      )
      from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname in (
          'roads',
          'footpath_segments',
          'crosswalk_links',
          'obstacle_types',
          'observations',
          'segment_state',
          'profiles',
          'unknown_obstacle_queue',
          'model_versions'
        )
    ),
    'obstacle_type_count', (
      select count(*) from public.obstacle_types
    ),
    'thumbnail_bucket', exists (
      select 1 from storage.buckets where id = 'thumbnails'
    )
  );
$$;

grant execute on function public.phase1_healthcheck() to service_role;

-- RLS is enabled on every application table. Public map reads are intentionally
-- limited to graph/state reference data; evidence writes go through authenticated
-- users or the server-side service role.
alter table public.roads enable row level security;
alter table public.footpath_segments enable row level security;
alter table public.crosswalk_links enable row level security;
alter table public.obstacle_types enable row level security;
alter table public.profiles enable row level security;
alter table public.observations enable row level security;
alter table public.segment_state enable row level security;
alter table public.unknown_obstacle_queue enable row level security;
alter table public.model_versions enable row level security;

drop policy if exists roads_public_read on public.roads;
create policy roads_public_read
on public.roads for select
to anon, authenticated
using (true);

drop policy if exists footpath_segments_public_read on public.footpath_segments;
create policy footpath_segments_public_read
on public.footpath_segments for select
to anon, authenticated
using (true);

drop policy if exists crosswalk_links_public_read on public.crosswalk_links;
create policy crosswalk_links_public_read
on public.crosswalk_links for select
to anon, authenticated
using (true);

drop policy if exists obstacle_types_public_read on public.obstacle_types;
create policy obstacle_types_public_read
on public.obstacle_types for select
to anon, authenticated
using (true);

drop policy if exists segment_state_public_read on public.segment_state;
create policy segment_state_public_read
on public.segment_state for select
to anon, authenticated
using (true);

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert
on public.profiles for insert
to authenticated
with check (id = (select auth.uid()));

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists observations_authenticated_insert on public.observations;
create policy observations_authenticated_insert
on public.observations for insert
to authenticated
with check (
  source in ('user', 'camera')
  and reporter_id = (select auth.uid())
);

drop policy if exists unknown_obstacle_queue_self_read on public.unknown_obstacle_queue;
create policy unknown_obstacle_queue_self_read
on public.unknown_obstacle_queue for select
to authenticated
using (reporter_id = (select auth.uid()));

drop policy if exists unknown_obstacle_queue_self_insert on public.unknown_obstacle_queue;
create policy unknown_obstacle_queue_self_insert
on public.unknown_obstacle_queue for insert
to authenticated
with check (reporter_id = (select auth.uid()));

drop policy if exists model_versions_active_read on public.model_versions;
create policy model_versions_active_read
on public.model_versions for select
to anon, authenticated
using (is_active = true);

-- Private thumbnails: clients upload only into their own folder and can delete
-- their own files. Server-side signed URLs will be used for public evidence views.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'thumbnails',
  'thumbnails',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists thumbnails_authenticated_insert on storage.objects;
create policy thumbnails_authenticated_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'thumbnails'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists thumbnails_authenticated_select on storage.objects;
create policy thumbnails_authenticated_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'thumbnails'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists thumbnails_authenticated_delete on storage.objects;
create policy thumbnails_authenticated_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'thumbnails'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

commit;

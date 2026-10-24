-- AccessPath Phase 5: State Fusion and Self-Healing Engine
--
-- This migration implements:
-- 1. Obstacle decay (rapid for temporary vehicles/carts, multi-day for rubble/garbage,
--    zero decay for permanent obstacles).
-- 2. Observation weighting with reporter trust and all-clear reduction.
-- 3. Permanent obstacle clearance requiring >= 2 independent confirmations.
-- 4. Reversion of stale segments (>90 days without observations) to Grey.
-- 5. Functions: compute_segment_state(text/uuid), batch_recompute_dirty_segments().
-- 6. Instant recomputation trigger on observations INSERT/UPDATE/DELETE.
-- 7. Hourly pg_cron schedule for temporal obstacle decay.

begin;

-- 1. Segment dirty queue for tracking segments requiring recomputation
create table if not exists public.segment_dirty_queue (
  segment_id text primary key references public.footpath_segments (id) on delete cascade,
  queued_at timestamptz not null default now()
);

create index if not exists segment_dirty_queue_queued_at_index
  on public.segment_dirty_queue (queued_at asc);

alter table public.segment_dirty_queue enable row level security;

drop policy if exists segment_dirty_queue_service_role on public.segment_dirty_queue;
create policy segment_dirty_queue_service_role
  on public.segment_dirty_queue for all
  to service_role
  using (true)
  with check (true);

-- Indexes for high-performance observation queries and fusion
create index if not exists observations_segment_is_clear_captured_idx
  on public.observations (segment_id, is_clear, captured_at desc);

create index if not exists observations_segment_obstacle_type_idx
  on public.observations (segment_id, obstacle_type)
  where obstacle_type is not null;

create index if not exists segment_state_status_last_verified_idx
  on public.segment_state (status, last_verified_at);

-- 2. Helper to mark segments dirty
create or replace function public.mark_segment_dirty(p_segment_id text)
returns void
language sql
security definer
set search_path = public, extensions, pg_catalog
as $$
  insert into public.segment_dirty_queue (segment_id, queued_at)
  values (p_segment_id, now())
  on conflict (segment_id) do update
  set queued_at = now();
$$;

-- 3. Core State Fusion Function
create or replace function public.compute_segment_state(
  p_segment_id text,
  p_as_of timestamptz default now()
)
returns public.segment_state
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_segment record;
  v_latest_captured_at timestamptz;
  v_total_obs integer;
  v_clear_obs_count integer;
  v_has_permanent_obstacle boolean := false;
  v_latest_perm_obs_time timestamptz;
  v_independent_clear_count integer := 0;
  v_active_obstacles jsonb := '[]'::jsonb;
  v_max_severity_impact double precision := 0.0;
  v_sum_severity_impact double precision := 0.0;
  v_computed_status public.segment_status;
  v_difficulty_score double precision;
  v_overall_confidence double precision := 0.0;
  v_state_row public.segment_state;
  v_eval_time timestamptz := coalesce(p_as_of, now());
  v_has_active_permanent boolean := false;
  v_perm_clear_satisfied boolean := true;
begin
  -- 1. Check segment existence in footpath_segments
  select id, status, difficulty_score into v_segment
  from public.footpath_segments
  where id = p_segment_id;

  if not found then
    return null;
  end if;

  -- 2. Query summary statistics for observations up to eval time
  select
    count(*),
    count(*) filter (where o.is_clear = true),
    max(o.captured_at)
  into
    v_total_obs,
    v_clear_obs_count,
    v_latest_captured_at
  from public.observations o
  where o.segment_id = p_segment_id
    and o.captured_at <= v_eval_time;

  -- 3. If no observations exist, segment is Grey (unverified default)
  if v_total_obs = 0 or v_latest_captured_at is null then
    insert into public.segment_state (
      segment_id,
      status,
      difficulty_score,
      confidence,
      last_verified_at,
      active_obstacles,
      computed_at,
      state_version,
      updated_at
    )
    values (
      p_segment_id,
      'grey',
      25.0,
      0.0,
      null,
      '[]'::jsonb,
      now(),
      1,
      now()
    )
    on conflict (segment_id) do update
    set
      status = 'grey',
      difficulty_score = 25.0,
      confidence = 0.0,
      last_verified_at = null,
      active_obstacles = '[]'::jsonb,
      computed_at = now(),
      state_version = public.segment_state.state_version + 1,
      updated_at = now()
    returning * into v_state_row;

    update public.footpath_segments
    set
      status = 'grey',
      difficulty_score = 25.0,
      last_verified_at = null,
      updated_at = now()
    where id = p_segment_id;

    return v_state_row;
  end if;

  -- 4. Staleness check: > 90 days with no observations
  -- "Stale segments with no observations for >90 days revert towards Grey (unverified)."
  if v_latest_captured_at < (v_eval_time - interval '90 days') then
    insert into public.segment_state (
      segment_id,
      status,
      difficulty_score,
      confidence,
      last_verified_at,
      active_obstacles,
      computed_at,
      state_version,
      updated_at
    )
    values (
      p_segment_id,
      'grey',
      25.0,
      0.0,
      v_latest_captured_at,
      '[]'::jsonb,
      now(),
      1,
      now()
    )
    on conflict (segment_id) do update
    set
      status = 'grey',
      difficulty_score = 25.0,
      confidence = 0.0,
      last_verified_at = v_latest_captured_at,
      active_obstacles = '[]'::jsonb,
      computed_at = now(),
      state_version = public.segment_state.state_version + 1,
      updated_at = now()
    returning * into v_state_row;

    update public.footpath_segments
    set
      status = 'grey',
      difficulty_score = 25.0,
      last_verified_at = v_latest_captured_at,
      updated_at = now()
    where id = p_segment_id;

    return v_state_row;
  end if;

  -- 5. Permanent Obstacle Verification Rule:
  -- "Permanent obstacles require at least 2 independent confirmations before status changes from Red to Green."
  select
    coalesce(bool_or(ot.is_permanent), false),
    max(o.captured_at) filter (where ot.is_permanent = true)
  into
    v_has_permanent_obstacle,
    v_latest_perm_obs_time
  from public.observations o
  join public.obstacle_types ot on ot.code = o.obstacle_type
  where o.segment_id = p_segment_id
    and o.is_clear = false
    and o.captured_at <= v_eval_time;

  if v_has_permanent_obstacle then
    -- Count distinct independent confirmation sources of all-clear after the permanent obstacle observation
    select count(distinct coalesce(o.reporter_id::text, o.source::text || ':' || o.id::text))
    into v_independent_clear_count
    from public.observations o
    where o.segment_id = p_segment_id
      and o.is_clear = true
      and o.captured_at >= v_latest_perm_obs_time
      and o.captured_at <= v_eval_time;

    if v_independent_clear_count < 2 then
      v_perm_clear_satisfied := false;
    else
      v_perm_clear_satisfied := true;
    end if;
  else
    v_perm_clear_satisfied := true;
  end if;

  -- 6. Decay and Evidence Fusion by Obstacle Type
  with obs_ranked as (
    select
      o.obstacle_type,
      ot.display_name,
      ot.is_permanent,
      ot.decay_hours,
      ot.severity,
      o.confidence,
      coalesce(p.trust_score, case when o.source = 'harvester' then 0.70 else 0.50 end) as reporter_trust,
      o.captured_at
    from public.observations o
    join public.obstacle_types ot on ot.code = o.obstacle_type
    left join public.profiles p on p.id = o.reporter_id
    where o.segment_id = p_segment_id
      and o.is_clear = false
      and o.captured_at <= v_eval_time
  ),
  type_aggregated as (
    select
      obstacle_type,
      display_name,
      is_permanent,
      decay_hours,
      severity,
      max(captured_at) as latest_captured_at,
      count(*) as obs_count,
      -- Independent Bayesian aggregation: 1 - product(1 - (confidence * reporter_trust))
      1.0 - exp(sum(ln(greatest(0.001, 1.0 - least(0.999, confidence * reporter_trust))))) as raw_confidence
    from obs_ranked
    group by obstacle_type, display_name, is_permanent, decay_hours, severity
  ),
  clears_after_obs as (
    select
      t.obstacle_type,
      coalesce(
        sum(o.confidence * coalesce(p.trust_score, case when o.source = 'harvester' then 0.70 else 0.50 end)),
        0.0
      ) as total_clear_weight
    from type_aggregated t
    left join public.observations o
      on o.segment_id = p_segment_id
      and o.is_clear = true
      and o.captured_at >= t.latest_captured_at
      and o.captured_at <= v_eval_time
    left join public.profiles p on p.id = o.reporter_id
    group by t.obstacle_type
  ),
  decayed_obstacles as (
    select
      t.obstacle_type,
      t.display_name,
      t.is_permanent,
      t.decay_hours,
      t.severity,
      t.latest_captured_at,
      t.obs_count,
      c.total_clear_weight,
      case
        -- Permanent obstacles require 2+ independent confirmations to clear
        when t.is_permanent and not v_perm_clear_satisfied then
          greatest(0.50, t.raw_confidence - (c.total_clear_weight * 0.20))
        when t.is_permanent and v_perm_clear_satisfied then
          greatest(0.0, t.raw_confidence - c.total_clear_weight)
        -- Temporary obstacles decay over time (rapid for 12h, days for 48h/72h) and reduce with clears
        else
          greatest(0.0, (
            t.raw_confidence * (
              case
                when t.decay_hours is null or t.decay_hours <= 0 then 0.0
                else greatest(0.0, 1.0 - (extract(epoch from (v_eval_time - t.latest_captured_at)) / (t.decay_hours * 3600.0)))
              end
            )
          ) - c.total_clear_weight)
      end as active_confidence
    from type_aggregated t
    join clears_after_obs c on c.obstacle_type = t.obstacle_type
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'obstacle_type', obstacle_type,
          'display_name', display_name,
          'is_permanent', is_permanent,
          'decay_hours', decay_hours,
          'severity', severity,
          'confidence', round(active_confidence::numeric, 4),
          'latest_captured_at', latest_captured_at,
          'observation_count', obs_count
        ) order by (severity * active_confidence) desc
      ) filter (where active_confidence >= 0.05),
      '[]'::jsonb
    ),
    coalesce(max(severity * active_confidence) filter (where active_confidence >= 0.05), 0.0),
    coalesce(sum(severity * active_confidence) filter (where active_confidence >= 0.05), 0.0),
    coalesce(bool_or(is_permanent and active_confidence >= 0.05), false)
  into
    v_active_obstacles,
    v_max_severity_impact,
    v_sum_severity_impact,
    v_has_active_permanent
  from decayed_obstacles;

  if v_has_active_permanent is null then
    v_has_active_permanent := false;
  end if;

  -- 7. Difficulty Score & Status Assignment
  if jsonb_array_length(v_active_obstacles) > 0 then
    -- Difficulty score: baseline + primary obstacle impact + 10% secondary obstacle contribution
    v_difficulty_score := least(100.0, greatest(10.0,
      round((v_max_severity_impact + 0.10 * (v_sum_severity_impact - v_max_severity_impact))::numeric, 2)::double precision
    ));

    select coalesce(max((elem->>'confidence')::double precision), 0.5)
    into v_overall_confidence
    from jsonb_array_elements(v_active_obstacles) as elem;

    if v_has_active_permanent or v_max_severity_impact >= 60.0 or v_difficulty_score >= 70.0 then
      v_computed_status := 'red';
      v_difficulty_score := greatest(75.0, v_difficulty_score);
    elsif v_max_severity_impact >= 20.0 or v_difficulty_score >= 30.0 then
      v_computed_status := 'yellow';
      v_difficulty_score := greatest(30.0, v_difficulty_score);
    else
      if v_has_permanent_obstacle and not v_perm_clear_satisfied then
        v_computed_status := 'yellow';
        v_difficulty_score := greatest(35.0, v_difficulty_score);
      else
        v_computed_status := 'green';
      end if;
    end if;

  else
    -- No active obstacles
    if v_has_permanent_obstacle and not v_perm_clear_satisfied then
      -- Permanent obstacle remains until 2 independent confirmations
      v_computed_status := 'red';
      v_difficulty_score := 75.0;
      v_overall_confidence := 0.60;
    elsif v_clear_obs_count > 0 then
      -- Verified clear by all-clear observations
      v_computed_status := 'green';
      v_difficulty_score := 10.0;
      select coalesce(max(o.confidence * coalesce(p.trust_score, 0.50)), 0.70)
      into v_overall_confidence
      from public.observations o
      left join public.profiles p on p.id = o.reporter_id
      where o.segment_id = p_segment_id
        and o.is_clear = true
        and o.captured_at <= v_eval_time;
    else
      -- Only temporary obstacles existed and have fully decayed, with no positive clear observation
      -- Lacking positive accessibility evidence, reverts to Grey
      v_computed_status := 'grey';
      v_difficulty_score := 25.0;
      v_overall_confidence := 0.0;
    end if;
  end if;

  -- 8. Persist to public.segment_state and public.footpath_segments
  insert into public.segment_state (
    segment_id,
    status,
    difficulty_score,
    confidence,
    last_verified_at,
    active_obstacles,
    computed_at,
    state_version,
    updated_at
  )
  values (
    p_segment_id,
    v_computed_status,
    v_difficulty_score,
    round(v_overall_confidence::numeric, 4)::double precision,
    v_latest_captured_at,
    v_active_obstacles,
    now(),
    1,
    now()
  )
  on conflict (segment_id) do update
  set
    status = excluded.status,
    difficulty_score = excluded.difficulty_score,
    confidence = excluded.confidence,
    last_verified_at = excluded.last_verified_at,
    active_obstacles = excluded.active_obstacles,
    computed_at = now(),
    state_version = public.segment_state.state_version + 1,
    updated_at = now()
  returning * into v_state_row;

  update public.footpath_segments
  set
    status = v_computed_status,
    difficulty_score = v_difficulty_score,
    last_verified_at = v_latest_captured_at,
    updated_at = now()
  where id = p_segment_id;

  return v_state_row;
end;
$$;

-- UUID overload for compute_segment_state
drop function if exists public.compute_segment_state(uuid, timestamptz);
create or replace function public.compute_segment_state(
  p_segment_uuid uuid,
  p_as_of timestamptz default now()
)
returns public.segment_state
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
  return public.compute_segment_state(p_segment_uuid::text, p_as_of);
end;
$$;

-- 4. Batch Recomputation Runner
create or replace function public.batch_recompute_dirty_segments(
  p_batch_size integer default 500,
  p_as_of timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_recomputed_count integer := 0;
  v_rec record;
  v_eval_time timestamptz := coalesce(p_as_of, now());
begin
  for v_rec in
    with dirty_candidates as (
      -- 1. Explicitly queued segments
      select segment_id from public.segment_dirty_queue
      union
      -- 2. Segments with active temporary obstacles that may have decayed
      select ss.segment_id
      from public.segment_state ss
      where jsonb_array_length(ss.active_obstacles) > 0
        and exists (
          select 1
          from jsonb_array_elements(ss.active_obstacles) as elem
          where coalesce((elem->>'is_permanent')::boolean, false) = false
        )
      union
      -- 3. Stale segments (>90 days) whose status is not yet grey
      select ss.segment_id
      from public.segment_state ss
      where ss.status <> 'grey'
        and ss.last_verified_at is not null
        and ss.last_verified_at < (v_eval_time - interval '90 days')
      union
      -- 4. Segments with fresh observations captured since last state calculation
      select o.segment_id
      from public.observations o
      left join public.segment_state ss on ss.segment_id = o.segment_id
      where o.segment_id is not null
        and (ss.computed_at is null or ss.computed_at < o.created_at)
      limit coalesce(p_batch_size, 500)
    )
    select segment_id from dirty_candidates
  loop
    perform public.compute_segment_state(v_rec.segment_id, v_eval_time);
    delete from public.segment_dirty_queue where segment_id = v_rec.segment_id;
    v_recomputed_count := v_recomputed_count + 1;
  end loop;

  return v_recomputed_count;
end;
$$;

-- 5. Trigger on observations INSERT, UPDATE, DELETE
create or replace function public.trg_observations_recompute_segment()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.segment_id is not null then
      perform public.compute_segment_state(new.segment_id);
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.segment_id is not null and old.segment_id <> coalesce(new.segment_id, '') then
      perform public.compute_segment_state(old.segment_id);
    end if;
    if new.segment_id is not null then
      perform public.compute_segment_state(new.segment_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.segment_id is not null then
      perform public.compute_segment_state(old.segment_id);
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_observations_recompute on public.observations;
create trigger trg_observations_recompute
after insert or update or delete on public.observations
for each row
execute function public.trg_observations_recompute_segment();

-- 6. Phase 5 Healthcheck Function
create or replace function public.phase5_healthcheck()
returns jsonb
language sql
security definer
set search_path = public, extensions, pg_catalog
as $$
  select jsonb_build_object(
    'compute_segment_state_text', exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'compute_segment_state'
    ),
    'batch_recompute_dirty_segments', exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'batch_recompute_dirty_segments'
    ),
    'trg_observations_recompute', exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      where c.relname = 'observations' and t.tgname = 'trg_observations_recompute'
    ),
    'cron_job_scheduled', exists (
      select 1 from cron.job where jobname = 'hourly-obstacle-decay'
    ),
    'dirty_queue_table', exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'segment_dirty_queue'
    )
  );
$$;

-- Function Execution Grants
grant execute on function public.compute_segment_state(text, timestamptz) to anon, authenticated, service_role;
grant execute on function public.compute_segment_state(uuid, timestamptz) to anon, authenticated, service_role;
grant execute on function public.batch_recompute_dirty_segments(integer, timestamptz) to authenticated, service_role;
grant execute on function public.mark_segment_dirty(text) to authenticated, service_role;
grant execute on function public.phase5_healthcheck() to anon, authenticated, service_role;

-- 7. pg_cron Scheduled Hourly Decay Job
do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into v_job_id from cron.job where jobname = 'hourly-obstacle-decay' limit 1;
    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;

    perform cron.schedule(
      'hourly-obstacle-decay',
      '0 * * * *',
      'select public.batch_recompute_dirty_segments();'
    );
  end if;
exception
  when others then
    raise notice 'pg_cron job schedule skipped: %', sqlerrm;
end;
$$;

commit;

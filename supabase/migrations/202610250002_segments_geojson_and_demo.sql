-- AccessPath Migration: 202610250002_segments_geojson_and_demo.sql
-- 1. Add 'demo' to observation_source enum
-- 2. Exempt 'demo' observations from temporal decay in compute_segment_state
-- 3. High-performance GeoJSON viewport RPC: segments_geojson(min_lng, min_lat, max_lng, max_lat, max_features)

-- Step 1: Add 'demo' enum value if not already present
alter type public.observation_source add value if not exists 'demo';

-- Step 2: High performance Viewport GeoJSON RPC for MapLibre / WebView
create or replace function public.segments_geojson(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  max_features integer default 1500
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_catalog
as $$
  with matching_segments as (
    select
      s.id,
      s.road_id,
      s.side,
      s.segment_index,
      s.length_m,
      coalesce(st.status, s.status, 'grey'::public.segment_status) as status,
      coalesce(st.difficulty_score, s.difficulty_score, 25.0) as difficulty_score,
      coalesce(st.last_verified_at, s.last_verified_at) as last_verified_at,
      coalesce(st.active_obstacles, '[]'::jsonb) as active_obstacles,
      exists (
        select 1 from public.observations o
        where o.segment_id = s.id and o.source::text = 'demo'
        limit 1
      ) as has_demo,
      extensions.ST_AsGeoJSON(s.geometry)::jsonb as geom_json
    from public.footpath_segments s
    left join public.segment_state st on st.segment_id = s.id
    where s.geometry && extensions.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    limit greatest(1, least(max_features, 5000))
  ),
  features as (
    select
      jsonb_build_object(
        'type', 'Feature',
        'id', id,
        'geometry', geom_json,
        'properties', jsonb_build_object(
          'id', id,
          'road_id', road_id,
          'side', side,
          'segment_index', segment_index,
          'length_m', length_m,
          'status', status,
          'difficulty_score', difficulty_score,
          'last_verified_at', last_verified_at,
          'active_obstacles', active_obstacles,
          'has_demo', has_demo
        )
      ) as feature
    from matching_segments
  )
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(feature), '[]'::jsonb)
  )
  from features;
$$;

-- Grant execution to anon, authenticated, service_role
grant execute on function public.segments_geojson(double precision, double precision, double precision, double precision, integer) to anon, authenticated, service_role;

-- Step 3: Update compute_segment_state so source='demo' observations are exempt from time decay
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
  v_eval_time timestamptz := coalesce(p_as_of, now());
  v_segment_exists boolean;
  v_obs_count integer;
  v_latest_captured_at timestamptz;
  v_has_permanent_obstacle boolean := false;
  v_latest_perm_obs_time timestamptz;
  v_independent_clear_count integer := 0;
  v_perm_clear_satisfied boolean := false;
  v_active_obstacles jsonb := '[]'::jsonb;
  v_max_severity_impact double precision := 0.0;
  v_sum_severity_impact double precision := 0.0;
  v_has_active_permanent boolean := false;
  v_difficulty_score double precision := 10.0;
  v_computed_status public.segment_status := 'green';
  v_overall_confidence double precision := 0.0;
  v_state_row public.segment_state%rowtype;
begin
  select exists(select 1 from public.footpath_segments where id = p_segment_id)
  into v_segment_exists;

  if not v_segment_exists then
    raise exception 'Footpath segment % does not exist', p_segment_id;
  end if;

  select
    count(*),
    max(captured_at)
  into
    v_obs_count,
    v_latest_captured_at
  from public.observations
  where segment_id = p_segment_id
    and captured_at <= v_eval_time;

  -- If no observations ever captured, default to Grey
  if v_obs_count = 0 then
    insert into public.segment_state (
      segment_id, status, difficulty_score, confidence,
      last_verified_at, active_obstacles, computed_at, state_version, updated_at
    )
    values (
      p_segment_id, 'grey', 25.0, 0.0,
      null, '[]'::jsonb, now(), 1, now()
    )
    on conflict (segment_id) do update set
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

  -- 4. Stale Segment Decay Rule (> 90 days without observations)
  if v_latest_captured_at < (v_eval_time - interval '90 days') then
    insert into public.segment_state (
      segment_id, status, difficulty_score, confidence,
      last_verified_at, active_obstacles, computed_at, state_version, updated_at
    )
    values (
      p_segment_id, 'grey', 25.0, 0.0,
      v_latest_captured_at, '[]'::jsonb, now(), 1, now()
    )
    on conflict (segment_id) do update set
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

  -- 5. Permanent Obstacle Verification Rule
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
    select count(distinct coalesce(o.reporter_id::text, o.source::text || ':' || o.id::text))
    into v_independent_clear_count
    from public.observations o
    where o.segment_id = p_segment_id
      and o.is_clear = true
      and o.captured_at > v_latest_perm_obs_time
      and o.captured_at <= v_eval_time;

    v_perm_clear_satisfied := (v_independent_clear_count >= 2);
  else
    v_perm_clear_satisfied := true;
  end if;

  -- 6. Decay and Evidence Fusion
  with type_aggregated as (
    select
      o.obstacle_type,
      ot.display_name,
      ot.is_permanent,
      ot.decay_hours,
      ot.severity,
      max(o.captured_at) as latest_captured_at,
      bool_or(o.source::text = 'demo') as has_demo_source,
      count(*) as obs_count,
      greatest(
        0.0,
        least(
          1.0,
          sum(o.confidence * coalesce(p.trust_score, case when o.source = 'harvester' then 0.70 else 0.50 end)) /
          greatest(1.0, count(*)::double precision * 0.50)
        )
      ) as raw_confidence
    from public.observations o
    join public.obstacle_types ot on ot.code = o.obstacle_type
    left join public.profiles p on p.id = o.reporter_id
    where o.segment_id = p_segment_id
      and o.is_clear = false
      and o.captured_at <= v_eval_time
    group by o.obstacle_type, ot.display_name, ot.is_permanent, ot.decay_hours, ot.severity
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
        -- Demo observations are preserved without decay
        when t.has_demo_source then
          greatest(0.0, t.raw_confidence - c.total_clear_weight)
        -- Permanent obstacles require 2+ independent confirmations to clear
        when t.is_permanent and not v_perm_clear_satisfied then
          greatest(0.50, t.raw_confidence - (c.total_clear_weight * 0.20))
        when t.is_permanent and v_perm_clear_satisfied then
          greatest(0.0, t.raw_confidence - c.total_clear_weight)
        -- Temporary obstacles decay over time
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
    v_difficulty_score := least(100.0, greatest(10.0,
      round((v_max_severity_impact + 0.10 * (v_sum_severity_impact - v_max_severity_impact))::numeric, 2)::double precision
    ));

    if v_has_active_permanent or v_max_severity_impact >= 60.0 or v_difficulty_score >= 70.0 then
      v_computed_status := 'red';
      v_difficulty_score := greatest(75.0, v_difficulty_score);
    elsif v_max_severity_impact >= 20.0 or v_difficulty_score >= 30.0 then
      v_computed_status := 'yellow';
      v_difficulty_score := greatest(30.0, v_difficulty_score);
    else
      if v_has_permanent_obstacle and not v_perm_clear_satisfied then
        v_computed_status := 'yellow';
      else
        v_computed_status := 'green';
      end if;
    end if;

    select coalesce(max((elem->>'confidence')::double precision), 0.0)
    into v_overall_confidence
    from jsonb_array_elements(v_active_obstacles) elem;
  else
    v_difficulty_score := 10.0;
    v_computed_status := 'green';
    v_overall_confidence := 0.0;
  end if;

  -- 8. Persist to public.segment_state and public.footpath_segments
  insert into public.segment_state (
    segment_id, status, difficulty_score, confidence,
    last_verified_at, active_obstacles, computed_at, state_version, updated_at
  )
  values (
    p_segment_id, v_computed_status, v_difficulty_score,
    round(v_overall_confidence::numeric, 4)::double precision,
    v_latest_captured_at, v_active_obstacles, now(), 1, now()
  )
  on conflict (segment_id) do update set
    status = v_computed_status,
    difficulty_score = v_difficulty_score,
    confidence = round(v_overall_confidence::numeric, 4)::double precision,
    last_verified_at = v_latest_captured_at,
    active_obstacles = v_active_obstacles,
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

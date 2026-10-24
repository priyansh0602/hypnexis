-- AccessPath obstacle taxonomy seed.
-- Safe to run more than once.

insert into public.obstacle_types (
  code,
  display_name,
  is_permanent,
  decay_hours,
  severity,
  description
)
values
  (
    'missing_kerb_ramp',
    'Missing kerb ramp',
    true,
    null,
    85,
    'A kerb transition is absent or unusable for a wheelchair.'
  ),
  (
    'steps',
    'Steps',
    true,
    null,
    100,
    'Stairs or steps block the accessible path.'
  ),
  (
    'broken_footpath',
    'Broken footpath',
    true,
    null,
    70,
    'The walking surface is broken, collapsed, or too uneven for safe rolling.'
  ),
  (
    'pole_fixed_obstacle',
    'Fixed pole or utility obstacle',
    true,
    null,
    60,
    'A fixed pole, cabinet, or similar object reduces or blocks clear width.'
  ),
  (
    'parked_vehicle',
    'Parked vehicle',
    false,
    12,
    60,
    'A vehicle temporarily occupies the footpath.'
  ),
  (
    'vendor_cart',
    'Vendor cart',
    false,
    12,
    45,
    'A temporary vendor cart or stall occupies the footpath.'
  ),
  (
    'rubble',
    'Rubble or construction material',
    false,
    72,
    50,
    'Loose rubble, building material, or construction debris blocks clear width.'
  ),
  (
    'garbage',
    'Garbage',
    false,
    48,
    35,
    'Garbage or waste temporarily reduces clear width.'
  ),
  (
    'unknown',
    'Unknown obstacle',
    false,
    24,
    40,
    'An obstacle detected by the clear-width rule that needs human review.'
  )
on conflict (code) do update
set
  display_name = excluded.display_name,
  is_permanent = excluded.is_permanent,
  decay_hours = excluded.decay_hours,
  severity = excluded.severity,
  description = excluded.description;

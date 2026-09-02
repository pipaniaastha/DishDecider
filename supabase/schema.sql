-- DishDecider schema
-- Run this in the Supabase SQL editor for a fresh project.

create extension if not exists "pgcrypto";

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamp default now(),
  max_budget integer,
  dietary_rules jsonb default '{}'::jsonb,
  share_code text unique not null
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  name text not null,
  dietary_restrictions text[] default '{}',
  max_budget integer,
  created_at timestamp default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  claimed_by uuid references participants(id) on delete set null,
  name text not null,
  category text,
  estimated_cost integer,
  serving_size integer,
  agent_suggestion_rationale text,
  status text default 'suggested' check (status in ('suggested', 'claimed', 'conflict')),
  created_at timestamp default now(),
  original_cost integer -- pre-conflict-swap cost, null if this item was never swapped; powers the "budget saved" recap metric
);

create table if not exists conflict_resolutions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  resolution_type text check (resolution_type in ('duplicate', 'dietary', 'budget', 'balance')),
  rationale text not null,
  alternative_item text,
  resolved_by uuid references participants(id),
  resolved_at timestamp default now()
);

-- Realtime: enable replication on the tables the UI subscribes to.
alter publication supabase_realtime add table items;
alter publication supabase_realtime add table conflict_resolutions;

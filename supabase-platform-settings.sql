create table if not exists public.platform_settings (
  platform text primary key,
  enabled boolean not null default true,
  maintenance boolean not null default false,
  maintenance_message text not null default 'Platform sedang dalam maintenance. Silakan coba lagi nanti.',
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

-- No public policies: the AIODL server uses the Supabase service-role key.

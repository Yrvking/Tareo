-- Ejecutar en Supabase SQL Editor
-- Persistencia colaborativa de catálogos y configuración del sistema

create table if not exists public.app_settings (
  setting_key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_select_auth'
  ) then
    create policy "app_settings_select_auth"
    on public.app_settings
    for select
    using (auth.role() = 'authenticated');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_insert_auth'
  ) then
    create policy "app_settings_insert_auth"
    on public.app_settings
    for insert
    with check (auth.role() = 'authenticated');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_update_auth'
  ) then
    create policy "app_settings_update_auth"
    on public.app_settings
    for update
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');
  end if;
end;
$$;

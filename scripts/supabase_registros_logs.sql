-- Ejecutar en Supabase SQL Editor
-- Crea bitacora de cambios para auditoria de registros de tareo

create table if not exists public.registros_logs (
  id bigint generated always as identity primary key,
  registro_id bigint,
  action text not null,
  actor text,
  source text,
  before_data jsonb,
  after_data jsonb,
  changed_at timestamptz not null default now()
);

alter table public.registros_logs enable row level security;

-- Politicas recomendadas: usuarios autenticados pueden leer/escribir logs
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'registros_logs'
      and policyname = 'registros_logs_select_auth'
  ) then
    create policy "registros_logs_select_auth"
    on public.registros_logs
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
      and tablename = 'registros_logs'
      and policyname = 'registros_logs_insert_auth'
  ) then
    create policy "registros_logs_insert_auth"
    on public.registros_logs
    for insert
    with check (auth.role() = 'authenticated');
  end if;
end;
$$;

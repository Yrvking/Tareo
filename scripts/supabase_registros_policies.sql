-- Ejecutar en Supabase SQL Editor
-- Politicas RLS para permitir trabajo colaborativo autenticado en tabla registros

alter table public.registros enable row level security;

-- SELECT para usuarios autenticados
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'registros'
      and policyname = 'registros_select_auth'
  ) then
    create policy "registros_select_auth"
    on public.registros
    for select
    using (auth.role() = 'authenticated');
  end if;
end;
$$;

-- INSERT para usuarios autenticados
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'registros'
      and policyname = 'registros_insert_auth'
  ) then
    create policy "registros_insert_auth"
    on public.registros
    for insert
    with check (auth.role() = 'authenticated');
  end if;
end;
$$;

-- UPDATE para usuarios autenticados
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'registros'
      and policyname = 'registros_update_auth'
  ) then
    create policy "registros_update_auth"
    on public.registros
    for update
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');
  end if;
end;
$$;

-- DELETE para usuarios autenticados
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'registros'
      and policyname = 'registros_delete_auth'
  ) then
    create policy "registros_delete_auth"
    on public.registros
    for delete
    using (auth.role() = 'authenticated');
  end if;
end;
$$;

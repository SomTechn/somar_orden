-- Somar Orden · esquema base
-- Tablas con prefijo ord_ dentro del proyecto Supabase compartido.
-- Toda tabla tiene RLS: el taller solo ve lo suyo; el cliente solo ve su orden con el enlace (ord_publica).

-- =============== Tablas ===============
create table if not exists public.ord_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.ord_negocios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null,
  giro text not null default 'costura',
  tel text not null default '',
  direccion text not null default '',
  -- Día de la semana (0 = domingo) -> [hora que abre, hora que cierra]. Días sin clave están cerrados.
  horario jsonb not null default '{"1":[8,17],"2":[8,17],"3":[8,17],"4":[8,17],"5":[8,17],"6":[8,12]}',
  capacidad int not null default 1 check (capacidad between 1 and 50),
  recargo_urgente numeric not null default 50 check (recargo_urgente between 0 and 300),
  reduccion_urgente numeric not null default 30 check (reduccion_urgente between 0 and 90),
  cuentas jsonb not null default '[]',
  msg_lista text not null default '',
  estado text not null default 'activo' check (estado in ('activo','suspendido')),
  plan text not null default 'Prueba',
  contador int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ord_miembros (
  negocio_id uuid not null references public.ord_negocios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null default 'empleado' check (rol in ('dueno','empleado')),
  nombre text not null default '',
  tel text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (negocio_id, user_id)
);
create index if not exists ord_miembros_user on public.ord_miembros(user_id);

create table if not exists public.ord_servicios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.ord_negocios(id) on delete cascade,
  nombre text not null,
  precio numeric not null default 0 check (precio >= 0),
  horas numeric not null default 1 check (horas > 0),
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ord_servicios_neg on public.ord_servicios(negocio_id);

create table if not exists public.ord_clientes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.ord_negocios(id) on delete cascade,
  nombre text not null,
  tel text not null default '',
  notas text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ord_clientes_neg on public.ord_clientes(negocio_id);
create unique index if not exists ord_clientes_tel on public.ord_clientes(negocio_id, tel) where tel <> '';

create table if not exists public.ord_medidas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.ord_negocios(id) on delete cascade,
  cliente_id uuid not null references public.ord_clientes(id) on delete cascade,
  etiqueta text not null,
  valores jsonb not null default '[]',
  notas text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists ord_medidas_cli on public.ord_medidas(cliente_id);

create table if not exists public.ord_ordenes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.ord_negocios(id) on delete cascade,
  numero int not null default 0,
  cliente_id uuid not null references public.ord_clientes(id),
  estado text not null default 'recibida' check (estado in ('recibida','en_proceso','lista','entregada','cancelada')),
  urgente boolean not null default false,
  subtotal numeric not null default 0 check (subtotal >= 0),
  recargo numeric not null default 0 check (recargo >= 0),
  total numeric not null default 0 check (total >= 0),
  fecha_sugerida timestamptz,
  fecha_entrega timestamptz not null,
  notas text not null default '',
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  lista_at timestamptz,
  entregada_at timestamptz,
  unique (negocio_id, numero)
);
create index if not exists ord_ordenes_neg_estado on public.ord_ordenes(negocio_id, estado);
create index if not exists ord_ordenes_cli on public.ord_ordenes(cliente_id);

create table if not exists public.ord_prendas (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ord_ordenes(id) on delete cascade,
  negocio_id uuid not null references public.ord_negocios(id) on delete cascade,
  servicio_id uuid references public.ord_servicios(id) on delete set null,
  descripcion text not null,
  cantidad int not null default 1 check (cantidad between 1 and 999),
  precio numeric not null default 0 check (precio >= 0),
  horas numeric not null default 1 check (horas > 0),
  medida_id uuid references public.ord_medidas(id) on delete set null,
  fotos text[] not null default '{}',
  notas text not null default '',
  pos int not null default 0
);
create index if not exists ord_prendas_orden on public.ord_prendas(orden_id);

create table if not exists public.ord_pagos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ord_ordenes(id) on delete cascade,
  negocio_id uuid not null references public.ord_negocios(id) on delete cascade,
  monto numeric not null check (monto > 0),
  metodo text not null default 'efectivo' check (metodo in ('efectivo','transferencia','tigo_money','tarjeta')),
  tipo text not null default 'abono' check (tipo in ('anticipo','abono','saldo')),
  ref text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists ord_pagos_orden on public.ord_pagos(orden_id);
create index if not exists ord_pagos_neg_fecha on public.ord_pagos(negocio_id, created_at);

create table if not exists public.ord_eventos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ord_ordenes(id) on delete cascade,
  negocio_id uuid not null references public.ord_negocios(id) on delete cascade,
  estado text not null,
  nota text not null default '',
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists ord_eventos_orden on public.ord_eventos(orden_id);

-- =============== Funciones de permiso ===============
create or replace function public.ord_es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ord_admins where user_id = auth.uid());
$$;

create or replace function public.ord_es_miembro(p_neg uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ord_miembros m join ord_negocios n on n.id = m.negocio_id
                 where m.negocio_id = p_neg and m.user_id = auth.uid() and m.activo and n.estado = 'activo')
      or exists (select 1 from ord_admins where user_id = auth.uid());
$$;

create or replace function public.ord_es_dueno(p_neg uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ord_miembros where negocio_id = p_neg and user_id = auth.uid() and rol = 'dueno' and activo)
      or exists (select 1 from ord_admins where user_id = auth.uid());
$$;

-- =============== Disparadores ===============
-- Número correlativo por taller
create or replace function public.ord_tg_numero() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update ord_negocios set contador = contador + 1 where id = new.negocio_id returning contador into new.numero;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;
drop trigger if exists ord_numero on public.ord_ordenes;
create trigger ord_numero before insert on public.ord_ordenes for each row execute function public.ord_tg_numero();

-- Cambios de estado: fechas y bitácora
create or replace function public.ord_tg_estado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into ord_eventos (orden_id, negocio_id, estado, user_id) values (new.id, new.negocio_id, new.estado, auth.uid());
    return new;
  end if;
  if new.negocio_id <> old.negocio_id or new.numero <> old.numero or new.token <> old.token then
    raise exception 'No se puede cambiar el taller, el número ni el enlace de la orden';
  end if;
  if new.estado <> old.estado then
    if new.estado = 'lista' and new.lista_at is null then new.lista_at := now(); end if;
    if new.estado = 'entregada' then new.entregada_at := now(); end if;
    if new.estado in ('recibida','en_proceso') then new.lista_at := null; new.entregada_at := null; end if;
    insert into ord_eventos (orden_id, negocio_id, estado, user_id) values (new.id, new.negocio_id, new.estado, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists ord_estado_ins on public.ord_ordenes;
create trigger ord_estado_ins after insert on public.ord_ordenes for each row execute function public.ord_tg_estado();
drop trigger if exists ord_estado_upd on public.ord_ordenes;
create trigger ord_estado_upd before update on public.ord_ordenes for each row execute function public.ord_tg_estado();

-- Prendas, pagos y eventos heredan el taller de su orden (no se puede mezclar talleres)
create or replace function public.ord_tg_hereda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select negocio_id into new.negocio_id from ord_ordenes where id = new.orden_id;
  if new.negocio_id is null then raise exception 'La orden no existe'; end if;
  if tg_table_name = 'ord_pagos' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  return new;
end $$;
drop trigger if exists ord_hereda on public.ord_prendas;
create trigger ord_hereda before insert or update of orden_id on public.ord_prendas for each row execute function public.ord_tg_hereda();
drop trigger if exists ord_hereda on public.ord_pagos;
create trigger ord_hereda before insert or update of orden_id on public.ord_pagos for each row execute function public.ord_tg_hereda();

-- La medida debe ser de un cliente del mismo taller
create or replace function public.ord_tg_medida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select negocio_id into new.negocio_id from ord_clientes where id = new.cliente_id;
  if new.negocio_id is null then raise exception 'El cliente no existe'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ord_medida on public.ord_medidas;
create trigger ord_medida before insert or update on public.ord_medidas for each row execute function public.ord_tg_medida();

-- =============== RLS ===============
alter table public.ord_admins enable row level security;
alter table public.ord_negocios enable row level security;
alter table public.ord_miembros enable row level security;
alter table public.ord_servicios enable row level security;
alter table public.ord_clientes enable row level security;
alter table public.ord_medidas enable row level security;
alter table public.ord_ordenes enable row level security;
alter table public.ord_prendas enable row level security;
alter table public.ord_pagos enable row level security;
alter table public.ord_eventos enable row level security;

drop policy if exists ord_admins_sel on public.ord_admins;
create policy ord_admins_sel on public.ord_admins for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists ord_neg_sel on public.ord_negocios;
create policy ord_neg_sel on public.ord_negocios for select to authenticated using (public.ord_es_miembro(id));
drop policy if exists ord_neg_upd on public.ord_negocios;
create policy ord_neg_upd on public.ord_negocios for update to authenticated using (public.ord_es_dueno(id)) with check (public.ord_es_dueno(id));

drop policy if exists ord_mie_sel on public.ord_miembros;
create policy ord_mie_sel on public.ord_miembros for select to authenticated using (user_id = (select auth.uid()) or public.ord_es_miembro(negocio_id));
drop policy if exists ord_mie_upd on public.ord_miembros;
create policy ord_mie_upd on public.ord_miembros for update to authenticated using (public.ord_es_dueno(negocio_id)) with check (public.ord_es_dueno(negocio_id));

do $$ declare t text; begin
  foreach t in array array['ord_servicios','ord_clientes','ord_medidas','ord_ordenes','ord_prendas','ord_pagos'] loop
    execute format('drop policy if exists %1$s_sel on public.%1$s', t);
    execute format('create policy %1$s_sel on public.%1$s for select to authenticated using (public.ord_es_miembro(negocio_id))', t);
    execute format('drop policy if exists %1$s_ins on public.%1$s', t);
    execute format('create policy %1$s_ins on public.%1$s for insert to authenticated with check (public.ord_es_miembro(negocio_id))', t);
    execute format('drop policy if exists %1$s_upd on public.%1$s', t);
    execute format('create policy %1$s_upd on public.%1$s for update to authenticated using (public.ord_es_miembro(negocio_id)) with check (public.ord_es_miembro(negocio_id))', t);
  end loop;
end $$;
-- Borrar: servicios se desactivan; medidas y prendas se pueden borrar; pagos solo el dueño
drop policy if exists ord_medidas_del on public.ord_medidas;
create policy ord_medidas_del on public.ord_medidas for delete to authenticated using (public.ord_es_miembro(negocio_id));
drop policy if exists ord_prendas_del on public.ord_prendas;
create policy ord_prendas_del on public.ord_prendas for delete to authenticated using (public.ord_es_miembro(negocio_id));
drop policy if exists ord_pagos_del on public.ord_pagos;
create policy ord_pagos_del on public.ord_pagos for delete to authenticated using (public.ord_es_dueno(negocio_id));

drop policy if exists ord_eventos_sel on public.ord_eventos;
create policy ord_eventos_sel on public.ord_eventos for select to authenticated using (public.ord_es_miembro(negocio_id));

revoke all on public.ord_admins, public.ord_negocios, public.ord_miembros, public.ord_servicios, public.ord_clientes,
  public.ord_medidas, public.ord_ordenes, public.ord_prendas, public.ord_pagos, public.ord_eventos from anon;

-- =============== Crear una orden completa (cliente + prendas + anticipo) en un solo paso ===============
create or replace function public.ord_crear_orden(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_neg uuid := (p->>'negocio_id')::uuid;
  v_cli uuid := nullif(p->>'cliente_id','')::uuid;
  v_tel text := regexp_replace(coalesce(p->>'cliente_tel',''), '\D', '', 'g');
  v_ord ord_ordenes;
  v_sub numeric := 0; v_rec numeric := 0; v_pct numeric; v_ant numeric;
  x jsonb; i int := 0;
begin
  if not ord_es_miembro(v_neg) then raise exception 'No tenés acceso a este taller'; end if;
  if jsonb_array_length(coalesce(p->'prendas','[]')) = 0 then raise exception 'Agregá al menos una prenda'; end if;
  v_tel := right(v_tel, 8);

  if v_cli is null then
    if length(trim(coalesce(p->>'cliente_nombre',''))) < 2 then raise exception 'Escribí el nombre del cliente'; end if;
    if v_tel <> '' then select id into v_cli from ord_clientes where negocio_id = v_neg and tel = v_tel; end if;
    if v_cli is null then
      insert into ord_clientes (negocio_id, nombre, tel) values (v_neg, trim(p->>'cliente_nombre'), v_tel) returning id into v_cli;
    end if;
  elsif not exists (select 1 from ord_clientes where id = v_cli and negocio_id = v_neg) then
    raise exception 'El cliente no es de este taller';
  end if;

  for x in select * from jsonb_array_elements(p->'prendas') loop
    v_sub := v_sub + greatest(0, coalesce((x->>'precio')::numeric, 0)) * greatest(1, coalesce((x->>'cantidad')::int, 1));
  end loop;
  if coalesce((p->>'urgente')::boolean, false) then
    select recargo_urgente into v_pct from ord_negocios where id = v_neg;
    v_rec := round(v_sub * v_pct / 100);
  end if;

  insert into ord_ordenes (negocio_id, cliente_id, urgente, subtotal, recargo, total, fecha_sugerida, fecha_entrega, notas)
  values (v_neg, v_cli, coalesce((p->>'urgente')::boolean, false), v_sub, v_rec, v_sub + v_rec,
          nullif(p->>'fecha_sugerida','')::timestamptz, (p->>'fecha_entrega')::timestamptz, coalesce(p->>'notas',''))
  returning * into v_ord;

  for x in select * from jsonb_array_elements(p->'prendas') loop
    insert into ord_prendas (orden_id, negocio_id, servicio_id, descripcion, cantidad, precio, horas, medida_id, fotos, notas, pos)
    values (v_ord.id, v_neg, nullif(x->>'servicio_id','')::uuid, coalesce(nullif(trim(x->>'descripcion'),''),'Prenda'),
            greatest(1, coalesce((x->>'cantidad')::int,1)), greatest(0, coalesce((x->>'precio')::numeric,0)),
            greatest(0.25, coalesce((x->>'horas')::numeric,1)), nullif(x->>'medida_id','')::uuid,
            coalesce(array(select jsonb_array_elements_text(x->'fotos')), '{}'), coalesce(x->>'notas',''), i);
    i := i + 1;
  end loop;

  v_ant := coalesce((p->>'anticipo')::numeric, 0);
  if v_ant > 0 then
    if v_ant > v_ord.total then raise exception 'El anticipo no puede ser mayor que el total'; end if;
    insert into ord_pagos (orden_id, negocio_id, monto, metodo, tipo, ref)
    values (v_ord.id, v_neg, v_ant, coalesce(nullif(p->>'anticipo_metodo',''),'efectivo'), 'anticipo', coalesce(p->>'anticipo_ref',''));
  end if;

  return jsonb_build_object('id', v_ord.id, 'numero', v_ord.numero, 'token', v_ord.token, 'cliente_id', v_cli);
end $$;
revoke execute on function public.ord_crear_orden(jsonb) from anon, public;
grant execute on function public.ord_crear_orden(jsonb) to authenticated;

-- Recalcular totales cuando se editan prendas de una orden existente
create or replace function public.ord_recalcular(p_orden uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare v_sub numeric; v_pct numeric; v_urg boolean; v_neg uuid;
begin
  select negocio_id, urgente into v_neg, v_urg from ord_ordenes where id = p_orden;
  if v_neg is null or not ord_es_miembro(v_neg) then raise exception 'No tenés acceso a esta orden'; end if;
  select coalesce(sum(precio * cantidad), 0) into v_sub from ord_prendas where orden_id = p_orden;
  select recargo_urgente into v_pct from ord_negocios where id = v_neg;
  update ord_ordenes set subtotal = v_sub, recargo = case when v_urg then round(v_sub * v_pct / 100) else 0 end,
         total = v_sub + case when v_urg then round(v_sub * v_pct / 100) else 0 end
   where id = p_orden;
end $$;
revoke execute on function public.ord_recalcular(uuid) from anon, public;
grant execute on function public.ord_recalcular(uuid) to authenticated;

-- =============== Vista pública de una orden (enlace que recibe el cliente) ===============
create or replace function public.ord_publica(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o ord_ordenes; n ord_negocios; c ord_clientes; v_pag numeric;
begin
  if p_token is null or length(p_token) < 24 then return null; end if;
  select * into o from ord_ordenes where token = p_token;
  if o.id is null then return null; end if;
  select * into n from ord_negocios where id = o.negocio_id;
  select * into c from ord_clientes where id = o.cliente_id;
  select coalesce(sum(monto),0) into v_pag from ord_pagos where orden_id = o.id;
  return jsonb_build_object(
    'taller', jsonb_build_object('nombre', n.nombre, 'tel', n.tel, 'direccion', n.direccion, 'horario', n.horario, 'cuentas', n.cuentas, 'giro', n.giro),
    'orden', jsonb_build_object('numero', o.numero, 'estado', o.estado, 'urgente', o.urgente, 'subtotal', o.subtotal, 'recargo', o.recargo,
       'total', o.total, 'pagado', v_pag, 'saldo', greatest(0, o.total - v_pag), 'fecha_entrega', o.fecha_entrega,
       'creada', o.created_at, 'lista', o.lista_at, 'entregada', o.entregada_at, 'notas', o.notas),
    'cliente', split_part(trim(c.nombre), ' ', 1),
    'prendas', coalesce((select jsonb_agg(jsonb_build_object('descripcion', descripcion, 'cantidad', cantidad, 'precio', precio) order by pos)
                         from ord_prendas where orden_id = o.id), '[]'),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('monto', monto, 'tipo', tipo, 'fecha', created_at) order by created_at)
                       from ord_pagos where orden_id = o.id), '[]'),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('estado', estado, 'fecha', created_at) order by created_at)
                         from ord_eventos where orden_id = o.id), '[]')
  );
end $$;
revoke execute on function public.ord_publica(text) from public;
grant execute on function public.ord_publica(text) to anon, authenticated;

-- =============== Fotos de las prendas (privadas, carpeta = id del taller) ===============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ord-fotos', 'ord-fotos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- La carpeta se valida dentro de una función para no romper otros buckets (nombres que no son uuid)
create or replace function public.ord_foto_ok(p_bucket text, p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  if p_bucket <> 'ord-fotos' then return false; end if;
  v := split_part(p_name, '/', 1);
  if v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return ord_es_miembro(v::uuid);
end $$;

drop policy if exists ord_fotos_sel on storage.objects;
create policy ord_fotos_sel on storage.objects for select to authenticated using (bucket_id = 'ord-fotos' and public.ord_foto_ok(bucket_id, name));
drop policy if exists ord_fotos_ins on storage.objects;
create policy ord_fotos_ins on storage.objects for insert to authenticated with check (bucket_id = 'ord-fotos' and public.ord_foto_ok(bucket_id, name));
drop policy if exists ord_fotos_del on storage.objects;
create policy ord_fotos_del on storage.objects for delete to authenticated using (bucket_id = 'ord-fotos' and public.ord_foto_ok(bucket_id, name));

-- =============== Administrador de Somar ===============
insert into public.ord_admins (user_id)
select id from auth.users where email = 'ramoska26som@gmail.com'
on conflict do nothing;

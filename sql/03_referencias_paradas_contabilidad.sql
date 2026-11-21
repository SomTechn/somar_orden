-- Somar Orden · referencias, tiempos muertos y contabilidad (solo agrega, no borra nada)

-- =============== Imágenes de referencia por prenda ===============
alter table public.ord_prendas add column if not exists referencias text[] not null default '{}';

-- =============== Tiempos muertos ===============
create table if not exists public.ord_paradas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.ord_negocios(id) on delete cascade,
  motivo text not null default 'Otro',
  nota text not null default '',
  inicio timestamptz not null,
  fin timestamptz not null,
  horas_movidas numeric not null default 0,
  ordenes_movidas int not null default 0,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (fin > inicio)
);
create index if not exists ord_paradas_neg on public.ord_paradas(negocio_id, fin);
alter table public.ord_paradas enable row level security;
drop policy if exists ord_paradas_sel on public.ord_paradas;
create policy ord_paradas_sel on public.ord_paradas for select to authenticated using (public.ord_es_miembro(negocio_id));
drop policy if exists ord_paradas_ins on public.ord_paradas;
create policy ord_paradas_ins on public.ord_paradas for insert to authenticated with check (public.ord_es_miembro(negocio_id));
drop policy if exists ord_paradas_upd on public.ord_paradas;
create policy ord_paradas_upd on public.ord_paradas for update to authenticated
  using (public.ord_es_dueno(negocio_id) or created_by = (select auth.uid())) with check (public.ord_es_miembro(negocio_id));
drop policy if exists ord_paradas_del on public.ord_paradas;
create policy ord_paradas_del on public.ord_paradas for delete to authenticated
  using (public.ord_es_dueno(negocio_id) or created_by = (select auth.uid()));

-- Mover varias fechas de entrega de una vez (todo o nada). Respeta RLS.
create or replace function public.ord_mover_entregas(p_cambios jsonb) returns int
language plpgsql security invoker set search_path = public as $$
declare x jsonb; n int := 0; c int;
begin
  for x in select * from jsonb_array_elements(coalesce(p_cambios, '[]')) loop
    update ord_ordenes set fecha_entrega = (x->>'fecha')::timestamptz
     where id = (x->>'id')::uuid and estado in ('recibida','en_proceso');
    get diagnostics c = row_count; n := n + c;
  end loop;
  return n;
end $$;
revoke execute on function public.ord_mover_entregas(jsonb) from anon, public;
grant execute on function public.ord_mover_entregas(jsonb) to authenticated;

-- =============== Contabilidad ===============
-- Pagos fijos programados (alquiler, luz, sueldos...). Solo el dueño.
create table if not exists public.ord_pagos_fijos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.ord_negocios(id) on delete cascade,
  concepto text not null,
  categoria text not null default 'Otro',
  monto numeric not null check (monto > 0),
  frecuencia text not null default 'mensual' check (frecuencia in ('mensual','quincenal')),
  dia int not null default 1 check (dia between 1 and 31),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ord_pagos_fijos_neg on public.ord_pagos_fijos(negocio_id);

-- Gastos: fijos (pago de un pago fijo o gasto fijo suelto) y variables (materiales, transporte...).
-- Un gasto variable puede ir ligado a una orden para saber cuánto se ganó en ella.
create table if not exists public.ord_gastos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.ord_negocios(id) on delete cascade,
  fecha date not null default (now() at time zone 'America/Tegucigalpa')::date,
  tipo text not null check (tipo in ('fijo','variable')),
  categoria text not null default 'Otro',
  concepto text not null default '',
  monto numeric not null check (monto > 0),
  metodo text not null default 'efectivo' check (metodo in ('efectivo','transferencia','tigo_money','tarjeta')),
  orden_id uuid references public.ord_ordenes(id) on delete cascade,
  pago_fijo_id uuid references public.ord_pagos_fijos(id) on delete set null,
  periodo text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists ord_gastos_neg_fecha on public.ord_gastos(negocio_id, fecha);
create index if not exists ord_gastos_orden on public.ord_gastos(orden_id);
create unique index if not exists ord_gastos_periodo on public.ord_gastos(pago_fijo_id, periodo) where pago_fijo_id is not null;

-- El gasto ligado a una orden toma el taller de la orden
create or replace function public.ord_tg_gasto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.orden_id is not null then
    select negocio_id into new.negocio_id from ord_ordenes where id = new.orden_id;
    if new.negocio_id is null then raise exception 'La orden no existe'; end if;
    new.tipo := 'variable';
  end if;
  if new.pago_fijo_id is not null and not exists (select 1 from ord_pagos_fijos where id = new.pago_fijo_id and negocio_id = new.negocio_id) then
    raise exception 'Ese pago fijo no es de este taller';
  end if;
  return new;
end $$;
drop trigger if exists ord_gasto on public.ord_gastos;
create trigger ord_gasto before insert or update on public.ord_gastos for each row execute function public.ord_tg_gasto();

alter table public.ord_pagos_fijos enable row level security;
alter table public.ord_gastos enable row level security;

drop policy if exists ord_pf_all on public.ord_pagos_fijos;
create policy ord_pf_all on public.ord_pagos_fijos for all to authenticated
  using (public.ord_es_dueno(negocio_id)) with check (public.ord_es_dueno(negocio_id));

-- Contabilidad general: solo el dueño. Materiales de una orden: todo el equipo los ve y los anota.
drop policy if exists ord_gastos_sel on public.ord_gastos;
create policy ord_gastos_sel on public.ord_gastos for select to authenticated
  using (public.ord_es_dueno(negocio_id) or (orden_id is not null and public.ord_es_miembro(negocio_id)));
drop policy if exists ord_gastos_ins on public.ord_gastos;
create policy ord_gastos_ins on public.ord_gastos for insert to authenticated
  with check (public.ord_es_dueno(negocio_id) or (orden_id is not null and public.ord_es_miembro(negocio_id)));
drop policy if exists ord_gastos_upd on public.ord_gastos;
create policy ord_gastos_upd on public.ord_gastos for update to authenticated
  using (public.ord_es_dueno(negocio_id) or (orden_id is not null and created_by = (select auth.uid())))
  with check (public.ord_es_dueno(negocio_id) or (orden_id is not null and public.ord_es_miembro(negocio_id)));
drop policy if exists ord_gastos_del on public.ord_gastos;
create policy ord_gastos_del on public.ord_gastos for delete to authenticated
  using (public.ord_es_dueno(negocio_id) or (orden_id is not null and created_by = (select auth.uid())));

revoke all on public.ord_paradas, public.ord_pagos_fijos, public.ord_gastos from anon;

-- =============== Crear orden: ahora guarda también las referencias ===============
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
    insert into ord_prendas (orden_id, negocio_id, servicio_id, descripcion, cantidad, precio, horas, medida_id, fotos, referencias, notas, pos)
    values (v_ord.id, v_neg, nullif(x->>'servicio_id','')::uuid, coalesce(nullif(trim(x->>'descripcion'),''),'Prenda'),
            greatest(1, coalesce((x->>'cantidad')::int,1)), greatest(0, coalesce((x->>'precio')::numeric,0)),
            greatest(0.25, coalesce((x->>'horas')::numeric,1)), nullif(x->>'medida_id','')::uuid,
            coalesce(array(select jsonb_array_elements_text(x->'fotos')), '{}'),
            coalesce(array(select jsonb_array_elements_text(x->'referencias')), '{}'),
            coalesce(x->>'notas',''), i);
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

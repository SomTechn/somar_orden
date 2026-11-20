-- Búsqueda de usuario por correo para la función ord-cuentas (solo service_role)
create or replace function public.ord_user_por_email(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke execute on function public.ord_user_por_email(text) from public, anon, authenticated;
grant execute on function public.ord_user_por_email(text) to service_role;

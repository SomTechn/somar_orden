// Somar Orden · cuentas
// Crea talleres y usuarios (dueño y empleados) con número de WhatsApp + contraseña.
// Solo el administrador de Somar crea talleres; el dueño agrega a su equipo.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const DOMINIO = "orden.somar.invalid";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const falla = (m: string, s = 400) => json({ error: m }, s);

const SERVICIOS: Record<string, [string, number, number][]> = {
  costura: [["Ruedo de pantalón", 80, 1], ["Ajuste de cintura", 120, 1.5], ["Cambio de zíper", 100, 1], ["Entallar camisa o blusa", 150, 2],
    ["Ajuste de vestido", 250, 3], ["Acortar mangas", 100, 1], ["Arreglo general", 100, 1], ["Confección a la medida", 0, 8]],
  mecanica: [["Cambio de aceite", 350, 1], ["Revisión general", 500, 2], ["Frenos", 800, 3], ["Afinamiento", 1200, 4]],
  electronica: [["Diagnóstico", 150, 1], ["Reparación de televisor", 800, 6], ["Reparación de equipo de sonido", 600, 4]],
  celulares: [["Diagnóstico", 100, 1], ["Cambio de pantalla", 1200, 2], ["Cambio de batería", 600, 1], ["Cambio de centro de carga", 450, 1.5]],
  otro: [["Servicio general", 0, 2]],
};

const digitos = (t: unknown) => String(t ?? "").replace(/\D/g, "").slice(-8);
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "taller";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return falla("Método no permitido", 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Quién llama
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: yo, error: eYo } = await admin.auth.getUser(jwt);
  if (eYo || !yo?.user) return falla("Tu sesión venció. Entrá de nuevo.", 401);
  const uid = yo.user.id;
  const esAdmin = !!(await admin.from("ord_admins").select("user_id").eq("user_id", uid).maybeSingle()).data;
  const esDueno = async (neg: string) => esAdmin || !!(await admin.from("ord_miembros").select("user_id")
    .eq("negocio_id", neg).eq("user_id", uid).eq("rol", "dueno").eq("activo", true).maybeSingle()).data;

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return falla("Datos inválidos"); }

  // Crea el usuario o devuelve el que ya existe con ese número
  async function usuario(tel: string, nombre: string, clave: string) {
    const email = `${tel}@${DOMINIO}`;
    const { data: ya } = await admin.rpc("ord_user_por_email", { p_email: email });
    if (ya) return { id: ya as string, nuevo: false };
    if (String(clave || "").length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
    const { data, error } = await admin.auth.admin.createUser({ email, password: clave, email_confirm: true, user_metadata: { nombre, tel, app: "somar_orden" } });
    if (error) throw new Error(error.message);
    return { id: data.user.id, nuevo: true };
  }

  try {
    switch (b.accion) {
      case "crear_taller": {
        if (!esAdmin) return falla("Solo Somar puede crear talleres.", 403);
        const nombre = String(b.nombre || "").trim(), dueno = String(b.dueno_nombre || "").trim(), tel = digitos(b.dueno_tel);
        const giro = SERVICIOS[String(b.giro)] ? String(b.giro) : "otro";
        if (nombre.length < 3) return falla("Escribí el nombre del taller.");
        if (dueno.length < 3) return falla("Escribí el nombre del dueño.");
        if (tel.length !== 8) return falla("El WhatsApp del dueño debe tener 8 dígitos.");
        let slug = slugify(nombre), i = 2;
        while ((await admin.from("ord_negocios").select("id").eq("slug", slug).maybeSingle()).data) slug = `${slugify(nombre)}-${i++}`;
        const u = await usuario(tel, dueno, String(b.clave || ""));
        const { data: neg, error } = await admin.from("ord_negocios").insert({
          slug, nombre, giro, tel: digitos(b.tel) || tel, direccion: String(b.direccion || "").trim(),
        }).select().single();
        if (error) throw error;
        await admin.from("ord_miembros").insert({ negocio_id: neg.id, user_id: u.id, rol: "dueno", nombre: dueno, tel });
        await admin.from("ord_servicios").insert(SERVICIOS[giro].map(([n, p, h], k) => ({ negocio_id: neg.id, nombre: n, precio: p, horas: h, orden: k })));
        return json({ ok: true, negocio: neg, usuario_nuevo: u.nuevo });
      }
      case "crear_miembro": {
        const neg = String(b.negocio_id || "");
        if (!(await esDueno(neg))) return falla("Solo el dueño puede agregar personas.", 403);
        const nombre = String(b.nombre || "").trim(), tel = digitos(b.tel);
        if (nombre.length < 3) return falla("Escribí el nombre.");
        if (tel.length !== 8) return falla("El WhatsApp debe tener 8 dígitos.");
        const u = await usuario(tel, nombre, String(b.clave || ""));
        const rol = b.rol === "dueno" ? "dueno" : "empleado";
        const { error } = await admin.from("ord_miembros").upsert({ negocio_id: neg, user_id: u.id, rol, nombre, tel, activo: true });
        if (error) throw error;
        return json({ ok: true, usuario_nuevo: u.nuevo });
      }
      case "cambiar_clave": {
        const neg = String(b.negocio_id || ""), target = String(b.user_id || ""), clave = String(b.clave || "");
        if (clave.length < 6) return falla("La contraseña debe tener al menos 6 caracteres.");
        const propio = target === uid;
        if (!propio) {
          if (!(await esDueno(neg))) return falla("No podés cambiar esa contraseña.", 403);
          const m = (await admin.from("ord_miembros").select("user_id").eq("negocio_id", neg).eq("user_id", target).maybeSingle()).data;
          if (!m && !esAdmin) return falla("Esa persona no es de tu taller.", 403);
          // Un dueño no cambia la contraseña de alguien que también trabaja en otro taller (solo Somar)
          const otros = (await admin.from("ord_miembros").select("negocio_id").eq("user_id", target).neq("negocio_id", neg)).data || [];
          if (otros.length && !esAdmin) return falla("Esa cuenta también se usa en otro taller. Pedile a Somar que la cambie.", 403);
        }
        const { error } = await admin.auth.admin.updateUserById(target, { password: clave });
        if (error) throw error;
        return json({ ok: true });
      }
      case "talleres": {
        if (!esAdmin) return falla("Solo Somar.", 403);
        const { data } = await admin.from("ord_negocios").select("*, ord_miembros(nombre,tel,rol,activo,user_id)").order("created_at", { ascending: false });
        const conteo = (await admin.from("ord_ordenes").select("negocio_id")).data || [];
        return json({ ok: true, talleres: (data || []).map((n) => ({ ...n, ordenes: conteo.filter((o) => o.negocio_id === n.id).length })) });
      }
      default:
        return falla("Acción desconocida");
    }
  } catch (e) {
    const m = (e as Error).message || String(e);
    return falla(/already been registered|already exists/i.test(m) ? "Ese número ya tiene cuenta." : m, 400);
  }
});

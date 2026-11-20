/* Somar Orden · configuración y utilidades compartidas. Sin frameworks. */
const CONFIG = {
  URL: 'https://orden.somarlabs.online',
  SUPABASE_URL: 'https://edmvfqelxsxevpmxgbav.supabase.co',
  SUPABASE_KEY: 'sb_publishable_lgTmmLtUESDDyX2sff6ArQ_z65Ti9d6',
  DOMINIO: 'orden.somar.invalid',
  BUCKET: 'ord-fotos',
};
const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'somar_orden_auth' },
});

/* ---------- Texto y formato ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = n => 'L ' + Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const digitos = t => String(t ?? '').replace(/\D/g, '').slice(-8);
const telFmt = t => { const d = digitos(t); return d.length === 8 ? d.slice(0, 4) + '-' + d.slice(4) : d; };
const primero = n => String(n || '').trim().split(/\s+/)[0] || '';
const ini = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const ESTADOS = { recibida: 'Recibida', en_proceso: 'En proceso', lista: 'Lista', entregada: 'Entregada', cancelada: 'Cancelada' };
const METODOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tigo_money: 'Tigo Money', tarjeta: 'Tarjeta' };
const TIPOS_PAGO = { anticipo: 'Anticipo', abono: 'Abono', saldo: 'Pago final' };
const GIROS = { costura: 'Costura y sastrería', mecanica: 'Mecánica', electronica: 'Electrónica', celulares: 'Celulares', otro: 'Otro' };
const tagEstado = e => `<span class="tag ${e}">${ESTADOS[e] || e}</span>`;

/* ---------- Fechas ---------- */
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAS_L = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = n => String(n).padStart(2, '0');
const isoDia = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hora12 = d => { let h = d.getHours(); const m = d.getMinutes(), ap = h < 12 ? 'a. m.' : 'p. m.'; h = h % 12 || 12; return h + (m ? ':' + pad(m) : '') + ' ' + ap; };
const h12 = h => { const ap = h < 12 ? 'a. m.' : 'p. m.'; return (h % 12 || 12) + ' ' + ap; };
function diaLbl(d) {
  d = new Date(d); const hoy = new Date(); const m = new Date(); m.setDate(hoy.getDate() + 1); const a = new Date(); a.setDate(hoy.getDate() - 1);
  if (isoDia(d) === isoDia(hoy)) return 'Hoy';
  if (isoDia(d) === isoDia(m)) return 'Mañana';
  if (isoDia(d) === isoDia(a)) return 'Ayer';
  return DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()];
}
const fechaHora = d => d ? diaLbl(d) + ', ' + hora12(new Date(d)) : '';
const fechaCorta = d => { d = new Date(d); return d.getDate() + ' ' + MESES[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
/* Valor para <input type="datetime-local"> en hora local */
const aLocalInput = d => { d = new Date(d); return isoDia(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const deLocalInput = s => new Date(s);
function estadoEntrega(o) {
  if (['entregada', 'cancelada'].includes(o.estado)) return '';
  const f = new Date(o.fecha_entrega), now = new Date();
  if (o.estado !== 'lista' && f < now) return 'vencida';
  if (isoDia(f) === isoDia(now)) return 'hoy';
  return '';
}

/* ---------- Fecha de entrega sugerida ----------
   Suma las horas de trabajo pendientes del taller (cola) y las de la orden nueva, repartidas entre
   las personas que trabajan a la vez (capacidad), y avanza solo por las horas en que el taller abre.
   Las urgentes solo esperan detrás de otras urgentes y tardan menos (reduccion_urgente %). */
function horasAbiertas(neg, desde, horas) {
  const H = neg.horario || {};
  if (!Object.keys(H).length) { const d = new Date(desde); d.setHours(d.getHours() + Math.ceil(horas)); return d; }
  let t = new Date(desde), resta = horas * 60, vueltas = 0;
  while (resta > 0 && vueltas++ < 400) {
    const h = H[t.getDay()];
    if (h) {
      const abre = new Date(t); abre.setHours(h[0], 0, 0, 0);
      const cierra = new Date(t); cierra.setHours(h[1], 0, 0, 0);
      if (t < abre) t = abre;
      if (t < cierra) {
        const libre = (cierra - t) / 60000;
        if (libre >= resta) { t = new Date(t.getTime() + resta * 60000); resta = 0; break; }
        resta -= libre;
      }
    }
    t = new Date(t); t.setDate(t.getDate() + 1); t.setHours(0, 0, 0, 0);
  }
  // Redondea a la siguiente media hora
  const m = t.getMinutes(); if (m % 30) t.setMinutes(m + (30 - m % 30), 0, 0); else t.setSeconds(0, 0);
  return t;
}
function fechaSugerida(neg, horasNueva, urgente, pendientes) {
  const red = urgente ? (1 - (neg.reduccion_urgente || 0) / 100) : 1;
  const cola = pendientes.filter(o => !urgente || o.urgente).reduce((a, o) => a + (o.horas || 0) * (o.urgente ? (1 - (neg.reduccion_urgente || 0) / 100) : 1), 0);
  const cap = Math.max(1, neg.capacidad || 1);
  const total = cola / cap + Math.max(0.5, horasNueva * red);
  return horasAbiertas(neg, new Date(), total);
}

/* ---------- WhatsApp ---------- */
const waLink = (tel, texto) => 'https://wa.me/504' + digitos(tel) + '?text=' + encodeURIComponent(texto);
const linkOrden = token => CONFIG.URL + '/o/' + token;

/* ---------- Interfaz ---------- */
let toastT;
function toast(msg, mal) {
  $('.toast')?.remove(); clearTimeout(toastT);
  const t = document.createElement('div'); t.className = 'toast' + (mal ? ' mal' : ''); t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t); toastT = setTimeout(() => t.remove(), mal ? 4500 : 2600);
}
function errMsg(e) {
  const m = String(e?.message || e?.error_description || e || '');
  if (/Invalid login credentials/i.test(m)) return 'El número o la contraseña no coinciden.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión. Revisá tu internet e intentá otra vez.';
  if (/JWT|session/i.test(m)) return 'Tu sesión venció. Entrá de nuevo.';
  if (/row-level security|permission denied/i.test(m)) return 'No tenés permiso para hacer esto.';
  return m.replace(/^.*?ERROR:\s*/, '') || 'Algo salió mal. Intentá otra vez.';
}
const fallo = e => { console.error(e); toast(errMsg(e), true); };

/* Hoja inferior: abrir(titulo, html, alMontar) */
function abrirHoja(titulo, html, alMontar) {
  cerrarHoja();
  const v = document.createElement('div'); v.className = 'velo'; v.id = 'velo';
  v.innerHTML = `<div class="hoja" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><div class="cab"><h3>${esc(titulo)}</h3><button class="btn-ic" data-cerrar aria-label="Cerrar">${IC.x}</button></div><div class="cuerpo">${html}</div></div>`;
  v.addEventListener('click', e => { if (e.target === v || e.target.closest('[data-cerrar]')) cerrarHoja(); });
  document.body.appendChild(v); document.body.style.overflow = 'hidden';
  const c = $('.cuerpo', v); if (alMontar) alMontar(c);
  return c;
}
function cerrarHoja() { $('#velo')?.remove(); document.body.style.overflow = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarHoja(); });
function confirmar(texto, { si = 'Sí', no = 'Cancelar', peligro } = {}) {
  return new Promise(res => {
    abrirHoja('Confirmar', `<p style="font-size:15.5px">${esc(texto)}</p><div class="btns"><button class="btn" data-r="0">${esc(no)}</button><button class="btn ${peligro ? 'mal' : 'pri'}" data-r="1">${esc(si)}</button></div>`, c => {
      $$('[data-r]', c).forEach(b => b.onclick = () => { cerrarHoja(); res(b.dataset.r === '1'); });
    });
    $('#velo').addEventListener('click', e => { if (e.target.id === 'velo' || e.target.closest('[data-cerrar]')) res(false); });
  });
}
/* Evita doble toque mientras se guarda */
async function ocupado(btn, fn) {
  if (btn?.disabled) return;
  const txt = btn?.innerHTML; if (btn) { btn.disabled = true; btn.innerHTML = 'Guardando…'; }
  try { return await fn(); } catch (e) { fallo(e); } finally { if (btn) { btn.disabled = false; btn.innerHTML = txt; } }
}

/* ---------- Fotos: se reducen antes de subir para ahorrar datos ---------- */
function reducirFoto(file, max = 1280, calidad = 0.78) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('No se pudo leer la foto')), 'image/jpeg', calidad);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la foto')); };
    img.src = url;
  });
}
const urlCache = {};
async function urlFoto(path) {
  if (urlCache[path] && urlCache[path].exp > Date.now()) return urlCache[path].url;
  const { data, error } = await sb.storage.from(CONFIG.BUCKET).createSignedUrl(path, 3600);
  if (error) return '';
  urlCache[path] = { url: data.signedUrl, exp: Date.now() + 50 * 60e3 };
  return data.signedUrl;
}
async function pintarFotos(root = document) {
  for (const img of $$('img[data-foto]', root)) { if (!img.src) img.src = await urlFoto(img.dataset.foto); }
}

/* ---------- Íconos ---------- */
const sv = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  x: sv('<path d="M18 6 6 18M6 6l12 12"/>'),
  mas: sv('<path d="M12 5v14M5 12h14"/>'),
  lista: sv('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
  gente: sv('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.8 2.6 3 5.2"/>'),
  menu: sv('<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>'),
  caja: sv('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>'),
  atras: sv('<path d="M15 18l-6-6 6-6"/>'),
  sig: sv('<path d="M9 18l6-6-6-6"/>'),
  wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg>',
  camara: sv('<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>'),
  regla: sv('<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>'),
  buscar: sv('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  link: sv('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
  basura: sv('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  lapiz: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  reloj: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  salir: sv('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
  ok: sv('<path d="m5 12 5 5L20 7"/>'),
  tijera: sv('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1 20 20M8.1 15.9 20 4"/>'),
  copiar: sv('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
};

/* Plantillas de medidas para costura */
const PLANTILLAS = {
  'Pantalón': ['Cintura', 'Cadera', 'Largo', 'Tiro', 'Muslo', 'Rodilla', 'Ruedo'],
  'Camisa / blusa': ['Cuello', 'Hombro', 'Pecho / busto', 'Cintura', 'Cadera', 'Largo', 'Manga', 'Puño'],
  'Vestido': ['Busto', 'Cintura', 'Cadera', 'Talle delantero', 'Talle espalda', 'Hombro', 'Largo'],
  'Falda': ['Cintura', 'Cadera', 'Largo'],
  'Saco': ['Hombro', 'Pecho', 'Cintura', 'Largo', 'Manga', 'Espalda'],
  'Otra': [],
};

/* Service worker (app instalable) */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => { });

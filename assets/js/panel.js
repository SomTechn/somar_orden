/* Somar Orden · panel del taller (dueño y empleados) */
const S = { user: null, admin: false, miembros: [], neg: null, rol: null, servs: [], ordenes: [], clientes: [], paradas: [], fijos: [], pagosFijosMes: [], filtro: 'activas', q: '', cargando: true };
let N = null; // orden nueva en edición

const esDueno = () => S.rol === 'dueno' || S.admin;
const ACTIVAS = ['recibida', 'en_proceso', 'lista'];
const pagado = o => (o.ord_pagos || []).reduce((a, p) => a + Number(p.monto), 0);
const saldo = o => Math.max(0, Number(o.total) - pagado(o));
const cli = id => S.clientes.find(c => c.id === id);
const ordCli = o => o.ord_clientes || cli(o.cliente_id) || { nombre: 'Cliente', tel: '' };
const resumenPrendas = o => (o.ord_prendas || []).sort((a, b) => a.pos - b.pos).map(p => (p.cantidad > 1 ? p.cantidad + ' × ' : '') + p.descripcion).join(', ');
const horasOrden = o => (o.ord_prendas || []).reduce((a, p) => a + Number(p.horas) * p.cantidad, 0);

/* =================== Arranque y sesión =================== */
async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return pintarEntrada();
  S.user = session.user;
  try { await cargarMembresias(); } catch (e) { return pintarEntrada(errMsg(e)); }
  if (!S.miembros.length) return pintarSinTaller();
  const pedido = new URLSearchParams(location.search).get('n') || localStorage.getItem('ord_neg');
  const m = S.miembros.find(x => x.negocio.id === pedido) || (S.miembros.length === 1 ? S.miembros[0] : null);
  if (!m) return pintarElegirTaller();
  await abrirTaller(m);
}
async function cargarMembresias() {
  const [{ data: ad }, { data: mm, error }] = await Promise.all([
    sb.from('ord_admins').select('user_id').eq('user_id', S.user.id).maybeSingle(),
    sb.from('ord_miembros').select('rol, nombre, activo, negocio:ord_negocios(*)').eq('user_id', S.user.id).eq('activo', true),
  ]);
  if (error) throw error;
  S.admin = !!ad;
  S.miembros = (mm || []).filter(m => m.negocio).map(m => ({ rol: m.rol, nombre: m.nombre, negocio: m.negocio }));
  if (S.admin) {
    const { data: todos } = await sb.from('ord_negocios').select('*').order('nombre');
    (todos || []).forEach(n => { if (!S.miembros.some(m => m.negocio.id === n.id)) S.miembros.push({ rol: 'admin', nombre: 'Somar', negocio: n }); });
  }
}
async function abrirTaller(m) {
  S.neg = m.negocio; S.rol = m.rol; localStorage.setItem('ord_neg', S.neg.id);
  document.title = S.neg.nombre + ' · Somar Orden';
  S.cargando = true; render();
  await recargar();
  if (!location.hash) location.hash = '#/ordenes'; else render();
}
async function recargar() {
  const desde = new Date(); desde.setDate(desde.getDate() - 45);
  const hace7 = new Date(); hace7.setDate(hace7.getDate() - 7);
  const hoyD = new Date(), mesIni = `${hoyD.getFullYear()}-${pad(hoyD.getMonth() + 1)}-01`;
  const [n, s, o, c, pa, pf, gm] = await Promise.all([
    sb.from('ord_negocios').select('*').eq('id', S.neg.id).single(),
    sb.from('ord_servicios').select('*').eq('negocio_id', S.neg.id).eq('activo', true).order('orden').order('nombre'),
    sb.from('ord_ordenes').select('*, ord_clientes(id,nombre,tel), ord_prendas(*), ord_pagos(*)').eq('negocio_id', S.neg.id)
      .or(`estado.in.(recibida,en_proceso,lista),created_at.gte.${desde.toISOString()},entregada_at.gte.${desde.toISOString()}`)
      .order('fecha_entrega'),
    sb.from('ord_clientes').select('*').eq('negocio_id', S.neg.id).order('nombre'),
    sb.from('ord_paradas').select('*').eq('negocio_id', S.neg.id).gte('fin', hace7.toISOString()).order('inicio'),
    esDueno() ? sb.from('ord_pagos_fijos').select('*').eq('negocio_id', S.neg.id).eq('activo', true).order('dia') : Promise.resolve({ data: [] }),
    esDueno() ? sb.from('ord_gastos').select('pago_fijo_id, periodo').eq('negocio_id', S.neg.id).not('pago_fijo_id', 'is', null).gte('fecha', mesIni) : Promise.resolve({ data: [] }),
  ]);
  for (const r of [n, s, o, c]) if (r.error) { fallo(r.error); S.cargando = false; return; }
  S.neg = n.data; S.servs = s.data; S.ordenes = o.data; S.clientes = c.data; S.cargando = false;
  S.paradas = pa.data || []; S.fijos = pf.data || []; S.pagosFijosMes = gm.data || [];
}
function pintarEntrada(msg = '') {
  document.body.innerHTML = `<div class="entrada">
    <div class="marca"><img src="/assets/img/icon.svg" alt=""><div><div class="t">Somar Orden</div><div class="s">Órdenes de trabajo para tu taller</div></div></div>
    <form class="card" id="fEnt" style="gap:14px">
      <h2 class="h2">Entrar al panel</h2>
      <label class="f">Tu número de WhatsApp<input class="inp" name="u" inputmode="tel" autocomplete="username" placeholder="9999-9999" required></label>
      <label class="f">Contraseña<input class="inp" name="p" type="password" autocomplete="current-password" required></label>
      <div class="err ${msg ? '' : 'hidden'}" id="eEnt">${esc(msg)}</div>
      <button class="btn pri full" type="submit">Entrar</button>
    </form>
    <p class="sm muted" style="text-align:center">¿Querés Somar Orden para tu taller? <a class="b" href="https://somarlabs.online" target="_blank" rel="noopener">Conocé Somar Labs</a></p>
    <div class="pie">Una app de <img src="/assets/img/somar-labs.png" alt="Somar Labs"></div></div>`;
  $('#fEnt').onsubmit = async e => {
    e.preventDefault(); const f = e.target, b = $('button', f), u = f.u.value.trim();
    const email = u.includes('@') ? u.toLowerCase() : digitos(u) + '@' + CONFIG.DOMINIO;
    if (!u.includes('@') && digitos(u).length !== 8) { $('#eEnt').textContent = 'Escribí tu número de 8 dígitos.'; $('#eEnt').classList.remove('hidden'); return; }
    b.disabled = true; b.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email, password: f.p.value });
    if (error) { b.disabled = false; b.textContent = 'Entrar'; $('#eEnt').textContent = errMsg(error); $('#eEnt').classList.remove('hidden'); return; }
    location.reload();
  };
}
function pintarSinTaller() {
  document.body.innerHTML = `<div class="entrada"><div class="marca"><img src="/assets/img/icon.svg" alt=""><div><div class="t">Somar Orden</div></div></div>
    <div class="card"><h2 class="h2">Tu cuenta no tiene taller</h2><p class="muted">Pedile al dueño del taller que te agregue, o escribile a Somar para activar tu taller.</p><button class="btn full" id="bSal">Salir</button></div></div>`;
  $('#bSal').onclick = salir;
}
function pintarElegirTaller() {
  document.body.innerHTML = `<div class="entrada"><div class="marca"><img src="/assets/img/icon.svg" alt=""><div><div class="t">¿Qué taller abrís?</div></div></div>
    <div class="card list">${S.miembros.map((m, i) => `<button class="li" data-i="${i}" style="text-align:left"><div class="grow"><div class="b">${esc(m.negocio.nombre)}</div><div class="sm muted">${esc(GIROS[m.negocio.giro] || '')}${m.negocio.estado !== 'activo' ? ' · suspendido' : ''}</div></div>${IC.sig}</button>`).join('')}</div>
    <button class="btn quiet" id="bSal">Salir</button></div>`;
  $$('[data-i]').forEach(b => b.onclick = () => { localStorage.setItem('ord_neg', S.miembros[b.dataset.i].negocio.id); location.href = '/panel'; });
  $('#bSal').onclick = salir;
}
async function salir() { await sb.auth.signOut(); localStorage.removeItem('ord_neg'); location.href = '/panel'; }

/* =================== Rutas =================== */
const ruta = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || 'ordenes').split('/');
window.addEventListener('hashchange', () => { cerrarHoja(); render(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', async () => { if (!document.hidden && S.neg && !N) { await recargar(); render(); } });

function render() {
  if (!S.neg) return;
  const [r, a] = ruta();
  const tab = { ordenes: 'ordenes', orden: 'ordenes', nueva: 'nueva', clientes: 'clientes', cliente: 'clientes', mas: 'mas' }[r] || 'ordenes';
  let titulo = S.neg.nombre, sub = GIROS[S.neg.giro] || '', atras = '', html = '';
  if (S.cargando) html = '<div class="spin"></div>';
  else if (r === 'orden') { const o = S.ordenes.find(x => x.id === a); titulo = o ? 'Orden ' + o.numero : 'Orden'; sub = o ? ordCli(o).nombre : ''; atras = '#/ordenes'; html = o ? vOrden(o) : '<div class="empty">No encontramos esa orden.</div>'; }
  else if (r === 'nueva') { titulo = 'Nueva orden'; sub = 'Recibir prendas'; html = vNueva(); }
  else if (r === 'clientes') { titulo = 'Clientes'; sub = S.clientes.length + ' en total'; html = vClientes(); }
  else if (r === 'cliente') { const c = cli(a); titulo = c ? c.nombre : 'Cliente'; sub = c ? telFmt(c.tel) : ''; atras = '#/clientes'; html = c ? vCliente(c) : '<div class="empty">No encontramos ese cliente.</div>'; }
  else if (r === 'mas') { const v = MAS[a]; titulo = v ? v.t : 'Más'; atras = v ? '#/mas' : ''; sub = v ? S.neg.nombre : sub; html = v ? v.f() : vMas(); }
  else html = vOrdenes();

  document.body.innerHTML = `<div class="app">
    <header class="top">${atras ? `<a class="btn-ic" href="${atras}" aria-label="Atrás">${IC.atras}</a>` : `<img src="/assets/img/icon.svg" alt="" style="width:34px;height:34px">`}
      <div class="grow"><h1 class="ell">${esc(titulo)}</h1><div class="sub ell">${esc(sub)}</div></div>
      ${r === 'ordenes' ? `<button class="btn-ic" id="bRec" aria-label="Actualizar">${sv('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>')}</button>` : ''}</header>
    <main class="main" id="main">${html}</main>
    <nav class="tabs"><div class="in">
      <a class="tab ${tab === 'ordenes' ? 'on' : ''}" href="#/ordenes">${IC.lista}Órdenes</a>
      <a class="tab nueva ${tab === 'nueva' ? 'on' : ''}" href="#/nueva"><span class="bola">${IC.mas}</span>Nueva</a>
      <a class="tab ${tab === 'clientes' ? 'on' : ''}" href="#/clientes">${IC.gente}Clientes</a>
      <a class="tab ${tab === 'mas' ? 'on' : ''}" href="#/mas">${IC.menu}Más</a>
    </div></nav></div>`;
  $('#bRec')?.addEventListener('click', async e => { e.currentTarget.disabled = true; await recargar(); render(); toast('Actualizado'); });
  enlazar();
  pintarFotos();
}

/* Acciones con data-a="nombre" y data-x="argumento" */
const A = {};
function enlazar(root = document) {
  $$('[data-a]', root).forEach(el => {
    const ev = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ? (el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input') : 'click';
    el.addEventListener(ev, e => { const f = A[el.dataset.a]; if (f) f(el.dataset.x, el, e); });
  });
}

/* =================== Órdenes =================== */
function vOrdenes() {
  const act = S.ordenes.filter(o => ACTIVAS.includes(o.estado));
  const hoy = isoDia(new Date());
  const atrasadas = act.filter(o => o.estado !== 'lista' && new Date(o.fecha_entrega) < new Date()).length;
  const paraHoy = act.filter(o => o.estado !== 'lista' && isoDia(new Date(o.fecha_entrega)) === hoy).length;
  const porCobrar = act.reduce((a, o) => a + saldo(o), 0);
  const cuenta = e => S.ordenes.filter(o => o.estado === e).length;
  const F = [['activas', 'Pendientes', act.length], ['recibida', 'Recibidas', cuenta('recibida')], ['en_proceso', 'En proceso', cuenta('en_proceso')], ['lista', 'Listas', cuenta('lista')], ['entregada', 'Entregadas', cuenta('entregada')]];
  let lista = S.filtro === 'activas' ? act : S.ordenes.filter(o => o.estado === S.filtro);
  const q = S.q.trim().toLowerCase();
  if (q) lista = S.ordenes.filter(o => String(o.numero) === q.replace('#', '') || ordCli(o).nombre.toLowerCase().includes(q) || digitos(ordCli(o).tel).includes(digitos(q) || '§') || resumenPrendas(o).toLowerCase().includes(q));
  if (S.filtro === 'entregada' && !q) lista = [...lista].sort((a, b) => new Date(b.entregada_at || b.created_at) - new Date(a.entregada_at || a.created_at));
  else lista = [...lista].sort((a, b) => (b.urgente - a.urgente) || (new Date(a.fecha_entrega) - new Date(b.fecha_entrega)));
  return `${bloqueCarga()}${avisoPagosFijos()}
  <div class="stats">
    <div class="stat ${atrasadas ? 'alerta' : ''}"><div class="k">Atrasadas</div><div class="v num">${atrasadas}</div></div>
    <div class="stat"><div class="k">Para hoy</div><div class="v num">${paraHoy}</div></div>
    <div class="stat"><div class="k">Por cobrar</div><div class="v num" style="font-size:17px">${L(porCobrar)}</div></div>
  </div>
  <div class="pre"><span>${IC.buscar.replace('<svg', '<svg width="18" height="18"')}</span><input class="inp" id="qOrd" type="search" placeholder="Buscar por número, cliente o prenda" value="${esc(S.q)}" autocomplete="off"></div>
  ${q ? '' : `<div class="chips">${F.map(([k, t, n]) => `<button class="chip ${S.filtro === k ? 'on' : ''}" data-a="filtro" data-x="${k}">${t}<span class="n num">${n}</span></button>`).join('')}</div>`}
  <div class="col" id="lOrd">${lista.length ? lista.map(tarjetaOrden).join('') : `<div class="empty">${q ? 'No hay órdenes que coincidan.' : S.filtro === 'activas' ? 'No hay órdenes pendientes.<br><br><a class="btn ama" href="#/nueva">' + IC.mas + 'Recibir prendas</a>' : 'No hay órdenes aquí.'}</div>`}</div>`;
}
const pendientesCola = () => S.ordenes.filter(o => ['recibida', 'en_proceso'].includes(o.estado)).map(o => ({ horas: horasOrden(o), urgente: o.urgente }));
function bloqueCarga() {
  const c = comprometidoHasta(S.neg, pendientesCola(), S.paradas), now = new Date();
  const activa = S.paradas.find(p => new Date(p.inicio) <= now && new Date(p.fin) > now);
  const prox = S.paradas.find(p => new Date(p.inicio) > now);
  return `<div class="card" style="background:var(--tinta);color:#fff;gap:8px">
    <div class="row"><div class="grow"><div class="sm" style="color:#C9CCD4">Comprometido hasta</div>
      <div class="b" style="font-size:19px">${c.fecha ? esc(fechaHora(c.fecha)) : 'Libre: podés recibir trabajo ya'}</div>
      <div class="xs" style="color:#C9CCD4">${c.horas ? `${Math.round(c.horas * 10) / 10} h de trabajo pendiente · ${S.neg.capacidad} persona${S.neg.capacidad > 1 ? 's' : ''} cosiendo` : 'Sin trabajo pendiente'}</div></div>
      <button class="btn s ama" data-a="nuevaParada">${IC.reloj}Tiempo muerto</button></div>
    ${activa ? `<div class="panel warn" style="margin-top:4px"><b>Parado ahora: ${esc(activa.motivo)}</b><span class="sm">Hasta ${esc(fechaHora(activa.fin).toLowerCase())}</span></div>` : ''}
    ${!activa && prox ? `<div class="xs" style="color:var(--amarillo)">Próximo tiempo muerto: ${esc(prox.motivo)}, ${esc(fechaHora(prox.inicio).toLowerCase())}</div>` : ''}
  </div>`;
}
function pagosFijosPendientes(y, m, pagados) {
  const out = [];
  S.fijos.forEach(pf => vencimientos(pf, y, m).forEach(v => { if (!pagados.some(g => g.pago_fijo_id === pf.id && g.periodo === v.periodo)) out.push({ pf, ...v }); }));
  return out.sort((a, b) => a.fecha - b.fecha);
}
function avisoPagosFijos() {
  if (!esDueno() || !S.fijos.length) return '';
  const hoy = inicioDia(new Date()), lim = new Date(hoy); lim.setDate(lim.getDate() + 3);
  const p = pagosFijosPendientes(hoy.getFullYear(), hoy.getMonth(), S.pagosFijosMes).filter(x => x.fecha <= lim);
  if (!p.length) return '';
  const venc = p.filter(x => x.fecha < hoy);
  return `<a class="panel ${venc.length ? 'bad' : 'warn'}" href="#/mas/conta" style="text-decoration:none"><b>${venc.length ? 'Pagos fijos vencidos' : 'Pagos fijos por vencer'}</b>
    <span class="sm">${p.map(x => `${esc(x.pf.concepto)} ${L(x.pf.monto)} · ${x.fecha < hoy ? 'venció ' : 'vence '}${esc(diaLbl(x.fecha).toLowerCase())}`).join('<br>')}</span></a>`;
}
function tarjetaOrden(o) {
  const c = ordCli(o), ee = estadoEntrega(o), s = saldo(o);
  const cuando = o.estado === 'entregada' ? 'Entregada ' + diaLbl(o.entregada_at).toLowerCase() : o.estado === 'cancelada' ? '' : (ee === 'vencida' ? 'Atrasada · ' : '') + fechaHora(o.fecha_entrega);
  return `<a class="card tap ord" href="#/orden/${o.id}" style="text-decoration:none">
    <div class="numero num"><span>${o.numero}</span></div>
    <div class="grow" style="display:flex;flex-direction:column;gap:3px">
      <div class="nom ell">${esc(c.nombre)}</div>
      <div class="det ell">${esc(resumenPrendas(o))}</div>
      <div class="row wrap" style="gap:6px;margin-top:3px">${tagEstado(o.estado)}${o.urgente ? '<span class="tag urg">Urgente</span>' : ''}${s > 0 && o.estado !== 'cancelada' ? `<span class="tag plain" style="background:var(--fondo)">Debe ${L(s)}</span>` : ''}</div>
    </div>
    <div class="cuando ${ee}">${esc(cuando)}</div></a>`;
}
A.filtro = k => { S.filtro = k; render(); };
document.addEventListener('input', e => {
  if (e.target.id === 'qOrd') { S.q = e.target.value; const pos = e.target.selectionStart; render(); const i = $('#qOrd'); i.focus(); i.setSelectionRange(pos, pos); }
  if (e.target.id === 'qCli') { S.qc = e.target.value; $('#lCli').innerHTML = listaClientes(); }
});

/* ---------- Detalle de orden ---------- */
function vOrden(o) {
  const c = ordCli(o), pag = pagado(o), s = saldo(o), ee = estadoEntrega(o);
  const pasos = ['recibida', 'en_proceso', 'lista', 'entregada'], idx = pasos.indexOf(o.estado);
  const prendas = [...(o.ord_prendas || [])].sort((a, b) => a.pos - b.pos);
  let acc = '';
  if (o.estado === 'recibida') acc = `<button class="btn pri full" data-a="estado" data-x="en_proceso">Empezar el trabajo</button><button class="btn full" data-a="marcarLista">Ya está lista</button>`;
  if (o.estado === 'en_proceso') acc = `<button class="btn ok full" data-a="marcarLista">${IC.ok}Ya está lista</button>`;
  if (o.estado === 'lista') acc = `<button class="btn wa full" data-a="avisarLista">${IC.wa}Avisar que está lista</button><button class="btn pri full" data-a="entregar">Entregar al cliente</button>`;
  if (o.estado === 'entregada') acc = `<div class="panel ok"><b>Entregada ${esc(fechaHora(o.entregada_at).toLowerCase())}</b></div>`;
  if (o.estado === 'cancelada') acc = `<div class="panel bad"><b>Orden cancelada</b></div>`;
  return `
  <div class="card">
    <div class="row between"><div class="row wrap" style="gap:6px">${tagEstado(o.estado)}${o.urgente ? '<span class="tag urg">Urgente</span>' : ''}</div><span class="sm faint">Recibida ${esc(fechaCorta(o.created_at))}</span></div>
    ${o.estado !== 'cancelada' ? `<div class="pasos">${['Recibida', 'En proceso', 'Lista', 'Entregada'].map((t, i) => `<div class="paso ${i <= idx ? 'on' : ''} ${i === idx && i < 3 ? 'ahora' : ''}"><div class="bar"></div>${t}</div>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:4px"><div class="grow"><div class="sm muted">Entrega</div><div class="b ${ee === 'vencida' ? 'err' : ''}" style="font-size:16px">${ee === 'vencida' ? 'Atrasada · ' : ''}${esc(fechaHora(o.fecha_entrega))}</div></div>
      ${ACTIVAS.includes(o.estado) ? `<button class="btn s" data-a="editarFecha">${IC.reloj}Cambiar</button>` : ''}</div>
    <div class="col" style="gap:8px">${acc}</div>
  </div>

  <div class="card">
    <div class="row"><div class="grow"><div class="b" style="font-size:16px">${esc(c.nombre)}</div><div class="sm muted num">${esc(telFmt(c.tel)) || 'Sin WhatsApp'}</div></div>
      <a class="btn s" href="#/cliente/${o.cliente_id}">Ver cliente</a></div>
    ${c.tel ? `<div class="btns"><button class="btn s wa" data-a="enviarComprobante">${IC.wa}Enviar comprobante</button><a class="btn s" href="tel:+504${digitos(c.tel)}">Llamar</a></div>` : ''}
    <button class="btn s quiet" data-a="copiarEnlace" style="align-self:flex-start">${IC.link}Copiar enlace de la orden</button>
  </div>

  <div class="sect">Prendas (${prendas.reduce((a, p) => a + p.cantidad, 0)})</div>
  ${prendas.map(p => {
    const med = p.medida_id ? MED[p.medida_id] : null;
    return `<div class="card">
      <div class="row"><div class="grow"><div class="b">${p.cantidad > 1 ? p.cantidad + ' × ' : ''}${esc(p.descripcion)}</div>${p.notas ? `<div class="sm muted" style="white-space:pre-wrap">${esc(p.notas)}</div>` : ''}</div>
        <div class="right"><div class="b num">${L(p.precio * p.cantidad)}</div>${p.cantidad > 1 ? `<div class="xs faint num">${L(p.precio)} c/u</div>` : ''}</div>
        ${ACTIVAS.includes(o.estado) ? `<button class="btn-ic" data-a="editarPrenda" data-x="${p.id}" aria-label="Editar prenda">${IC.lapiz}</button>` : ''}</div>
      ${['referencias', 'fotos'].map(campo => (p[campo] || []).length || ACTIVAS.includes(o.estado) ? `<div class="col" style="gap:6px"><div class="xs b muted">${ETQ_FOTOS[campo][0]}</div><div class="fotos">
        ${(p[campo] || []).map(f => `<button class="foto" data-a="verFoto" data-x="${p.id}|${campo}|${esc(f)}"><img data-foto="${esc(f)}" alt="${ETQ_FOTOS[campo][0]}"></button>`).join('')}
        ${ACTIVAS.includes(o.estado) ? `<label class="foto add" aria-label="Agregar">${campo === 'fotos' ? IC.camara : IC.imagen}<input type="file" accept="image/*" multiple hidden data-a="fotoPrenda" data-x="${p.id}|${campo}"></label>` : ''}</div></div>` : '').join('')}
      ${p.medida_id ? `<div class="medida-ref" data-med="${p.medida_id}">${med ? bloqueMedida(med) : '<span class="sm faint">Cargando medidas…</span>'}</div>` : ''}
    </div>`;
  }).join('')}
  ${ACTIVAS.includes(o.estado) ? `<button class="btn" data-a="agregarPrendaOrden">${IC.mas}Agregar prenda</button>` : ''}

  <div class="sect">Cobro</div>
  <div class="card">
    ${o.recargo > 0 ? `<div class="kv"><span class="k">Subtotal</span><span class="num">${L(o.subtotal)}</span></div><div class="kv"><span class="k">Recargo urgente</span><span class="num">${L(o.recargo)}</span></div>` : ''}
    <div class="kv tot"><span>Total</span><span class="num">${L(o.total)}</span></div>
    ${(o.ord_pagos || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(p => `<div class="kv"><span class="k">${TIPOS_PAGO[p.tipo]} · ${METODOS[p.metodo]} · ${esc(fechaCorta(p.created_at))}</span><span class="num row" style="gap:4px">− ${L(p.monto)}${esDueno() ? `<button class="btn-ic" style="width:28px;height:28px" data-a="borrarPago" data-x="${p.id}" aria-label="Borrar pago">${IC.x}</button>` : ''}</span></div>`).join('')}
    <div class="hr"></div>
    <div class="kv tot"><span>${s > 0 ? 'Saldo' : 'Pagada'}</span><span class="num" style="color:${s > 0 ? 'var(--mal)' : 'var(--ok)'}">${s > 0 ? L(s) : '✓'}</span></div>
    ${s > 0 && o.estado !== 'cancelada' ? `<button class="btn full" data-a="cobrar">Registrar pago</button>` : ''}
  </div>

  <div class="sect">Materiales y costos</div>
  <div class="card" id="matOrd"><div class="spin" style="margin:10px auto"></div></div>

  <div class="card"><label class="f">Notas de la orden<textarea class="inp" id="notasOrd" placeholder="Algo que el taller deba recordar">${esc(o.notas)}</textarea></label>
    <button class="btn s" data-a="guardarNotas" style="align-self:flex-end">Guardar notas</button></div>

  <details class="card"><summary class="b" style="cursor:pointer">Historial</summary><div id="hist" class="list sm"><div class="spin" style="margin:12px auto"></div></div></details>

  ${ACTIVAS.includes(o.estado) && esDueno() ? `<button class="btn mal" data-a="cancelar">Cancelar orden</button>` : ''}
  ${o.estado === 'entregada' && esDueno() ? `<button class="btn quiet" data-a="estado" data-x="lista">Deshacer entrega</button>` : ''}
  ${o.estado === 'cancelada' && esDueno() ? `<button class="btn" data-a="estado" data-x="recibida">Reactivar orden</button>` : ''}`;
}
const ordActual = () => S.ordenes.find(o => o.id === ruta()[1]);
const MED = {};
function bloqueMedida(m) {
  const v = (m.valores || []).filter(x => String(x.v || '').trim());
  return `<div class="col" style="gap:6px"><div class="sm b row" style="gap:6px">${IC.regla.replace('<svg', '<svg width="16" height="16"')}Medidas · ${esc(m.etiqueta)}</div>
    ${v.length ? `<div class="medidas">${v.map(x => `<div class="medida"><div class="k">${esc(x.n)}</div><div class="v num">${esc(x.v)}</div></div>`).join('')}</div>` : '<span class="sm faint">Sin valores</span>'}
    ${m.notas ? `<div class="sm muted">${esc(m.notas)}</div>` : ''}</div>`;
}
async function despuesDeOrden(o) {
  // medidas e historial se cargan aparte
  const ids = [...new Set((o.ord_prendas || []).map(p => p.medida_id).filter(id => id && !MED[id]))];
  if (ids.length) {
    const { data } = await sb.from('ord_medidas').select('*').in('id', ids);
    (data || []).forEach(m => MED[m.id] = m);
    $$('[data-med]').forEach(el => { const m = MED[el.dataset.med]; if (m) el.innerHTML = bloqueMedida(m); });
  }
  cargarMateriales(o);
  const det = $('details.card'); if (!det) return;
  det.addEventListener('toggle', async () => {
    if (!det.open) return;
    const { data } = await sb.from('ord_eventos').select('*').eq('orden_id', o.id).order('created_at');
    $('#hist').innerHTML = (data || []).map(e => `<div class="li"><div class="grow">${ESTADOS[e.estado] || esc(e.estado)}</div><div class="faint num">${esc(fechaHora(e.created_at))}</div></div>`).join('') || '<div class="faint">Sin movimientos</div>';
  }, { once: true });
}
const _render = render;
render = function () { _render(); const [r] = ruta(); if (r === 'orden' && ordActual()) despuesDeOrden(ordActual()); if (r === 'cliente') despuesDeCliente(); };

async function refrescarOrden(id) {
  const { data, error } = await sb.from('ord_ordenes').select('*, ord_clientes(id,nombre,tel), ord_prendas(*), ord_pagos(*)').eq('id', id).single();
  if (error) throw error;
  const i = S.ordenes.findIndex(o => o.id === id); if (i >= 0) S.ordenes[i] = data; else S.ordenes.push(data);
  return data;
}
async function cambiarEstado(o, estado) {
  const { error } = await sb.from('ord_ordenes').update({ estado }).eq('id', o.id);
  if (error) throw error;
  return refrescarOrden(o.id);
}
A.estado = (estado, b) => ocupado(b, async () => { await cambiarEstado(ordActual(), estado); render(); toast(ESTADOS[estado]); });
A.marcarLista = (x, b) => ocupado(b, async () => { const o = await cambiarEstado(ordActual(), 'lista'); render(); hojaAvisoLista(o); });
A.avisarLista = () => hojaAvisoLista(ordActual());
function msgLista(o) {
  const c = ordCli(o), s = saldo(o);
  const base = (S.neg.msg_lista || '').trim() || 'Hola {nombre}, tu orden #{numero} ya está lista en {taller}. {saldo}Te esperamos.';
  return base.replace(/\{nombre\}/g, primero(c.nombre)).replace(/\{numero\}/g, o.numero).replace(/\{taller\}/g, S.neg.nombre)
    .replace(/\{saldo\}/g, s > 0 ? `El saldo a pagar es ${L(s)}. ` : 'Ya está pagada. ').replace(/\{total\}/g, L(o.total))
    + `\n\nDetalle: ${linkOrden(o.token)}`;
}
function msgRecibida(o) {
  const c = ordCli(o), s = saldo(o), pag = pagado(o);
  return `Hola ${primero(c.nombre)}, recibimos tu orden #${o.numero} en ${S.neg.nombre}.\n\n` +
    (o.ord_prendas || []).sort((a, b) => a.pos - b.pos).map(p => `• ${p.cantidad > 1 ? p.cantidad + ' × ' : ''}${p.descripcion}: ${L(p.precio * p.cantidad)}`).join('\n') +
    (o.recargo > 0 ? `\n• Recargo urgente: ${L(o.recargo)}` : '') +
    `\n\nTotal: ${L(o.total)}` + (pag > 0 ? `\nAbonado: ${L(pag)}\nSaldo: ${L(s)}` : '') +
    `\nEntrega: ${fechaHora(o.fecha_entrega).toLowerCase()}\n\nMirá el estado de tu orden aquí: ${linkOrden(o.token)}`;
}
function hojaAvisoLista(o) {
  const c = ordCli(o);
  if (!c.tel) return toast('Este cliente no tiene WhatsApp registrado');
  abrirHoja('Avisar al cliente', `<p class="muted">Se abre WhatsApp con este mensaje para ${esc(primero(c.nombre))}. Podés cambiarlo antes de enviarlo.</p>
    <textarea class="inp" id="txtWa" style="min-height:150px">${esc(msgLista(o))}</textarea>
    <a class="btn wa full" id="bWa" target="_blank" rel="noopener">${IC.wa}Abrir WhatsApp</a>`, h => {
    const b = $('#bWa', h), t = $('#txtWa', h), upd = () => b.href = waLink(c.tel, t.value); upd(); t.oninput = upd; b.onclick = () => setTimeout(cerrarHoja, 300);
  });
}
A.enviarComprobante = () => {
  const o = ordActual(), c = ordCli(o);
  abrirHoja('Enviar comprobante', `<p class="muted">El cliente recibe el detalle y un enlace para ver cuándo está lista su orden.</p>
    <textarea class="inp" id="txtWa" style="min-height:200px">${esc(msgRecibida(o))}</textarea>
    <a class="btn wa full" id="bWa" target="_blank" rel="noopener">${IC.wa}Abrir WhatsApp</a>`, h => {
    const b = $('#bWa', h), t = $('#txtWa', h), upd = () => b.href = waLink(c.tel, t.value); upd(); t.oninput = upd; b.onclick = () => setTimeout(cerrarHoja, 300);
  });
};
A.copiarEnlace = async () => { const u = linkOrden(ordActual().token); try { await navigator.clipboard.writeText(u); toast('Enlace copiado'); } catch (e) { prompt('Copiá el enlace:', u); } };
A.verFoto = async x => {
  const [pid, campo, path] = x.includes('|') ? x.split('|') : [null, null, x];
  const u = await urlFoto(path), o = ordActual();
  abrirHoja(campo ? ETQ_FOTOS[campo][0] : 'Foto', `<img src="${esc(u)}" alt="Foto" style="border-radius:12px;width:100%"><a class="btn full" href="${esc(u)}" target="_blank" rel="noopener">Abrir en grande</a>
    ${pid && o && ACTIVAS.includes(o.estado) ? '<button class="btn mal full" id="bQF">Quitar esta foto</button>' : ''}`, h => {
    $('#bQF', h)?.addEventListener('click', async () => {
      if (!await confirmar('¿Quitar esta foto?', { si: 'Quitar', peligro: true })) return;
      try {
        const p = o.ord_prendas.find(z => z.id === pid), lista = (p[campo] || []).filter(z => z !== path);
        const { error } = await sb.from('ord_prendas').update({ [campo]: lista }).eq('id', pid); if (error) throw error;
        sb.storage.from(CONFIG.BUCKET).remove([path]); await refrescarOrden(o.id); render(); toast('Foto quitada');
      } catch (e) { fallo(e); }
    });
  });
};
A.fotoPrenda = async (x, el) => {
  const [pid, campo] = x.split('|'), files = [...(el.files || [])]; if (!files.length) return;
  const o = ordActual(); toast('Subiendo ' + files.length + ' foto' + (files.length > 1 ? 's' : '') + '…');
  try {
    const paths = await Promise.all(files.map(subirFoto));
    const p = o.ord_prendas.find(z => z.id === pid);
    const { error } = await sb.from('ord_prendas').update({ [campo]: [...(p[campo] || []), ...paths] }).eq('id', pid); if (error) throw error;
    await refrescarOrden(o.id); render(); toast('Listo');
  } catch (e) { fallo(e); }
};
A.guardarNotas = (x, b) => ocupado(b, async () => { const o = ordActual(); const { error } = await sb.from('ord_ordenes').update({ notas: $('#notasOrd').value.trim() }).eq('id', o.id); if (error) throw error; o.notas = $('#notasOrd').value.trim(); toast('Notas guardadas'); });
A.cancelar = async () => { if (!await confirmar('¿Cancelar esta orden? Ya no aparecerá en pendientes.', { si: 'Cancelar orden', no: 'Volver', peligro: true })) return; try { await cambiarEstado(ordActual(), 'cancelada'); render(); toast('Orden cancelada'); } catch (e) { fallo(e); } };
A.borrarPago = async id => { if (!await confirmar('¿Borrar este pago? Solo hacelo si se registró por error.', { si: 'Borrar pago', peligro: true })) return; try { const { error } = await sb.from('ord_pagos').delete().eq('id', id); if (error) throw error; await refrescarOrden(ordActual().id); render(); toast('Pago borrado'); } catch (e) { fallo(e); } };
A.editarFecha = () => {
  const o = ordActual();
  abrirHoja('Fecha de entrega', `<label class="f">Nueva fecha y hora<input class="inp" type="datetime-local" id="fEnt" value="${aLocalInput(o.fecha_entrega)}"></label>
    <button class="btn pri full" id="bF">Guardar</button>`, h => {
    $('#bF', h).onclick = e => ocupado(e.currentTarget, async () => {
      const v = $('#fEnt', h).value; if (!v) return toast('Elegí la fecha', true);
      const { error } = await sb.from('ord_ordenes').update({ fecha_entrega: deLocalInput(v).toISOString() }).eq('id', o.id); if (error) throw error;
      await refrescarOrden(o.id); cerrarHoja(); render(); toast('Fecha cambiada');
    });
  });
};
function formPago(maximo, titulo = 'Registrar pago') {
  return `<div class="panel info"><span class="sm">Saldo pendiente</span><b class="num" style="font-size:20px">${L(maximo)}</b></div>
    <label class="f">Monto<div class="pre"><span>L</span><input class="inp" id="pMonto" type="number" inputmode="decimal" min="0" step="any" value="${maximo}"></div></label>
    <div class="f">Cómo pagó<div class="seg" id="pMet">${Object.entries(METODOS).map(([k, t], i) => `<button type="button" data-m="${k}" class="${i === 0 ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    <label class="f hidden" id="pRefW">Referencia (opcional)<input class="inp" id="pRef" placeholder="Número de la transferencia"></label>`;
}
function leerPago(h, maximo) {
  const monto = Number($('#pMonto', h).value), metodo = $('#pMet .on', h).dataset.m, ref = $('#pRef', h).value.trim();
  if (!(monto > 0)) throw new Error('Escribí el monto.');
  if (monto > maximo + 0.001) throw new Error('El monto es mayor que el saldo (' + L(maximo) + ').');
  return { monto, metodo, ref };
}
function enlazarMetodo(h) { $$('#pMet button', h).forEach(b => b.onclick = () => { $$('#pMet button', h).forEach(x => x.classList.toggle('on', x === b)); $('#pRefW', h).classList.toggle('hidden', !['transferencia', 'tigo_money'].includes(b.dataset.m)); }); }
A.cobrar = () => {
  const o = ordActual(), s = saldo(o);
  abrirHoja('Registrar pago', formPago(s) + `<button class="btn pri full" id="bP">Guardar pago</button>`, h => {
    enlazarMetodo(h);
    $('#bP', h).onclick = e => ocupado(e.currentTarget, async () => {
      const p = leerPago(h, s);
      const { error } = await sb.from('ord_pagos').insert({ orden_id: o.id, negocio_id: o.negocio_id, monto: p.monto, metodo: p.metodo, ref: p.ref, tipo: p.monto >= s ? 'saldo' : 'abono' });
      if (error) throw error; await refrescarOrden(o.id); cerrarHoja(); render(); toast('Pago registrado');
    });
  });
};
A.entregar = () => {
  const o = ordActual(), s = saldo(o);
  if (s <= 0) return confirmar(`¿Entregar la orden ${o.numero} a ${primero(ordCli(o).nombre)}?`, { si: 'Entregar' }).then(ok => ok && cambiarEstado(o, 'entregada').then(() => { render(); toast('Orden entregada'); }).catch(fallo));
  abrirHoja('Entregar y cobrar', formPago(s) + `<button class="btn ok full" id="bE">Cobrar y entregar</button><button class="btn quiet full" id="bSin">Entregar sin cobrar el saldo</button>`, h => {
    enlazarMetodo(h);
    $('#bE', h).onclick = e => ocupado(e.currentTarget, async () => {
      const p = leerPago(h, s);
      const { error } = await sb.from('ord_pagos').insert({ orden_id: o.id, negocio_id: o.negocio_id, monto: p.monto, metodo: p.metodo, ref: p.ref, tipo: p.monto >= s ? 'saldo' : 'abono' });
      if (error) throw error;
      await cambiarEstado(o, 'entregada'); cerrarHoja(); render(); toast(p.monto >= s ? 'Cobrada y entregada' : 'Entregada · queda debiendo ' + L(s - p.monto));
    });
    $('#bSin', h).onclick = async () => { if (!await confirmar(`El cliente se lleva la prenda debiendo ${L(s)}. ¿Seguro?`, { si: 'Sí, entregar' })) return; try { await cambiarEstado(o, 'entregada'); render(); toast('Entregada con saldo pendiente'); } catch (e) { fallo(e); } };
  });
};
/* Editar o agregar prendas en una orden ya creada */
function formPrendaSimple(p) {
  return `<label class="f">Descripción<input class="inp" id="eDes" value="${esc(p.descripcion)}"></label>
    <div class="grid3"><label class="f">Cantidad<input class="inp" id="eCan" type="number" inputmode="numeric" min="1" value="${p.cantidad}"></label>
    <label class="f">Precio c/u<input class="inp" id="ePre" type="number" inputmode="decimal" min="0" step="any" value="${p.precio}"></label>
    <label class="f">Horas<input class="inp" id="eHor" type="number" inputmode="decimal" min="0.25" step="0.25" value="${p.horas}"></label></div>
    <label class="f">Notas<textarea class="inp" id="eNot" placeholder="Detalles del arreglo">${esc(p.notas || '')}</textarea></label>`;
}
const leerPrendaSimple = h => {
  const d = { descripcion: $('#eDes', h).value.trim(), cantidad: Math.max(1, parseInt($('#eCan', h).value) || 1), precio: Math.max(0, Number($('#ePre', h).value) || 0), horas: Math.max(0.25, Number($('#eHor', h).value) || 1), notas: $('#eNot', h).value.trim() };
  if (!d.descripcion) throw new Error('Escribí la descripción.'); return d;
};
A.editarPrenda = id => {
  const o = ordActual(), p = o.ord_prendas.find(x => x.id === id);
  abrirHoja('Editar prenda', formPrendaSimple(p) + `<button class="btn pri full" id="bG">Guardar</button>${o.ord_prendas.length > 1 ? '<button class="btn mal full" id="bB">Quitar prenda</button>' : ''}`, h => {
    $('#bG', h).onclick = e => ocupado(e.currentTarget, async () => {
      const { error } = await sb.from('ord_prendas').update(leerPrendaSimple(h)).eq('id', id); if (error) throw error;
      await sb.rpc('ord_recalcular', { p_orden: o.id }); await refrescarOrden(o.id); cerrarHoja(); render(); toast('Prenda actualizada');
    });
    $('#bB', h)?.addEventListener('click', async () => {
      if (!await confirmar('¿Quitar esta prenda de la orden?', { si: 'Quitar', peligro: true })) return;
      try { const { error } = await sb.from('ord_prendas').delete().eq('id', id); if (error) throw error; await sb.rpc('ord_recalcular', { p_orden: o.id }); await refrescarOrden(o.id); render(); toast('Prenda quitada'); } catch (e) { fallo(e); }
    });
  });
};
A.agregarPrendaOrden = () => {
  const o = ordActual();
  abrirHoja('Agregar prenda', `<div class="servs">${S.servs.map(s => `<button class="serv" data-s="${s.id}"><span class="n">${esc(s.nombre)}</span><span class="p num">${s.precio ? L(s.precio) : 'Precio a definir'}</span></button>`).join('')}<button class="serv" data-s=""><span class="n">Otra cosa</span><span class="p">Escribirla</span></button></div>`, h => {
    $$('[data-s]', h).forEach(b => b.onclick = () => {
      const s = S.servs.find(x => x.id === b.dataset.s);
      const p = { descripcion: s ? s.nombre : '', cantidad: 1, precio: s ? s.precio : 0, horas: s ? s.horas : 1, notas: '' };
      abrirHoja('Agregar prenda', formPrendaSimple(p) + `<button class="btn pri full" id="bG">Agregar</button>`, h2 => {
        $('#bG', h2).onclick = e => ocupado(e.currentTarget, async () => {
          const d = leerPrendaSimple(h2);
          const { error } = await sb.from('ord_prendas').insert({ ...d, orden_id: o.id, negocio_id: o.negocio_id, servicio_id: s?.id || null, pos: o.ord_prendas.length }); if (error) throw error;
          await sb.rpc('ord_recalcular', { p_orden: o.id }); await refrescarOrden(o.id); cerrarHoja(); render(); toast('Prenda agregada');
        });
      });
    });
  });
};

/* =================== Nueva orden =================== */
const nuevaVacia = clienteId => ({ cliente: clienteId ? { ...cli(clienteId) } : { id: null, nombre: '', tel: '' }, buscar: '', prendas: [], urgente: false, fecha: null, anticipo: '', metodo: 'efectivo', ref: '', notas: '' });
const nKey = () => Math.random().toString(36).slice(2, 9);
function totalesN() {
  const sub = N.prendas.reduce((a, p) => a + (Number(p.precio) || 0) * (Number(p.cantidad) || 1), 0);
  const rec = N.urgente ? Math.round(sub * (S.neg.recargo_urgente || 0) / 100) : 0;
  return { sub, rec, total: sub + rec, horas: N.prendas.reduce((a, p) => a + (Number(p.horas) || 1) * (Number(p.cantidad) || 1), 0) };
}
function sugeridaN() {
  const pend = S.ordenes.filter(o => ['recibida', 'en_proceso'].includes(o.estado)).map(o => ({ horas: horasOrden(o), urgente: o.urgente }));
  return fechaSugerida(S.neg, totalesN().horas || 1, N.urgente, pend, S.paradas);
}
function vNueva() {
  if (!N) N = nuevaVacia(new URLSearchParams(location.hash.split('?')[1] || '').get('c'));
  const t = totalesN(), sug = sugeridaN(), fecha = N.fecha || sug, c = N.cliente;
  const medidasCli = c.id ? Object.values(MED).filter(m => m.cliente_id === c.id) : [];
  let cliHtml;
  if (c.id) cliHtml = `<div class="row"><div class="grow"><div class="b" style="font-size:16px">${esc(c.nombre)}</div><div class="sm muted num">${esc(telFmt(c.tel)) || 'Sin WhatsApp'}</div></div><button class="btn s" data-a="nCambiarCli">Cambiar</button></div>`;
  else cliHtml = `<label class="f">WhatsApp<input class="inp" id="nTel" inputmode="tel" placeholder="9999-9999" value="${esc(c.tel)}" autocomplete="off"></label>
    <label class="f">Nombre<input class="inp" id="nNom" placeholder="Nombre y apellido" value="${esc(c.nombre)}" autocomplete="off"></label>
    <div id="nSug" class="list"></div>`;
  return `
  <div class="sect">1. Cliente</div>
  <div class="card">${cliHtml}</div>

  <div class="sect">2. Prendas</div>
  ${N.prendas.map((p, i) => `<div class="prenda" data-k="${p.k}">
    <div class="row"><input class="inp grow" data-a="nCampo" data-x="${p.k}|descripcion" value="${esc(p.descripcion)}" placeholder="¿Qué prenda y qué arreglo?" style="font-weight:700"><button class="btn-ic" data-a="nQuitar" data-x="${p.k}" aria-label="Quitar prenda">${IC.basura}</button></div>
    <div class="grid3">
      <label class="f">Cantidad<input class="inp" type="number" inputmode="numeric" min="1" data-a="nCampo" data-x="${p.k}|cantidad" value="${p.cantidad}"></label>
      <label class="f">Precio c/u<input class="inp" type="number" inputmode="decimal" min="0" step="any" data-a="nCampo" data-x="${p.k}|precio" value="${p.precio}"></label>
      <label class="f">Horas<input class="inp" type="number" inputmode="decimal" min="0.25" step="0.25" data-a="nCampo" data-x="${p.k}|horas" value="${p.horas}"></label>
    </div>
    <textarea class="inp" data-a="nCampo" data-x="${p.k}|notas" placeholder="Detalles: color, largo, dónde ajustar…" style="min-height:56px">${esc(p.notas)}</textarea>
    ${filaFotosN(p, esConfeccion(p) ? 'referencias' : 'fotos')}${filaFotosN(p, esConfeccion(p) ? 'fotos' : 'referencias')}
    <div class="row wrap" style="gap:8px">
      ${p.medida_id && MED[p.medida_id] ? `<span class="tag plain" style="background:var(--amarillo-2);color:var(--tinta)">${IC.regla.replace('<svg', '<svg width="14" height="14"')} ${esc(MED[p.medida_id].etiqueta)}</span><button class="btn s quiet" data-a="nMedida" data-x="${p.k}">Cambiar medidas</button>`
        : `<button class="btn s" data-a="nMedida" data-x="${p.k}">${IC.regla}${medidasCli.length ? 'Usar medidas' : 'Tomar medidas'}</button>`}
      <span class="grow"></span><b class="num">${L((Number(p.precio) || 0) * (Number(p.cantidad) || 1))}</b>
    </div></div>`).join('')}
  <button class="btn ${N.prendas.length ? '' : 'ama'}" data-a="nAgregar">${IC.mas}${N.prendas.length ? 'Agregar otra prenda' : 'Agregar prenda'}</button>

  <div class="sect">3. Entrega</div>
  <div class="card">
    <label class="chk"><input type="checkbox" data-a="nUrgente" ${N.urgente ? 'checked' : ''}> Urgente <span class="muted" style="font-weight:500">(+${S.neg.recargo_urgente}% · se entrega antes)</span></label>
    <div class="panel info"><span class="sm">Fecha sugerida según el trabajo pendiente del taller</span><b id="nSugTxt">${esc(fechaHora(sug))}</b></div>
    <label class="f">Fecha de entrega<input class="inp" type="datetime-local" id="nFecha" data-a="nFecha" value="${aLocalInput(fecha)}"></label>
    ${N.fecha ? `<button class="btn s quiet" data-a="nUsarSug" style="align-self:flex-start">Usar la sugerida</button>` : ''}
  </div>

  <div class="sect">4. Cobro</div>
  <div class="card">
    ${t.rec ? `<div class="kv"><span class="k">Subtotal</span><span class="num">${L(t.sub)}</span></div><div class="kv"><span class="k">Recargo urgente</span><span class="num">${L(t.rec)}</span></div>` : ''}
    <div class="kv tot"><span>Total</span><span class="num" id="nTot">${L(t.total)}</span></div>
    <label class="f">Anticipo que deja el cliente<div class="pre"><span>L</span><input class="inp" id="nAnt" data-a="nAnt" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${esc(N.anticipo)}"></div></label>
    <div class="row wrap" style="gap:6px">${[0.5, 1].map(k => `<button class="btn s" data-a="nAntRap" data-x="${k}">${k === 1 ? 'Todo' : 'La mitad'}</button>`).join('')}</div>
    <div class="seg" id="nMet">${Object.entries(METODOS).map(([k, tt]) => `<button type="button" data-a="nMetodo" data-x="${k}" class="${N.metodo === k ? 'on' : ''}">${tt}</button>`).join('')}</div>
    ${['transferencia', 'tigo_money'].includes(N.metodo) ? `<input class="inp" id="nRef" data-a="nRef" placeholder="Referencia (opcional)" value="${esc(N.ref)}">` : ''}
    <div class="kv"><span class="k">Queda debiendo</span><b class="num" id="nSal">${L(Math.max(0, t.total - (Number(N.anticipo) || 0)))}</b></div>
  </div>
  <label class="f">Notas de la orden<textarea class="inp" data-a="nNotas" placeholder="Opcional">${esc(N.notas)}</textarea></label>
  <button class="btn pri full" data-a="nGuardar" style="min-height:54px;font-size:16px">Guardar orden</button>
  <button class="btn quiet" data-a="nDescartar">Descartar</button>`;
}
function reN() { const y = window.scrollY; render(); window.scrollTo(0, y); }
function actualizarTotalesN() { const t = totalesN(); $('#nTot') && ($('#nTot').textContent = L(t.total)); $('#nSal') && ($('#nSal').textContent = L(Math.max(0, t.total - (Number(N.anticipo) || 0)))); }
A.nCampo = (x, el) => { const [k, campo] = x.split('|'), p = N.prendas.find(q => q.k === k); p[campo] = el.value; if (['precio', 'cantidad'].includes(campo)) { actualizarTotalesN(); const tot = el.closest('.prenda').querySelector('b.num'); tot.textContent = L((Number(p.precio) || 0) * (Number(p.cantidad) || 1)); } };
/* Al cambiar horas o cantidad se actualiza la fecha sugerida sin redibujar (no se pierde el foco) */
function actualizarFechaN() { const sug = sugeridaN(); if ($('#nSugTxt')) $('#nSugTxt').textContent = fechaHora(sug); if (!N.fecha && $('#nFecha')) $('#nFecha').value = aLocalInput(sug); }
document.addEventListener('change', e => { if (N && e.target.matches?.('[data-a="nCampo"]') && /horas|cantidad/.test(e.target.dataset.x)) actualizarFechaN(); });
A.nQuitar = k => { N.prendas = N.prendas.filter(p => p.k !== k); reN(); };
A.nAgregar = () => abrirHoja('¿Qué trae?', `<div class="servs">${S.servs.map(s => `<button class="serv" data-s="${s.id}"><span class="n">${esc(s.nombre)}</span><span class="p num">${s.precio ? L(s.precio) : 'Precio a definir'}</span></button>`).join('')}<button class="serv" data-s=""><span class="n">Otra cosa</span><span class="p">Escribirla</span></button></div>
  <p class="xs faint">Los servicios y precios se cambian en Más → Servicios.</p>`, h => {
  $$('[data-s]', h).forEach(b => b.onclick = () => {
    const s = S.servs.find(x => x.id === b.dataset.s);
    N.prendas.push({ k: nKey(), servicio_id: s?.id || null, descripcion: s ? s.nombre : '', cantidad: 1, precio: s ? s.precio : '', horas: s ? s.horas : 1, notas: '', fotos: [], referencias: [], medida_id: null });
    cerrarHoja(); reN();
    if (!s) setTimeout(() => $(`.prenda[data-k="${N.prendas.at(-1).k}"] input`)?.focus(), 50);
  });
});
A.nUrgente = (x, el) => { N.urgente = el.checked; reN(); };
A.nFecha = (x, el) => { N.fecha = el.value ? deLocalInput(el.value) : null; };
A.nUsarSug = () => { N.fecha = null; reN(); };
A.nAnt = (x, el) => { N.anticipo = el.value; actualizarTotalesN(); };
A.nAntRap = k => { N.anticipo = String(Math.round(totalesN().total * Number(k))); reN(); };
A.nMetodo = k => { N.metodo = k; reN(); };
A.nRef = (x, el) => { N.ref = el.value; };
A.nNotas = (x, el) => { N.notas = el.value; };
A.nDescartar = async () => { if (N.prendas.length && !await confirmar('¿Descartar esta orden sin guardar?', { si: 'Descartar', peligro: true })) return; N = null; location.hash = '#/ordenes'; };
A.nCambiarCli = () => { N.cliente = { id: null, nombre: '', tel: '' }; reN(); setTimeout(() => $('#nTel')?.focus(), 50); };
A.nElegirCli = id => { N.cliente = { ...cli(id) }; cargarMedidasCli(id).then(reN); reN(); };
async function cargarMedidasCli(id) { const { data } = await sb.from('ord_medidas').select('*').eq('cliente_id', id).order('updated_at', { ascending: false }); (data || []).forEach(m => MED[m.id] = m); return data || []; }
document.addEventListener('input', e => {
  if (!N || !['nTel', 'nNom'].includes(e.target.id)) return;
  N.cliente.tel = $('#nTel').value; N.cliente.nombre = $('#nNom').value;
  const qt = digitos(N.cliente.tel), qn = N.cliente.nombre.trim().toLowerCase();
  const res = (qt.length >= 3 || qn.length >= 2) ? S.clientes.filter(c => (qt.length >= 3 && digitos(c.tel).includes(qt)) || (qn.length >= 2 && c.nombre.toLowerCase().includes(qn))).slice(0, 5) : [];
  $('#nSug').innerHTML = res.length ? `<div class="sm muted" style="margin:4px 0">¿Es alguno de estos?</div>` + res.map(c => `<button class="li" data-a="nElegirCli" data-x="${c.id}" style="text-align:left"><div class="grow"><div class="b">${esc(c.nombre)}</div><div class="sm muted num">${esc(telFmt(c.tel))}</div></div><span class="btn s">Elegir</span></button>`).join('') : '';
  $$('#nSug [data-a]').forEach(b => b.onclick = () => A.nElegirCli(b.dataset.x));
});
/* El cliente nuevo se guarda antes de tomarle medidas (las medidas quedan en su ficha) */
async function asegurarClienteN() {
  if (N.cliente.id) return N.cliente.id;
  const nombre = N.cliente.nombre.trim(), tel = digitos(N.cliente.tel);
  if (nombre.length < 2) throw new Error('Primero escribí el nombre del cliente.');
  if (tel && tel.length !== 8) throw new Error('El WhatsApp debe tener 8 dígitos.');
  const ya = tel && S.clientes.find(c => c.tel === tel);
  if (ya) { N.cliente = { ...ya }; return ya.id; }
  const { data, error } = await sb.from('ord_clientes').insert({ negocio_id: S.neg.id, nombre, tel }).select().single();
  if (error) throw error;
  S.clientes.push(data); N.cliente = { ...data }; return data.id;
}
A.nMedida = async k => {
  try { await asegurarClienteN(); } catch (e) { return toast(errMsg(e), true); }
  const p = N.prendas.find(q => q.k === k), meds = await cargarMedidasCli(N.cliente.id);
  const elegir = () => abrirHoja('Medidas de ' + primero(N.cliente.nombre), `
    ${meds.length ? `<div class="sm muted">Medidas guardadas</div>` + meds.map(m => `<button class="card tap" data-m="${m.id}" style="text-align:left;box-shadow:none;border:1px solid ${p.medida_id === m.id ? 'var(--tinta)' : 'var(--linea)'}">${bloqueMedida(m)}<span class="xs faint">Actualizadas ${esc(fechaCorta(m.updated_at))}</span></button>`).join('') : '<p class="muted">Este cliente todavía no tiene medidas.</p>'}
    <button class="btn ama full" id="bNM">${IC.regla}Tomar medidas nuevas</button>
    ${p.medida_id ? '<button class="btn quiet full" id="bSinM">No usar medidas en esta prenda</button>' : ''}`, h => {
    $$('[data-m]', h).forEach(b => b.onclick = () => { p.medida_id = b.dataset.m; cerrarHoja(); reN(); });
    $('#bNM', h).onclick = () => hojaMedida(N.cliente.id, null, m => { p.medida_id = m.id; reN(); }, p.descripcion);
    $('#bSinM', h)?.addEventListener('click', () => { p.medida_id = null; cerrarHoja(); reN(); });
  });
  elegir();
};
const esConfeccion = p => /medida|confecc|hacer|nuev/i.test(p.descripcion || '');
const ETQ_FOTOS = { fotos: ['Fotos de la prenda', 'Cómo llegó (respaldo)'], referencias: ['Referencias del cliente', 'Modelos o fotos de lo que quiere'] };
function filaFotosN(p, campo) {
  const l = p[campo] || (p[campo] = []);
  return `<div class="col" style="gap:6px"><div class="xs b muted">${ETQ_FOTOS[campo][0]} <span class="faint" style="font-weight:500">· ${ETQ_FOTOS[campo][1]}</span></div>
    <div class="fotos">${l.map((f, j) => `<div class="foto"><img src="${esc(f.prev || '')}" ${f.prev ? '' : `data-foto="${esc(f.path)}"`} alt="${ETQ_FOTOS[campo][0]}"><button class="x" data-a="nQuitarFoto" data-x="${p.k}|${campo}|${j}" aria-label="Quitar">×</button></div>`).join('')}
      <label class="foto add" aria-label="Agregar ${ETQ_FOTOS[campo][0].toLowerCase()}">${campo === 'fotos' ? IC.camara : IC.imagen}<input type="file" accept="image/*" multiple hidden data-a="nFoto" data-x="${p.k}|${campo}"></label></div></div>`;
}
async function subirFoto(file) {
  const blob = await reducirFoto(file);
  const path = `${S.neg.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(CONFIG.BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}
A.nFoto = async (x, el) => {
  const [k, campo] = x.split('|'), files = [...(el.files || [])]; if (!files.length) return;
  const p = N.prendas.find(q => q.k === k);
  const nuevas = files.map(file => ({ path: '', prev: URL.createObjectURL(file), subiendo: true, file }));
  p[campo].push(...nuevas); reN();
  await Promise.all(nuevas.map(async f => {
    try { f.path = await subirFoto(f.file); f.subiendo = false; delete f.file; }
    catch (e) { p[campo] = p[campo].filter(z => z !== f); fallo(e); }
  }));
  reN();
};
A.nQuitarFoto = x => { const [k, campo, j] = x.split('|'), p = N.prendas.find(q => q.k === k), f = p[campo][j]; p[campo].splice(j, 1); if (f?.path) sb.storage.from(CONFIG.BUCKET).remove([f.path]); reN(); };
A.nGuardar = (x, b) => ocupado(b, async () => {
  if (!N.cliente.id) { N.cliente.nombre = $('#nNom')?.value || N.cliente.nombre; N.cliente.tel = $('#nTel')?.value || N.cliente.tel; }
  const tel = digitos(N.cliente.tel);
  if (!N.cliente.id && N.cliente.nombre.trim().length < 2) throw new Error('Escribí el nombre del cliente.');
  if (!N.cliente.id && tel && tel.length !== 8) throw new Error('El WhatsApp debe tener 8 dígitos.');
  if (!N.prendas.length) throw new Error('Agregá al menos una prenda.');
  if (N.prendas.some(p => !String(p.descripcion).trim())) throw new Error('Escribí qué es cada prenda.');
  if (N.prendas.some(p => [...p.fotos, ...(p.referencias || [])].some(f => f.subiendo))) throw new Error('Esperá a que terminen de subir las fotos.');
  const t = totalesN(), ant = Number(N.anticipo) || 0, fecha = N.fecha || sugeridaN();
  if (ant > t.total) throw new Error('El anticipo es mayor que el total.');
  const { data, error } = await sb.rpc('ord_crear_orden', { p: {
    negocio_id: S.neg.id, cliente_id: N.cliente.id || '', cliente_nombre: N.cliente.nombre, cliente_tel: tel,
    urgente: N.urgente, fecha_sugerida: sugeridaN().toISOString(), fecha_entrega: new Date(fecha).toISOString(), notas: N.notas.trim(),
    anticipo: ant, anticipo_metodo: N.metodo, anticipo_ref: N.ref,
    prendas: N.prendas.map(p => ({ servicio_id: p.servicio_id || '', descripcion: p.descripcion, cantidad: Number(p.cantidad) || 1, precio: Number(p.precio) || 0, horas: Number(p.horas) || 1, notas: p.notas, medida_id: p.medida_id || '', fotos: p.fotos.map(f => f.path).filter(Boolean), referencias: (p.referencias || []).map(f => f.path).filter(Boolean) })),
  } });
  if (error) throw error;
  N = null;
  await recargar();
  location.hash = '#/orden/' + data.id;
  setTimeout(() => { const o = S.ordenes.find(z => z.id === data.id); if (o) hojaRecibida(o); }, 80);
});
function hojaRecibida(o) {
  const c = ordCli(o);
  abrirHoja('Orden ' + o.numero + ' guardada', `<div class="panel ok"><b>Listo. La orden ${o.numero} quedó registrada.</b><span class="sm">Entrega: ${esc(fechaHora(o.fecha_entrega))}</span></div>
    ${c.tel ? `<p class="muted">Mandale el comprobante por WhatsApp. Ahí le llega el enlace para ver cuándo está lista su ropa.</p>
    <textarea class="inp" id="txtWa" style="min-height:190px">${esc(msgRecibida(o))}</textarea><a class="btn wa full" id="bWa" target="_blank" rel="noopener">${IC.wa}Enviar por WhatsApp</a>` : '<p class="muted">El cliente no tiene WhatsApp registrado. Podés copiar el enlace de la orden y compartirlo como quieras.</p>'}
    <a class="btn full" href="#/nueva" data-cerrar>Recibir otra orden</a>`, h => {
    const b = $('#bWa', h), t = $('#txtWa', h); if (b) { const upd = () => b.href = waLink(c.tel, t.value); upd(); t.oninput = upd; b.onclick = () => setTimeout(cerrarHoja, 300); }
  });
}

/* ---------- Hoja de medidas (nueva o editar) ---------- */
function hojaMedida(clienteId, medida, alGuardar, sugerencia = '') {
  const adivinar = Object.keys(PLANTILLAS).find(k => k !== 'Otra' && sugerencia.toLowerCase().includes(k.split(' ')[0].toLowerCase())) || 'Pantalón';
  let etiqueta = medida?.etiqueta || adivinar;
  let campos = medida ? medida.valores.map(x => ({ ...x })) : PLANTILLAS[etiqueta].map(n => ({ n, v: '' }));
  const pintar = h => {
    h.innerHTML = `<div class="f">¿De qué prenda?<div class="chips" style="flex-wrap:wrap">${Object.keys(PLANTILLAS).map(k => `<button type="button" class="chip ${k === etiqueta ? 'on' : ''}" data-t="${esc(k)}">${esc(k)}</button>`).join('')}</div></div>
      ${etiqueta === 'Otra' || !PLANTILLAS[etiqueta] ? `<label class="f">Nombre<input class="inp" id="mEt" value="${esc(medida && !PLANTILLAS[medida.etiqueta] ? medida.etiqueta : '')}" placeholder="Ej.: Uniforme escolar"></label>` : ''}
      <div class="grid2">${campos.map((c, i) => `<label class="f">${esc(c.n)}<input class="inp" data-i="${i}" value="${esc(c.v)}" placeholder="pulg. o cm"></label>`).join('')}</div>
      <div class="row"><input class="inp grow" id="mNuevo" placeholder="Otra medida (ej.: Largo de saco)"><button class="btn s" id="mAdd">Agregar</button></div>
      <label class="f">Notas<textarea class="inp" id="mNot" placeholder="Ej.: le gusta holgado de la cadera">${esc(medida?.notas || '')}</textarea></label>
      <button class="btn pri full" id="mG">Guardar medidas</button>
      ${medida ? '<button class="btn mal full" id="mB">Borrar estas medidas</button>' : ''}`;
    const leer = () => $$('[data-i]', h).forEach(i => campos[i.dataset.i].v = i.value.trim());
    $$('[data-t]', h).forEach(b => b.onclick = () => { leer(); const conValor = campos.filter(c => c.v); etiqueta = b.dataset.t; const base = (PLANTILLAS[etiqueta] || []).map(n => ({ n, v: (conValor.find(c => c.n === n) || {}).v || '' })); campos = base.concat(conValor.filter(c => !base.some(x => x.n === c.n))); pintar(h); });
    $('#mAdd', h).onclick = () => { leer(); const n = $('#mNuevo', h).value.trim(); if (n) { campos.push({ n, v: '' }); pintar(h); $(`[data-i="${campos.length - 1}"]`, h)?.focus(); } };
    $('#mG', h).onclick = e => ocupado(e.currentTarget, async () => {
      leer();
      const et = (etiqueta === 'Otra' || !PLANTILLAS[etiqueta]) ? ($('#mEt', h)?.value.trim() || 'Otra') : etiqueta;
      const d = { cliente_id: clienteId, negocio_id: S.neg.id, etiqueta: et, valores: campos.filter(c => c.v || PLANTILLAS[et]?.includes(c.n)), notas: $('#mNot', h).value.trim() };
      if (!d.valores.some(c => c.v)) throw new Error('Escribí al menos una medida.');
      const r = medida ? await sb.from('ord_medidas').update(d).eq('id', medida.id).select().single() : await sb.from('ord_medidas').insert(d).select().single();
      if (r.error) throw r.error;
      MED[r.data.id] = r.data; cerrarHoja(); toast('Medidas guardadas'); alGuardar && alGuardar(r.data);
    });
    $('#mB', h)?.addEventListener('click', async () => {
      if (!await confirmar('¿Borrar estas medidas?', { si: 'Borrar', peligro: true })) return;
      const { error } = await sb.from('ord_medidas').delete().eq('id', medida.id); if (error) return fallo(error);
      delete MED[medida.id]; toast('Medidas borradas'); alGuardar && alGuardar(null);
    });
  };
  abrirHoja(medida ? 'Editar medidas' : 'Tomar medidas', '', pintar);
}

/* =================== Clientes =================== */
S.qc = '';
function listaClientes() {
  const q = S.qc.trim().toLowerCase();
  const l = S.clientes.filter(c => !q || c.nombre.toLowerCase().includes(q) || digitos(c.tel).includes(digitos(q) || '§'));
  const deuda = id => S.ordenes.filter(o => o.cliente_id === id && o.estado !== 'cancelada').reduce((a, o) => a + saldo(o), 0);
  const act = id => S.ordenes.filter(o => o.cliente_id === id && ACTIVAS.includes(o.estado)).length;
  return l.length ? `<div class="card list" style="padding:4px 14px">${l.map(c => { const d = deuda(c.id), a = act(c.id); return `<a class="li" href="#/cliente/${c.id}" style="text-decoration:none"><div class="grow"><div class="b">${esc(c.nombre)}</div><div class="sm muted num">${esc(telFmt(c.tel)) || 'Sin WhatsApp'}${a ? ` · ${a} pendiente${a > 1 ? 's' : ''}` : ''}</div></div>${d > 0 ? `<span class="sm b num" style="color:var(--mal)">Debe ${L(d)}</span>` : ''}${IC.sig.replace('<svg', '<svg width="18" height="18"')}</a>`; }).join('')}</div>`
    : `<div class="empty">${q ? 'Nadie coincide con la búsqueda.' : 'Todavía no hay clientes. Se agregan solos al recibir la primera orden.'}</div>`;
}
function vClientes() {
  return `<div class="pre"><span>${IC.buscar.replace('<svg', '<svg width="18" height="18"')}</span><input class="inp" id="qCli" type="search" placeholder="Buscar por nombre o WhatsApp" value="${esc(S.qc)}" autocomplete="off"></div>
  <div id="lCli">${listaClientes()}</div>`;
}
function vCliente(c) {
  const ords = S.ordenes.filter(o => o.cliente_id === c.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const deuda = ords.filter(o => o.estado !== 'cancelada').reduce((a, o) => a + saldo(o), 0);
  return `<div class="card">
    <div class="row"><div class="grow"><div class="b" style="font-size:17px">${esc(c.nombre)}</div><div class="muted num">${esc(telFmt(c.tel)) || 'Sin WhatsApp'}</div></div><button class="btn s" data-a="editarCli">${IC.lapiz}Editar</button></div>
    ${c.notas ? `<div class="sm muted" style="white-space:pre-wrap">${esc(c.notas)}</div>` : ''}
    ${deuda > 0 ? `<div class="panel bad"><b>Debe ${L(deuda)}</b></div>` : ''}
    <div class="btns">${c.tel ? `<a class="btn s wa" href="${waLink(c.tel, 'Hola ' + primero(c.nombre) + ', ')}" target="_blank" rel="noopener">${IC.wa}WhatsApp</a>` : ''}<a class="btn s ama" href="#/nueva?c=${c.id}" data-a="nuevaPara" data-x="${c.id}">${IC.mas}Nueva orden</a></div>
  </div>
  <div class="row between"><div class="sect">Medidas</div><button class="btn s" data-a="nuevaMedida" style="margin-top:6px">${IC.mas}Tomar medidas</button></div>
  <div id="medCli" class="col"><div class="spin" style="margin:14px auto"></div></div>
  <div class="sect">Órdenes</div>
  <div class="col">${ords.length ? ords.map(tarjetaOrden).join('') : '<div class="empty">Sin órdenes recientes.</div>'}</div>`;
}
async function despuesDeCliente() {
  const id = ruta()[1], el = $('#medCli'); if (!el) return;
  const meds = await cargarMedidasCli(id);
  el.innerHTML = meds.length ? meds.map(m => `<button class="card tap" data-med-ed="${m.id}" style="text-align:left">${bloqueMedida(m)}<span class="xs faint">Actualizadas ${esc(fechaCorta(m.updated_at))} · tocá para editar</span></button>`).join('') : '<div class="card"><span class="muted">Sin medidas todavía.</span></div>';
  $$('[data-med-ed]', el).forEach(b => b.onclick = () => hojaMedida(id, MED[b.dataset.medEd], () => despuesDeCliente()));
}
A.nuevaMedida = () => hojaMedida(ruta()[1], null, () => despuesDeCliente());
A.nuevaPara = id => { N = nuevaVacia(id); cargarMedidasCli(id); };
A.editarCli = () => {
  const c = cli(ruta()[1]);
  abrirHoja('Editar cliente', `<label class="f">Nombre<input class="inp" id="cN" value="${esc(c.nombre)}"></label>
    <label class="f">WhatsApp<input class="inp" id="cT" inputmode="tel" value="${esc(c.tel)}"></label>
    <label class="f">Notas<textarea class="inp" id="cO" placeholder="Preferencias, dirección, etc.">${esc(c.notas)}</textarea></label>
    <button class="btn pri full" id="cG">Guardar</button>`, h => {
    $('#cG', h).onclick = e => ocupado(e.currentTarget, async () => {
      const d = { nombre: $('#cN', h).value.trim(), tel: digitos($('#cT', h).value), notas: $('#cO', h).value.trim() };
      if (d.nombre.length < 2) throw new Error('Escribí el nombre.');
      if (d.tel && d.tel.length !== 8) throw new Error('El WhatsApp debe tener 8 dígitos.');
      const { error } = await sb.from('ord_clientes').update(d).eq('id', c.id);
      if (error) throw (/duplicate|unique/i.test(error.message) ? new Error('Ya hay otro cliente con ese WhatsApp.') : error);
      Object.assign(c, d); S.ordenes.forEach(o => { if (o.cliente_id === c.id && o.ord_clientes) Object.assign(o.ord_clientes, { nombre: d.nombre, tel: d.tel }); });
      cerrarHoja(); render(); toast('Cliente actualizado');
    });
  });
};

/* =================== Más =================== */
const MAS = {
  caja: { t: 'Caja de hoy', f: () => vCaja() },
  servicios: { t: 'Servicios y precios', f: () => vServicios() },
  equipo: { t: 'Equipo', f: () => vEquipo() },
  taller: { t: 'Datos del taller', f: () => vTaller() },
  paradas: { t: 'Tiempos muertos', f: () => vParadas() },
  conta: { t: 'Contabilidad', f: () => vConta() },
  fijos: { t: 'Pagos fijos', f: () => vFijos() },
};
function vMas() {
  const it = (h, ic, t, s) => `<a class="li" href="${h}" style="text-decoration:none"><span class="btn-ic" style="background:var(--fondo)">${ic}</span><div class="grow"><div class="b">${t}</div><div class="sm muted">${s}</div></div>${IC.sig.replace('<svg', '<svg width="18" height="18"')}</a>`;
  return `<div class="card list" style="padding:4px 14px">
    ${it('#/mas/caja', IC.caja, 'Caja del día', 'Lo que entró y salió, por forma de pago')}
    ${esDueno() ? it('#/mas/conta', IC.grafica, 'Contabilidad', 'Ganancia del mes, gastos y pagos fijos') : ''}
    ${it('#/mas/paradas', IC.reloj, 'Tiempos muertos', 'Cortes de luz, compras, enfermedad, feriados')}
    ${it('#/mas/servicios', IC.tijera, 'Servicios y precios', S.servs.length + ' servicios')}
    ${esDueno() ? it('#/mas/equipo', IC.gente, 'Equipo', 'Quién puede usar el panel') : ''}
    ${esDueno() ? it('#/mas/taller', IC.lapiz, 'Datos del taller', 'Horario, cuentas, mensajes y urgentes') : ''}
  </div>
  <div class="card list" style="padding:4px 14px">
    <button class="li" data-a="miClave" style="text-align:left"><span class="btn-ic" style="background:var(--fondo)">${sv('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>')}</span><div class="grow b">Cambiar mi contraseña</div></button>
    ${S.miembros.length > 1 ? `<button class="li" data-a="otroTaller" style="text-align:left"><span class="btn-ic" style="background:var(--fondo)">${IC.lista}</span><div class="grow b">Cambiar de taller</div></button>` : ''}
    ${S.admin ? `<a class="li" href="/admin" style="text-decoration:none"><span class="btn-ic" style="background:var(--fondo)">${IC.menu}</span><div class="grow b">Panel de Somar</div></a>` : ''}
    <button class="li" data-a="salir" style="text-align:left;color:var(--mal)"><span class="btn-ic" style="background:var(--mal-2)">${IC.salir}</span><div class="grow b">Salir</div></button>
  </div>
  <div class="pie">Somar Orden · una app de <img src="/assets/img/somar-labs.png" alt="Somar Labs"></div>`;
}
A.salir = async () => { if (await confirmar('¿Salir del panel en este teléfono?', { si: 'Salir' })) salir(); };
A.otroTaller = () => { localStorage.removeItem('ord_neg'); location.href = '/panel'; };
A.miClave = () => abrirHoja('Cambiar mi contraseña', `<label class="f">Nueva contraseña<input class="inp" id="k1" type="password" autocomplete="new-password" minlength="6"></label>
  <label class="f">Repetila<input class="inp" id="k2" type="password" autocomplete="new-password"></label><button class="btn pri full" id="kG">Guardar</button>`, h => {
  $('#kG', h).onclick = e => ocupado(e.currentTarget, async () => {
    const a = $('#k1', h).value, b = $('#k2', h).value;
    if (a.length < 6) throw new Error('Usá al menos 6 caracteres.'); if (a !== b) throw new Error('Las contraseñas no coinciden.');
    const { error } = await sb.auth.updateUser({ password: a }); if (error) throw error; cerrarHoja(); toast('Contraseña cambiada');
  });
});

/* ---------- Caja ---------- */
function vCaja() { setTimeout(cargarCaja, 0); return `<input class="inp" type="date" id="cajaDia" value="${isoDia(new Date())}" max="${isoDia(new Date())}"><div id="cajaRes"><div class="spin"></div></div>`; }
async function cargarCaja() {
  const el = $('#cajaRes'), inp = $('#cajaDia'); if (!el) return;
  inp.onchange = cargarCaja;
  const d0 = new Date(inp.value + 'T00:00:00'), d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
  const { data, error } = await sb.from('ord_pagos').select('*, ord_ordenes(numero, ord_clientes(nombre))').eq('negocio_id', S.neg.id).gte('created_at', d0.toISOString()).lt('created_at', d1.toISOString()).order('created_at');
  if (error) return fallo(error);
  const { data: gs } = await sb.from('ord_gastos').select('*, ord_ordenes(numero)').eq('negocio_id', S.neg.id).eq('fecha', inp.value).order('created_at');
  const salidas = (gs || []).reduce((a, g) => a + Number(g.monto), 0);
  const tot = data.reduce((a, p) => a + Number(p.monto), 0);
  const porM = Object.keys(METODOS).map(m => [m, data.filter(p => p.metodo === m).reduce((a, p) => a + Number(p.monto), 0)]).filter(x => x[1] > 0);
  const efe = data.filter(p => p.metodo === 'efectivo').reduce((a, p) => a + Number(p.monto), 0) - (gs || []).filter(g => g.metodo === 'efectivo').reduce((a, g) => a + Number(g.monto), 0);
  el.innerHTML = `<div class="card"><div class="kv tot"><span>Entró</span><span class="num">${L(tot)}</span></div>${porM.map(([m, v]) => `<div class="kv"><span class="k">${METODOS[m]}</span><span class="num">${L(v)}</span></div>`).join('')}
    ${salidas ? `<div class="hr"></div><div class="kv"><span class="k">Salió (gastos)</span><span class="num">− ${L(salidas)}</span></div><div class="kv tot"><span>Neto del día</span><span class="num">${L(tot - salidas)}</span></div>` : ''}
    <div class="kv"><span class="k">Efectivo que debería haber en caja</span><b class="num">${L(efe)}</b></div></div>
    ${(gs || []).length ? `<div class="sect">Gastos (${gs.length})</div><div class="card list" style="padding:4px 14px">${gs.map(g => `<div class="li"><div class="grow"><div class="b">${esc(g.concepto || g.categoria)}</div><div class="sm muted">${g.tipo === 'fijo' ? 'Fijo' : 'Variable'} · ${esc(g.categoria)} · ${METODOS[g.metodo]}${g.ord_ordenes ? ' · orden ' + g.ord_ordenes.numero : ''}</div></div><b class="num">− ${L(g.monto)}</b></div>`).join('')}</div>` : ''}
    <div class="sect">Pagos (${data.length})</div>
    ${data.length ? `<div class="card list" style="padding:4px 14px">${data.map(p => `<a class="li" href="#/orden/${p.orden_id}" style="text-decoration:none"><div class="grow"><div class="b">Orden ${p.ord_ordenes?.numero} · ${esc(p.ord_ordenes?.ord_clientes?.nombre || '')}</div><div class="sm muted">${TIPOS_PAGO[p.tipo]} · ${METODOS[p.metodo]}${p.ref ? ' · ' + esc(p.ref) : ''} · ${hora12(new Date(p.created_at))}</div></div><b class="num">${L(p.monto)}</b></a>`).join('')}</div>` : '<div class="empty">No hubo pagos este día.</div>'}`;
}

/* ---------- Servicios ---------- */
function vServicios() {
  return `<p class="sm muted">Estos son los servicios que aparecen al recibir una prenda. Las <b>horas</b> son el tiempo de trabajo y sirven para sugerir la fecha de entrega.</p>
  <div class="card list" style="padding:4px 14px">${S.servs.map(s => `<button class="li" data-a="editarServ" data-x="${s.id}" style="text-align:left"><div class="grow"><div class="b">${esc(s.nombre)}</div><div class="sm muted num">${s.precio ? L(s.precio) : 'Precio a definir'} · ${s.horas} h de trabajo</div></div>${IC.lapiz.replace('<svg', '<svg width="18" height="18"')}</button>`).join('') || '<div class="empty">Sin servicios</div>'}</div>
  <button class="btn ama" data-a="editarServ">${IC.mas}Agregar servicio</button>`;
}
A.editarServ = id => {
  const s = S.servs.find(x => x.id === id) || { nombre: '', precio: '', horas: 1 };
  abrirHoja(id ? 'Editar servicio' : 'Nuevo servicio', `<label class="f">Nombre<input class="inp" id="sN" value="${esc(s.nombre)}" placeholder="Ej.: Ruedo de pantalón"></label>
    <div class="grid2"><label class="f">Precio<div class="pre"><span>L</span><input class="inp" id="sP" type="number" inputmode="decimal" min="0" step="any" value="${s.precio}"></div></label>
    <label class="f">Horas de trabajo<input class="inp" id="sH" type="number" inputmode="decimal" min="0.25" step="0.25" value="${s.horas}"></label></div>
    <button class="btn pri full" id="sG">Guardar</button>${id ? '<button class="btn mal full" id="sB">Quitar servicio</button>' : ''}`, h => {
    $('#sG', h).onclick = e => ocupado(e.currentTarget, async () => {
      const d = { nombre: $('#sN', h).value.trim(), precio: Math.max(0, Number($('#sP', h).value) || 0), horas: Math.max(0.25, Number($('#sH', h).value) || 1) };
      if (d.nombre.length < 2) throw new Error('Escribí el nombre.');
      const r = id ? await sb.from('ord_servicios').update(d).eq('id', id) : await sb.from('ord_servicios').insert({ ...d, negocio_id: S.neg.id, orden: S.servs.length });
      if (r.error) throw r.error; await recargar(); cerrarHoja(); render(); toast('Servicio guardado');
    });
    $('#sB', h)?.addEventListener('click', async () => { if (!await confirmar('¿Quitar este servicio? Las órdenes viejas no cambian.', { si: 'Quitar', peligro: true })) return; const { error } = await sb.from('ord_servicios').update({ activo: false }).eq('id', id); if (error) return fallo(error); await recargar(); render(); toast('Servicio quitado'); });
  });
};

/* ---------- Equipo ---------- */
async function cuentas(body) {
  const { data, error } = await sb.functions.invoke('ord-cuentas', { body });
  if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch (_) { } throw new Error(m); }
  if (data?.error) throw new Error(data.error);
  return data;
}
function vEquipo() { setTimeout(cargarEquipo, 0); return `<div id="eq"><div class="spin"></div></div><button class="btn ama" data-a="nuevoMiembro">${IC.mas}Agregar persona</button>
  <p class="sm muted">Cada persona entra con su número de WhatsApp y su contraseña. Los empleados pueden recibir, trabajar y entregar órdenes; solo el dueño cambia precios, datos del taller y borra pagos.</p>`; }
async function cargarEquipo() {
  const { data, error } = await sb.from('ord_miembros').select('*').eq('negocio_id', S.neg.id).order('rol').order('nombre');
  if (error) return fallo(error);
  S.equipo = data;
  $('#eq').innerHTML = `<div class="card list" style="padding:4px 14px">${data.map(m => `<div class="li"><div class="grow"><div class="b">${esc(m.nombre)} ${m.user_id === S.user.id ? '<span class="faint">(vos)</span>' : ''}</div><div class="sm muted num">${esc(telFmt(m.tel))} · ${m.rol === 'dueno' ? 'Dueño' : 'Empleado'}${m.activo ? '' : ' · sin acceso'}</div></div>
    ${m.user_id !== S.user.id ? `<button class="btn s" data-mclave="${m.user_id}">Contraseña</button><button class="btn s ${m.activo ? 'mal' : ''}" data-mact="${m.user_id}">${m.activo ? 'Quitar' : 'Activar'}</button>` : ''}</div>`).join('')}</div>`;
  $$('[data-mact]').forEach(b => b.onclick = async () => {
    const m = S.equipo.find(x => x.user_id === b.dataset.mact);
    if (m.activo && !await confirmar(`¿Quitarle el acceso a ${m.nombre}?`, { si: 'Quitar acceso', peligro: true })) return;
    const { error } = await sb.from('ord_miembros').update({ activo: !m.activo }).eq('negocio_id', S.neg.id).eq('user_id', m.user_id);
    if (error) return fallo(error); cargarEquipo(); toast(m.activo ? 'Acceso quitado' : 'Acceso activado');
  });
  $$('[data-mclave]').forEach(b => b.onclick = () => abrirHoja('Nueva contraseña', `<label class="f">Contraseña nueva (mínimo 6)<input class="inp" id="nk" type="text" autocomplete="off"></label><button class="btn pri full" id="nkG">Guardar</button>`, h => {
    $('#nkG', h).onclick = e => ocupado(e.currentTarget, async () => { await cuentas({ accion: 'cambiar_clave', negocio_id: S.neg.id, user_id: b.dataset.mclave, clave: $('#nk', h).value }); cerrarHoja(); toast('Contraseña cambiada. Pasásela por WhatsApp.'); });
  }));
}
A.nuevoMiembro = () => abrirHoja('Agregar persona', `<label class="f">Nombre<input class="inp" id="mN"></label>
  <label class="f">WhatsApp<input class="inp" id="mT" inputmode="tel" placeholder="9999-9999"></label>
  <label class="f">Contraseña para entrar (mínimo 6)<input class="inp" id="mK" type="text" autocomplete="off"></label>
  <div class="seg" id="mR"><button type="button" class="on" data-r="empleado">Empleado</button><button type="button" data-r="dueno">Dueño</button></div>
  <button class="btn pri full" id="mG">Agregar</button>`, h => {
  $$('#mR button', h).forEach(b => b.onclick = () => $$('#mR button', h).forEach(x => x.classList.toggle('on', x === b)));
  $('#mG', h).onclick = e => ocupado(e.currentTarget, async () => {
    const r = await cuentas({ accion: 'crear_miembro', negocio_id: S.neg.id, nombre: $('#mN', h).value, tel: $('#mT', h).value, clave: $('#mK', h).value, rol: $('#mR .on', h).dataset.r });
    cerrarHoja(); cargarEquipo(); toast(r.usuario_nuevo ? 'Persona agregada' : 'Agregada. Ya tenía cuenta: entra con su misma contraseña.');
  });
});

/* ---------- Datos del taller ---------- */
function vTaller() {
  const n = S.neg, H = n.horario || {};
  return `<div class="card">
    <label class="f">Nombre del taller<input class="inp" id="tN" value="${esc(n.nombre)}"></label>
    <label class="f">WhatsApp del taller (lo ve el cliente)<input class="inp" id="tT" inputmode="tel" value="${esc(n.tel)}"></label>
    <label class="f">Dirección<input class="inp" id="tD" value="${esc(n.direccion)}" placeholder="Colonia, referencia"></label></div>
  <div class="sect">Horario</div>
  <div class="card">${[1, 2, 3, 4, 5, 6, 0].map(d => { const h = H[d]; return `<div class="row" data-dia="${d}"><label class="chk" style="width:120px"><input type="checkbox" ${h ? 'checked' : ''}>${DIAS_L[d]}</label>
    <select class="inp" style="min-height:40px;padding:6px" ${h ? '' : 'disabled'}>${Array.from({ length: 17 }, (_, i) => i + 5).map(x => `<option value="${x}" ${(h ? h[0] : 8) === x ? 'selected' : ''}>${h12(x)}</option>`).join('')}</select>
    <span class="faint">a</span><select class="inp" style="min-height:40px;padding:6px" ${h ? '' : 'disabled'}>${Array.from({ length: 17 }, (_, i) => i + 6).map(x => `<option value="${x}" ${(h ? h[1] : 17) === x ? 'selected' : ''}>${h12(x)}</option>`).join('')}</select></div>`; }).join('')}</div>
  <div class="sect">Fecha de entrega</div>
  <div class="card">
    <label class="f">¿Cuántas personas cosen a la vez?<input class="inp" id="tC" type="number" min="1" max="50" value="${n.capacidad}"></label>
    <div class="grid2"><label class="f">Recargo urgente (%)<input class="inp" id="tR" type="number" min="0" max="300" value="${n.recargo_urgente}"></label>
    <label class="f">Urgente tarda menos (%)<input class="inp" id="tU" type="number" min="0" max="90" value="${n.reduccion_urgente}"></label></div></div>
  <div class="sect">Cuentas para recibir transferencias</div>
  <div class="card"><div id="tCtas" class="col">${(n.cuentas || []).map(filaCuenta).join('')}</div><button class="btn s" data-a="tAddCta" style="align-self:flex-start">${IC.mas}Agregar cuenta</button>
    <p class="xs faint">El cliente las ve en el enlace de su orden para pagar el saldo.</p></div>
  <div class="sect">Mensaje cuando la orden está lista</div>
  <div class="card"><textarea class="inp" id="tM" placeholder="Hola {nombre}, tu orden #{numero} ya está lista en {taller}. {saldo}Te esperamos.">${esc(n.msg_lista)}</textarea>
    <p class="xs faint">Podés usar {nombre}, {numero}, {taller}, {saldo} y {total}. El enlace de la orden se agrega solo al final.</p></div>
  <button class="btn pri full" data-a="tGuardar">Guardar cambios</button>`;
}
const filaCuenta = (c = {}) => `<div class="grid2 cta" style="border:1px solid var(--linea);border-radius:12px;padding:10px">
  <input class="inp" data-c="banco" placeholder="Banco (BAC, Atlántida, Tigo Money…)" value="${esc(c.banco || '')}"><input class="inp" data-c="tipo" placeholder="Tipo (ahorro, cheques)" value="${esc(c.tipo || '')}">
  <input class="inp" data-c="numero" placeholder="Número de cuenta" value="${esc(c.numero || '')}"><input class="inp" data-c="titular" placeholder="A nombre de" value="${esc(c.titular || '')}">
  <button class="btn s mal" type="button" onclick="this.parentElement.remove()" style="grid-column:1/-1">Quitar cuenta</button></div>`;
A.tAddCta = () => $('#tCtas').insertAdjacentHTML('beforeend', filaCuenta());
document.addEventListener('change', e => { const r = e.target.closest?.('[data-dia]'); if (r && e.target.type === 'checkbox') $$('select', r).forEach(s => s.disabled = !e.target.checked); });
A.tGuardar = (x, b) => ocupado(b, async () => {
  const horario = {};
  for (const r of $$('[data-dia]')) { if ($('input', r).checked) { const [a, c] = $$('select', r).map(s => Number(s.value)); if (c <= a) throw new Error(`Revisá el horario del ${DIAS_L[r.dataset.dia].toLowerCase()}: cierra antes de abrir.`); horario[r.dataset.dia] = [a, c]; } }
  if (!Object.keys(horario).length) throw new Error('Marcá al menos un día abierto.');
  const cuentas = $$('.cta').map(el => Object.fromEntries($$('[data-c]', el).map(i => [i.dataset.c, i.value.trim()]))).filter(c => c.numero);
  const d = { nombre: $('#tN').value.trim(), tel: digitos($('#tT').value), direccion: $('#tD').value.trim(), horario, capacidad: Math.max(1, parseInt($('#tC').value) || 1),
    recargo_urgente: Math.max(0, Number($('#tR').value) || 0), reduccion_urgente: Math.min(90, Math.max(0, Number($('#tU').value) || 0)), cuentas, msg_lista: $('#tM').value.trim() };
  if (d.nombre.length < 3) throw new Error('Escribí el nombre del taller.');
  const { error } = await sb.from('ord_negocios').update(d).eq('id', S.neg.id); if (error) throw error;
  Object.assign(S.neg, d); toast('Datos guardados'); location.hash = '#/mas';
});

/* =================== Materiales y costos de una orden =================== */
async function cargarMateriales(o) {
  const el = $('#matOrd'); if (!el) return;
  const { data, error } = await sb.from('ord_gastos').select('*').eq('orden_id', o.id).order('created_at');
  if (error) { el.innerHTML = '<span class="sm faint">No se pudieron cargar los costos.</span>'; return; }
  const costo = data.reduce((a, g) => a + Number(g.monto), 0), gan = Number(o.total) - costo;
  el.innerHTML = `${data.length ? data.map(g => `<div class="kv"><span class="k">${esc(g.concepto || g.categoria)} · ${esc(g.categoria)}</span><span class="num row" style="gap:4px">${L(g.monto)}<button class="btn-ic" style="width:28px;height:28px" data-gborrar="${g.id}" aria-label="Quitar costo">${IC.x}</button></span></div>`).join('') : '<p class="sm muted">Anotá lo que gastaste en esta orden (tela, hilo, zíper, transporte) para saber cuánto ganaste.</p>'}
    ${data.length ? `<div class="hr"></div><div class="kv"><span class="k">Costos</span><span class="num">${L(costo)}</span></div>
    <div class="kv tot"><span>Ganancia de la orden</span><span class="num" style="color:${gan >= 0 ? 'var(--ok)' : 'var(--mal)'}">${L(gan)}</span></div>
    ${o.total > 0 ? `<div class="xs faint">Te queda el ${Math.round(gan / o.total * 100)}% de lo cobrado, antes de gastos fijos.</div>` : ''}` : ''}
    <button class="btn s" id="bMat" style="align-self:flex-start">${IC.mas}Anotar costo</button>`;
  $('#bMat').onclick = () => hojaGasto({ orden: o, alGuardar: () => cargarMateriales(o) });
  $$('[data-gborrar]', el).forEach(b => b.onclick = async () => {
    if (!await confirmar('¿Quitar este costo?', { si: 'Quitar', peligro: true })) return;
    const { error } = await sb.from('ord_gastos').delete().eq('id', b.dataset.gborrar); if (error) return fallo(error);
    cargarMateriales(o); toast('Costo quitado');
  });
}

/* Hoja para anotar un gasto. Con orden: costo variable de esa orden. Sin orden: gasto del taller (solo dueño). */
function hojaGasto({ orden, tipo = 'variable', alGuardar } = {}) {
  let t = orden ? 'variable' : tipo, cat = (t === 'fijo' ? CAT_FIJO : CAT_VAR)[0], met = 'efectivo';
  const pintar = h => {
    const cats = t === 'fijo' ? CAT_FIJO : CAT_VAR;
    if (!cats.includes(cat)) cat = cats[0];
    h.innerHTML = `${orden ? `<div class="panel info"><span class="sm">Costo de la orden ${orden.numero}</span></div>` : `<div class="seg" id="gT"><button type="button" data-t="variable" class="${t === 'variable' ? 'on' : ''}">Variable</button><button type="button" data-t="fijo" class="${t === 'fijo' ? 'on' : ''}">Fijo</button></div>
      <p class="xs faint">${t === 'variable' ? 'Variable: cambia según cuánto trabajo hay (tela, hilos, transporte).' : 'Fijo: se paga igual haya o no trabajo (alquiler, luz, sueldos). Para los que se repiten cada mes usá Pagos fijos.'}</p>`}
      <div class="f">Categoría<div class="chips" style="flex-wrap:wrap">${cats.map(c => `<button type="button" class="chip ${c === cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>
      <label class="f">Detalle<input class="inp" id="gD" placeholder="${t === 'variable' ? 'Ej.: 3 yardas de lino azul' : 'Ej.: reparación de máquina'}"></label>
      <div class="grid2"><label class="f">Monto<div class="pre"><span>L</span><input class="inp" id="gM" type="number" inputmode="decimal" min="0" step="any"></div></label>
      <label class="f">Fecha<input class="inp" id="gF" type="date" value="${isoDia(new Date())}" max="${isoDia(new Date())}"></label></div>
      <div class="seg" id="gMet">${Object.entries(METODOS).map(([k, x]) => `<button type="button" data-m="${k}" class="${k === met ? 'on' : ''}">${x}</button>`).join('')}</div>
      <button class="btn pri full" id="gG">Guardar</button>`;
    $$('#gT button', h).forEach(b => b.onclick = () => { t = b.dataset.t; pintar(h); });
    $$('[data-c]', h).forEach(b => b.onclick = () => { cat = b.dataset.c; $$('[data-c]', h).forEach(x => x.classList.toggle('on', x === b)); });
    $$('#gMet button', h).forEach(b => b.onclick = () => { met = b.dataset.m; $$('#gMet button', h).forEach(x => x.classList.toggle('on', x === b)); });
    $('#gG', h).onclick = e => ocupado(e.currentTarget, async () => {
      const monto = Number($('#gM', h).value); if (!(monto > 0)) throw new Error('Escribí el monto.');
      const d = { negocio_id: S.neg.id, tipo: t, categoria: cat, concepto: $('#gD', h).value.trim(), monto, metodo: met, fecha: $('#gF', h).value || isoDia(new Date()), orden_id: orden?.id || null };
      const { error } = await sb.from('ord_gastos').insert(d); if (error) throw error;
      cerrarHoja(); toast('Gasto anotado'); alGuardar && alGuardar();
    });
  };
  abrirHoja(orden ? 'Anotar costo' : 'Registrar gasto', '', pintar);
}

/* =================== Tiempos muertos =================== */
/* Calcula qué órdenes se mueven y a qué fecha, sin guardar nada */
function previsualizarParada(inicio, fin) {
  const min = minutosAbiertosEntre(S.neg, inicio, fin), horas = min / 60;
  const conNueva = [...S.paradas, { inicio, fin }];
  if (!min) return { min, horas, afectadas: [] }; // el taller estaba cerrado: no se mueve nada
  const afectadas = S.ordenes.filter(o => ['recibida', 'en_proceso'].includes(o.estado) && new Date(o.fecha_entrega) > inicio)
    .map(o => ({ o, antes: new Date(o.fecha_entrega), despues: horasAbiertas(S.neg, o.fecha_entrega, horas, conNueva) }))
    .filter(x => x.despues > x.antes).sort((a, b) => a.antes - b.antes);
  return { min, horas, afectadas };
}
A.nuevaParada = () => {
  let motivo = MOTIVOS_PARADA[0];
  const ini = new Date(), finD = new Date(ini.getTime() + 2 * 36e5);
  abrirHoja('Registrar tiempo muerto', `<p class="sm muted">Si no se pudo trabajar (o no se va a poder), las fechas de entrega pendientes se corren lo mismo que se perdió.</p>
    <div class="f">¿Qué pasó?<div class="chips" style="flex-wrap:wrap" id="pMot">${MOTIVOS_PARADA.map((m, i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div></div>
    <input class="inp" id="pNota" placeholder="Nota (opcional)">
    <div class="grid2"><label class="f">Desde<input class="inp" type="datetime-local" id="pIni" value="${aLocalInput(ini)}"></label>
    <label class="f">Hasta<input class="inp" type="datetime-local" id="pFin" value="${aLocalInput(finD)}"></label></div>
    <div class="row wrap" style="gap:6px">${[[1, '1 hora'], [2, '2 horas'], [4, '4 horas'], ['dia', 'Resto del día'], ['manana', 'Hasta mañana']].map(([v, t]) => `<button type="button" class="btn s" data-dur="${v}">${t}</button>`).join('')}</div>
    <div id="pPrev"></div>
    <label class="chk"><input type="checkbox" id="pMover" checked> Correr las fechas de entrega</label>
    <button class="btn pri full" id="pG">Guardar tiempo muerto</button>`, h => {
    const prev = () => {
      const a = deLocalInput($('#pIni', h).value), b = deLocalInput($('#pFin', h).value);
      if (!(b > a)) { $('#pPrev', h).innerHTML = '<div class="err">"Hasta" debe ser después de "Desde".</div>'; return null; }
      const r = previsualizarParada(a, b);
      $('#pPrev', h).innerHTML = `<div class="panel ${r.min ? 'warn' : 'info'}"><b>${r.min ? `Se pierden ${Math.round(r.horas * 10) / 10} h de trabajo` : 'Ese rato el taller está cerrado: no se pierde trabajo'}</b>
        ${r.afectadas.length ? `<span class="sm">Se corren ${r.afectadas.length} orden${r.afectadas.length > 1 ? 'es' : ''}:</span>${r.afectadas.slice(0, 8).map(x => `<span class="sm">#${x.o.numero} ${esc(primero(ordCli(x.o).nombre))}: ${esc(fechaHora(x.antes))} → <b>${esc(fechaHora(x.despues))}</b></span>`).join('')}${r.afectadas.length > 8 ? `<span class="sm">y ${r.afectadas.length - 8} más</span>` : ''}` : r.min ? '<span class="sm">Ninguna orden pendiente se mueve.</span>' : ''}</div>`;
      return { a, b, r };
    };
    $$('#pMot [data-m]', h).forEach(b => b.onclick = () => { motivo = b.dataset.m; $$('#pMot [data-m]', h).forEach(x => x.classList.toggle('on', x === b)); });
    $$('[data-dur]', h).forEach(b => b.onclick = () => {
      const a = deLocalInput($('#pIni', h).value); let f;
      if (b.dataset.dur === 'dia') { const hh = (S.neg.horario || {})[a.getDay()]; f = new Date(a); f.setHours(hh ? hh[1] : 18, 0, 0, 0); if (f <= a) f = new Date(a.getTime() + 36e5); }
      else if (b.dataset.dur === 'manana') { f = new Date(a); f.setDate(f.getDate() + 1); const hh = (S.neg.horario || {})[f.getDay()]; f.setHours(hh ? hh[0] : 8, 0, 0, 0); }
      else f = new Date(a.getTime() + Number(b.dataset.dur) * 36e5);
      $('#pFin', h).value = aLocalInput(f); prev();
    });
    $('#pIni', h).onchange = prev; $('#pFin', h).onchange = prev; prev();
    $('#pG', h).onclick = e => ocupado(e.currentTarget, async () => {
      const x = prev(); if (!x) throw new Error('Revisá las fechas.');
      const mover = $('#pMover', h).checked && x.r.afectadas.length;
      if (mover) {
        const { error } = await sb.rpc('ord_mover_entregas', { p_cambios: x.r.afectadas.map(z => ({ id: z.o.id, fecha: z.despues.toISOString() })) });
        if (error) throw error;
      }
      const { error } = await sb.from('ord_paradas').insert({ negocio_id: S.neg.id, motivo, nota: $('#pNota', h).value.trim(), inicio: x.a.toISOString(), fin: x.b.toISOString(), horas_movidas: mover ? x.r.horas : 0, ordenes_movidas: mover ? x.r.afectadas.length : 0 });
      if (error) throw error;
      await recargar(); render(); toast('Tiempo muerto guardado');
      if (mover) hojaAvisarMovidas(x.r.afectadas, motivo);
    });
  });
};
function hojaAvisarMovidas(afectadas, motivo) {
  const conTel = afectadas.filter(x => ordCli(x.o).tel);
  if (!conTel.length) return;
  const msg = x => `Hola ${primero(ordCli(x.o).nombre)}, te escribimos de ${S.neg.nombre}. Por un inconveniente (${motivo.toLowerCase()}) tu orden #${x.o.numero} va a estar lista ${fechaHora(x.despues).toLowerCase()}. Disculpá la molestia.\n\n${linkOrden(x.o.token)}`;
  abrirHoja('Avisar a los clientes', `<p class="muted">Las fechas ya se corrieron. Tocá cada cliente para mandarle el aviso por WhatsApp.</p>
    <div class="card list" style="padding:4px 14px">${conTel.map(x => `<a class="li" target="_blank" rel="noopener" href="${waLink(ordCli(x.o).tel, msg(x))}" style="text-decoration:none" data-hecho><div class="grow"><div class="b">#${x.o.numero} ${esc(ordCli(x.o).nombre)}</div><div class="sm muted">Nueva entrega: ${esc(fechaHora(x.despues))}</div></div><span class="btn s wa">${IC.wa}Avisar</span></a>`).join('')}</div>
    <button class="btn full" data-cerrar>Listo</button>`, h => {
    $$('[data-hecho]', h).forEach(a => a.addEventListener('click', () => { a.style.opacity = '.45'; $('.btn', a).innerHTML = IC.ok + 'Enviado'; }));
  });
}
function vParadas() {
  setTimeout(cargarParadas, 0);
  return `<button class="btn ama" data-a="nuevaParada">${IC.reloj}Registrar tiempo muerto</button>
  <p class="sm muted">También sirve para programar cierres: un feriado, una cita médica o un viaje a comprar material. La fecha sugerida de las órdenes nuevas los salta solos.</p>
  <div id="lPar"><div class="spin"></div></div>`;
}
async function cargarParadas() {
  const { data, error } = await sb.from('ord_paradas').select('*').eq('negocio_id', S.neg.id).order('inicio', { ascending: false }).limit(60);
  if (error) return fallo(error);
  const now = new Date(), prox = data.filter(p => new Date(p.fin) > now).reverse(), pas = data.filter(p => new Date(p.fin) <= now);
  const fila = p => `<div class="li"><div class="grow"><div class="b">${esc(p.motivo)}${p.nota ? ` <span class="muted" style="font-weight:500">· ${esc(p.nota)}</span>` : ''}</div>
    <div class="sm muted">${esc(fechaHora(p.inicio))} → ${esc(fechaHora(p.fin))}</div>${p.ordenes_movidas ? `<div class="xs faint">Corrió ${p.ordenes_movidas} orden${p.ordenes_movidas > 1 ? 'es' : ''} ${Math.round(p.horas_movidas * 10) / 10} h</div>` : ''}</div>
    ${esDueno() || p.created_by === S.user.id ? `<button class="btn-ic" data-pborrar="${p.id}" aria-label="Borrar">${IC.basura}</button>` : ''}</div>`;
  $('#lPar').innerHTML = `${prox.length ? `<div class="sect">Ahora y próximos</div><div class="card list" style="padding:4px 14px">${prox.map(fila).join('')}</div>` : ''}
    <div class="sect">Anteriores</div>${pas.length ? `<div class="card list" style="padding:4px 14px">${pas.map(fila).join('')}</div>` : '<div class="empty">Todavía no hay tiempos muertos registrados.</div>'}`;
  $$('[data-pborrar]').forEach(b => b.onclick = async () => {
    if (!await confirmar('¿Borrar este tiempo muerto? Las fechas que ya se corrieron no vuelven atrás solas; cambialas en cada orden si hace falta.', { si: 'Borrar', peligro: true })) return;
    const { error } = await sb.from('ord_paradas').delete().eq('id', b.dataset.pborrar); if (error) return fallo(error);
    S.paradas = S.paradas.filter(p => p.id !== b.dataset.pborrar); cargarParadas(); toast('Borrado');
  });
}

/* =================== Contabilidad =================== */
S.mesConta = null;
function vConta() {
  if (!esDueno()) return '<div class="empty">Solo el dueño ve la contabilidad.</div>';
  if (!S.mesConta) { const d = new Date(); S.mesConta = [d.getFullYear(), d.getMonth()]; }
  const [y, m] = S.mesConta, esteMes = (() => { const d = new Date(); return y === d.getFullYear() && m === d.getMonth(); })();
  setTimeout(cargarConta, 0);
  return `<div class="row"><button class="btn-ic" data-a="mesConta" data-x="-1" aria-label="Mes anterior" style="background:var(--sup)">${IC.atras}</button>
    <div class="grow b" style="text-align:center;font-size:17px">${MESES_L[m]} ${y}</div>
    <button class="btn-ic" data-a="mesConta" data-x="1" aria-label="Mes siguiente" style="background:var(--sup)" ${esteMes ? 'disabled' : ''}>${IC.sig}</button></div>
  <div id="cRes"><div class="spin"></div></div>`;
}
A.mesConta = d => { let [y, m] = S.mesConta; m += Number(d); if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } S.mesConta = [y, m]; render(); };
async function cargarConta() {
  const el = $('#cRes'); if (!el) return;
  const [y, m] = S.mesConta, d0 = new Date(y, m, 1), d1 = new Date(y, m + 1, 1);
  const f0 = isoDia(d0), f1 = isoDia(new Date(y, m + 1, 0));
  const [pg, gs, pf] = await Promise.all([
    sb.from('ord_pagos').select('monto, metodo').eq('negocio_id', S.neg.id).gte('created_at', d0.toISOString()).lt('created_at', d1.toISOString()),
    sb.from('ord_gastos').select('*, ord_ordenes(numero)').eq('negocio_id', S.neg.id).gte('fecha', f0).lte('fecha', f1).order('fecha', { ascending: false }),
    sb.from('ord_pagos_fijos').select('*').eq('negocio_id', S.neg.id).eq('activo', true).order('dia'),
  ]);
  for (const r of [pg, gs, pf]) if (r.error) return fallo(r.error);
  S.fijos = pf.data;
  const cobrado = pg.data.reduce((a, p) => a + Number(p.monto), 0);
  const variables = gs.data.filter(g => g.tipo === 'variable').reduce((a, g) => a + Number(g.monto), 0);
  const fijosPag = gs.data.filter(g => g.tipo === 'fijo').reduce((a, g) => a + Number(g.monto), 0);
  const pend = pagosFijosPendientes(y, m, gs.data);
  const fijosPend = pend.reduce((a, x) => a + Number(x.pf.monto), 0);
  const utilidad = cobrado - variables - fijosPag - fijosPend;
  const fijosMes = pf.data.reduce((a, x) => a + mensualEquiv(x), 0);
  const contrib = cobrado > 0 ? 1 - variables / cobrado : null;
  const equilibrio = contrib && contrib > 0 ? fijosMes / contrib : null;
  const hoy = inicioDia(new Date());
  const vencs = pf.data.flatMap(x => vencimientos(x, y, m).map(v => ({ pf: x, ...v, pago: gs.data.find(g => g.pago_fijo_id === x.id && g.periodo === v.periodo) }))).sort((a, b) => a.fecha - b.fecha);
  const pct = equilibrio ? Math.min(100, Math.round(cobrado / equilibrio * 100)) : 0;
  el.innerHTML = `
  <div class="card">
    <div class="kv"><span class="k">Cobrado a clientes</span><b class="num">${L(cobrado)}</b></div>
    <div class="kv"><span class="k">Costos variables (materiales…)</span><span class="num">− ${L(variables)}</span></div>
    <div class="kv"><span class="k">Gastos fijos pagados</span><span class="num">− ${L(fijosPag)}</span></div>
    ${fijosPend ? `<div class="kv"><span class="k">Gastos fijos por pagar este mes</span><span class="num">− ${L(fijosPend)}</span></div>` : ''}
    <div class="hr"></div>
    <div class="kv tot"><span>${fijosPend ? 'Ganancia estimada' : 'Ganancia del mes'}</span><span class="num" style="color:${utilidad >= 0 ? 'var(--ok)' : 'var(--mal)'}">${L(utilidad)}</span></div>
    ${cobrado > 0 ? `<div class="xs faint">De cada L 100 que cobrás te quedan L ${Math.round(utilidad / cobrado * 100)} de ganancia.</div>` : ''}
  </div>
  ${fijosMes ? `<div class="card"><div class="b">Punto de equilibrio</div>
    ${equilibrio ? `<p class="sm muted">Para cubrir tus gastos fijos (${L(fijosMes)} al mes) necesitás cobrar <b>${L(Math.ceil(equilibrio))}</b> este mes.</p>
      <div style="height:10px;border-radius:99px;background:var(--linea);overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct >= 100 ? 'var(--ok)' : 'var(--amarillo)'}"></div></div>
      <div class="sm ${pct >= 100 ? '' : 'muted'}">${pct >= 100 ? '✓ Ya cubriste los gastos fijos. Lo que entre de aquí en adelante es ganancia (menos materiales).' : `Llevás ${pct}%. Faltan ${L(Math.max(0, Math.ceil(equilibrio - cobrado)))}.`}</div>`
      : `<p class="sm muted">Tus gastos fijos son ${L(fijosMes)} al mes. Cuando registres cobros y materiales te digo cuánto necesitás vender para cubrirlos.</p>`}</div>` : ''}

  <div class="row between"><div class="sect">Pagos fijos del mes</div><a class="btn s" href="#/mas/fijos" style="margin-top:6px">Administrar</a></div>
  ${vencs.length ? `<div class="card list" style="padding:4px 14px">${vencs.map(v => {
    const est = v.pago ? `<span class="tag lista">Pagado</span>` : v.fecha < hoy ? `<span class="tag cancelada">Vencido</span>` : `<span class="tag recibida">${esc(diaLbl(v.fecha))}</span>`;
    return `<div class="li"><div class="grow"><div class="b">${esc(v.pf.concepto)}</div><div class="sm muted">${esc(v.pf.categoria)} · vence ${esc(fechaCorta(v.fecha))}${v.pago ? ' · pagado ' + L(v.pago.monto) : ''}</div></div>
      <div class="col" style="gap:4px;align-items:flex-end"><b class="num">${L(v.pf.monto)}</b>${v.pago ? est : `<button class="btn s ama" data-pagar="${v.pf.id}|${v.periodo}|${isoDia(v.fecha)}">Pagar</button>`}</div></div>`;
  }).join('')}</div>` : `<div class="card"><p class="sm muted">Agregá lo que pagás cada mes (alquiler, luz, agua, internet, sueldos) y te aviso cuando se acerque cada pago.</p><a class="btn ama" href="#/mas/fijos">${IC.mas}Agregar pagos fijos</a></div>`}

  <div class="row between"><div class="sect">Gastos del mes (${gs.data.length})</div><button class="btn s" id="bGasto" style="margin-top:6px">${IC.mas}Registrar gasto</button></div>
  ${gs.data.length ? `<div class="card list" style="padding:4px 14px">${gs.data.map(g => `<div class="li"><div class="grow"><div class="b">${esc(g.concepto || g.categoria)}</div><div class="sm muted">${esc(fechaCorta(g.fecha + 'T12:00'))} · ${g.tipo === 'fijo' ? 'Fijo' : 'Variable'} · ${esc(g.categoria)}${g.ord_ordenes ? ' · orden ' + g.ord_ordenes.numero : ''}</div></div><b class="num">${L(g.monto)}</b><button class="btn-ic" data-gb="${g.id}" aria-label="Borrar gasto">${IC.basura}</button></div>`).join('')}</div>` : '<div class="empty">Sin gastos registrados este mes.</div>'}
  ${gs.data.length ? `<div class="card">${[...new Set(gs.data.map(g => g.categoria))].map(c => [c, gs.data.filter(g => g.categoria === c).reduce((a, g) => a + Number(g.monto), 0)]).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="kv"><span class="k">${esc(c)}</span><span class="num">${L(v)}</span></div>`).join('')}</div>` : ''}`;
  $('#bGasto').onclick = () => hojaGasto({ alGuardar: cargarConta });
  $$('[data-pagar]', el).forEach(b => b.onclick = () => { const [id, periodo, fecha] = b.dataset.pagar.split('|'); hojaPagarFijo(S.fijos.find(x => x.id === id), periodo, fecha); });
  $$('[data-gb]', el).forEach(b => b.onclick = async () => {
    if (!await confirmar('¿Borrar este gasto?', { si: 'Borrar', peligro: true })) return;
    const { error } = await sb.from('ord_gastos').delete().eq('id', b.dataset.gb); if (error) return fallo(error);
    toast('Gasto borrado'); cargarConta(); recargarPagosFijosMes();
  });
}
async function recargarPagosFijosMes() {
  const d = new Date(), ini = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  const { data } = await sb.from('ord_gastos').select('pago_fijo_id, periodo').eq('negocio_id', S.neg.id).not('pago_fijo_id', 'is', null).gte('fecha', ini);
  S.pagosFijosMes = data || [];
}
function hojaPagarFijo(pf, periodo, fechaVence) {
  let met = 'efectivo';
  abrirHoja('Pagar ' + pf.concepto, `<p class="sm muted">Vence ${esc(fechaCorta(fechaVence + 'T12:00'))}. Si este mes el monto fue distinto (la luz, por ejemplo), cambialo.</p>
    <label class="f">Monto pagado<div class="pre"><span>L</span><input class="inp" id="fM" type="number" inputmode="decimal" min="0" step="any" value="${pf.monto}"></div></label>
    <label class="f">Fecha de pago<input class="inp" id="fF" type="date" value="${isoDia(new Date())}"></label>
    <div class="seg" id="fMet">${Object.entries(METODOS).map(([k, x]) => `<button type="button" data-m="${k}" class="${k === met ? 'on' : ''}">${x}</button>`).join('')}</div>
    <button class="btn pri full" id="fG">Marcar como pagado</button>`, h => {
    $$('#fMet button', h).forEach(b => b.onclick = () => { met = b.dataset.m; $$('#fMet button', h).forEach(x => x.classList.toggle('on', x === b)); });
    $('#fG', h).onclick = e => ocupado(e.currentTarget, async () => {
      const monto = Number($('#fM', h).value); if (!(monto > 0)) throw new Error('Escribí el monto.');
      const { error } = await sb.from('ord_gastos').insert({ negocio_id: S.neg.id, tipo: 'fijo', categoria: pf.categoria, concepto: pf.concepto, monto, metodo: met, fecha: $('#fF', h).value || isoDia(new Date()), pago_fijo_id: pf.id, periodo });
      if (error) throw (/duplicate|unique/i.test(error.message) ? new Error('Ese pago ya estaba marcado como pagado.') : error);
      cerrarHoja(); toast('Pago registrado'); await recargarPagosFijosMes(); cargarConta();
    });
  });
}
function vFijos() {
  if (!esDueno()) return '<div class="empty">Solo el dueño administra los pagos fijos.</div>';
  setTimeout(async () => { const { data } = await sb.from('ord_pagos_fijos').select('*').eq('negocio_id', S.neg.id).order('activo', { ascending: false }).order('dia'); S.todosFijos = data || []; pintarFijos(); }, 0);
  return `<p class="sm muted">Lo que pagás siempre, haya o no trabajo. Te aviso en el tablero 3 días antes de cada pago y cuenta para el punto de equilibrio.</p>
  <div id="lFij"><div class="spin"></div></div><button class="btn ama" data-a="editarFijo">${IC.mas}Agregar pago fijo</button>`;
}
function pintarFijos() {
  const l = S.todosFijos, tot = l.filter(x => x.activo).reduce((a, x) => a + mensualEquiv(x), 0);
  $('#lFij').innerHTML = l.length ? `<div class="card list" style="padding:4px 14px">${l.map(x => `<button class="li" data-a="editarFijo" data-x="${x.id}" style="text-align:left;${x.activo ? '' : 'opacity:.5'}"><div class="grow"><div class="b">${esc(x.concepto)}</div><div class="sm muted">${esc(x.categoria)} · ${x.frecuencia === 'quincenal' ? 'cada quincena' : 'el día ' + x.dia + ' de cada mes'}${x.activo ? '' : ' · pausado'}</div></div><b class="num">${L(x.monto)}</b></button>`).join('')}</div>
    <div class="card"><div class="kv tot"><span>Total fijo al mes</span><span class="num">${L(tot)}</span></div></div>` : '<div class="empty">Todavía no hay pagos fijos.</div>';
  enlazar($('#lFij'));
}
A.editarFijo = id => {
  const x = (S.todosFijos || []).find(z => z.id === id) || { concepto: '', categoria: CAT_FIJO[0], monto: '', frecuencia: 'mensual', dia: 1, activo: true };
  let cat = x.categoria, fr = x.frecuencia;
  abrirHoja(id ? 'Editar pago fijo' : 'Nuevo pago fijo', `<div class="f">Categoría<div class="chips" style="flex-wrap:wrap" id="xC">${CAT_FIJO.map(c => `<button type="button" class="chip ${c === cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>
    <label class="f">Nombre<input class="inp" id="xN" value="${esc(x.concepto)}" placeholder="Ej.: Alquiler del local"></label>
    <label class="f">Monto<div class="pre"><span>L</span><input class="inp" id="xM" type="number" inputmode="decimal" min="0" step="any" value="${x.monto}"></div></label>
    <div class="seg" id="xF"><button type="button" data-f="mensual" class="${fr === 'mensual' ? 'on' : ''}">Cada mes</button><button type="button" data-f="quincenal" class="${fr === 'quincenal' ? 'on' : ''}">Cada quincena</button></div>
    <label class="f" id="xDw">Día de pago<input class="inp" id="xD" type="number" min="1" max="31" value="${x.dia}"></label>
    <p class="xs faint" id="xAyuda"></p>
    ${id ? `<label class="chk"><input type="checkbox" id="xA" ${x.activo ? 'checked' : ''}> Activo</label>` : ''}
    <button class="btn pri full" id="xG">Guardar</button>${id ? '<button class="btn mal full" id="xB">Borrar</button>' : ''}`, h => {
    const ayuda = () => { const d = Number($('#xD', h).value) || 1; $('#xAyuda', h).textContent = fr === 'quincenal' ? `Se paga el ${d <= 15 ? d : d - 15} y el ${(d <= 15 ? d : d - 15) + 15} de cada mes.` : `Se paga el ${d} de cada mes (si el mes es más corto, el último día).`; };
    $$('#xC [data-c]', h).forEach(b => b.onclick = () => { cat = b.dataset.c; $$('#xC [data-c]', h).forEach(z => z.classList.toggle('on', z === b)); if (!$('#xN', h).value) $('#xN', h).value = cat === 'Otro' ? '' : cat; });
    $$('#xF button', h).forEach(b => b.onclick = () => { fr = b.dataset.f; $$('#xF button', h).forEach(z => z.classList.toggle('on', z === b)); ayuda(); });
    $('#xD', h).oninput = ayuda; ayuda();
    $('#xG', h).onclick = e => ocupado(e.currentTarget, async () => {
      const d = { negocio_id: S.neg.id, concepto: $('#xN', h).value.trim() || cat, categoria: cat, monto: Number($('#xM', h).value), frecuencia: fr, dia: Math.min(31, Math.max(1, parseInt($('#xD', h).value) || 1)), activo: id ? $('#xA', h).checked : true };
      if (!(d.monto > 0)) throw new Error('Escribí el monto.');
      const r = id ? await sb.from('ord_pagos_fijos').update(d).eq('id', id) : await sb.from('ord_pagos_fijos').insert(d);
      if (r.error) throw r.error;
      cerrarHoja(); toast('Guardado'); await recargar(); render();
    });
    $('#xB', h)?.addEventListener('click', async () => {
      if (!await confirmar('¿Borrar este pago fijo? Los pagos que ya registraste se quedan en la contabilidad.', { si: 'Borrar', peligro: true })) return;
      const { error } = await sb.from('ord_pagos_fijos').delete().eq('id', id); if (error) return fallo(error);
      toast('Borrado'); await recargar(); render();
    });
  });
};

iniciar();

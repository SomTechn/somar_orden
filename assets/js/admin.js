/* Somar Orden · panel de Somar: crear talleres y ver cómo van */
let T = [];
async function cuentas(body) {
  const { data, error } = await sb.functions.invoke('ord-cuentas', { body });
  if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch (_) { } throw new Error(m); }
  if (data?.error) throw new Error(data.error);
  return data;
}
async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return entrada();
  const { data: ad } = await sb.from('ord_admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
  if (!ad) { document.body.innerHTML = `<div class="entrada"><div class="card"><h2 class="h2">Esta cuenta no es de Somar</h2><a class="btn full" href="/panel">Ir al panel del taller</a><button class="btn quiet" id="bS">Salir</button></div></div>`; $('#bS').onclick = async () => { await sb.auth.signOut(); location.reload(); }; return; }
  await cargar();
}
function entrada(msg = '') {
  document.body.innerHTML = `<div class="entrada"><div class="marca"><img src="/assets/img/icon.svg" alt=""><div><div class="t">Somar Orden</div><div class="s">Panel de Somar</div></div></div>
    <form class="card" id="fE" style="gap:14px"><label class="f">Correo o número<input class="inp" name="u" autocomplete="username" autocapitalize="none" required></label>
    <label class="f">Contraseña<input class="inp" name="p" type="password" autocomplete="current-password" required></label>
    <div class="err ${msg ? '' : 'hidden'}" id="eE">${esc(msg)}</div><button class="btn pri full">Entrar</button>
    <p class="xs faint">Usá el mismo usuario de Mi Planilla.</p></form></div>`;
  $('#fE').onsubmit = async e => {
    e.preventDefault(); const f = e.target, u = f.u.value.trim().toLowerCase();
    const { error } = await sb.auth.signInWithPassword({ email: u.includes('@') ? u : digitos(u) + '@' + CONFIG.DOMINIO, password: f.p.value });
    if (error) { $('#eE').textContent = errMsg(error); $('#eE').classList.remove('hidden'); return; }
    iniciar();
  };
}
async function cargar() {
  try { T = (await cuentas({ accion: 'talleres' })).talleres; } catch (e) { return fallo(e); }
  pintar();
}
function pintar() {
  document.body.innerHTML = `<div class="app"><header class="top"><img src="/assets/img/icon.svg" alt="" style="width:34px;height:34px"><div class="grow"><h1>Somar Orden</h1><div class="sub">Panel de Somar · ${T.length} taller${T.length === 1 ? '' : 'es'}</div></div><button class="btn-ic" id="bSal" aria-label="Salir">${IC.salir}</button></header>
  <main class="main" style="padding-bottom:30px">
    <button class="btn ama full" id="bNuevo">${IC.mas}Crear taller</button>
    ${T.map(n => { const d = (n.ord_miembros || []).find(m => m.rol === 'dueno'); return `<div class="card">
      <div class="row"><div class="grow"><div class="b" style="font-size:16px">${esc(n.nombre)}</div><div class="sm muted">${esc(GIROS[n.giro] || n.giro)} · ${n.ordenes} órdenes · desde ${esc(fechaCorta(n.created_at))}</div></div>
        <span class="tag ${n.estado === 'activo' ? 'lista' : 'cancelada'}">${n.estado === 'activo' ? 'Activo' : 'Suspendido'}</span></div>
      ${d ? `<div class="sm">Dueño: <b>${esc(d.nombre)}</b> · <span class="num">${esc(telFmt(d.tel))}</span></div>` : ''}
      <div class="sm muted">${(n.ord_miembros || []).length} persona(s) con acceso · plan ${esc(n.plan)}</div>
      <div class="btns"><a class="btn s pri" href="/panel?n=${n.id}">Abrir panel</a>${d ? `<button class="btn s" data-clave="${n.id}|${d.user_id}">Contraseña del dueño</button>` : ''}<button class="btn s ${n.estado === 'activo' ? 'mal' : ''}" data-est="${n.id}">${n.estado === 'activo' ? 'Suspender' : 'Activar'}</button></div>
    </div>`; }).join('') || '<div class="empty">Todavía no hay talleres.</div>'}
  </main></div>`;
  $('#bSal').onclick = async () => { await sb.auth.signOut(); location.reload(); };
  $('#bNuevo').onclick = nuevo;
  $$('[data-est]').forEach(b => b.onclick = async () => {
    const n = T.find(x => x.id === b.dataset.est), est = n.estado === 'activo' ? 'suspendido' : 'activo';
    if (est === 'suspendido' && !await confirmar(`¿Suspender ${n.nombre}? Su equipo no podrá entrar al panel.`, { si: 'Suspender', peligro: true })) return;
    const { error } = await sb.from('ord_negocios').update({ estado: est }).eq('id', n.id); if (error) return fallo(error); cargar();
  });
  $$('[data-clave]').forEach(b => b.onclick = () => { const [neg, uid] = b.dataset.clave.split('|'); abrirHoja('Nueva contraseña del dueño', `<label class="f">Contraseña nueva (mínimo 6)<input class="inp" id="k" autocomplete="off"></label><button class="btn pri full" id="kG">Guardar</button>`, h => {
    $('#kG', h).onclick = e => ocupado(e.currentTarget, async () => { await cuentas({ accion: 'cambiar_clave', negocio_id: neg, user_id: uid, clave: $('#k', h).value }); cerrarHoja(); toast('Contraseña cambiada'); });
  }); });
}
function nuevo() {
  abrirHoja('Crear taller', `<label class="f">Nombre del taller<input class="inp" id="n1" placeholder="Ej.: Costuras Doña Marta"></label>
    <label class="f">Tipo de taller<select class="inp" id="n2">${Object.entries(GIROS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
    <label class="f">Dirección (opcional)<input class="inp" id="n3"></label>
    <div class="hr"></div>
    <label class="f">Nombre del dueño<input class="inp" id="n4"></label>
    <label class="f">WhatsApp del dueño (con este entra)<input class="inp" id="n5" inputmode="tel" placeholder="9999-9999"></label>
    <label class="f">Contraseña inicial (mínimo 6)<input class="inp" id="n6" autocomplete="off"></label>
    <p class="xs faint">Se cargan servicios de ejemplo según el tipo de taller. El dueño los cambia en Más → Servicios.</p>
    <button class="btn pri full" id="nG">Crear taller</button>`, h => {
    $('#nG', h).onclick = e => ocupado(e.currentTarget, async () => {
      const r = await cuentas({ accion: 'crear_taller', nombre: $('#n1', h).value, giro: $('#n2', h).value, direccion: $('#n3', h).value, dueno_nombre: $('#n4', h).value, dueno_tel: $('#n5', h).value, clave: $('#n6', h).value });
      const tel = digitos($('#n5', h).value), clave = $('#n6', h).value;
      const txt = `Hola ${primero($('#n4', h).value)}, ya está listo Somar Orden para ${r.negocio.nombre}.\n\nEntrá aquí: ${CONFIG.URL}/panel\nTu número: ${telFmt(tel)}\n${r.usuario_nuevo ? 'Tu contraseña: ' + clave : 'Usá tu misma contraseña de siempre.'}\n\nCuando entrés, podés cambiarla en Más → Cambiar mi contraseña.`;
      await cargar();
      abrirHoja('Taller creado', `<div class="panel ok"><b>${esc(r.negocio.nombre)} ya está activo.</b></div><textarea class="inp" id="tx" style="min-height:170px">${esc(txt)}</textarea>
        <a class="btn wa full" target="_blank" rel="noopener" href="${waLink(tel, txt)}">${IC.wa}Mandarle el acceso por WhatsApp</a><button class="btn full" data-cerrar>Listo</button>`);
    });
  });
}
iniciar();

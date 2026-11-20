/* Somar Orden · página del cliente (enlace que manda el taller). Solo lectura. */
const token = location.pathname.split('/').filter(Boolean).pop() || new URLSearchParams(location.search).get('t') || '';
const PASOS = [['recibida', 'Recibida', 'El taller recibió tus prendas.'], ['en_proceso', 'En proceso', 'Están trabajando en tu orden.'], ['lista', 'Lista', 'Ya podés pasar a recogerla.'], ['entregada', 'Entregada', 'Ya te la entregaron. ¡Gracias!']];

async function cargar() {
  const { data, error } = await sb.rpc('ord_publica', { p_token: token });
  if (error || !data) return pintarNoEncontrada(error);
  pintar(data);
}
function pintarNoEncontrada(e) {
  document.body.innerHTML = `<div class="entrada"><div class="marca"><img src="/assets/img/icon.svg" alt=""><div class="t">Somar Orden</div></div>
    <div class="card"><h2 class="h2">${e ? 'No pudimos cargar tu orden' : 'No encontramos esta orden'}</h2><p class="muted">${e ? 'Revisá tu conexión e intentá otra vez.' : 'Revisá que el enlace esté completo o pedíselo de nuevo al taller.'}</p>${e ? '<button class="btn pri full" onclick="location.reload()">Intentar otra vez</button>' : ''}</div></div>`;
}
function horarioTxt(H) {
  const dias = [1, 2, 3, 4, 5, 6, 0].filter(d => H?.[d]);
  if (!dias.length) return '';
  const grupos = []; // agrupa días seguidos con el mismo horario
  dias.forEach(d => { const h = H[d].join('-'), g = grupos.at(-1); if (g && g.h === h && [1, 2, 3, 4, 5, 6, 0].indexOf(d) === [1, 2, 3, 4, 5, 6, 0].indexOf(g.fin) + 1) g.fin = d; else grupos.push({ ini: d, fin: d, h }); });
  return grupos.map(g => `${DIAS_L[g.ini]}${g.fin !== g.ini ? ' a ' + DIAS_L[g.fin].toLowerCase() : ''}: ${h12(H[g.ini][0])} a ${h12(H[g.ini][1])}`).join('<br>');
}
function pintar(d) {
  const o = d.orden, t = d.taller, idx = PASOS.findIndex(p => p[0] === o.estado), cancel = o.estado === 'cancelada';
  document.title = `Orden ${o.numero} · ${t.nombre}`;
  const msg = `Hola, soy ${d.cliente}. Te escribo por mi orden #${o.numero}.`;
  const atrasada = !cancel && idx < 2 && new Date(o.fecha_entrega) < new Date();
  document.body.innerHTML = `<div class="app">
  <header class="top"><img src="/assets/img/icon.svg" alt="" style="width:34px;height:34px"><div class="grow"><h1 class="ell">${esc(t.nombre)}</h1><div class="sub">Orden de trabajo</div></div></header>
  <main class="main" style="padding-bottom:30px">
    <div class="card" style="gap:14px">
      <div class="row"><div class="ord" style="grid-template-columns:54px 1fr"><div class="numero num"><span>${o.numero}</span></div><div><div class="sm muted">Hola ${esc(d.cliente)}, esta es tu orden</div><div class="h1">${cancel ? 'Cancelada' : PASOS[idx][1]}</div></div></div></div>
      ${cancel ? '<div class="panel bad">Esta orden fue cancelada. Si tenés dudas, escribile al taller.</div>' : `
      <div class="pasos">${PASOS.map((p, i) => `<div class="paso ${i <= idx ? 'on' : ''} ${i === idx && i < 3 ? 'ahora' : ''}"><div class="bar"></div>${p[1]}</div>`).join('')}</div>
      <p class="muted">${PASOS[idx][2]}</p>`}
      ${!cancel && o.estado !== 'entregada' ? `<div class="panel ${o.estado === 'lista' ? 'ok' : atrasada ? 'warn' : 'info'}"><span class="sm">${o.estado === 'lista' ? 'Lista desde' : 'Fecha de entrega'}</span><b style="font-size:17px">${esc(fechaHora(o.estado === 'lista' ? o.lista : o.fecha_entrega))}</b>${atrasada ? '<span class="sm">Se está atrasando un poco. El taller te avisará por WhatsApp cuando esté lista.</span>' : ''}</div>` : ''}
      ${o.urgente ? '<span class="tag urg" style="align-self:flex-start">Servicio urgente</span>' : ''}
    </div>

    <div class="sect">Prendas</div>
    <div class="card">
      ${d.prendas.map(p => `<div class="kv"><span>${p.cantidad > 1 ? p.cantidad + ' × ' : ''}${esc(p.descripcion)}</span><span class="num">${L(p.precio * p.cantidad)}</span></div>`).join('')}
      ${o.recargo > 0 ? `<div class="kv"><span class="k">Recargo urgente</span><span class="num">${L(o.recargo)}</span></div>` : ''}
      <div class="hr"></div>
      <div class="kv tot"><span>Total</span><span class="num">${L(o.total)}</span></div>
      ${d.pagos.map(p => `<div class="kv"><span class="k">${TIPOS_PAGO[p.tipo]} · ${esc(fechaCorta(p.fecha))}</span><span class="num">− ${L(p.monto)}</span></div>`).join('')}
      ${!cancel ? `<div class="kv tot"><span>${o.saldo > 0 ? 'Saldo a pagar' : 'Pagada'}</span><span class="num" style="color:${o.saldo > 0 ? 'var(--tinta)' : 'var(--ok)'}">${o.saldo > 0 ? L(o.saldo) : '✓'}</span></div>` : ''}
    </div>

    ${o.saldo > 0 && !cancel && t.cuentas?.length ? `<div class="sect">Para pagar por transferencia</div>
    <div class="card">${t.cuentas.map(c => `<div class="row"><div class="grow"><div class="b">${esc(c.banco)}${c.tipo ? ' · ' + esc(c.tipo) : ''}</div><div class="num" style="font-size:16px">${esc(c.numero)}</div><div class="sm muted">${esc(c.titular)}</div></div><button class="btn s" data-copia="${esc(c.numero)}">${IC.copiar}Copiar</button></div>`).join('<div class="hr"></div>')}
      <p class="sm muted">Cuando transfieras, mandale el comprobante al taller por WhatsApp.</p></div>` : ''}

    <div class="sect">El taller</div>
    <div class="card">
      ${t.direccion ? `<div><div class="sm muted">Dirección</div><div class="b">${esc(t.direccion)}</div></div>` : ''}
      ${horarioTxt(t.horario) ? `<div><div class="sm muted">Horario</div><div class="sm">${horarioTxt(t.horario)}</div></div>` : ''}
      ${t.tel ? `<a class="btn wa full" href="${waLink(t.tel, msg)}" target="_blank" rel="noopener">${IC.wa}Escribirle al taller</a>` : ''}
    </div>
    <p class="xs faint" style="text-align:center">Guardá este enlace para ver cómo va tu orden. Se actualiza solo.</p>
    <div class="pie">Hecho con Somar Orden · <img src="/assets/img/somar-labs.png" alt="Somar Labs"></div>
  </main></div>`;
  $$('[data-copia]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copia.replace(/\s/g, '')); toast('Número copiado'); } catch (e) { toast(b.dataset.copia); } });
}
cargar();
// Se actualiza solo cada minuto y al volver a la pestaña
setInterval(() => { if (!document.hidden) cargar(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) cargar(); });

# Somar Orden

Órdenes de trabajo para talleres de **costura, mecánica, electrónica y celulares** en Honduras. Producto de Somar Labs.

## Páginas

| Ruta | Para quién | Qué hace |
| --- | --- | --- |
| `/` | Prospectos | Presentación corta de la app. |
| `/panel` | Dueño y empleados del taller | Entrar con WhatsApp + contraseña. Recibir prendas (varias por orden), fotos, medidas, anticipo, fecha de entrega sugerida y editable, urgentes, estados, cobro del saldo, aviso por WhatsApp, clientes, caja del día, servicios, equipo y datos del taller. |
| `/o/<token>` | Cliente final | Enlace que manda el taller. Muestra estado, fecha de entrega, prendas, saldo, cuentas para transferir y botón de WhatsApp al taller. Solo lectura. |
| `/admin` | Somar Labs | Crear talleres (con su dueño y servicios de ejemplo), suspender/activar, cambiar contraseña del dueño, abrir el panel de cualquier taller. |

## Cómo está armado

- HTML, CSS y JavaScript sin frameworks. Sin paso de compilación.
- **Supabase** (proyecto compartido con las demás apps, tablas con prefijo `ord_`):
  - `sql/01_somar_orden.sql`: tablas, RLS, disparadores, `ord_crear_orden`, `ord_recalcular`, `ord_publica` y la carpeta privada de fotos `ord-fotos`.
  - `sql/02_usuario_por_email.sql`: búsqueda de usuario para la función de cuentas (solo `service_role`).
  - `sql/03_referencias_paradas_contabilidad.sql`: imágenes de referencia por prenda, tiempos muertos (`ord_paradas`, `ord_mover_entregas`), gastos (`ord_gastos`) y pagos fijos (`ord_pagos_fijos`).
  - `supabase/functions/ord-cuentas`: crea talleres y usuarios, cambia contraseñas y lista talleres para el panel de Somar.
- Las cuentas usan un correo interno `<8 dígitos>@orden.somar.invalid`; la persona solo escribe su número y contraseña.
- El administrador de Somar está en `ord_admins` (entra con el mismo usuario de Mi Planilla).
- Configuración pública (URL y clave publicable de Supabase) en `assets/js/core.js`.

## Seguridad

- Toda tabla `ord_*` tiene RLS. Un taller solo ve sus datos; los empleados no cambian datos del taller ni borran pagos.
- El cliente final solo ve su orden a través de `ord_publica(token)` con un enlace imposible de adivinar (32 caracteres).
- Las fotos son privadas y se ven con enlaces firmados que vencen en una hora.

## Tiempos muertos

Se registran cortes de luz, compras de material, enfermedad, feriados, etc. Las horas de trabajo que se pierden (solo cuenta el horario del taller) corren las fechas de entrega de las órdenes pendientes que vencían después del corte, con vista previa y aviso al cliente por WhatsApp. La fecha sugerida y el "Comprometido hasta" del tablero saltan los tiempos muertos programados.

## Contabilidad (solo dueño)

- Costos variables por orden (tela, hilos, zíperes, transporte) con ganancia de cada orden. Los empleados también los anotan.
- Gastos fijos y pagos fijos programados (mensual o quincenal) con aviso en el tablero 3 días antes.
- Reporte del mes: cobrado, costos variables, fijos pagados y por pagar, ganancia y punto de equilibrio.

## Fecha de entrega sugerida

Suma las horas de trabajo de las órdenes pendientes, las reparte entre las personas que trabajan a la vez (capacidad) y avanza solo por las horas en que el taller abre, saltando los tiempos muertos. Las urgentes solo esperan detrás de otras urgentes y tardan menos (porcentaje configurable). La costurera puede cambiar la fecha.

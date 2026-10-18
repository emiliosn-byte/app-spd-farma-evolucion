# Evolución · Gestión SPD

MVP administrativo en español para Farmacia Evolución. Next.js 16, React, TypeScript y Supabase (PostgreSQL + Auth). No almacena identidad de pacientes, teléfonos, tratamientos ni consentimientos: se referencian por su código Farmatic.

## Arranque local

Requisitos: Node.js 24 y pnpm 11.25.0. Para Supabase local también se necesitan Supabase CLI y Docker; para un proyecto remoto no.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Abrir http://127.0.0.1:3000. Sin credenciales se muestra una **vista previa vacía, sin conexión y sin escritura**, no un sistema de autenticación alternativo. Configurar las tres variables de `.env.local` para activar el acceso real. La clave de servicio nunca debe llevar el prefijo `NEXT_PUBLIC_`.

## Supabase y primer acceso

1. Crear el proyecto de Supabase en Fráncfort (`eu-central-1`).
2. Aplicar, en orden, los SQL de `supabase/migrations/`. Con CLI: `supabase link --project-ref REFERENCIA` y `supabase db push`. En local: `supabase start` y `supabase db reset`.
3. **Deshabilitar el registro público en el panel de Auth del proyecto remoto.** El fichero `supabase/config.toml` lo deshabilita para el entorno local, pero no configura por sí mismo un proyecto alojado. No activar acceso anónimo ni proveedores sociales. Mantener correo/contraseña sin SMTP, confirmación automática para las cuentas creadas administrativamente y sin MFA, conforme al alcance acordado.
4. Copiar la URL, clave publicable y `service_role` a `.env.local`. No incluirlas en Git ni en diagnósticos.
5. Crear la primera cuenta:

```sh
pnpm accounts bootstrap --email titular@ejemplo.es --name "Nombre del titular"
```

La utilidad pide la contraseña temporal de forma oculta. Cambiarla al iniciar sesión. El nombre y el correo son configurables; el código no asocia privilegios a personas concretas.

Desde Configuración, superpowers crea las empleadas, sus jornadas iniciales de **38,5 h**, vincula cuentas cuando corresponda y crea la cuenta administradora de Ana. Antes de aprobar por primera vez deben estar configuradas al menos las cinco beneficiarias iniciales y las jornadas de todos los meses a repartir. Para una baja laboral, cerrar la jornada y deshabilitar también el acceso si corresponde: son registros independientes.

## Reglas que aplica el MVP

- El programa comienza en el **mes de la primera venta real registrada**, no en el alta del primer paciente ni en enero. Una primera venta en noviembre de 2026 fija el año 1 en noviembre de 2026–octubre de 2027, y T1 en noviembre–enero. Antes de la primera aprobación, corregir ventas puede recalcular ese inicio; después permanece fijado.
- Los objetivos del primer año son 12 (4/8), 10 (7/3), 10 (9/1) y 18 (13/5) altas NUEVO/PROPIO. La meta a dos años es 100 **activos**; no se inventan objetivos trimestrales del segundo año. Las reactivaciones no son nuevas incorporaciones. Solo las altas validadas se incluyen en el resultado del objetivo.
- Cada paciente mantiene ciclos individuales de doce meses de calendario desde su mes de alta, independientemente del inicio global del programa.
- El resumen compara el resultado trimestral con la referencia temporal, muestra el ritmo necesario y ofrece evolución mensual de altas, bajas, reactivaciones y activos. Los meses futuros se identifican como pendientes.
- Administración puede corregir la fecha de alta original: se actualiza su primer periodo en la misma transacción y se rechaza cualquier fecha que deje ventas fuera del alta. Los cambios económicos posteriores a una aprobación se revisan como ajustes.
- Cada venta conserva fecha efectiva y fecha de registro. Varias ventas en un mes cuentan una vez. Se permiten ventas distintas el mismo día. Las correcciones y anulaciones requieren motivo y quedan auditadas.
- Un mes sin venta no equivale a sin compra: debe comprobarse expresamente. Solo pueden cerrarse como sin compra meses terminados.
- Captación: 40 € NUEVO / 15 € PROPIO al completar tres meses con compra del primer ciclo. Está disponible al cerrar el tercero (o un cierre anticipado por baja). No se recupera esa captación alcanzando el tercero en otro ciclo.
- Permanencia: máximo × (meses con compra − 3) / 9; madura al cierre del primer ciclo o de una baja. Mantenimiento posterior: importe anual × meses con compra / 12, al cerrar cada ciclo o baja.
- Mostrador: captación atribuida por tercios a los tres primeros meses con compra, permanencia por novenos a los posteriores y mantenimiento por doceavos. Cada tramo mensual se reparte por horas semanales y días naturales de vigencia, intersectados con los periodos del paciente. Una nueva empleada participa únicamente desde su incorporación. Las jornadas no se solapan.
- Externa: íntegro para la captadora, sin ponderar su jornada. Después de la baja laboral requiere un periodo aceptado de continuidad de la gestión de medicación, validado por superpowers para ese paciente. Al terminar, se cierra lo generado y no hay nuevos derechos ni transferencia automática. Las ventas posteriores no generan incentivo para ella. Esta aceptación es administrativa: no registra medicación ni acredita automáticamente su gestión.
- Titular: cuenta en los objetivos y no genera incentivos. Las metas colectivas no condicionan el cobro.
- Los cálculos usan `numeric`. Se redondea cada derecho por paciente, ciclo y concepto; el reparto usa mayores restos y desempata por orden de beneficiaria e identificador. No se redondean los tramos mensuales antes de sumarlos.
- Los ajustes son diferencias respecto a los derechos ya aprobados, incluidas diferencias negativas. Los saldos negativos se compensan con incentivos futuros; no se ejecutan devoluciones o transferencias.
- Se registra el pago del **saldo aprobado completo por empleada**, que puede cubrir varios trimestres y ajustes; no hay pagos parciales. La fecha de pago no puede preceder a la aprobación. Repetir una aprobación o confirmación no duplica movimientos.

## Permisos y seguridad

| Rol           | Funciones                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Estándar      | Operativa diaria, objetivos y solo sus importes.                                                            |
| Administrador | Lo anterior, validación de origen/clasificación, revisión de todo el equipo y preparación de liquidaciones. |
| Superpowers   | Lo anterior, aprobación, confirmación de pagos y gestión de plantilla, jornadas y accesos.                  |

El acceso se valida en servidor y PostgreSQL. Las tablas tienen RLS y no aceptan escrituras directas de usuarios: las RPC autorizan recursos y campos y exigen versión para editar. Las funciones de cálculo internas y restauración no son ejecutables por usuarios autenticados. Deshabilitar un perfil bloquea de inmediato las operaciones aunque conserve un token de Auth. Las cuentas sin cambio de contraseña temporal solo pueden acceder a su perfil y al cambio de contraseña.

La aprobación bloquea cambios concurrentes, comprueba que la vista previa sigue vigente y conserva fuentes, reglas, repartos e importes. Los datos fuente pueden corregirse con auditoría, pero los cierres aprobados permanecen inmutables y las diferencias aparecen en el siguiente trimestre. El CSV protege frente a inyección de fórmulas.

Las liquidaciones aprobadas tienen un CSV trimestral por empleada para gestoría, además del CSV de saldos y del detalle interno por paciente. Los CSV utilizan punto y coma y separador decimal español; al importarlos en una hoja de cálculo, tratar el código Farmatic como texto para conservar ceros iniciales.

## Copias y restauración

Realizar una copia **antes de cada aprobación y después de registrar pagos**, y conservar copias fuera de la máquina y del proyecto. El plan Free no proporciona las mismas garantías de copias y continuidad que un plan de pago y puede pausar proyectos inactivos.

```sh
pnpm backup create
```

La copia JSON completa incluye datos administrativos, auditoría, liquidaciones y el mapa de identificadores/correos de acceso. Se escribe con permisos restrictivos en `backups/`, ignorado por Git. **No contiene contraseñas, hashes, sesiones ni credenciales de Supabase**. El botón de exportación de la aplicación descarga solo datos administrativos; por sí solo no recrea las cuentas de Auth.

Para restaurar sin sobrescribir el origen:

1. Crear un proyecto Supabase **nuevo y vacío**, con registro público deshabilitado.
2. Aplicar las mismas migraciones; no crear la cuenta inicial.
3. Configurar las credenciales del **destino** en el entorno o en una copia privada de `.env.local`.
4. Ejecutar:

```sh
pnpm backup restore --file /ruta/absoluta/copia.json --empty-target
pnpm accounts recover --email titular@ejemplo.es
```

La restauración exige un destino vacío, recrea Auth con los UUID originales y contraseñas aleatorias desconocidas y restaura los datos administrativos en una transacción. Si falla la restauración, revierte los datos y trata de retirar las cuentas recién creadas. Todas las cuentas restauradas deben cambiar su contraseña tras la recuperación manual. Repetir `accounts recover` para los demás accesos.

Verificar recuentos de pacientes, empleadas, ventas, objetivos, importes aprobados/pagados y una liquidación histórica antes de cambiar el destino de la aplicación. La suite prueba el recorrido exportación → restauración en otra base PostgreSQL integrada y compara derechos económicos. Las llamadas a Supabase Auth y la restauración alojada requieren además una prueba de implantación con datos ficticios.

## Despliegue en Vercel

Importar el repositorio como proyecto Next.js, usar Node 24 y configurar las tres variables de entorno. `vercel.json` sitúa las funciones en `fra1`; crear también Supabase en Fráncfort. Configurar en Auth la URL de producción y sus redirecciones. Las vistas de prueba deben utilizar otra base de datos con datos ficticios, nunca la producción.

Añadir también `ENABLE_EXPERIMENTAL_COREPACK=1` en Vercel para respetar la versión de pnpm fijada en `packageManager`, según la [configuración oficial de Corepack](https://vercel.com/docs/builds/configure-a-build#corepack).

Para el uso empresarial elegir un plan compatible de Vercel (Hobby está limitado a uso personal no comercial). No se contrata ningún servicio desde este proyecto. Mantener inicialmente Supabase Free solo si se aceptan sus límites y las copias manuales.

## Comprobaciones

```sh
pnpm typecheck
pnpm test
pnpm build
```

Las pruebas ejecutan las migraciones reales con PGlite (PostgreSQL en WASM), incluidas RLS, funciones PL/pgSQL, reparto temporal, céntimos, cierres, pagos, privacidad y restauración. No necesitan credenciales ni usan la base real. La compilación también funciona sin credenciales. Antes de ponerlo en producción, comprobar además login/logout, contraseñas y panel de cuentas contra un proyecto Supabase de pruebas.

No incluidos: importación automática de Farmatic, transferencias bancarias, nóminas/coste empresarial del neto, notas clínicas, correos, recuperación automática ni contratación de alojamiento.

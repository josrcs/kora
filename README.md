# Kora · Gestión académica multi-institución

Plataforma web de calificaciones y gestión académica para colegios de Colombia (SIEE · Decreto 1290 de 2009).
Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · Drizzle ORM · PostgreSQL 15+.

> **Estado:** en desarrollo. Los colegios, personas y documentos de los datos de prueba son ficticios; el SIEE de la
> IED Jorge Isaacs se usa como referencia real.

## Puesta en marcha

```bash
git clone https://github.com/josrcs/kora.git
cd kora
npm install
cp .env.example .env.local     # ajustar PG*, SESSION_SECRET y DB_SCHEMA
npm run db:reset               # (desarrollo) recrea el esquema, aplica migraciones y carga datos de prueba
npm run dev
```

| Script | Qué hace |
|---|---|
| `npm run db:migrate` | Aplica las migraciones pendientes de `db/migrations` |
| `npm run db:seed` | Carga el colegio de prueba (no corre en producción) |
| `npm run db:reset` | Borra `DB_SCHEMA` y lo recrea (solo desarrollo, nunca sobre `public`) |
| `npm test` | Pruebas del cálculo de notas |
| `npm run typecheck` | TypeScript estricto |

### Usuarios de prueba

Tres colegios a escala real (`npm run db:reset`, ~1 minuto): **11 grados × 4 salones × 46 = 2.024 estudiantes** cada uno,
40 docentes, unas 300.000 notas de actividades. En `/login` elija colegio y **perfil**; en desarrollo la pantalla lista
estas cuentas y las autocompleta con un clic. Fuente única: `src/features/auth/demo.ts`.

| Perfil | Documento (igual en los 3 colegios) | Clave | Qué ve |
|---|---|---|---|
| Coordinador | `1000000003` | `Coordinador2026` | Todo: todas las planillas, cierre de periodos, corte preventivo, carga, convivencia |
| Rector | `1000000002` | `Rector2026` | Promedios de la institución y curso por curso; anotaciones. Nada académico editable |
| Docente | `1000000004` | `Docente2026` | Matemáticas 9° a 11° (12 cursos): solo sus planillas |
| Docente | `1000000005` | `Docente2026` | Titular de 3°-A (primaria: todas las asignaturas de su salón) |
| Secretaría | `1000000001` | `Admin2026` | Matrículas, grupos, grados, años. **No ve notas** |

| Colegio | Estudiantes (`Estudiante2026`) | Acudiente (`Acudiente2026`) |
|---|---|---|
| IED Jorge Isaacs (Barranquilla) | `1100000001` Valeria (9-A) · `1100000002` Mateo (9-A) · `1100000003` Mariana (9-B) | `52000001` (madre de Valeria y Mateo) |
| IED Los Corales (Cartagena) | `1200000001` Sebastián (10-A) | `53000001` |
| IE Técnica Industrial Las Palmas (Soledad) | `1300000001` Valentina (11-A) | `54000001` |

El personal usa los mismos documentos en los tres colegios **a propósito**: son personas distintas (prueba de
aislamiento). Los demás usuarios del seed tienen la clave `Kora.2026` y deben cambiarla al primer ingreso.

### Roles y permisos

| | Planillas y notas | Coordinación | Administración | Rectoría | Observador | Procesos disciplinarios | Portal |
|---|---|---|---|---|---|---|---|
| Estudiante / acudiente | – | – | – | – | – | – | solo lo suyo |
| Docente | **solo sus asignaciones** | – | – | – | sus estudiantes (desde la planilla) | – | – |
| Coordinador | **todas (el único)** | ✓ | ✓ | ✓ | todo el colegio | abrir y cerrar | – |
| Rector | – | – | – | ✓ | todo el colegio | – | – |
| Secretaría | – | – | ✓ | – | – | – | – |

La base lo garantiza además de la app (migraciones 0005 y 0006): solo el docente asignado o coordinación escriben notas
y actividades (`fn_assert_editor_asignacion`); un periodo cerrado no admite cambios salvo la recuperación en su ventana;
solo coordinación abre o cierra procesos.

## Ciclo de un periodo

1. **Actividades.** Cada docente crea en su planilla las actividades del periodo con nombre y porcentaje (Quiz temático
   30 %, Taller 30 %…) y las califica. La definitiva se calcula en el servidor (centésimas, sin errores de redondeo) y
   existe cuando todas las actividades tienen nota; mientras tanto se muestra la parcial. Sin actividades, se digita la
   definitiva directamente. Las actividades no pueden sumar más de 100 %.
2. **Corte preventivo** (`/coordinacion/corte`). A mitad de periodo (`periods.fecha_corte`) coordinación toma una foto
   de las notas parciales (`fn_generar_corte_preventivo`). El corte aparece en la planilla de cada docente, en un
   reporte por grado y salón con los estudiantes en riesgo, y en el **Informe preventivo** del portal.
3. **Cierre.** Coordinación cierra el periodo: nadie (ni docentes ni coordinación) modifica notas ni actividades; el
   boletín queda publicado. Se cierran en orden.
4. **Recuperación.** Cuando empieza el periodo siguiente, el docente ve el botón «Recuperación P*n* (máx. 3,0)»: solo
   aparecen los estudiantes que perdieron, y la nota de recuperación no puede superar `institutions.nota_max_recuperacion`
   (3.0) ni bajar la obtenida. Vale `nota_final = coalesce(recuperación, nota)` en boletines y reportes. La ventana se
   cierra cuando se cierra el periodo siguiente.

## Ingreso

1. **Una sola pantalla** (`/login`): tarjetas de colegios con buscador (nombre, municipio o código DANE, sin tildes),
   perfil (Estudiante, Acudiente, Docente, Coordinador, Rector) y credenciales. El navegador recuerda el último colegio.
2. **Documento y contraseña**: acepta el documento con puntos o espacios (`1.045.678.901`). Mensaje genérico
   ante error (no revela si el documento existe; bcrypt corre igual con un hash señuelo). Aviso de Bloq Mayús.
3. **Bloqueo por fuerza bruta** (tabla `login_attempts`): 5 fallos por documento y colegio, o 30 por IP en
   cualquier colegio, bloquean 15 minutos. Se avisa cuando quedan 2 intentos.
4. **Clave temporal**: si `debe_cambiar_password`, toda página y acción redirige a `/cambiar-clave` hasta que la
   cambie (8+ caracteres, letras y números, sin su documento, distinta de la anterior).
5. **Sesión**: JWT HS256 en cookie httpOnly (8 h) con la `sesion_version` del usuario. Cambiar la contraseña sube
   la versión y cierra las sesiones de otros equipos; desactivar la cuenta surte efecto en la siguiente petición. **Salir** es un POST nativo a `/salir` (no un
   Server Action) que obliga a recargar: así no quedan en memoria del navegador páginas del usuario anterior, algo
   importante en los computadores compartidos del colegio.

Pendiente para producción: la IP sale de `X-Forwarded-For`, así que la app debe estar detrás de un proxy que
lo sobrescriba; y la recuperación por correo (hoy la secretaría asigna una clave temporal).

## Estructura

```
kora/
├── db/
│   └── migrations/
│       ├── 0001_init.sql            ← FUENTE DE VERDAD del esquema (DDL, triggers, RLS, vistas)
│       ├── 0002_auth.sql            intentos de ingreso, versión de sesión, búsqueda sin tildes
│       ├── 0003_coordinacion.sql    historial de cierres/reaperturas, cierre de periodos en orden
│       ├── 0004_traslado_grupo.sql  cambio de grupo a mitad de año llevando las notas (fn_trasladar_matricula)
│       ├── 0005_rector_convivencia.sql  rol Rector, procesos disciplinarios, autoría de notas
│       └── 0006_actividades_recuperacion_corte.sql  actividades, recuperación con tope, corte preventivo
├── scripts/
│   ├── migrate.ts                   aplica migraciones en orden (tabla schema_migrations)
│   └── seed.ts                      colegio de prueba con el SIEE real de la IED Jorge Isaacs
├── src/
│   ├── app/                         SOLO rutas: páginas delgadas que componen features
│   │   ├── layout.tsx               fuentes, metadatos
│   │   ├── globals.css              tokens de la paleta institucional
│   │   ├── api/instituciones/       búsqueda pública del selector (Route Handler)
│   │   ├── (auth)/                  pantallas sin marco: login, cambiar-clave, sin-acceso
│   │   └── (app)/                   rutas autenticadas, con el marco lateral
│   │       ├── layout.tsx           menú por rol, usuario, salir
│   │       ├── inicio/              reparte según el rol
│   │       ├── docente/planilla/
│   │       │   ├── page.tsx         carga datos en el servidor (dentro de <Suspense>)
│   │       │   └── actions.ts       Server Action de autoguardado (Zod + sesión)
│   │       ├── portal/              boletín (+ PDF), asistencia y observador de estudiante/acudiente
│   │       ├── coordinacion/        resumen, periodos, seguimiento, carga (layout con pestañas)
│   │       └── admin/               matrículas, grupos, grados y asignaturas, años y periodos
│   ├── features/                    un directorio por módulo funcional
│   │   ├── auth/
│   │   │   ├── actions.ts           iniciarSesion, cerrarSesion, cambiarClave
│   │   │   ├── server/              login.ts (bloqueo + verificación), instituciones.ts
│   │   │   └── components/          selector de institución, formularios
│   │   └── planilla/
│   │       ├── types.ts             tipos y esquemas Zod compartidos cliente/servidor
│   │       ├── server/              solo servidor ("server-only")
│   │       │   ├── queries.ts       lecturas + reglas de acceso
│   │       │   └── guardar.ts       escritura transaccional + recálculo de la definitiva
│   │       └── components/          cliente
│   │           ├── planilla-docente.tsx   grilla tipo hoja de cálculo
│   │           ├── use-autosave.ts        cola de guardado con debounce y reintentos
│   │           ├── save-status.tsx        "Guardado hace 2 s"
│   │           └── desempeno-badge.tsx
│   │   ├── portal/                  consultas y vistas del portal de estudiante/acudiente
│   │   ├── periodos/                cierre/reapertura/fechas (actions.ts) y avance de digitación (server/)
│   │   ├── carga-academica/         asignación docente × grupo × asignatura, director de grupo
│   │   ├── dashboard/               indicadores del periodo y gráficos (cliente, con tooltip y tabla)
│   │   └── admin/                   estructura del año: actions/ (una por pantalla), server/comun.ts
│   │                                (ejecutar(): autoriza, traduce errores de la base, refresca), components/ui.tsx
│   ├── components/                  piezas de UI transversales (íconos, navegación)
│   ├── db/
│   │   ├── schema.ts                espejo tipado del DDL para Drizzle
│   │   ├── client.ts                pool + withTenant() (SET LOCAL del colegio y el usuario)
│   │   └── errors.ts                errorPostgres(): código/hint del error de PostgreSQL
│   └── lib/
│       ├── fechas.ts                hoy en Colombia, días entre fechas, formatos cortos
│       ├── auth/session.ts          cookie JWT firmada, getSession(), requireSession(), sessionParaAccion()
│       ├── auth/password.ts         bcrypt, hash señuelo, política de contraseñas
│       └── grading/calc.ts          cálculo PURO de notas (mismo código en navegador y servidor)
└── .env.example
```

Pendiente: carga académica y matrículas de un año aún inactivo (hoy solo sobre el activo), reactivar una matrícula
retirada, promoción masiva de un año al siguiente, gestión de usuarios del personal (docentes, coordinación) y un menú
de navegación para pantallas angostas (el lateral se oculta bajo 1024 px).

## Decisiones de diseño

**Multi-institución a prueba de errores.** Todas las tablas de negocio llevan `institution_id` y las FK entre ellas son
compuestas `(institution_id, x_id)`: el motor impide que una nota de un colegio apunte a una matrícula de otro.
Además, RLS filtra por `app.institution_id`, que `withTenant()` fija con `SET LOCAL` en cada transacción.
RLS solo aplica a un rol que no sea dueño de las tablas: en producción la app debe conectarse con un rol propio
(ver permisos al final de `0001_init.sql`).

**La base es la última línea de defensa.** Triggers que rechazan: escribir en un periodo cerrado, notas fuera de la
escala del colegio o con más decimales de los permitidos, logros o periodos que sumen más de 100 %, notas de un
estudiante en un grupo/grado/año que no es el suyo, roles incorrectos (un estudiante como docente). Toda escritura
de notas queda en `audit_log` con el valor anterior, el nuevo y el usuario.

**Definitiva calculada, nunca digitada (si hay logros).** La planilla calcula en vivo con `lib/grading/calc.ts`; al
guardar, el servidor recalcula con el mismo código a partir de lo que hay en la base y es ese valor el que se
persiste. Si una asignatura no tiene logros en el periodo, el docente digita la definitiva directamente.
Los cálculos se hacen en centésimas enteras (sin errores de coma flotante) y el desempeño se ubica después de
redondear según `institutions.decimales_nota` (3.55 → 3.6 → Básico).

**Escala por colegio.** `escala_min`, `escala_max`, `nota_aprobatoria`, `decimales_nota` y los rangos de desempeño
(`performance_levels`, sin solapes gracias a una restricción `EXCLUDE`) son datos, no código.

## Planilla de calificaciones

- Navegación tipo Excel: `Enter`/`Shift+Enter`, flechas (izquierda/derecha respetan el cursor dentro del texto),
  `Tab`, `Esc` deshace la celda. Al entrar a una celda se selecciona su contenido: escribir la reemplaza.
- Digitación rápida: `45` → 4.5, `4,5` (coma) → 4.5. Valores inválidos quedan en rojo y no se envían.
- Pegar un rango desde Excel o Google Sheets llena hacia abajo y a la derecha.
- Autoguardado silencioso: agrupa por celda, espera 800 ms tras la última tecla, un envío a la vez, reintentos con
  espera exponencial si se cae la red, guarda al ocultar la pestaña y avisa antes de cerrarla con cambios pendientes.
- Periodo cerrado: solo lectura. Si coordinación lo cierra mientras el docente digita, el siguiente guardado es
  rechazado, la grilla se bloquea y se avisa que el cambio no se guardó.
- Solo se re-renderiza la fila que cambia (`React.memo` + eventos delegados en `<tbody>`).

## Coordinación académica

Coordinación y administración entran a `/coordinacion` (los docentes, a su planilla).

- **Resumen**: avance de digitación del periodo abierto (con plazo y docentes atrasados), y para el periodo elegido
  (por defecto el último cerrado): promedio, % de notas en desempeño bajo, reparto por desempeño de cada grupo,
  reprobación por asignatura y la lista de estudiantes con 3 o más asignaturas en bajo en el **acumulado del año**
  (mismo cálculo del boletín). Cada gráfico tiene tooltip (mouse y teclado) y vista de tabla.
- **Periodos**: cerrar (bloquea las planillas y **publica** el boletín), reabrir (exige motivo y retira el boletín
  del portal) y editar fechas y plazo de notas. Cerrar con calificaciones pendientes exige confirmarlo, y si el número
  cambió mientras se confirmaba se vuelve a pedir. Cada cierre/reapertura queda en `period_events` (quién, cuándo,
  motivo, pendientes). La base impide cerrar un periodo con uno anterior abierto.
- **Seguimiento de notas**: avance por docente y asignación (al día / en curso / sin empezar, última edición),
  los más atrasados primero, con enlace a la planilla en modo consulta.
- **Carga académica**: por grupo, el docente e intensidad horaria de cada asignatura y el director de grupo; por
  docente, horas semanales, grupos y dirección de grupo. Una asignación con calificaciones no se puede quitar (FK);
  se cambia el docente, y las notas pasan al nuevo (su nombre aparece también en boletines anteriores).

## Administración académica

Coordinación y administración, en `/admin`:

- **Años y periodos**: crear un año lectivo (inactivo) con N periodos repartidos en partes iguales (100 / 3 → 33.33,
  33.33, 33.34; fechas contiguas), ajustar cada periodo y **activarlo** cuando empiecen las clases (el anterior se
  desactiva). El porcentaje de un periodo no cambia si ya hay periodos cerrados del año (alteraría boletines
  publicados). Solo se elimina el último periodo, y solo si no tiene logros ni notas.
- **Grados y asignaturas**: grados del sistema colombiano (prejardín a 13°) por nivel; áreas con su orden en el boletín;
  asignaturas por área (una asignatura usada no se borra: se marca inactiva y sale de la carga académica).
- **Grupos**: por año (también el siguiente, antes de activarlo), con grado, jornada y capacidad. Un grupo con
  matrículas o carga no se elimina.
- **Matrículas** (año activo): al digitar el documento se consulta si la persona existe y se prellenan sus datos.
  Si no existe, se crea con **clave temporal** (se muestra una sola vez; debe cambiarla al primer ingreso). El acudiente
  es opcional y queda como principal si el estudiante no tiene otro. Además:
  - **Cambiar de grupo** (mismo grado): `fn_trasladar_matricula` mueve la matrícula y re-apunta sus calificaciones,
    también las de periodos cerrados, a las mismas asignaturas del grupo destino sin tocar los valores. Es la única
    excepción al bloqueo de periodos cerrados y solo aplica a esa matrícula dentro de esa transacción. Si al grupo
    destino le falta alguna asignatura con notas, se rechaza.
  - **Retirar** (deserción o traslado a otra institución): conserva las notas; sale de planillas y seguimiento.
  - **Nueva clave**: clave temporal para un estudiante o acudiente; cierra sus sesiones abiertas.

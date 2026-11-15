# diego. — Pauta (v4 · Midnight Energy)

PWA estática para GitHub Pages. Sin servidor, sin APIs externas, sin dependencias. Los datos quedan en el teléfono (localStorage).

## 1. Auditoría de la versión anterior (v2)

| Área | Estado encontrado | Decisión en v3 |
|---|---|---|
| Archivos | `index.html` (vista + estilos), `app.js` (interfaz), `calc.js` (lógica pura), `store.js` (persistencia), `sw.js`, `manifest.json`, íconos, `tests/` | Se mantiene la misma arquitectura. Se reescriben vista y estilos; se extienden `calc.js` y `store.js` sin cambiar la fórmula. |
| Datos de alimentos | Una sola base en `calc.js` (27 alimentos) + alimentos propios + recetas | Misma base. Se agregan estado (crudo/cocido) y fuente sin tocar los valores. |
| Almacenamiento | `diegoPauta`, `diegoHistorial`, `diegoAlimentos` (v1) y `diego.v2.*` | Se conservan todas las claves. Solo se agregan `diego.v3.*` (recientes, favoritos de alimentos, reglas clínicas, preferencias). |
| Cálculos | `Calc.dose()`, `hcFor()`, `recipe()` | Fórmula idéntica: objetivo 110, sensibilidad 50, ratio 14 (cambiado desde 12 por la Dra. el 15/11/2026). `hcFor` acepta ahora gramos o unidades. |
| Navegación | 5 pestañas abajo, rutas por `#hash` | 4 pestañas (Inicio, Alimentos, Recetas, Pauta); Favoritas, Perfil e Historial desde Inicio, Perfil o Pauta. |
| PWA | Service worker "red primero, caché sin conexión" | Se mantiene la estrategia (evita servir versiones antiguas) y se renueva la caché a `pauta-diego-v3`. |

## 2. Sistema de diseño Midnight Energy

**Tokens** (`:root` en `index.html`), en dos temas con el mismo lima:

| Token | Oscuro | Claro |
|---|---|---|
| `--bg` / `--bg2` | #0B1020 / #121A2B | #F3F5F9 / #E9EDF4 |
| `--surface` / `--elev` | #182235 / #1F2A40 | #FFFFFF / #F5F7FB |
| `--accent` (acciones y navegación) | #B8FF3B | #B8FF3B (texto oscuro encima) |
| `--accent-text` (enlaces) | #B8FF3B | #3F6212 |
| `--accent2` | #38E1C6 | #0F766E |
| `--text` / `--text2` / `--muted` | #F8FAFC / #A8B3C7 / #8391A8 | #0B1020 / #3E4A5E / #5B677B |
| `--warning` / `--danger` / `--info` | #F59E0B / #EF4444 / #38BDF8 | #B45309 / #DC2626 / #0369A1 |

Tipografía: Inter o fuente del sistema. Display 42–52 px, títulos 26 px, subtítulos 19 px, texto 15 px, etiquetas 12,5 px. Radios: tarjetas 20 px, botones 15 px, chips redondos. Transiciones de 200 ms, desactivadas con `prefers-reduced-motion`.

**Regla de color clínico:** el lima nunca indica que una glicemia esté bien. Glicemia baja: rojo con ícono y texto. Alta: ámbar con ícono y texto. Entre 70 y 180: neutro con texto.

**Componentes reutilizables:** `.card` (`.hero`, `.elev`), `.btn` (`-primary`, `-secondary`, `-ghost`, `-danger`), `.chip`, `.seg` (Sí/No y selectores), `.inp` (input con unidad), `.note` (`warn`, `danger`, `info`), `.pill` (estado de glicemia), `.li` (filas de lista), `.sheet` (bottom sheet), `confirmModal()` (confirmación destructiva), `toast()`, `.sk` (skeleton), `.nav` (barra inferior flotante con áreas seguras). Íconos Lucide como `<symbol>` en línea.

## 2b. Voz y tono (UX writing)

La app le habla a Diego como un compañero: cercana, alegre y breve, en español de Chile sin modismos forzados.

| Situación | Tono | Ejemplos |
|---|---|---|
| Bienvenida | Entusiasta, con saludo según la hora del teléfono (5–12 h, 12–20 h, 20–5 h) | "¡Buenas tardes, Diego!", "¡Vamos, Diego! ⚡ ¿Qué comeremos al almuerzo?" |
| Elegir alimentos | Invitación | "¿Qué se te antoja?", "¡Vamos a elegir!", "¿Un poquito más o menos?" |
| Terminar una tarea | Motivador, solo por organizar o registrar | "¡Listo, Diego! Ya tenemos la cuenta.", "¡Receta guardada! 🍳", "¡Bien organizado!" |
| Advertencias, hipoglucemia, errores e insulina | Directo, sobrio y preciso. Sin emojis ni exclamaciones | "Hipoglucemia: no inyectar", "Paso 4: falta el peso final real." |

Reglas: emojis con moderación (saludos y mensajes positivos); nunca felicitar por valores de glucosa, carbohidratos ni dosis; no infantilizar ni presionar. Una prueba automática revisa que la pantalla Pauta no tenga celebraciones.

## 3. Pantallas

1. **Inicio / Mi comida (v7):** encabezado compacto con futbolista, barra "Próxima" con cuenta regresiva, selector de 5 comidas sin recortes, total del plato con referencia de pauta y diferencia neutral, filas compactas (nombre en 2 líneas), menú ⋯ (guardar, favoritas, pauta, vaciar con confirmación) y "Guardar esta comida". Cabe sin scroll; la lista se desliza por dentro. Versión anterior:  comida del día, "Tu plato de hoy" con total en g HC (animado, sin barras de progreso), lista con editar y eliminar, guardar favorito, consultar pauta, vista previa de favoritas.
2. **Alimentos:** buscador fijo, filtros (Recientes, Favoritos ★, Mis alimentos, Recetas, categorías), etiqueta crudo/cocido y fuente en cada fila. El bottom sheet permite elegir unidades o gramos cuando existe peso por unidad.
3. **Recetas:** constructor en 8 pasos (nombre, ingredientes, cantidades, peso final real, total, por 100 g, porción, guardar). Se pueden editar, duplicar y usar.
4. **Favoritas:** tarjetas con alimentos, cantidades y g HC. "Usar" deja ajustar las cantidades antes de cargar. Nunca guardan glicemia ni dosis.
5. **Mi pauta:** carbohidratos y glicemia arriba; justo debajo, la dosis de la fórmula en grande y con 2 decimales (el redondeo lo hace el usuario según su equipo). Luego las verificaciones (bolo reciente, síntomas, ejercicio). Bajo 70 aparece "No inyectar". Las notas del equipo en Perfil son opcionales y no bloquean nada (decisión de la familia, v5).
6. **Horarios y alarmas:** contador en Inicio hasta la próxima comida o la Tresiba (07:00, 10:00, 13:00, 16:00, 19:00, Tresiba 20:00, 22:00; editable). Aviso dentro de la app a la hora y archivo .ics para crear alarmas diarias en el Calendario del iPhone (10 min antes y a la hora).
7. **Perfil:** tema oscuro o claro, unidades, mis alimentos, historial, respaldo (exportar e importar con validación), notas del equipo (opcionales) y parámetros médicos protegidos por confirmación.

## 4. Implementación en GitHub Pages

1. Descomprime el zip en una carpeta nueva y vacía.
2. En el repositorio: **Add file → Upload files**. Arrastra todo: `index.html`, `app.js`, `calc.js`, `store.js`, `sw.js`, `manifest.json`, `icon-*.png`, `README.md` y la carpeta `tests`.
3. Haz clic en **Commit changes**. La URL no cambia.
4. En el iPhone, cierra la app y ábrela con internet. Si el ícono antiguo sigue en la pantalla de inicio, bórralo y vuelve a agregarlo desde Safari para ver el nuevo ícono "d.".

## 5. Pruebas

- **Unitarias:** `node tests/tests.js`, o abrir `/tests/` en el navegador (50 pruebas). Cubren la fórmula sin cambios, carbohidratos, unidades, recetas, reglas clínicas, persistencia, migración y respaldo.
- **Checklist manual en iPhone:**
  - [ ] Agregar alimento por gramos y por unidades; editar y eliminar; el total cambia.
  - [ ] Crear alimento con etiqueta; aparece en Mis alimentos con su fuente.
  - [ ] Crear receta con peso final real; agregar una porción al plato; editar y duplicar.
  - [ ] Guardar favorita, ajustar cantidades y cargarla.
  - [ ] Pauta: con 214 mg/dL y 72 g aparece 8,08 U arriba; bajo 70 aparece "No inyectar".
  - [ ] Perfil: cambiar tema; exportar e importar respaldo; los parámetros piden confirmación.
  - [ ] Cerrar y abrir la app: el plato, las recetas y el historial siguen ahí.
  - [ ] Modo avión: la app abre y calcula.
  - [ ] VoiceOver lee botones y campos con su nombre.

Que las pruebas técnicas pasen **no** valida la seguridad clínica.

## 6. Funcionalidades conservadas

Calculadora con la misma fórmula y avisos (bolo menor a 3 h, bajo objetivo, ejercicio, cetonas sobre 250, resultado sobre 15 U, síntomas); hipoglucemia sin dosis; base de alimentos completa; alimentos propios (v1 y v2 migrados); recetas; favoritas; plato por comida; historial con fecha, hora y unidades aplicadas; copiar historial; parámetros editables (ahora protegidos) con restauración a la epicrisis; ficha de la pauta; recuadro de emergencia; modo claro y oscuro; uso sin conexión; instalación como app.

## 7. Aspectos médicos pendientes de validación con el equipo

1. Redondeo de la dosis (0,5 U o 1 U).
2. Insulina activa: tiempo antes de corregir de nuevo.
3. Glicemia bajo el objetivo: si se resta la corrección.
4. Si la colación de 20 g lleva insulina.
5. Dosis máxima por bolo y situaciones excepcionales (enfermedad, cetonas).
6. Ajustes por ejercicio (fútbol y gimnasio), incluida la hipoglucemia nocturna.
7. Cuándo confirmar con glucómetro capilar antes de calcular.
8. Protocolo escrito de hipoglucemia y receta de glucagón (hoy se muestra la regla general ISPAD/ADA).
9. Diferencia entre el total diario indicado (280 g) y la suma de las comidas (270 g).

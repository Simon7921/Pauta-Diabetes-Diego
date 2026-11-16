# Diego Soft Pastel 3D — Rediseño real V4

Esta versión cambia **la estructura visual** de Inicio, Alimentos, Recetas y Pauta, no solo su paleta. Se preparó para el repositorio de pruebas `Diego-Midnight`, no para reemplazar sin pruebas la aplicación principal.

## Cambios visuales
- Inicio: hero deportivo ilustrado con rostro, logotipo, saludo y cuenta regresiva fuera del hero; selector 3D, tarjeta de comida grande, plato compacto.
- Alimentos: encabezado editorial ilustrado, búsqueda, categorías en cápsulas y alimentos como tarjetas individuales.
- Recetas: cabecera ilustrada y recetario de tarjetas.
- Pauta: cabecera informativa y formularios de alto contraste (la presentación de dosis no implica validación clínica).
- Barra de navegación flotante y superficies pastel, menta y crema.

## Conservación de funciones
`app.js`, `calc.js` y `store.js` no se modificaron. Se preservaron los IDs y listeners usados por la app. No se han validado clínicamente los cálculos de insulina.

## Publicar
1. Descarga y guarda respaldo de la app actual.
2. Descomprime y sube los archivos **a la raíz** del repositorio de PRUEBAS `Diego-Midnight`.
3. Confirma Pages main /(root). Abre la página en una pestaña de incógnito para evitar caché.
4. Prueba navegación, recetas, alimentos, favoritos, historial y ajustes, y verifica con datos de prueba que la app funciona.

**Atención:** No expongas datos médicos personales en un repositorio público. Esta versión mantiene el código previo de cálculo y no debe considerarse clínicamente validada.

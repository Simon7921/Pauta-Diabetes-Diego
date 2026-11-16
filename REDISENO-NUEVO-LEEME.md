# Diego — Sage & Peach 3D (nuevo dashboard)

Versión de prueba separada de la app principal.

## Cambio real de estructura
- Escritorio: navegación lateral salvia, encabezado durazno con futbolista, 4 tarjetas de acceso/resumen, panel del plato y gráfico informativo de HC por alimento.
- Móvil: módulos reordenados verticalmente, navegación inferior; contenido fluido sin zoom.
- Alimentos: tarjetas en grid en escritorio, búsqueda y filtros originales.
- Recetas: recetario visual con creación y edición originales.
- Pauta: secciones visuales de alta legibilidad; no se cambiaron las fórmulas.

## Sin tocar lógica médica
`app.js`, `calc.js` y `store.js` son originales del ZIP V5 y se conservan sin cambios. `sage-dashboard.js` solo refleja información visible de la lista y enlaces. Los cálculos clínicos no están validados.

## Cómo probar
Sube el contenido (no la carpeta ZIP) a un repositorio GitHub Pages de pruebas. También se puede probar con un servidor local: `python -m http.server 8000`, abrir `http://localhost:8000`.

## Seguridad
No publiques datos médicos identificables. Haz respaldos antes de importar información. No uses resultados de insulina para decidir dosis sin pauta validada y revisión del equipo tratante.

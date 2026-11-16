# Diego Sage & Peach V15 — IA real para etiquetas y platos

La V15 permite **seleccionar una foto, enviarla a un Cloudflare Worker y recibir interpretación real de un modelo OpenAI con visión**. **La conexión solo funcionará cuando implementes el Worker con tus claves**. La versión de prueba local puede abrir la cámara y mostrar la interfaz, pero **no puede conectarse al Worker mientras no esté publicado/configurado**.

## Antes de empezar

- Mantén las apps originales y V14 intactas. Usa **solo** el repositorio de prueba `Simon7921/Nueva-APP` si deseas subir V15.
- Necesitas una cuenta OpenAI API con facturación habilitada y clave de API privada. La suscripción a ChatGPT no implica créditos de API.
- Necesitas una cuenta Cloudflare para desplegar un **Worker**; revisa sus límites y precios antes de habilitar uso frecuente.
- Si el sitio de pruebas está en `https://simon7921.github.io/Nueva-APP/`, el Worker ya está configurado para autorizar ese origen. La autorización de origen sola no protege contra abuso; configura un código de acceso fuerte y límites de uso/rate limiting para producción.
- Las fotografías se procesan fuera del teléfono mediante el servicio de visión. La V15 no guarda automáticamente las imágenes en una base de datos; la API puede aplicar sus políticas propias de procesamiento y retención. Evita rostros, nombres y datos sensibles en las fotos.

## 1. Crear una clave de OpenAI API

En `https://platform.openai.com/api-keys` crea una clave de proyecto con permisos para Responses API y habilita la facturación API. **No compartas ni pegues la clave en la app de GitHub, en el HTML ni en este chat**.

## 2. Publicar un Cloudflare Worker

Puedes usar el panel de Cloudflare para un nuevo Worker o Wrangler desde tu computador.

1. Crea el Worker desde el código incluido en `worker.js`.
2. Si usas terminal, dentro de esta carpeta ejecuta `npx wrangler login` y `npx wrangler deploy` (necesitas Node.js).
3. Configura sus secretos por terminal:
   - `npx wrangler secret put OPENAI_API_KEY` y pega tu clave **solo** en el prompt de la terminal local.
   - `npx wrangler secret put APP_ACCESS_CODE` y usa una contraseña aleatoria larga y exclusiva para esta aplicación (distinta de la API key).
4. Publica nuevamente si corresponde y copia la URL `https://diego-vision-ia.<tu-subdominio>.workers.dev`. Para verificar salud del servicio, recuerda que `/analyze` acepta POST con imagen y código; abrirlo desde una pestaña directamente no ejecuta un análisis.

**Protecciones recomendadas antes de compartir públicamente**: rate limiting del Worker, límites de gasto API, supervisión de uso y un sistema de autenticación de usuarios. El código de acceso es una barrera básica para un entorno familiar, no un sistema completo de autenticación.

## 3. Publicar únicamente la app de prueba

Sube los archivos de la V15, **excepto** `worker.js`, `wrangler.toml` y este README de configuración, al repositorio GitHub Pages de prueba `Nueva-APP`. Si subes los otros dos archivos por error, **no contienen secretos**, pero es preferible mantener el servicio por separado. Verifica `Settings → Pages → main / (root)`.

## 4. Activar IA desde la app

1. Abre `https://simon7921.github.io/Nueva-APP/` después de publicar V15.
2. Entra a **Alimentos** → **📷 Agregar con una foto** → **⚙️ Configurar IA**.
3. Pega URL del Worker (sin `/analyze`) y el `APP_ACCESS_CODE` (no la clave de OpenAI).
4. Guarda conexión. La URL queda guardada en el navegador; el código únicamente durante la sesión de la pestaña.
5. Toma foto de etiqueta → **✨ Analizar foto con IA** → **Copiar datos al formulario** → revisa *HC por porción*, *HC por 100 g/ml* y *peso de porción* antes de guardar.
6. Para plato → **✨ Analizar foto con IA** → lee estimación visual y advertencias → usa **Elegir ingredientes con cantidades verificadas** para agregar alimentos por porciones reales.

## Por qué el plato NO se agrega automáticamente al cálculo de insulina

El modelo puede no identificar cantidades, aceites, azúcar o ingredientes ocultos y no puede pesar la comida desde una sola foto. Presentamos la estimación como **referencial** sin enviarla a la lógica médica de dosis. Los cálculos clínicos originales siguen sin alterarse y deben seguir las indicaciones del equipo médico.

## Diagnóstico rápido

- «Primero configura» → debes ingresar Worker y código.
- «Código de acceso incorrecto» → verifica APP_ACCESS_CODE, no OPENAI_API_KEY.
- Error HTTP / red → verifica URL HTTPS, despliegue, origen, permisos CORS y cuenta API.
- Un resultado con `null` indica dato no legible; no inventes para completarlo.

## Archivos

- `ai-photos.js`: interfaz, selección/reducción de imagen, llamada al Worker, resultados y revisión.
- `worker.js`: recibe imagen, valida origen/código, llama Responses API, usa salida JSON estructurada; `store:false`.
- `wrangler.toml`: variables **públicas** del Worker (ningún secreto).
- `calc.js` y lógica de dosis clínica: **no modificados por V15**.

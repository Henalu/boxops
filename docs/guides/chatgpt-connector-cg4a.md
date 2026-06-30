# Guia CG.4A - Conector ChatGPT MCP Interno

Estado: referencia historica del packaging MCP interno. La conexion OAuth real vive en `docs/guides/chatgpt-connector-cg4b.md`.

## Que Existe

- Endpoint: `/api/chatgpt/mcp`
- Transporte: JSON-RPC compatible con el corte MCP interno.
- Metodos: `initialize`, `ping`, `tools/list`, `tools/call`.
- Herramientas: las mismas de `chatGptConnectorTools`.
- Auth CG.4A: sesion BoxOps existente por cookie server-side.
- Auth CG.4B: Bearer OAuth scoped del conector.

## Que No Existe Todavia

- GPT Action.
- UI embebida.
- Acceso directo a Supabase.
- Storage, documentos, fichaje, payroll, firmas, ubicacion o RRHH sensible.

## Prueba Rapida

Con la app levantada, una llamada publica de discovery debe devolver estado y herramientas:

```bash
curl -i http://127.0.0.1:3000/api/chatgpt/mcp
```

Inicializacion MCP basica:

```bash
curl -i http://127.0.0.1:3000/api/chatgpt/mcp \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}"
```

`tools/list` sin sesion debe fallar con `authentication_required`:

```bash
curl -i http://127.0.0.1:3000/api/chatgpt/mcp \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}"
```

Para probar `tools/list` o `tools/call` con datos reales desde ChatGPT, usar la guia CG.4B.

## Demo Segura

Prompts candidatos cuando CG.4B este conectado:

- "Que centros tengo activos?"
- "Que clases hay el martes 7 de julio en el centro norte?"
- "Quien da la clase del martes 7 de julio a las 11:15?"
- "Prepara una plantilla semanal de lunes a viernes, de 9 a 12, con slots de 60 minutos, para este centro."
- "Prepara la aplicacion de esta plantilla del 1 al 31 de julio."

Regla: cualquier aplicacion real de plantilla debe pasar por `prepare_schedule_template_application`, mostrar resumen humano y despues llamar `apply_schedule_template` con `confirmation_token` valido.

## Siguiente Corte

CG.4C debe ejecutar prueba controlada en ChatGPT/dev mode o documentar bloqueo verificable con entorno/URL/configuracion.

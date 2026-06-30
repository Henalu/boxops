# Guia CG.4B - Account Linking ChatGPT MCP

Estado: implementacion tecnica local. Pendiente prueba real en ChatGPT/dev mode con URL publica HTTPS.

## Que Existe

- MCP: `/api/chatgpt/mcp`
- Protected resource metadata: `/.well-known/oauth-protected-resource`
- Authorization server metadata: `/.well-known/oauth-authorization-server`
- OAuth:
  - `GET /api/chatgpt/oauth/authorize`
  - `POST /api/chatgpt/oauth/token`
  - `POST /api/chatgpt/oauth/revoke`
- Bearer scoped en MCP:
  - `boxops.schedule.read`
  - `boxops.templates.write`
  - `boxops.templates.apply`

Decision: OAuth 2.1 authorization code + PKCE. El token scoped del conector es el access token opaco emitido por BoxOps dentro de ese flujo.

## Seguridad

- El access token crudo solo se devuelve a ChatGPT en `/token`.
- BoxOps guarda `token_hash`, nunca el token crudo.
- Los authorization codes tambien se guardan por hash y son de un solo uso.
- Los tokens expiran como maximo a los 45 minutos.
- La revocacion marca el token como `revoked`.
- Cada llamada MCP revalida token, recurso, scopes, usuario, organizacion, membership activa, rol operativo y permisos de la herramienta.
- El transporte MCP no lee ni muta datos operativos directamente; llama `chatGptConnectorTools`.

Variable necesaria:

```bash
CHATGPT_CONNECTOR_CREDENTIAL_SECRET="valor-aleatorio-largo-de-32+-caracteres"
```

Sin esa variable, el authorize falla de forma controlada porque no puede cifrar la credencial interna corta usada para respetar RLS.

## Prueba Local Controlada

Metadata:

```bash
curl -i http://127.0.0.1:3000/.well-known/oauth-protected-resource
curl -i http://127.0.0.1:3000/.well-known/oauth-authorization-server
curl -i http://127.0.0.1:3000/api/chatgpt/mcp
```

Sin auth, `tools/list` debe fallar:

```bash
curl -i http://127.0.0.1:3000/api/chatgpt/mcp \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}"
```

Resultado esperado: `401`, `authentication_required` y `WWW-Authenticate` con `resource_metadata`.

## Prueba ChatGPT/dev Mode

Bloqueo actual desde este entorno: no hay evidencia real porque hace falta una URL publica HTTPS accesible por ChatGPT y configurar el conector en ChatGPT/dev mode.

Checklist exacto:

1. Desplegar BoxOps en entorno QA HTTPS.
2. Configurar `NEXT_PUBLIC_SITE_URL` con la URL QA.
3. Configurar `CHATGPT_CONNECTOR_CREDENTIAL_SECRET` server-side.
4. Si ChatGPT usa un redirect origin distinto, anadirlo a `CHATGPT_CONNECTOR_ALLOWED_REDIRECT_ORIGINS`.
5. Registrar/conectar el MCP en ChatGPT/dev mode apuntando a `/api/chatgpt/mcp`.
6. Verificar que ChatGPT descubre `/.well-known/oauth-protected-resource`.
7. Completar account linking con un usuario QA real y una organizacion activa.
8. Probar:
   - `initialize`
   - `tools/list`
   - `list_centers`
   - `get_schedule_for_day`
   - `preview_schedule_template`
   - `create_schedule_template_draft`
   - `prepare_schedule_template_application`
   - `apply_schedule_template` solo con `confirmation_token` valido
9. Revocar desde `/api/chatgpt/oauth/revoke` y comprobar que el Bearer anterior devuelve `invalid_token`.
10. Guardar evidencia redacted de requests/responses y errores esperados.

No marcar `CG.4` completo hasta cerrar esa prueba o documentar bloqueo real con fecha, URL/entorno y motivo.

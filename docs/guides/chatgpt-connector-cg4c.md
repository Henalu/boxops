# Guia CG.4C - Refresh Tokens ChatGPT MCP

Estado: implementacion tecnica con migracion Cloud aplicada. Requiere deploy de la app y reconexion del conector en ChatGPT para que el cliente reciba `refresh_token`.

## Que Cambia

- `POST /api/chatgpt/oauth/token` soporta:
  - `grant_type=authorization_code`
  - `grant_type=refresh_token`
- El authorization code emite:
  - access token opaco, TTL maximo 45 minutos;
  - refresh token opaco, TTL maximo 30 dias.
- El refresh token rota en cada uso:
  - el refresh anterior pasa a `rotated`;
  - los access tokens asociados se revocan;
  - se emiten access token y refresh token nuevos.
- `POST /api/chatgpt/oauth/revoke` acepta access token o refresh token y revoca la cadena asociada cuando corresponde.

## Seguridad

- BoxOps no guarda tokens crudos del conector.
- Access y refresh tokens se guardan solo como hash.
- La credencial renovable de Supabase se guarda cifrada con `CHATGPT_CONNECTOR_CREDENTIAL_SECRET`.
- Cada refresh revalida:
  - token activo/no revocado/no rotado/no expirado;
  - `client_id`;
  - `resource`;
  - usuario;
  - organizacion;
  - membership activa;
  - rol operativo permitido;
  - organizacion activa.
- El transporte MCP sigue sin leer ni mutar datos operativos directamente.

## Prueba Controlada

Despues de desplegar CG.4C:

1. Desconectar `BoxOps QA` en ChatGPT.
2. Conectarlo de nuevo con la misma URL:

```text
https://boxops-pi.vercel.app/api/chatgpt/mcp
```

3. Confirmar que `POST /api/chatgpt/oauth/token` responde 200.
4. Confirmar en Supabase que existe un refresh token activo para el usuario QA.
5. Probar lectura:

```text
Usa BoxOps QA y lista mis centros.
```

6. Esperar a que el access token expire o forzar una llamada posterior si ChatGPT refresca automaticamente.
7. Confirmar en logs que aparece otro `POST /api/chatgpt/oauth/token` con exito y que la tabla refleja un refresh `rotated` y otro `active`.

## Bloqueos Esperables

- Una conexion creada antes de CG.4C no tiene refresh token. Hay que desconectar/reconectar.
- Si ChatGPT no usa refresh aunque el token endpoint lo ofrezca, BoxOps respondera `401 invalid_token` al expirar el access token y ChatGPT pedira reconexion. Eso debe registrarse como bloqueo del cliente, no como fallo de seguridad de BoxOps.

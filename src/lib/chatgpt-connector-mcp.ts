import { getAuthenticatedUser } from "@/lib/auth/tenant";
import {
  getBearerTokenFromAuthorizationHeader,
  getChatGptConnectorProtectedResourceMetadata,
  getChatGptConnectorResourceIdentifier,
  getChatGptConnectorToolRequiredScopes,
  runWithChatGptConnectorBearerContext,
  validateChatGptConnectorBearerToken,
  type ChatGptConnectorOAuthScope,
} from "@/lib/chatgpt-connector-auth";
import {
  chatGptConnectorTools,
  type ApplyScheduleTemplateInput,
  type CreateScheduleTemplateDraftInput,
  type GetMyScheduleInput,
  type GetScheduleAtTimeInput,
  type GetScheduleForDayInput,
  type ListCentersInput,
  type ListClassTypesInput,
  type PrepareScheduleTemplateApplicationInput,
  type PreviewScheduleTemplateInput,
} from "@/lib/chatgpt-connector-tools";
import type { ChatGptConnectorToolResponse } from "@/lib/chatgpt-connector-core";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const MCP_SERVER_NAME = "boxops-chatgpt-connector";
const MCP_SERVER_VERSION = "0.4.1";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

function getAuthHeaders(input: {
  error?: "insufficient_scope" | "invalid_token";
  origin: string;
  scope?: string | null;
}) {
  const params = [
    'realm="BoxOps ChatGPT connector"',
    `resource_metadata="${new URL(
      "/.well-known/oauth-protected-resource",
      input.origin,
    ).toString()}"`,
    ...(input.error ? [`error="${input.error}"`] : []),
    ...(input.scope ? [`scope="${input.scope}"`] : []),
  ];

  return {
    ...NO_STORE_HEADERS,
    "WWW-Authenticate": `Bearer ${params.join(", ")}`,
  } as const;
}

type JsonRpcId = number | string | null;

type JsonRpcRequest = {
  id?: unknown;
  jsonrpc?: unknown;
  method?: unknown;
  params?: unknown;
};

type JsonRpcError = {
  code: number;
  data?: unknown;
  message: string;
};

type JsonRpcResponse = {
  error?: JsonRpcError;
  id: JsonRpcId;
  jsonrpc: "2.0";
  result?: unknown;
};

type JsonSchema = {
  additionalProperties?: boolean;
  description?: string;
  enum?: string[];
  format?: string;
  items?: JsonSchema;
  maxItems?: number;
  minItems?: number;
  maximum?: number;
  minimum?: number;
  pattern?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  title?: string;
  type: "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";
};

type ChatGptConnectorMcpToolName = keyof typeof chatGptConnectorTools;

type ChatGptConnectorMcpToolDefinition = {
  _meta: {
    securitySchemes: OAuth2SecurityScheme[];
  };
  annotations: {
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
    readOnlyHint: boolean;
  };
  description: string;
  inputSchema: JsonSchema;
  name: ChatGptConnectorMcpToolName;
  securitySchemes: OAuth2SecurityScheme[];
  title: string;
};

type ConnectorToolHandler = (
  input: Record<string, unknown>,
) => Promise<ChatGptConnectorToolResponse<unknown>>;

type OAuth2SecurityScheme = {
  scopes: ChatGptConnectorOAuthScope[];
  type: "oauth2";
};

const DATE_SCHEMA: JsonSchema = {
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  type: "string",
};

const TIME_SCHEMA: JsonSchema = {
  pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
  type: "string",
};

const UUID_SCHEMA: JsonSchema = {
  format: "uuid",
  type: "string",
};

const NULLABLE_STRING_SCHEMA: JsonSchema = {
  type: "string",
};

const COMMON_GUARD_PROPERTIES: Record<string, JsonSchema> = {
  organization_id: UUID_SCHEMA,
  requested_scope: NULLABLE_STRING_SCHEMA,
};

const CENTER_REFERENCE_PROPERTIES: Record<string, JsonSchema> = {
  center_id: UUID_SCHEMA,
  center_name: NULLABLE_STRING_SCHEMA,
};

const CLASS_TYPE_REFERENCE_PROPERTIES: Record<string, JsonSchema> = {
  class_type_id: UUID_SCHEMA,
  class_type_name: NULLABLE_STRING_SCHEMA,
};

const TEMPLATE_RULE_SCHEMA: JsonSchema = {
  additionalProperties: false,
  properties: {
    class_type_id: UUID_SCHEMA,
    coach_ids: {
      items: UUID_SCHEMA,
      type: "array",
    },
    ends_at: TIME_SCHEMA,
    slot_duration_minutes: {
      minimum: 1,
      type: "integer",
    },
    starts_at: TIME_SCHEMA,
    weekdays: {
      items: {
        enum: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
        type: "string",
      },
      minItems: 1,
      type: "array",
    },
  },
  required: [
    "class_type_id",
    "ends_at",
    "slot_duration_minutes",
    "starts_at",
    "weekdays",
  ],
  type: "object",
};

function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): JsonSchema {
  return {
    additionalProperties: false,
    properties: {
      ...COMMON_GUARD_PROPERTIES,
      ...properties,
    },
    required,
    type: "object",
  };
}

function toolDefinition(input: {
  description: string;
  inputSchema: JsonSchema;
  name: ChatGptConnectorMcpToolName;
  readOnlyHint: boolean;
  title: string;
}): ChatGptConnectorMcpToolDefinition {
  const securitySchemes = [
    {
      scopes: getChatGptConnectorToolRequiredScopes(input.name),
      type: "oauth2",
    } satisfies OAuth2SecurityScheme,
  ];

  return {
    _meta: {
      securitySchemes,
    },
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: input.readOnlyHint,
    },
    description: input.description,
    inputSchema: input.inputSchema,
    name: input.name,
    securitySchemes,
    title: input.title,
  };
}

export const chatGptConnectorMcpTools: ChatGptConnectorMcpToolDefinition[] = [
  toolDefinition({
    description: "List active BoxOps centers visible to the connected user.",
    inputSchema: objectSchema({
      include_inactive: { type: "boolean" },
    } satisfies Partial<Record<keyof ListCentersInput, JsonSchema>>),
    name: "list_centers",
    readOnlyHint: true,
    title: "List centers",
  }),
  toolDefinition({
    description: "List operational class or activity types for the active tenant.",
    inputSchema: objectSchema({
      ...CENTER_REFERENCE_PROPERTIES,
      include_inactive: { type: "boolean" },
    } satisfies Partial<Record<keyof ListClassTypesInput, JsonSchema>>),
    name: "list_class_types",
    readOnlyHint: true,
    title: "List class types",
  }),
  toolDefinition({
    description: "Get BoxOps schedule blocks for a concrete date.",
    inputSchema: objectSchema(
      {
        ...CENTER_REFERENCE_PROPERTIES,
        ...CLASS_TYPE_REFERENCE_PROPERTIES,
        date: DATE_SCHEMA,
        status: {
          enum: ["active", "all", "cancelled", "draft"],
          type: "string",
        },
      } satisfies Partial<Record<keyof GetScheduleForDayInput, JsonSchema>>,
      ["date"],
    ),
    name: "get_schedule_for_day",
    readOnlyHint: true,
    title: "Get schedule for day",
  }),
  toolDefinition({
    description: "Find schedule blocks overlapping or starting at a concrete time.",
    inputSchema: objectSchema(
      {
        ...CENTER_REFERENCE_PROPERTIES,
        ...CLASS_TYPE_REFERENCE_PROPERTIES,
        date: DATE_SCHEMA,
        empty_result_mode: {
          enum: ["empty", "error"],
          type: "string",
        },
        match_mode: {
          enum: ["overlapping", "starting_at"],
          type: "string",
        },
        time: TIME_SCHEMA,
      } satisfies Partial<Record<keyof GetScheduleAtTimeInput, JsonSchema>>,
      ["date", "time"],
    ),
    name: "get_schedule_at_time",
    readOnlyHint: true,
    title: "Get schedule at time",
  }),
  toolDefinition({
    description: "Get the connected user's own coach schedule.",
    inputSchema: objectSchema(
      {
        ...CENTER_REFERENCE_PROPERTIES,
        date_from: DATE_SCHEMA,
        date_to: DATE_SCHEMA,
      } satisfies Partial<Record<keyof GetMyScheduleInput, JsonSchema>>,
      ["date_from", "date_to"],
    ),
    name: "get_my_schedule",
    readOnlyHint: true,
    title: "Get my schedule",
  }),
  toolDefinition({
    description: "Preview a weekly schedule template without persisting it.",
    inputSchema: objectSchema(
      {
        center_id: UUID_SCHEMA,
        date_from: DATE_SCHEMA,
        date_to: DATE_SCHEMA,
        name: { type: "string" },
        rules: {
          items: TEMPLATE_RULE_SCHEMA,
          maxItems: 100,
          type: "array",
        },
      } satisfies Partial<Record<keyof PreviewScheduleTemplateInput, JsonSchema>>,
      ["center_id", "date_from", "date_to", "name", "rules"],
    ),
    name: "preview_schedule_template",
    readOnlyHint: true,
    title: "Preview schedule template",
  }),
  toolDefinition({
    description: "Create a weekly schedule template draft from a confirmed preview.",
    inputSchema: objectSchema(
      {
        center_id: UUID_SCHEMA,
        date_from: DATE_SCHEMA,
        date_to: DATE_SCHEMA,
        idempotency_key: { type: "string" },
        name: { type: "string" },
        preview_id: { type: "string" },
        rules: {
          items: TEMPLATE_RULE_SCHEMA,
          maxItems: 100,
          type: "array",
        },
      } satisfies Partial<Record<keyof CreateScheduleTemplateDraftInput, JsonSchema>>,
      [
        "center_id",
        "date_from",
        "date_to",
        "idempotency_key",
        "name",
        "preview_id",
        "rules",
      ],
    ),
    name: "create_schedule_template_draft",
    readOnlyHint: false,
    title: "Create schedule template draft",
  }),
  toolDefinition({
    description: "Prepare a confirmed application plan for a weekly template.",
    inputSchema: objectSchema(
      {
        center_id: UUID_SCHEMA,
        date_from: DATE_SCHEMA,
        date_to: DATE_SCHEMA,
        idempotency_key: { type: "string" },
        template_id: UUID_SCHEMA,
      } satisfies Partial<Record<
        keyof PrepareScheduleTemplateApplicationInput,
        JsonSchema
      >>,
      ["center_id", "date_from", "date_to", "idempotency_key", "template_id"],
    ),
    name: "prepare_schedule_template_application",
    readOnlyHint: false,
    title: "Prepare schedule template application",
  }),
  toolDefinition({
    description: "Apply a prepared weekly template only with a valid confirmation token.",
    inputSchema: objectSchema(
      {
        center_id: UUID_SCHEMA,
        confirmation_token: { type: "string" },
        date_from: DATE_SCHEMA,
        date_to: DATE_SCHEMA,
        idempotency_key: { type: "string" },
        template_id: UUID_SCHEMA,
      } satisfies Partial<Record<keyof ApplyScheduleTemplateInput, JsonSchema>>,
      [
        "center_id",
        "confirmation_token",
        "date_from",
        "date_to",
        "idempotency_key",
        "template_id",
      ],
    ),
    name: "apply_schedule_template",
    readOnlyHint: false,
    title: "Apply schedule template",
  }),
];

const chatGptConnectorMcpToolHandlers =
  chatGptConnectorTools as unknown as Record<string, ConnectorToolHandler>;

export function getChatGptConnectorMcpDiscovery(origin: string) {
  const resourceMetadata = getChatGptConnectorProtectedResourceMetadata(origin);

  return {
    authentication: {
      authorization_server:
        resourceMetadata.authorization_servers[0] ?? origin,
      oauth_account_linking: "oauth2_authorization_code_pkce",
      protected_resource_metadata: new URL(
        "/.well-known/oauth-protected-resource",
        origin,
      ).toString(),
      revocation_endpoint: new URL(
        "/api/chatgpt/oauth/revoke",
        origin,
      ).toString(),
      token_type: "opaque_bearer_scoped",
    },
    mcp_endpoint: new URL("/api/chatgpt/mcp", origin).toString(),
    name: MCP_SERVER_NAME,
    protocol_version: MCP_PROTOCOL_VERSION,
    status: "CG.4B MCP packaging with OAuth account linking",
    tools: chatGptConnectorMcpTools.map((tool) => ({
      name: tool.name,
      read_only: tool.annotations.readOnlyHint,
      title: tool.title,
    })),
  };
}

function normalizeJsonRpcId(value: unknown): JsonRpcId {
  return typeof value === "number" || typeof value === "string" || value === null
    ? value
    : null;
}

function jsonRpcResponse(
  response: JsonRpcResponse,
  init?: ResponseInit,
): Response {
  return Response.json(response, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...init?.headers,
    },
  });
}

function jsonRpcError(input: {
  data?: unknown;
  id: JsonRpcId;
  code: number;
  message: string;
  status?: number;
  headers?: HeadersInit;
}) {
  return jsonRpcResponse(
    {
      error: {
        code: input.code,
        data: input.data,
        message: input.message,
      },
      id: input.id,
      jsonrpc: "2.0",
    },
    {
      headers: input.headers,
      status: input.status,
    },
  );
}

async function requireAuthenticatedMcpSession({
  id,
  request,
  requiredScopes = [],
}: {
  id: JsonRpcId;
  request: Request;
  requiredScopes?: string[];
}) {
  const origin = getChatGptConnectorResourceIdentifier(new URL(request.url).origin);
  const bearerToken = getBearerTokenFromAuthorizationHeader(
    request.headers.get("authorization"),
  );

  if (bearerToken) {
    const validation = await validateChatGptConnectorBearerToken({
      requiredScopes,
      resource: origin,
      token: bearerToken,
    });

    if (validation.ok) {
      return {
        context: validation.context,
        ok: true as const,
      };
    }

    return {
      ok: false as const,
      response: jsonRpcError({
        code: validation.status === 403 ? -32003 : -32001,
        data: {
          code:
            validation.status === 403
              ? "insufficient_scope"
              : "authentication_required",
          reason: validation.reason,
        },
        headers: getAuthHeaders({
          error:
            validation.status === 403 ? "insufficient_scope" : "invalid_token",
          origin,
          scope: validation.scope,
        }),
        id,
        message:
          validation.status === 403
            ? "Insufficient scope"
            : "Authentication required",
        status: validation.status,
      }),
    };
  }

  const user = await getAuthenticatedUser();

  if (user) {
    return {
      context: null,
      ok: true as const,
    };
  }

  return {
    ok: false as const,
    response: jsonRpcError({
      code: -32001,
      data: {
        code: "authentication_required",
        message: "Connect your BoxOps account before using this connector.",
      },
      headers: getAuthHeaders({ origin }),
      id,
      message: "Authentication required",
      status: 401,
    }),
  };
}

function normalizeToolArguments(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function createMcpToolResult(
  response: ChatGptConnectorToolResponse<unknown>,
) {
  const payload = response.ok
    ? {
        data: response.data,
        ok: true,
        request_id: response.request_id,
        warnings: response.warnings,
      }
    : {
        error: response.error,
        ok: false,
        request_id: response.request_id,
      };

  return {
    _meta: {
      request_id: response.request_id,
      source: "chatgpt_connector",
      warnings: response.ok ? response.warnings : [],
    },
    content: [
      {
        text: JSON.stringify(payload),
        type: "text",
      },
    ],
    isError: !response.ok,
    structuredContent: payload,
  };
}

async function handleToolCall(
  request: JsonRpcRequest,
  id: JsonRpcId,
  httpRequest: Request,
) {
  const params = normalizeToolArguments(request.params);
  const name = typeof params.name === "string" ? params.name : "";
  const tool = chatGptConnectorMcpTools.find((candidate) => candidate.name === name);
  const handler = chatGptConnectorMcpToolHandlers[name];

  if (!tool || !handler) {
    return jsonRpcError({
      code: -32602,
      data: { name },
      id,
      message: "Unknown BoxOps connector tool",
    });
  }

  const authorization = await requireAuthenticatedMcpSession({
    id,
    request: httpRequest,
    requiredScopes: getChatGptConnectorToolRequiredScopes(name),
  });

  const args = normalizeToolArguments(params.arguments);

  if (!authorization.ok) {
    return authorization.response;
  }

  const toolResponse = authorization.context
    ? await runWithChatGptConnectorBearerContext(authorization.context, () =>
        handler(args),
      )
    : await handler(args);

  return jsonRpcResponse({
    id,
    jsonrpc: "2.0",
    result: createMcpToolResult(toolResponse),
  });
}

async function handleToolsList(id: JsonRpcId, request: Request) {
  const authorization = await requireAuthenticatedMcpSession({
    id,
    request,
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  return jsonRpcResponse({
    id,
    jsonrpc: "2.0",
    result: {
      tools: chatGptConnectorMcpTools,
    },
  });
}

function handleInitialize(id: JsonRpcId) {
  return jsonRpcResponse({
    id,
    jsonrpc: "2.0",
    result: {
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      instructions:
        "Use BoxOps tools only for allowed operational schedule data. Do not request out-of-scope personal or legal data.",
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
      },
    },
  });
}

export async function handleChatGptConnectorMcpRequest(
  request: Request,
): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonRpcError({
      code: -32700,
      id: null,
      message: "Parse error",
    });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonRpcError({
      code: -32600,
      id: null,
      message: "Invalid Request",
    });
  }

  const jsonRpcRequest = body as JsonRpcRequest;
  const id = normalizeJsonRpcId(jsonRpcRequest.id);
  const method =
    typeof jsonRpcRequest.method === "string" ? jsonRpcRequest.method : "";

  if (!("id" in jsonRpcRequest)) {
    return new Response(null, {
      headers: NO_STORE_HEADERS,
      status: 202,
    });
  }

  switch (method) {
    case "initialize":
      return handleInitialize(id);
    case "ping":
      return jsonRpcResponse({
        id,
        jsonrpc: "2.0",
        result: {},
      });
    case "tools/list":
      return handleToolsList(id, request);
    case "tools/call":
      return handleToolCall(jsonRpcRequest, id, request);
    default:
      return jsonRpcError({
        code: -32601,
        data: { method },
        id,
        message: "Method not found",
      });
  }
}

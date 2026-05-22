type SendEmailInput = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

type SendEmailResult =
  | {
      id: string | null;
      ok: true;
    }
  | {
      code: "email-not-configured" | "email-send-failed";
      message: string;
      ok: false;
    };

type ResendEmailResponse = {
  id?: string;
};

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.BOXOPS_EMAIL_FROM?.trim();
  const replyTo = process.env.BOXOPS_EMAIL_REPLY_TO?.trim();

  if (!apiKey || !from) {
    return null;
  }

  return {
    apiKey,
    from,
    replyTo: replyTo || undefined,
  };
}

export function isEmailConfigured() {
  return Boolean(getEmailConfig());
}

export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const config = getEmailConfig();

  if (!config) {
    return {
      code: "email-not-configured",
      message: "Email provider is not configured.",
      ok: false,
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        from: config.from,
        html: input.html,
        reply_to: config.replyTo,
        subject: input.subject,
        text: input.text,
        to: input.to,
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      return {
        code: "email-send-failed",
        message: "Email provider rejected the request.",
        ok: false,
      };
    }

    const payload = (await response.json().catch(() => ({}))) as ResendEmailResponse;

    return {
      id: payload.id ?? null,
      ok: true,
    };
  } catch {
    return {
      code: "email-send-failed",
      message: "Email provider request failed.",
      ok: false,
    };
  }
}

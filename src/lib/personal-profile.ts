const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_MAX_LENGTH = 80;
const PREFERRED_ALIAS_MAX_LENGTH = 50;
const PUBLIC_EMAIL_MAX_LENGTH = 254;

export type PersonalProfileValues = {
  displayName: string;
  preferredAlias: string | null;
  publicEmail: string | null;
};

export type PersonalProfileValidationResult =
  | {
      ok: true;
      values: PersonalProfileValues;
    }
  | {
      ok: false;
      error:
        | "display-name-too-long"
        | "invalid-public-email"
        | "missing-display-name"
        | "preferred-alias-too-long"
        | "public-email-too-long";
    };

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

export function validatePersonalProfileForm(
  formData: FormData,
): PersonalProfileValidationResult {
  const displayName = getFormString(formData, "displayName");
  const preferredAlias = getFormString(formData, "preferredAlias");
  const publicEmail = getFormString(formData, "publicEmail");

  if (!displayName) {
    return {
      ok: false,
      error: "missing-display-name",
    };
  }

  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: "display-name-too-long",
    };
  }

  if (preferredAlias.length > PREFERRED_ALIAS_MAX_LENGTH) {
    return {
      ok: false,
      error: "preferred-alias-too-long",
    };
  }

  if (publicEmail.length > PUBLIC_EMAIL_MAX_LENGTH) {
    return {
      ok: false,
      error: "public-email-too-long",
    };
  }

  if (publicEmail && !EMAIL_PATTERN.test(publicEmail)) {
    return {
      ok: false,
      error: "invalid-public-email",
    };
  }

  return {
    ok: true,
    values: {
      displayName,
      preferredAlias: preferredAlias || null,
      publicEmail: publicEmail || null,
    },
  };
}

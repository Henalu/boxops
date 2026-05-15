export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_POLICY_DESCRIPTION =
  "Mínimo 8 caracteres, al menos una letra y un número.";

export const PASSWORD_PATTERN_ATTRIBUTE = `(?=.*[A-Za-z])(?=.*\\d).{${PASSWORD_MIN_LENGTH},}`;

const LETTER_PATTERN = /[A-Za-z]/;
const NUMBER_PATTERN = /\d/;

export type PasswordValidationResult =
  | {
      ok: true;
    }
  | {
      error: "password-too-short" | "password-missing-letter" | "password-missing-number";
      message: string;
      ok: false;
    };

export function validatePasswordPolicy(password: string): PasswordValidationResult {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      error: "password-too-short",
      message: "La contraseña debe tener al menos 8 caracteres.",
      ok: false,
    };
  }

  if (!LETTER_PATTERN.test(password)) {
    return {
      error: "password-missing-letter",
      message: "La contraseña debe incluir al menos una letra.",
      ok: false,
    };
  }

  if (!NUMBER_PATTERN.test(password)) {
    return {
      error: "password-missing-number",
      message: "La contraseña debe incluir al menos un número.",
      ok: false,
    };
  }

  return { ok: true };
}

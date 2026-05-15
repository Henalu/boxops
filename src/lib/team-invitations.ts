import { createHash, randomBytes } from "node:crypto";

import { getRequestOrigin } from "@/lib/auth/site-url";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITATION_TOKEN_BYTES = 32;
const INVITATION_EXPIRY_DAYS = 14;

export const TEAM_INVITATION_STATUSES = [
  "pending",
  "sent",
  "accepted",
  "cancelled",
  "expired",
  "failed",
] as const;

export const TEAM_INVITATION_INITIAL_ACCESS_STATUSES = [
  "active",
  "inactive",
  "suspended",
] as const;

export type TeamInvitationStatus = (typeof TEAM_INVITATION_STATUSES)[number];
export type TeamInvitationInitialAccessStatus =
  (typeof TEAM_INVITATION_INITIAL_ACCESS_STATUSES)[number];

export function normalizeInvitationEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidInvitationEmail(value: string) {
  const normalizedEmail = normalizeInvitationEmail(value);

  return normalizedEmail.length <= 254 && EMAIL_PATTERN.test(normalizedEmail);
}

export function generateInvitationToken() {
  return randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getInvitationExpiryDate() {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + INVITATION_EXPIRY_DAYS);

  return expiryDate;
}

export async function getInvitationAcceptUrl(invitationId: string, token: string) {
  const origin = await getRequestOrigin();
  const url = new URL("/invite/accept", origin);

  url.searchParams.set("invitationId", invitationId);
  url.searchParams.set("token", token);

  return url.toString();
}

export function getInvitationAcceptPath(invitationId: string, token: string) {
  const params = new URLSearchParams({
    invitationId,
    token,
  });

  return `/invite/accept?${params.toString()}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildTeamInvitationEmail({
  acceptUrl,
  invitedByName,
  organizationName,
  recipientName,
}: {
  acceptUrl: string;
  invitedByName: string;
  organizationName: string;
  recipientName: string;
}) {
  const safeOrganizationName = escapeHtml(organizationName);
  const safeRecipientName = escapeHtml(recipientName);
  const safeInvitedByName = escapeHtml(invitedByName);
  const safeAcceptUrl = escapeHtml(acceptUrl);
  const subject = `Invitacion a ${organizationName} en BoxOps`;
  const text = [
    `Hola ${recipientName},`,
    "",
    `${invitedByName} te ha invitado a entrar en ${organizationName} en BoxOps.`,
    "Acepta la invitacion desde este enlace:",
    acceptUrl,
    "",
    "El enlace caduca en 14 dias. Si no esperabas esta invitacion, puedes ignorar este correo.",
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <p>Hola ${safeRecipientName},</p>
      <p>${safeInvitedByName} te ha invitado a entrar en <strong>${safeOrganizationName}</strong> en BoxOps.</p>
      <p>
        <a href="${safeAcceptUrl}" style="display: inline-block; border-radius: 8px; background: #0f172a; color: #ffffff; padding: 10px 14px; text-decoration: none;">
          Aceptar invitacion
        </a>
      </p>
      <p style="color: #475569; font-size: 14px;">El enlace caduca en 14 dias. Si no esperabas esta invitacion, puedes ignorar este correo.</p>
      <p style="color: #475569; font-size: 14px;">Si el boton no funciona, abre este enlace:<br />${safeAcceptUrl}</p>
    </div>
  `;

  return {
    html,
    subject,
    text,
  };
}

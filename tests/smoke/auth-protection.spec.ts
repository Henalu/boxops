import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/app",
  "/console",
  "/app/absences",
  "/app/absences?view=review&absence_type=vacation&absence_status=pending_review",
  "/app/account",
  "/app/centers",
  "/app/coaches",
  "/app/class-types",
  "/app/documents",
  "/app/coverage?week=2026-05-04",
  "/app/coverage?week=2026-05-04&block_id=00000000-0000-0000-0000-000000100412",
  "/app/more",
  "/app/settings",
  "/app/schedule?week=2026-05-04&risks_only=1",
  "/app/schedule?week=2026-05-04&view=agenda&block_id=00000000-0000-0000-0000-000000100400",
  "/app/stats?week=2026-05-04",
  "/app/templates?week=2026-05-04",
  "/app/time",
  "/app/work-windows?week=2026-05-04",
  "/app/time/export?organizationId=00000000-0000-0000-0000-000000000000&from=2026-05-04&to=2026-05-10",
];

test("login page renders the public auth surface", async ({ request }) => {
  const response = await request.get("/login");

  expect(response.ok()).toBeTruthy();

  const html = await response.text();
  expect(html).toContain("Accede a la operativa de tu box.");
  expect(html).toContain("He olvidado mi contrase");
  expect(html).toContain("Iniciar sesión");
});

test("forgot password page renders a generic reset response", async ({ request }) => {
  const response = await request.get("/forgot-password?status=sent");

  expect(response.ok()).toBeTruthy();

  const html = await response.text();
  expect(html).toContain("Recuperar contraseña");
  expect(html).toContain(
    "Si el email corresponde a una cuenta con acceso, enviaremos instrucciones",
  );
  expect(html).not.toContain("no existe");
});

test("reset password page is public and waits for a validated link", async ({
  request,
}) => {
  const response = await request.get("/reset-password");

  expect(response.ok()).toBeTruthy();

  const html = await response.text();
  expect(html).toContain("Nueva contraseña");
  expect(html).toContain("Enlace pendiente de validar");
});

for (const route of protectedRoutes) {
  test(`anonymous users are redirected from ${route}`, async ({ request, baseURL }) => {
    const response = await request.get(route, { maxRedirects: 0 });

    expect([302, 303, 307, 308]).toContain(response.status());

    const location = response.headers().location;
    expect(location).toBeTruthy();

    const redirectUrl = new URL(location!, baseURL);
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("redirectTo")).toBe(route);
  });
}

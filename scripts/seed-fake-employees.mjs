// Da de alta N empleados falsos en una organización, sin pasar por el
// formulario uno a uno. Reutiliza exactamente el mismo camino que un alta
// real (invite_member -> signUp -> accept_member_invite) llamando a la API
// de Supabase directamente con fetch, así que si el esquema de "members"
// cambia, lo normal es que este script solo necesite tocarse si cambian los
// PARÁMETROS de esas funciones, no su lógica interna.
//
// Uso:
//   /opt/homebrew/opt/node@20/bin/node scripts/seed-fake-employees.mjs \
//     admin@empresa.com "contraseñaDelAdmin" 5
//
// (Node 20+ requerido, igual que el resto del proyecto — ver scripts/dev.sh)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const content = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

const FAKE_NAMES = [
  "Lucía Fernández",
  "Marco Torres",
  "Elena Ruiz",
  "Javier Molina",
  "Sofía Navarro",
  "Diego Herrera",
  "Carmen Ibáñez",
  "Pablo Reyes",
  "Nuria Campos",
  "Álvaro Serrano",
];

const FAKE_PASSWORD = "FakePass123!";
const FAKE_EMAIL_DOMAIN = "brujula-fake.test";

async function main() {
  const [adminEmail, adminPassword, countArg] = process.argv.slice(2);
  const count = Number(countArg) || 5;

  if (!adminEmail || !adminPassword) {
    console.error(
      "Uso: node scripts/seed-fake-employees.mjs <email-admin> <password-admin> [cantidad=5]"
    );
    process.exit(1);
  }

  const env = loadEnvLocal();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !apikey) {
    console.error("No se encontraron NEXT_PUBLIC_SUPABASE_URL / ANON_KEY en .env.local");
    process.exit(1);
  }

  async function signIn(email, password) {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || data.message || JSON.stringify(data));
    return data.access_token;
  }

  async function signUp(email, password, metadata) {
    const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, data: metadata }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || data.message || JSON.stringify(data));
    // Si "Confirm email" estuviera activo, signup no devuelve sesión todavía.
    return data.access_token || null;
  }

  async function rpc(name, token, body) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || JSON.stringify(data));
    return data;
  }

  const firstAdminToken = await signIn(adminEmail, adminPassword);
  const departmentsRes = await fetch(`${supabaseUrl}/rest/v1/departments?select=id,name&order=name`, {
    headers: { apikey, Authorization: `Bearer ${firstAdminToken}` },
  });
  const departments = await departmentsRes.json();

  if (!Array.isArray(departments) || departments.length === 0) {
    console.error("No se encontraron departamentos. Crea al menos uno desde /dashboard/members.");
    process.exit(1);
  }

  console.log(
    `Creando ${count} empleados falsos como admin ${adminEmail}, repartidos entre: ` +
      departments.map((d) => d.name).join(", ") +
      "...\n"
  );

  for (let i = 0; i < count; i++) {
    const name = FAKE_NAMES[i % FAKE_NAMES.length] + (i >= FAKE_NAMES.length ? ` ${i + 1}` : "");
    const email = `empleado${i + 1}@${FAKE_EMAIL_DOMAIN}`;
    const department = departments[i % departments.length];
    // Uno de cada tres, responsable de equipo: da cobertura de prueba a las
    // preguntas del ciclo 360 que solo aplican a responsables.
    const isManager = i % 3 === 2;

    try {
      const adminToken = await signIn(adminEmail, adminPassword);
      const inviteToken = await rpc("invite_member", adminToken, {
        p_email: email,
        p_full_name: name,
        p_department_id: department.id,
        p_is_manager: isManager,
      });

      const fakeToken = await signUp(email, FAKE_PASSWORD, {
        pending_invite_token: inviteToken,
      });

      if (!fakeToken) {
        console.error(
          `- ${name} <${email}>: cuenta creada pero requiere confirmar email (Confirm email` +
            ` activo en Supabase) — no se pudo completar el alta automáticamente.`
        );
        continue;
      }

      await rpc("accept_member_invite", fakeToken, { p_token: inviteToken });

      console.log(
        `- ${name} <${email}>: creado y activo en ${department.name}${isManager ? " (responsable)" : ""} ` +
          `(contraseña: ${FAKE_PASSWORD}).`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Ya existe un empleado")) {
        console.log(`- ${name} <${email}>: ya existía, saltando.`);
      } else {
        console.error(`- ${name} <${email}>: error — ${message}`);
      }
    }
  }

  console.log("\nListo.");
}

main();

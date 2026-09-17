// Story 1.1 (_bmad-output/implementation-artifacts/
// spec-1-1-characterization-tests-report-groups-baseline.md): helper
// reutilizable que crea UN informe de grupo (create_report_group) sobre la
// base que ya deja scripts/seed-demo-company.mjs — ese script no crea
// grupos, solo la empresa/empleados/ciclo 360. Este es su equivalente para
// "informes de grupo" (spec.md sección 17), mismo patrón que
// seed-company-360.mjs para ciclos 360: fetch directo a la API de
// Supabase, solo con la anon key, nunca service role.
//
// Pensado para dos usos, igual que el resto de scripts/:
//   1. Standalone por CLI:
//        node scripts/seed-report-group.mjs creador@empresa.com contraseña "Nombre del grupo" [miembro1@x,miembro2@x,...]
//      Si no se pasa la lista de miembros, usa TODOS los compañeros con al
//      menos un 360 cerrado que devuelva get_colleagues_with_closed_cycle
//      para el creador indicado (mismo RPC que usa la pantalla de creación).
//   2. Importado desde otro script o desde un test (p.ej.
//      tests/characterization/report-groups.test.ts), llamando
//      directamente a `seedReportGroup(...)` o `createReportGroupFor(...)`
//      sin pasar por un subproceso — así un futuro dominio de Epic 3 puede
//      reutilizar exactamente esta forma (anon-key REST, sin service role,
//      standalone o importado).
//
// Nota: igual que create_report_group exige, TODOS los miembros pasados
// deben ser compañeros activos de la misma empresa con al menos un 360 ya
// cerrado, o la llamada falla (ese es justo uno de los escenarios que
// caracteriza el test de la historia 1.1 — aquí solo se envuelve el RPC,
// sin intentar adivinar ni corregir nada).

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

async function rpc(supabaseUrl, apikey, name, token, body) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${name} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function login(supabaseUrl, apikey, email, password) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login failed for ${email}: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function restGet(supabaseUrl, apikey, pathAndQuery, token) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${pathAndQuery}`, {
    headers: { apikey, Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`GET ${pathAndQuery} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

// ============================================================
// createReportGroupFor — envoltorio directo de create_report_group, sin
// resolver nada: quien llama ya sabe el token del creador y los ids de
// los miembros. Es el bloque mínimo reutilizable para Epic 3.
// ============================================================
export async function createReportGroupFor({ supabaseUrl, apikey, creatorToken, name, memberIds }) {
  if (!supabaseUrl || !apikey) throw new Error("createReportGroupFor: falta supabaseUrl/apikey");
  if (!creatorToken) throw new Error("createReportGroupFor: falta creatorToken");
  if (!name) throw new Error("createReportGroupFor: falta name");
  if (!memberIds || memberIds.length === 0) {
    throw new Error("createReportGroupFor: memberIds vacío");
  }

  // 0099_report_groups_membership_management_and_email.sql: create_report_group
  // cambió de `returns uuid` a `returns table(...)` (una fila por
  // invitado, group_id repetido en cada una) -- PostgREST lo devuelve
  // como un array de filas, ya no un uuid suelto. Cualquier fila sirve
  // para leer group_id, todas llevan el mismo valor.
  const rows = await rpc(supabaseUrl, apikey, "create_report_group", creatorToken, {
    p_name: name,
    p_member_ids: memberIds,
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`createReportGroupFor: create_report_group no devolvió ninguna fila: ${JSON.stringify(rows)}`);
  }
  return { groupId: rows[0].group_id };
}

// ============================================================
// seedReportGroup — versión de conveniencia: inicia sesión como el
// creador y, si no se pasan memberEmails explícitos, resuelve los
// miembros elegibles vía get_colleagues_with_closed_cycle (mismo RPC que
// usa la pantalla real de creación) y usa hasta `memberCount` de ellos.
// ============================================================
export async function seedReportGroup({
  supabaseUrl,
  apikey,
  creatorEmail,
  creatorPassword,
  name,
  memberEmails,
  memberCount = undefined,
}) {
  if (!supabaseUrl || !apikey) throw new Error("seedReportGroup: falta supabaseUrl/apikey");
  if (!creatorEmail || !creatorPassword) {
    throw new Error("seedReportGroup: falta creatorEmail/creatorPassword");
  }

  const creatorToken = await login(supabaseUrl, apikey, creatorEmail, creatorPassword);

  let memberIds;
  if (memberEmails !== undefined) {
    const rows = await restGet(
      supabaseUrl,
      apikey,
      `members?select=id,email&email=in.(${memberEmails.join(",")})`,
      creatorToken
    );
    const idByEmail = Object.fromEntries(rows.map((r) => [r.email, r.id]));
    memberIds = memberEmails.map((email) => {
      const id = idByEmail[email];
      if (!id) throw new Error(`seedReportGroup: no se encontró member para ${email}`);
      return id;
    });
  } else {
    const colleagues = await rpc(
      supabaseUrl,
      apikey,
      "get_colleagues_with_closed_cycle",
      creatorToken,
      {}
    );
    memberIds = colleagues.slice(0, memberCount ?? colleagues.length).map((c) => c.id);
    if (memberIds.length === 0) {
      throw new Error(
        "seedReportGroup: el creador no tiene compañeros con un 360 cerrado (get_colleagues_with_closed_cycle vacío)"
      );
    }
  }

  const { groupId } = await createReportGroupFor({
    supabaseUrl,
    apikey,
    creatorToken,
    name,
    memberIds,
  });

  return { groupId, creatorToken, memberIds };
}

async function main() {
  const [creatorEmail, creatorPassword, name, memberEmailsArg] = process.argv.slice(2);
  if (!creatorEmail || !creatorPassword || !name) {
    console.error(
      'Uso: node scripts/seed-report-group.mjs creador@empresa.com contraseña "Nombre del grupo" [miembro1@x,miembro2@x,...]'
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

  const memberEmails = memberEmailsArg ? memberEmailsArg.split(",").map((e) => e.trim()) : undefined;

  console.log(`Creando informe de grupo "${name}" para ${creatorEmail}...`);
  const { groupId, memberIds } = await seedReportGroup({
    supabaseUrl,
    apikey,
    creatorEmail,
    creatorPassword,
    name,
    memberEmails,
  });

  console.log(`\nListo — grupo ${groupId} con ${memberIds.length} invitados: ${memberIds.join(", ")}`);
}

// Solo ejecuta el CLI si se invoca directamente (`node
// scripts/seed-report-group.mjs ...`), nunca cuando otro módulo lo importa
// (p.ej. el test suite de la historia 1.1).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  });
}

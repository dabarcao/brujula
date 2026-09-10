// Crea un ciclo 360 de empresa completo para N empleados (por defecto 5)
// de una organización ya existente: los selecciona como participantes,
// organiza 5 evaluadores por cabeza (del resto de la plantilla), rellena
// todas las respuestas (incluidas las 10 de saboteadores en la
// autoevaluación) y finaliza cada 360 (close_cycle_request) — para tener
// de un tirón varios compañeros con al menos un 360 ya cerrado, sin lo
// cual no se puede probar "Informes de grupo" (sección 17 del spec).
//
// Solo participan empleados SIN ningún 360 abierto ya en curso (si un
// empleado ya está en un ciclo abierto, se salta — no se puede meter a
// nadie en dos a la vez). Si hay menos de N libres, usa los que haya.
//
// Uso:
//   node scripts/seed-company-360.mjs supervisor@empresa.com contraseñaSupervisor contraseñaEmpleados [cantidad=5]
//
// Ejemplo real de esta sesión:
//   node scripts/seed-company-360.mjs supervisor@kairosexperience.es admin123 kairos123 5

const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_KEY_ENV = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

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

const SCALE_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
function randScale() {
  return SCALE_STEPS[Math.floor(Math.random() * SCALE_STEPS.length)];
}
const OPEN_ANSWERS = [
  "Destaca por su capacidad de escucha y su claridad al comunicar decisiones.",
  "Podría beneficiarse de delegar más y confiar en la autonomía del equipo.",
  "Genera confianza y facilita que los demás se abran a dar su opinión.",
  "Le vendría bien dedicar más tiempo a revisar prioridades con el equipo.",
];
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  const [supervisorEmail, supervisorPassword, employeePassword, countArg] = process.argv.slice(2);
  const count = Number(countArg) || 5;

  if (!supervisorEmail || !supervisorPassword || !employeePassword) {
    console.error(
      "Uso: node scripts/seed-company-360.mjs supervisor@empresa.com contraseñaSupervisor contraseñaEmpleados [cantidad=5]"
    );
    process.exit(1);
  }

  const env = loadEnvLocal();
  const supabaseUrl = env[SUPABASE_URL_ENV];
  const apikey = env[SUPABASE_KEY_ENV];
  if (!supabaseUrl || !apikey) {
    console.error(`No se encontraron ${SUPABASE_URL_ENV} / ${SUPABASE_KEY_ENV} en .env.local`);
    process.exit(1);
  }

  async function rpc(name, token, body) {
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

  async function login(email, password) {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`login failed for ${email}: ${JSON.stringify(data)}`);
    return data.access_token;
  }

  async function restGet(pathAndQuery, token) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${pathAndQuery}`, {
      headers: { apikey, Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  async function submitAnswersForToken(token, bearerToken) {
    const ctx = await rpc("get_responder_context", bearerToken, { p_token: token });
    if (!ctx.valid) throw new Error(`token inválido: ${JSON.stringify(ctx)}`);
    if (ctx.used) return "ya respondido";
    const answers = ctx.questions.map((q) => {
      if (q.question_type === "scale") return { question_id: q.id, answer_value: randScale() };
      if (q.question_type === "open") return { question_id: q.id, answer_text: pick(OPEN_ANSWERS) };
      return { question_id: q.id, answer_value: randScale() };
    });
    await rpc("submit_feedback_response", bearerToken, { p_token: token, p_answers: answers });
    return "respondido";
  }

  console.log("1. Login supervisor...");
  const supervisorToken = await login(supervisorEmail, supervisorPassword);

  const allMembers = await restGet("members?select=id,email,status,is_supervisor", supervisorToken);
  const employees = allMembers.filter((m) => !m.is_supervisor && m.status === "active");
  const idByEmail = Object.fromEntries(allMembers.map((m) => [m.email, m.id]));

  console.log("2. Buscando quién ya tiene un 360 abierto (se salta)...");
  const openRequests = await restGet(
    "feedback_requests?select=requester_member_id&request_type=eq.cycle&status=eq.open",
    supervisorToken
  );
  const busyIds = new Set(openRequests.map((r) => r.requester_member_id));
  const free = employees.filter((m) => !busyIds.has(m.id));

  if (free.length < count) {
    console.log(
      `  Solo hay ${free.length} libres (pedías ${count}) — se usan los que hay. El resto ya tenía un 360 en curso.`
    );
  }
  const participants = free.slice(0, count);
  if (participants.length === 0) {
    console.log("No hay ningún empleado libre para meter en un ciclo nuevo. Nada que hacer.");
    return;
  }
  console.log(`  participantes: ${participants.map((p) => p.email).join(", ")}`);

  const tokens = {};
  for (const m of employees) tokens[m.email] = await login(m.email, employeePassword);

  console.log("3. Creando el ciclo...");
  const opensAt = new Date().toISOString().slice(0, 10);
  const closesAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const cycleId = await rpc("create_feedback_cycle", supervisorToken, {
    p_name: `Ciclo automático ${opensAt}`,
    p_opens_at: opensAt,
    p_closes_at: closesAt,
    p_participant_member_ids: participants.map((p) => p.id),
  });
  console.log(`  cycle id: ${cycleId}`);

  const requestByEmail = {};
  for (const p of participants) {
    const evaluators = employees.filter((e) => e.id !== p.id).slice(0, 5);
    const categories = ["team", "team", "organization", "organization", "other"];
    console.log(`4. Organizando evaluadores para ${p.email}...`);
    const requestId = await rpc("organize_cycle_evaluators", tokens[p.email], {
      p_cycle_id: cycleId,
      p_evaluator_member_ids: evaluators.map((e) => e.id),
      p_evaluator_categories: categories,
    });
    requestByEmail[p.email] = { requestId, evaluators };
    console.log(`   ok: ${evaluators.map((e) => e.email).join(", ")}`);
  }

  for (const p of participants) {
    const { evaluators } = requestByEmail[p.email];
    console.log(`5. Respondiendo para ${p.email}...`);
    for (const evaluator of evaluators) {
      const pending = await rpc("get_my_pending_invitations", tokens[evaluator.email], {});
      const invite = pending.find((x) => x.requester_member_id === p.id && x.evaluator_category !== "self");
      if (!invite) {
        console.log(`   (!) ${evaluator.email}: sin invitación pendiente`);
        continue;
      }
      const result = await submitAnswersForToken(invite.token, tokens[evaluator.email]);
      console.log(`   ${evaluator.email} -> ${result}`);
    }
    const pendingSelf = await rpc("get_my_pending_invitations", tokens[p.email], {});
    const selfInvite = pendingSelf.find((x) => x.evaluator_category === "self");
    if (selfInvite) {
      const result = await submitAnswersForToken(selfInvite.token, tokens[p.email]);
      console.log(`   autoevaluación -> ${result}`);
    } else {
      console.log("   (!) sin autoevaluación pendiente (¿ya respondida antes?)");
    }
  }

  console.log("6. Finalizando cada 360...");
  for (const p of participants) {
    const { requestId } = requestByEmail[p.email];
    try {
      await rpc("close_cycle_request", tokens[p.email], { p_request_id: requestId });
      console.log(`   ${p.email} cerrado`);
    } catch (e) {
      console.log(`   (!) ${p.email}: ${e.message}`);
    }
  }

  console.log(`\nListo — ${participants.length} empleados con su 360 finalizado.`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});

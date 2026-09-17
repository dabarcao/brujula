// Crea una empresa de cero para pruebas locales: la organización, su primer
// Supervisor, 4 departamentos y N empleados — y además lanza un ciclo 360
// con un reparto deliberadamente desigual (algunos cerrados, algunos listos
// para cerrar, algunos todavía respondiendo) para que la empresa no se vea
// artificialmente "perfecta". Reutiliza exactamente los mismos caminos
// reales que seed-fake-employees.mjs / seed-company-360.mjs / seed-full-360.mjs:
// fetch directo a la API de Supabase, solo con la anon key, nunca service role.
//
// Requiere que el admin general de plataforma (platform_admins, ver
// 0016_platform_admin_org_creation.sql) tenga ya su fila con este email —
// el script se autobootstrapea su cuenta de auth local si todavía no existe
// (signUpOrSignIn, igual que en seed-full-360.mjs).
//
// Nota: el Supervisor NO puede ser evaluador de nadie (ver
// 0032_supervisor_cannot_be_evaluator.sql, organize_cycle_evaluators lo
// rechaza) — los 5 evaluadores de cada empleado son siempre otros
// compañeros, nunca el Supervisor.
//
// Uso:
//   node scripts/seed-demo-company.mjs ["Nombre Empresa"] [cantidadEmpleados=12]
//
// Todas las cuentas que crea (Supervisor y empleados) comparten la misma
// contraseña: kairos123. Cada ejecución crea una empresa NUEVA — volver a
// correrlo con el mismo nombre de empresa fallará porque el email del
// admin ya estaría registrado (mismo alcance que el resto de scripts/:
// sin reanudación desde fallo parcial).

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

const PASSWORD = "kairos123";
const PLATFORM_ADMIN_EMAIL = "david.abarca@gmail.com";

const DEPARTMENT_NAMES = ["Ventas", "Ingeniería", "Marketing", "Operaciones"];

const EMPLOYEE_NAMES = [
  "Lucía Fernández", "Marco Torres", "Elena Ruiz", "Javier Molina",
  "Sofía Navarro", "Diego Herrera", "Carmen Ibáñez", "Pablo Reyes",
  "Nuria Campos", "Álvaro Serrano", "Marta Gil", "Rubén Ortega",
];

const EVALUATOR_CATEGORIES = ["manager", "team", "team", "organization", "other"];

const OPEN_ANSWERS = [
  "Destaca por su capacidad de escucha y su claridad al comunicar decisiones.",
  "Podría beneficiarse de delegar más y confiar en la autonomía del equipo.",
  "Genera confianza y facilita que los demás se abran a dar su opinión.",
  "Le vendría bien dedicar más tiempo a revisar prioridades con el equipo.",
];
const SCALE_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randScale() {
  return SCALE_STEPS[Math.floor(Math.random() * SCALE_STEPS.length)];
}

function slugify(name) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "empresa"
  );
}

async function main() {
  const [companyNameArg, countArg] = process.argv.slice(2);
  const companyName = companyNameArg || "Kairos Demo";
  const count = Number(countArg) || 12;
  const emailDomain = `${slugify(companyName)}.brujula-fake.test`;

  // Un caller (p.ej. un test) puede fijar estas dos variables de entorno
  // explícitamente para anclar el destino exacto ya verificado por ese
  // caller, en vez de dejar que este script relea .env.local por su cuenta
  // -- sin esto, un .env.local que apunte a otro proyecto pasaría inadvertido.
  const env = loadEnvLocal();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !apikey) {
    console.error("No se encontraron NEXT_PUBLIC_SUPABASE_URL / ANON_KEY en .env.local");
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

  async function signUpOrSignIn(email, password) {
    let res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    let data = await res.json();
    if (res.ok && data.access_token) return data.access_token;

    res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    data = await res.json();
    if (!res.ok) throw new Error(`signUp/signIn failed for ${email}: ${JSON.stringify(data)}`);
    return data.access_token;
  }

  async function signUpWithInvite(email, password, inviteToken) {
    const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, data: { pending_invite_token: inviteToken } }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`signUp failed for ${email}: ${JSON.stringify(data)}`);
    if (!data.access_token) {
      throw new Error(
        `${email}: cuenta creada pero requiere confirmar email (Confirm email activo) — ` +
          "no se pudo completar el alta automáticamente."
      );
    }
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

  console.log(`1. Preparando admin de plataforma (${PLATFORM_ADMIN_EMAIL})...`);
  const paToken = await signUpOrSignIn(PLATFORM_ADMIN_EMAIL, PASSWORD);

  console.log(`2. Creando la empresa "${companyName}"...`);
  const adminEmail = `admin@${emailDomain}`;
  const adminFullName = `Admin ${companyName}`;
  const orgInviteToken = await rpc("create_organization_as_admin", paToken, {
    p_org_name: companyName,
    p_admin_email: adminEmail,
    p_admin_full_name: adminFullName,
  });

  console.log(`3. Aceptando invitación del Supervisor (${adminEmail})...`);
  const adminToken = await signUpWithInvite(adminEmail, PASSWORD, orgInviteToken);
  await rpc("accept_member_invite", adminToken, { p_token: orgInviteToken });

  console.log("4. Creando departamentos...");
  for (const deptName of DEPARTMENT_NAMES) {
    try {
      await rpc("create_department", adminToken, { p_name: deptName });
    } catch (e) {
      console.log(`   (aviso) ${deptName}: ${e.message}`);
    }
  }
  const allDepartments = await restGet("departments?select=id,name&order=name", adminToken);
  const namedDepartments = allDepartments.filter((d) => DEPARTMENT_NAMES.includes(d.name));
  console.log(`   departamentos: ${allDepartments.map((d) => d.name).join(", ")}`);

  console.log(`5. Creando ${count} empleados...`);
  const employees = [];
  for (let i = 0; i < count; i++) {
    const name =
      EMPLOYEE_NAMES[i % EMPLOYEE_NAMES.length] + (i >= EMPLOYEE_NAMES.length ? ` ${i + 1}` : "");
    const email = `empleado${i + 1}@${emailDomain}`;
    const department = namedDepartments[i % namedDepartments.length];

    try {
      const inviteToken = await rpc("invite_member", adminToken, {
        p_email: email,
        p_full_name: name,
        p_department_id: department.id,
      });
      const employeeToken = await signUpWithInvite(email, PASSWORD, inviteToken);
      await rpc("accept_member_invite", employeeToken, { p_token: inviteToken });
      employees.push({ name, email, department: department.name, token: employeeToken });
      console.log(`   - ${name} <${email}> (${department.name})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Ya existe un empleado")) {
        console.log(`   - ${name} <${email}>: ya existía, saltando.`);
      } else {
        throw err;
      }
    }
  }

  if (employees.length === 0) {
    console.log("\nNo se creó ningún empleado nuevo (¿ya existían todos?). Nada más que hacer.");
    return;
  }

  console.log("6. Resolviendo el id de member de cada empleado...");
  const allMembers = await restGet("members?select=id,email", adminToken);
  const idByEmail = Object.fromEntries(allMembers.map((m) => [m.email, m.id]));
  for (const e of employees) e.id = idByEmail[e.email];

  console.log("7. Creando el ciclo 360...");
  const opensAt = new Date().toISOString().slice(0, 10);
  const closesAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const cycleId = await rpc("create_feedback_cycle", adminToken, {
    p_name: `Ciclo 360 — ${companyName}`,
    p_opens_at: opensAt,
    p_closes_at: closesAt,
    p_participant_member_ids: employees.map((e) => e.id),
  });
  console.log(`   cycle id: ${cycleId}`);

  console.log("8. Organizando evaluadores por empleado (nunca el Supervisor)...");
  for (const p of employees) {
    const evaluators = employees.filter((e) => e.id !== p.id).slice(0, 5);
    const requestId = await rpc("organize_cycle_evaluators", p.token, {
      p_cycle_id: cycleId,
      p_evaluator_member_ids: evaluators.map((e) => e.id),
      p_evaluator_categories: EVALUATOR_CATEGORIES,
    });
    p.requestId = requestId;
    p.evaluators = evaluators;
  }

  console.log("9. Repartiendo en 3 grupos de realismo y respondiendo...");
  // 3 cubos a partes iguales: 0 = cerrado, 1 = listo sin cerrar, 2 = a medias.
  for (let i = 0; i < employees.length; i++) {
    const p = employees[i];
    const bucket = i % 3;
    p.bucketLabel = bucket === 0 ? "cerrado" : bucket === 1 ? "listo (sin cerrar)" : "a medias";

    const pendingSelf = await rpc("get_my_pending_invitations", p.token, {});
    const selfInvite = pendingSelf.find((x) => x.evaluator_category === "self");
    if (selfInvite) await submitAnswersForToken(selfInvite.token, p.token);

    const evaluatorsToAnswer = bucket === 2 ? p.evaluators.slice(0, 2) : p.evaluators;
    for (const evaluator of evaluatorsToAnswer) {
      const pending = await rpc("get_my_pending_invitations", evaluator.token, {});
      const invite = pending.find(
        (x) => x.requester_member_id === p.id && x.evaluator_category !== "self"
      );
      if (invite) await submitAnswersForToken(invite.token, evaluator.token);
    }

    if (bucket === 0) {
      await rpc("close_cycle_request", p.token, { p_request_id: p.requestId });
    }
    console.log(`   - ${p.email}: ${p.bucketLabel}`);
  }

  console.log("\n=== Listo ===");
  console.log(`Empresa: ${companyName}`);
  console.log(`Supervisor: ${adminEmail} / ${PASSWORD}`);
  console.log(`Empleados (contraseña compartida: ${PASSWORD}):`);
  for (const e of employees) {
    console.log(`  - ${e.name} <${e.email}> — ${e.department} — 360: ${e.bucketLabel}`);
  }
  console.log(`\nApp:    http://localhost:3000/login`);
  console.log(`Studio: http://127.0.0.1:54323`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});

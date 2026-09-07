// Crea David Kairos Experience (cuenta individual, sin empresa) + 12
// evaluadores (uno@kairos.es .. doce@kairos.es), lanza un 360 desde David
// con 3 personas por categoría de evaluador, y rellena respuestas
// aleatorias de los 12 más la autoevaluación de David — para poder ver el
// informe ya revelado con desglose por grupo (mínimo 3 por categoría).
//
// Reutiliza exactamente el mismo camino que un alta y un 360 reales
// (signUp -> create_individual_account -> create_individual_cycle_request
// -> claim_pending_email_invitations -> get_responder_context ->
// submit_feedback_response), llamando a la API de Supabase con fetch —
// igual que scripts/seed-fake-employees.mjs.
//
// Uso:
//   node scripts/seed-david-360.mjs
//
// Es re-ejecutable: si las cuentas ya existen, inicia sesión en vez de
// registrarlas de nuevo (pero create_individual_cycle_request fallará si
// David ya tiene un 360 abierto — normal, "un 360 abierto a la vez").

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
const CLOSES_AT = "2026-12-31";

const NUMEROS = [
  "uno", "dos", "tres", "cuatro", "cinco", "seis",
  "siete", "ocho", "nueve", "diez", "once", "doce",
];

const CATEGORY_BY_INDEX = [
  "manager", "manager", "manager",
  "team", "team", "team",
  "organization", "organization", "organization",
  "other", "other", "other",
];

const OPEN_ANSWERS = [
  "Destaca por su capacidad de escucha y su claridad al comunicar decisiones.",
  "Podría beneficiarse de delegar más y confiar en la autonomía del equipo.",
  "Dar más visibilidad a los avances ayudaría a mantener la motivación del grupo.",
  "Genera confianza y facilita que los demás se abran a dar su opinión.",
  "Le vendría bien dedicar más tiempo a revisar prioridades con el equipo.",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randScale() {
  return Math.floor(Math.random() * 5) + 1;
}

async function main() {
  const env = loadEnvLocal();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !apikey) {
    console.error("No se encontraron NEXT_PUBLIC_SUPABASE_URL / ANON_KEY en .env.local");
    process.exit(1);
  }

  async function rpc(name, token, body) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey,
        Authorization: `Bearer ${token || apikey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!res.ok) {
      throw new Error(`${name} failed (${res.status}): ${JSON.stringify(data)}`);
    }
    return data;
  }

  async function signUpOrSignIn(email) {
    let res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    let data = await res.json();

    if (res.ok && data.access_token) {
      return data.access_token;
    }

    // Ya existía (reintento del script): iniciar sesión normal.
    res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    data = await res.json();
    if (!res.ok) {
      throw new Error(`signUp/signIn failed for ${email}: ${JSON.stringify(data)}`);
    }
    return data.access_token;
  }

  async function ensureIndividualAccount(email, fullName, token) {
    try {
      await rpc("create_individual_account", token, {
        p_full_name: fullName,
        p_email: email,
      });
    } catch (e) {
      console.log(`  (aviso create_individual_account ${email}): ${e.message}`);
    }
  }

  async function submitAnswersForToken(token, bearerToken) {
    const ctx = await rpc("get_responder_context", bearerToken, { p_token: token });
    if (!ctx.valid) throw new Error(`token inválido: ${JSON.stringify(ctx)}`);
    if (ctx.used) {
      console.log("    ya respondido, se salta");
      return;
    }

    const answers = ctx.questions.map((q) => {
      if (q.question_type === "scale") {
        return { question_id: q.id, answer_value: randScale() };
      }
      if (q.question_type === "open") {
        return { question_id: q.id, answer_text: pick(OPEN_ANSWERS) };
      }
      return { question_id: q.id, answer_value: randScale() };
    });

    await rpc("submit_feedback_response", bearerToken, {
      p_token: token,
      p_answers: answers,
    });
  }

  console.log("1. Creando cuentas...");
  const davidToken = await signUpOrSignIn("david@kairos.es");
  await ensureIndividualAccount("david@kairos.es", "David Kairos Experience", davidToken);
  console.log("  david@kairos.es OK");

  const evaluators = [];
  for (let i = 0; i < 12; i++) {
    const email = `${NUMEROS[i]}@kairos.es`;
    const fullName = `${NUMEROS[i][0].toUpperCase()}${NUMEROS[i].slice(1)} Kairos`;
    const token = await signUpOrSignIn(email);
    await ensureIndividualAccount(email, fullName, token);
    evaluators.push({ email, token, category: CATEGORY_BY_INDEX[i] });
    console.log(`  ${email} OK (${CATEGORY_BY_INDEX[i]})`);
  }

  console.log("2. Creando el 360 desde David...");
  const requestId = await rpc("create_individual_cycle_request", davidToken, {
    p_evaluator_emails: evaluators.map((e) => e.email),
    p_evaluator_categories: evaluators.map((e) => e.category),
    p_closes_at: CLOSES_AT,
  });
  console.log(`  feedback_requests.id = ${requestId}`);

  console.log("3. Reclamando invitaciones y respondiendo (12 evaluadores)...");
  for (const ev of evaluators) {
    await rpc("claim_pending_email_invitations", ev.token, {});
    const pending = await rpc("get_my_pending_invitations", ev.token, {});
    const invite = pending.find((p) => p.requester_email === "david@kairos.es");
    if (!invite) {
      console.log(`  (!) ${ev.email}: no se encontró invitación pendiente de David`);
      continue;
    }
    await submitAnswersForToken(invite.token, ev.token);
    console.log(`  ${ev.email} respondido`);
  }

  console.log("4. Autoevaluación de David...");
  const davidPending = await rpc("get_my_pending_invitations", davidToken, {});
  const selfInvite = davidPending.find((p) => p.evaluator_category === "self");
  if (!selfInvite) {
    console.log("  (!) no se encontró la invitación 'self' de David");
  } else {
    await submitAnswersForToken(selfInvite.token, davidToken);
    console.log("  autoevaluación respondida");
  }

  console.log("5. Progreso final:");
  const progress = await rpc("get_feedback_request_progress", davidToken, {
    p_request_id: requestId,
  });
  console.log(progress);
  console.log(`\nListo: /dashboard/feedback/${requestId} (login david@kairos.es / kairos123)`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});

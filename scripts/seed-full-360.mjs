// Generaliza scripts/seed-david-360.mjs: crea (o reutiliza) un 360
// individual ya completo — con las 12 respuestas de evaluadores más la
// autoevaluación — para CUALQUIER email que le pases, no solo David.
// Sigue exactamente el mismo camino real (signUp -> create_individual_account
// -> create_individual_cycle_request -> claim_pending_email_invitations ->
// get_responder_context -> submit_feedback_response).
//
// Uso:
//   node scripts/seed-full-360.mjs persona@ejemplo.com "Nombre Apellido"
//   node scripts/seed-full-360.mjs persona@ejemplo.com "Nombre Apellido" --no-close
//
// --no-close deja el 360 abierto y revelado (80% + autoevaluación) en vez
// de cerrarlo al final — para probar el botón "Finalizar informe" a mano
// en vez de simular también ese paso. Sin este flag, el script cierra el
// 360 él mismo (comportamiento de siempre).
//
// El segundo argumento (nombre completo) es opcional — si se omite, se usa
// la parte del email antes de la @. La cuenta objetivo se crea si no
// existe, o simplemente inicia sesión si ya existe (misma contraseña que
// el resto de cuentas de prueba: kairos123). Los 12 evaluadores
// (uno@kairos.es .. doce@kairos.es) se crean/reutilizan igual que en
// seed-david-360.mjs — puedes correr este script tantas veces como
// quieras, para tantos emails distintos como quieras: cada uno acaba con
// su propio 360 cerrado y listo para ver.

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

const SCALE_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

function randScale() {
  return SCALE_STEPS[Math.floor(Math.random() * SCALE_STEPS.length)];
}

async function main() {
  const targetEmail = process.argv[2];
  if (!targetEmail) {
    console.error('Uso: node scripts/seed-full-360.mjs persona@ejemplo.com "Nombre Apellido"');
    process.exit(1);
  }
  const args = process.argv.slice(3).filter((a) => a !== "--no-close");
  const noClose = process.argv.includes("--no-close");
  const targetName = args[0] || targetEmail.split("@")[0];

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

  console.log(`1. Creando cuenta objetivo (${targetEmail})...`);
  const targetToken = await signUpOrSignIn(targetEmail);
  await ensureIndividualAccount(targetEmail, targetName, targetToken);
  console.log(`  ${targetEmail} OK`);

  const evaluators = [];
  for (let i = 0; i < 12; i++) {
    const email = `${NUMEROS[i]}@kairos.es`;
    const fullName = `${NUMEROS[i][0].toUpperCase()}${NUMEROS[i].slice(1)} Kairos`;
    const token = await signUpOrSignIn(email);
    await ensureIndividualAccount(email, fullName, token);
    evaluators.push({ email, token, category: CATEGORY_BY_INDEX[i] });
    console.log(`  ${email} OK (${CATEGORY_BY_INDEX[i]})`);
  }

  console.log(`2. Creando el 360 desde ${targetEmail}...`);
  const requestId = await rpc("create_individual_cycle_request", targetToken, {
    p_evaluator_emails: evaluators.map((e) => e.email),
    p_evaluator_categories: evaluators.map((e) => e.category),
    p_closes_at: CLOSES_AT,
    p_name: `360 de prueba — ${targetName}`,
  });
  console.log(`  feedback_requests.id = ${requestId}`);

  console.log("3. Reclamando invitaciones y respondiendo (12 evaluadores)...");
  for (const ev of evaluators) {
    await rpc("claim_pending_email_invitations", ev.token, {});
    const pending = await rpc("get_my_pending_invitations", ev.token, {});
    const invite = pending.find((p) => p.requester_email === targetEmail);
    if (!invite) {
      console.log(`  (!) ${ev.email}: no se encontró invitación pendiente de ${targetEmail}`);
      continue;
    }
    await submitAnswersForToken(invite.token, ev.token);
    console.log(`  ${ev.email} respondido`);
  }

  console.log(`4. Autoevaluación de ${targetEmail}...`);
  const targetPending = await rpc("get_my_pending_invitations", targetToken, {});
  const selfInvite = targetPending.find((p) => p.evaluator_category === "self");
  if (!selfInvite) {
    console.log("  (!) no se encontró la invitación 'self' del usuario objetivo");
  } else {
    await submitAnswersForToken(selfInvite.token, targetToken);
    console.log("  autoevaluación respondida");
  }

  console.log("5. Progreso final:");
  const progress = await rpc("get_feedback_request_progress", targetToken, {
    p_request_id: requestId,
  });
  console.log(progress);

  if (noClose) {
    console.log("6. --no-close: se deja abierto (revelado, listo para probar 'Finalizar informe').");
    console.log(`\nListo (sin cerrar): /dashboard/feedback/${requestId} (login ${targetEmail} / kairos123)`);
  } else {
    console.log("6. Cerrando el 360 para poder volver a lanzar el script...");
    await rpc("close_cycle_request", targetToken, { p_request_id: requestId });
    console.log("  cerrado");
    console.log(`\nListo: /dashboard/feedback/${requestId} (login ${targetEmail} / kairos123)`);
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});

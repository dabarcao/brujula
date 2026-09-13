// Crea un 360 individual completo, igual que seed-full-360.mjs, pero en
// vez de rellenar todo con valores aleatorios, usa un perfil mapeado desde
// un informe externo (competencias + saboteadores + texto libre YA
// PARAFRASEADO, nunca copiado literal — ver scripts/data/*.json) para que
// número y texto sean coherentes entre sí al probar la interpretación IA.
//
// Uso:
//   node scripts/seed-migrated-profile.mjs migrado1@kairos.es "Nombre" scripts/data/migrated-profile-1.json
//   node scripts/seed-migrated-profile.mjs migrado1@kairos.es "Nombre" scripts/data/migrated-profile-1.json --no-close
//
// Igual que seed-full-360.mjs: 12 evaluadores fijos (uno@kairos.es ..
// doce@kairos.es) — si el perfil original tenía más evaluadores reales,
// el resto simplemente no se usa (se pierde), tal como se decidió.
// Competencias sin mapeo en el JSON se rellenan con un valor aleatorio
// suave (igual que el resto de scripts de siembra).

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

const SCALE_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

function randScale() {
  return SCALE_STEPS[Math.floor(Math.random() * SCALE_STEPS.length)];
}

// Pequeño ruido para que las 2 preguntas de una misma competencia no
// salgan siempre con el mismo número exacto — redondeado al escalón de
// 0,5 más cercano y con el rango pinzado a [1, 5].
function jitter(value) {
  const noisy = value + (Math.random() - 0.5) * 0.5;
  const stepped = Math.round(noisy * 2) / 2;
  return Math.min(5, Math.max(1, stepped));
}

async function main() {
  const targetEmail = process.argv[2];
  const targetNameArg = process.argv[3];
  const profilePathArg = process.argv[4];
  if (!targetEmail || !profilePathArg) {
    console.error(
      'Uso: node scripts/seed-migrated-profile.mjs migrado1@kairos.es "Nombre" scripts/data/migrated-profile-1.json [--no-close]'
    );
    process.exit(1);
  }
  const noClose = process.argv.includes("--no-close");
  const targetName = targetNameArg || targetEmail.split("@")[0];

  const profile = JSON.parse(readFileSync(path.resolve(profilePathArg), "utf8"));

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
      headers: { apikey, Authorization: `Bearer ${token || apikey}`, "Content-Type": "application/json" },
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

  async function restGet(pathAndQuery, token) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${pathAndQuery}`, {
      headers: { apikey, Authorization: `Bearer ${token || apikey}` },
    });
    return res.json();
  }

  async function signUpOrSignIn(email) {
    let res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    let data = await res.json();
    if (res.ok && data.access_token) return data.access_token;

    res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    data = await res.json();
    if (!res.ok) throw new Error(`signUp/signIn failed for ${email}: ${JSON.stringify(data)}`);
    return data.access_token;
  }

  async function ensureIndividualAccount(email, fullName, token) {
    try {
      await rpc("create_individual_account", token, { p_full_name: fullName, p_email: email });
    } catch (e) {
      console.log(`  (aviso create_individual_account ${email}): ${e.message}`);
    }
  }

  console.log("0. Leyendo el catálogo de preguntas (default_360_cycle)...");
  const anyToken = await signUpOrSignIn(`${NUMEROS[0]}@kairos.es`);
  const [template] = await restGet(
    "survey_templates?select=id&code=eq.default_360_cycle",
    anyToken
  );
  const allQuestions = await restGet(
    `survey_questions?select=id,position,question_type,self_only,competency_code,saboteador_code&template_id=eq.${template.id}&order=position.asc`,
    anyToken
  );
  const questionById = new Map(allQuestions.map((q) => [q.id, q]));
  const openQuestionsInOrder = allQuestions
    .filter((q) => q.question_type === "open")
    .sort((a, b) => a.position - b.position);
  // Posiciones 43/44/45 de la migración 0072: destaca, desafío, consejo,
  // en ese orden — se detecta por orden de posición, no por texto, para
  // no depender de que el prompt exacto no cambie.
  const openKeyByQuestionId = new Map(
    openQuestionsInOrder.map((q, i) => [q.id, ["destaca", "desafio", "consejo"][i]])
  );

  function valueForCompetency(code, isSelf) {
    const mapped = profile.competencies[code];
    if (!mapped) return randScale();
    return jitter(isSelf ? mapped.self : mapped.peer);
  }

  function valueForSaboteador(code) {
    const mapped = profile.saboteadores[code];
    if (mapped == null) return randScale();
    return jitter(mapped);
  }

  // Un índice de texto libre distinto por evaluador (0-11), para no
  // repetir siempre el mismo comentario y usar las 12 frases del perfil.
  async function submitAnswersForToken(token, bearerToken, isSelf, openTextIndex) {
    const ctx = await rpc("get_responder_context", bearerToken, { p_token: token });
    if (!ctx.valid) throw new Error(`token inválido: ${JSON.stringify(ctx)}`);
    if (ctx.used) {
      console.log("    ya respondido, se salta");
      return;
    }

    const answers = ctx.questions.map((q) => {
      const meta = questionById.get(q.id);
      if (q.question_type === "scale") {
        if (meta?.saboteador_code) {
          return { question_id: q.id, answer_value: valueForSaboteador(meta.saboteador_code) };
        }
        if (meta?.competency_code) {
          return { question_id: q.id, answer_value: valueForCompetency(meta.competency_code, isSelf) };
        }
        return { question_id: q.id, answer_value: randScale() };
      }
      if (q.question_type === "open") {
        const key = openKeyByQuestionId.get(q.id) || "destaca";
        const pool = profile.openAnswers[key] || [];
        const text = pool[openTextIndex % pool.length] || "";
        return { question_id: q.id, answer_text: text };
      }
      return { question_id: q.id, answer_value: randScale() };
    });

    await rpc("submit_feedback_response", bearerToken, { p_token: token, p_answers: answers });
  }

  console.log(`1. Creando cuenta objetivo (${targetEmail})...`);
  const targetToken = await signUpOrSignIn(targetEmail);
  await ensureIndividualAccount(targetEmail, targetName, targetToken);
  console.log(`  ${targetEmail} OK`);

  const evaluators = [];
  for (let i = 0; i < 12; i++) {
    const email = `${NUMEROS[i]}@kairos.es`;
    const fullName = `${NUMEROS[i][0].toUpperCase()}${NUMEROS[i].slice(1)} Kairos`;
    const token = i === 0 ? anyToken : await signUpOrSignIn(email);
    await ensureIndividualAccount(email, fullName, token);
    evaluators.push({ email, token, category: CATEGORY_BY_INDEX[i] });
    console.log(`  ${email} OK (${CATEGORY_BY_INDEX[i]})`);
  }

  console.log(`2. Creando el 360 desde ${targetEmail}...`);
  const requestId = await rpc("create_individual_cycle_request", targetToken, {
    p_evaluator_emails: evaluators.map((e) => e.email),
    p_evaluator_categories: evaluators.map((e) => e.category),
    p_closes_at: CLOSES_AT,
    p_name: `360 migrado — ${targetName}`,
  });
  console.log(`  feedback_requests.id = ${requestId}`);

  console.log("3. Reclamando invitaciones y respondiendo (12 evaluadores, valores del perfil)...");
  let evalIndex = 0;
  for (const ev of evaluators) {
    await rpc("claim_pending_email_invitations", ev.token, {});
    const pending = await rpc("get_my_pending_invitations", ev.token, {});
    const invite = pending.find((p) => p.requester_email === targetEmail);
    if (!invite) {
      console.log(`  (!) ${ev.email}: no se encontró invitación pendiente de ${targetEmail}`);
      evalIndex++;
      continue;
    }
    await submitAnswersForToken(invite.token, ev.token, false, evalIndex);
    console.log(`  ${ev.email} respondido`);
    evalIndex++;
  }

  console.log(`4. Autoevaluación de ${targetEmail}...`);
  const targetPending = await rpc("get_my_pending_invitations", targetToken, {});
  const selfInvite = targetPending.find((p) => p.evaluator_category === "self");
  if (!selfInvite) {
    console.log("  (!) no se encontró la invitación 'self' del usuario objetivo");
  } else {
    await submitAnswersForToken(selfInvite.token, targetToken, true, 0);
    console.log("  autoevaluación respondida");
  }

  console.log("5. Progreso final:");
  const progress = await rpc("get_feedback_request_progress", targetToken, { p_request_id: requestId });
  console.log(progress);

  if (noClose) {
    console.log("6. --no-close: se deja abierto (revelado, listo para 'Finalizar informe').");
    console.log(`\nListo (sin cerrar): /dashboard/feedback/${requestId} (login ${targetEmail} / kairos123)`);
  } else {
    console.log("6. Cerrando el 360...");
    await rpc("close_cycle_request", targetToken, { p_request_id: requestId });
    console.log("  cerrado");
    console.log(`\nListo: /dashboard/feedback/${requestId} (login ${targetEmail} / kairos123)`);
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});

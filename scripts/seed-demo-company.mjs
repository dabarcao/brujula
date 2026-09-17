// Crea una empresa de demo completa: activa al supervisor (ya dado de
// alta a mano desde /admin — ver más abajo por qué ese paso no se puede
// scriptar), da de alta N empleados, monta un ciclo 360 para UNO de
// ellos con un reparto de evaluadores fijo (no aleatorio), y responde
// con texto libre real (parafraseado de los 360 "migrado", nunca
// genérico tipo "Comentario de prueba.") — todo por API, sin pasar por
// la IA (nunca se llama a close_cycle_request, así que finalizeCycleRequest
// —y con ella generateAiInterpretation— no se dispara).
//
// Por qué hace falta un paso manual antes de ejecutar esto: crear la
// empresa en sí (create_organization_as_admin) exige estar autenticado
// como el Admin de plataforma real (david.abarca@gmail.com) — no hay
// forma de hacer eso desde un script sin su contraseña real, así que
// hay que crearla una vez desde /admin y pasarle aquí el token de
// invitación del supervisor que te enseña esa pantalla.
//
// Uso:
//   node scripts/seed-demo-company.mjs <tokenInvitacionSupervisor>
//
// Para crear OTRA empresa de demo: repite el paso de /admin y cambia el
// bloque CONFIG de abajo (nombre, prefijo de email, reparto de
// evaluadores...) antes de volver a ejecutar.

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

// ============================================================
// CONFIG — toca esto para crear otra empresa de demo
// ============================================================
const CONFIG = {
  orgName: "Kairos Innovación",
  // Emails reales tipo david.abarca+kairos_empleado1@gmail.com — de
  // verdad llegan a la bandeja de david.abarca@gmail.com (alias "+").
  emailBase: "david.abarca@gmail.com",
  emailPrefix: "kairos",
  password: "kairos123",
  employeeCount: 12,
  // Al empleado con este número se le monta el 360 completo.
  subjectIndex: 1,
  // Reparto de evaluadores para el empleado subjectIndex — 10 en total.
  managerIndex: 2,
  teamIndices: [3, 4, 5],
  organizationIndices: [6, 7, 8],
  otherIndices: [9, 10, 11],
  // El empleado 12 (o el que sobre) se queda sin tarea a propósito.
  closeAtEnd: false, // false = se deja abierto, lo cierra el usuario desde la app
};

// Textos reales (parafraseados de los 360 "migrado" ya existentes en la
// BBDD — 01c2ec6e/3989c0ac/78524ff6, sección de texto libre) en vez de
// placeholders genéricos, para que la interpretación IA que se pruebe
// después tenga con qué trabajar de verdad.
const DESTACA_POOL = [
  "Su conocimiento técnico es muy sólido, sabe transmitirlo con claridad.",
  "Destaca su nivel de competencia y la claridad con la que transmite las cosas.",
  "Tiene un gran conocimiento del área en la que trabaja.",
  "Su capacidad de análisis es su mayor atributo.",
  "Analiza y reflexiona bien antes de dar una opinión.",
  "Tiene una visión global de las necesidades a nivel de soluciones.",
  "Apoya a su equipo y consigue motivar con el ejemplo.",
  "Sabe hacer equipo para sacar los trabajos adelante.",
  "Gran capacidad de análisis, sabe priorizar y mantener la calma en momentos de tensión.",
  "Es una persona responsable, humilde y trabajadora.",
  "Tiene buen juicio y escucha a los demás.",
  "Tiene capacidad para ejercer de líder tanto del equipo como de cara al cliente.",
  "Escucha de verdad y siempre encuentra un terreno común para llegar a acuerdos.",
  "Sabe delegar y da espacio a su equipo para desarrollarse y tomar la iniciativa.",
  "Transmite pasión y honestidad, y contagia esa energía al resto del equipo.",
  "Actúa con humildad, poniendo al equipo por delante del reconocimiento personal.",
  "Se atreve a plantear temas incómodos en las reuniones, incluso en momentos de incertidumbre.",
  "Analiza los problemas con una mirada de conjunto, sin perder de vista los detalles importantes.",
  "Tiene un espíritu emprendedor natural, capaz de sacar lo mejor de cada persona del equipo.",
  "Hace preguntas genuinas y con curiosidad real para entender mejor las cosas.",
  "Aborda los retos con mente abierta, sin agenda oculta ni intereses personales.",
  "Equilibra muy bien la empatía con la objetividad a la hora de tomar decisiones.",
  "Aprende rápido de los errores y no se desanima ante los reveses.",
  "Comparte con generosidad su conocimiento y experiencia con quien lo necesita.",
  "Gracias a su experiencia, sabe impulsar temas hacia adelante con claridad.",
  "Siempre muestra humildad y cercanía con las personas, sea cual sea el tema.",
  "Deja trabajar a su equipo con libertad, guía e inspira cuando hace falta.",
  "Es muy hábil reuniendo a las personas adecuadas para resolver problemas.",
  "Tiene una experiencia profunda como líder y como mentor de su equipo.",
  "Su experiencia y trayectoria le dan una madurez que se nota en toda la organización.",
];

const DESAFIO_POOL = [
  "Podría explotar más su conocimiento y delegar más en su equipo.",
  "Podría atreverse más en la toma de decisiones estratégicas.",
  "Podría tener más libertad para aplicar nuevas formas de gestionar los proyectos.",
  "Podría dedicar más tiempo al análisis y menos a la ejecución directa.",
  "Podría implicarse más en tareas de definición y planificación.",
  "El conocimiento técnico a veces no le deja delegar adecuadamente.",
  "Podría visualizarse más como líder de un grupo que como un excelente trabajador individual.",
  "Podría desarrollar más su propio punto de vista y hacerse escuchar.",
  "Podría acercarse más al equipo para aumentar su motivación.",
  "Podría anticiparse a las decisiones en vez de esperar a que las tomen otros.",
  "Podría delegar más responsabilidad para liberar tiempo para el análisis clave.",
  "Podría potenciar más su vertiente comercial.",
  "Podría conectar más con sus compañeros más allá de las tareas puntuales, no solo cuando necesita algo concreto.",
  "A veces, llevada por la pasión, puede perder de vista el panorama general o las aportaciones de otros.",
  "Tiende a centrarse mucho en los detalles, dirigiendo la conversación hacia su propia conclusión en vez de escuchar más.",
  "Impulsa muchas iniciativas nuevas sin dar siempre tiempo a que las anteriores lleguen a buen puerto.",
  "Podría ser más directa y mostrar más su propio criterio en vez de moderar tanto el de los demás.",
  "Parece estar siempre \"encendida\", pensando sin parar — practicar la escucha activa le ayudaría a conectar más.",
  "Podría cuidar mejor el equilibrio entre lo urgente y lo importante en su día a día.",
  "Podría gestionar mejor la relación con su responsable directo y con sus compañeros de otros equipos.",
  "Un poco menos de perfeccionismo le ayudaría a enfocarse en lo que realmente importa.",
  "Podría dar más tiempo a las iniciativas ya en marcha antes de lanzar otras nuevas.",
  "Podría esperar a que el otro termine de hablar antes de intervenir con su opinión.",
  "Podría anticipar mejor los criterios de decisión antes de lanzar un nuevo proyecto.",
  "Podría implicarse más en su propio desarrollo profesional.",
  "Podría llevar a más talento senior al siguiente nivel, no solo al más nuevo.",
  "Podría delegar más responsabilidad en vez de asumir tanto él mismo.",
  "Podría dedicar tiempo a definir una visión y estrategia compartida a largo plazo.",
  "Podría reforzar la confianza con sus compañeros de su mismo nivel.",
  "Podría trabajar más en equipo con todo el grupo directivo, buscando consenso.",
];

const CONSEJO_POOL = [
  "Intenta delegar más responsabilidad, te ayudará a liberar tiempo para lo importante.",
  "No estás solo, deja que tu equipo asuma también su parte de responsabilidad.",
  "Aprovecha tu conocimiento y capacidad para liderar cambios más importantes.",
  "No todo es trabajo, cuida también el resto de facetas.",
  "Destacaría la excelencia en tu trabajo, tanto a nivel personal como en equipo.",
  "Transmites seguridad y sabes sacar lo mejor de tu equipo, sigue así.",
  "Sabes encajar las críticas y te esfuerzas siempre por mejorar, no lo pierdas.",
  "Tu análisis certero ayuda al equipo a encontrar el camino, compártelo más.",
  "Sé más de líder de grupo que de trabajador individual en tu día a día.",
  "Comparte tanto lo positivo como las áreas de mejora con quienes toman decisiones.",
  "Confía en que tu equipo puede asumir más autonomía.",
  "Sigue cuidando tanto lo personal como lo profesional en tu desarrollo.",
  "Sigue invirtiendo tiempo en construir la relación de confianza con el equipo, eso ya funciona muy bien.",
  "Comparte más abiertamente cómo consigues lo que consigues, a nivel profesional y personal — inspiraría a otros.",
  "Sé más valiente expresando tu propia opinión dentro de tu grupo de iguales.",
  "Practica la escucha activa, dejando que el otro sienta que de verdad se le ha entendido.",
  "Puedes ser más firme y directa sin necesidad de cambiar tu estilo de liderazgo.",
  "Encuentra el momento para promover abiertamente tu estilo de liderazgo colaborativo, sobre todo entre los más jóvenes.",
  "Sigue extendiendo esa mentalidad de \"probar y aprender\" al resto del equipo.",
  "Prioriza mejor entre las iniciativas nuevas y las que ya están en marcha.",
  "Cuida el equilibrio entre atender lo urgente y no perder de vista lo importante.",
  "Sigue haciendo visibles los avances del equipo, incluso cuando trabajáis en remoto.",
  "Aprovecha tu capacidad analítica para anticipar riesgos, no solo para resolverlos.",
  "No dejes de cuestionar el status quo, pero cuida el ritmo al que lo haces.",
  "Sigue siendo mentor, es algo que se valora mucho de ti.",
  "Eres colaborador y estás siempre abierto a apoyar a los demás, no lo pierdas.",
  "Sigue liderando con pasión, se nota y se aprecia.",
  "No dejes de compartir tanto lo positivo como las áreas de mejora con el resto.",
  "Sigue confiando en las personas, es parte de tu estilo de liderazgo.",
  "Podrías establecer programas para que otros aprendan de tu experiencia.",
];

const SCALE_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
function randScale() {
  return SCALE_STEPS[Math.floor(Math.random() * SCALE_STEPS.length)];
}
function shuffled(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function main() {
  const supervisorInviteToken = process.argv[2];
  if (!supervisorInviteToken) {
    console.error("Uso: node scripts/seed-demo-company.mjs <tokenInvitacionSupervisor>");
    process.exit(1);
  }

  const env = loadEnvLocal();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !apikey) {
    console.error("No se encontraron NEXT_PUBLIC_SUPABASE_URL / ANON_KEY en .env.local");
    process.exit(1);
  }

  const [localPart, domain] = CONFIG.emailBase.split("@");
  const aliasEmail = (role) => `${localPart}+${CONFIG.emailPrefix}_${role}@${domain}`;
  const empleadoEmail = (i) => aliasEmail(`empleado${i}`);

  async function signUp(email, password) {
    const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    // Si ya existe, seguimos — signIn se encarga de darnos el token igual.
    if (!res.ok && !String(data.msg || data.message || "").toLowerCase().includes("already")) {
      throw new Error(`signUp ${email}: ${JSON.stringify(data)}`);
    }
  }

  async function signIn(email, password) {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`signIn ${email}: ${JSON.stringify(data)}`);
    return data.access_token;
  }

  async function signUpAndIn(email, password) {
    await signUp(email, password);
    return signIn(email, password);
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

  async function restGet(pathAndQuery, token) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${pathAndQuery}`, {
      headers: { apikey, Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  console.log(`1. Activando al supervisor de "${CONFIG.orgName}"...`);
  const supervisorEmail = aliasEmail("supervisor");
  const supervisorToken = await signUpAndIn(supervisorEmail, CONFIG.password);
  const orgId = await rpc("accept_member_invite", supervisorToken, {
    p_token: supervisorInviteToken,
  });
  console.log(`   ${supervisorEmail} activo — organization_id ${orgId}`);

  const [department] = await restGet(
    `departments?select=id&organization_id=eq.${orgId}&limit=1`,
    supervisorToken
  );
  if (!department) throw new Error("No se encontró el departamento 'General' de la empresa.");

  console.log(`2. Dando de alta ${CONFIG.employeeCount} empleados...`);
  for (let i = 1; i <= CONFIG.employeeCount; i++) {
    const email = empleadoEmail(i);
    const fullName = `Empleado ${i} — ${CONFIG.orgName}`;
    const inviteToken = await rpc("invite_member", supervisorToken, {
      p_email: email,
      p_full_name: fullName,
      p_department_id: department.id,
    });
    const empToken = await signUpAndIn(email, CONFIG.password);
    await rpc("accept_member_invite", empToken, { p_token: inviteToken });
    console.log(`   ${email} activo`);
  }

  const members = await restGet(
    `members?select=id,email&organization_id=eq.${orgId}`,
    supervisorToken
  );
  const memberIdByEmail = Object.fromEntries(members.map((m) => [m.email, m.id]));

  const subjectEmail = empleadoEmail(CONFIG.subjectIndex);
  const subjectMemberId = memberIdByEmail[subjectEmail];
  const subjectToken = await signIn(subjectEmail, CONFIG.password);

  console.log(`3. Creando el ciclo 360 (participante: ${subjectEmail})...`);
  const opensAt = new Date().toISOString().slice(0, 10);
  const closesAtDate = new Date();
  closesAtDate.setMonth(closesAtDate.getMonth() + 1);
  const closesAt = closesAtDate.toISOString().slice(0, 10);

  const cycleId = await rpc("create_feedback_cycle", supervisorToken, {
    p_name: `360 piloto — ${CONFIG.orgName}`,
    p_opens_at: opensAt,
    p_closes_at: closesAt,
    p_participant_member_ids: [subjectMemberId],
  });
  console.log(`   cycle_id ${cycleId}`);

  console.log("4. Organizando evaluadores (jefe + 3 equipo + 3 empresa + 3 otro)...");
  const evaluatorPlan = [
    { index: CONFIG.managerIndex, category: "manager" },
    ...CONFIG.teamIndices.map((index) => ({ index, category: "team" })),
    ...CONFIG.organizationIndices.map((index) => ({ index, category: "organization" })),
    ...CONFIG.otherIndices.map((index) => ({ index, category: "other" })),
  ];
  const evaluatorMemberIds = evaluatorPlan.map((e) => memberIdByEmail[empleadoEmail(e.index)]);
  const evaluatorCategories = evaluatorPlan.map((e) => e.category);

  const requestId = await rpc("organize_cycle_evaluators", subjectToken, {
    p_cycle_id: cycleId,
    p_evaluator_member_ids: evaluatorMemberIds,
    p_evaluator_categories: evaluatorCategories,
  });
  console.log(`   request_id ${requestId}`);

  const destacaPool = shuffled(DESTACA_POOL);
  const desafioPool = shuffled(DESAFIO_POOL);
  const consejoPool = shuffled(CONSEJO_POOL);

  async function submitFor(token, invitationToken, openTextIndex) {
    const ctx = await rpc("get_responder_context", token, { p_token: invitationToken });
    if (!ctx.valid) throw new Error(`token inválido: ${JSON.stringify(ctx)}`);
    if (ctx.used) return "ya respondido";

    let openSeen = 0;
    const answers = ctx.questions.map((q) => {
      if (q.question_type === "open") {
        const pos = openSeen++;
        const pool = [destacaPool, desafioPool, consejoPool][pos] || destacaPool;
        return { question_id: q.id, answer_text: pool[openTextIndex % pool.length] };
      }
      // scale (incluye las de competencia/saboteador del 360, que aquí
      // son preguntas de escala fijas, no del tipo "competency" a elegir).
      return { question_id: q.id, answer_value: randScale() };
    });

    await rpc("submit_feedback_response", token, { p_token: invitationToken, p_answers: answers });
    return "respondido";
  }

  console.log("5. Respondiendo como los 10 evaluadores...");
  for (let i = 0; i < evaluatorPlan.length; i++) {
    const { index, category } = evaluatorPlan[i];
    const email = empleadoEmail(index);
    const token = await signIn(email, CONFIG.password);
    const pending = await rpc("get_my_pending_invitations", token, {});
    const invite = pending.find((p) => p.requester_member_id === subjectMemberId);
    if (!invite) {
      console.log(`   (!) ${email}: sin invitación pendiente`);
      continue;
    }
    const result = await submitFor(token, invite.token, i);
    console.log(`   ${email} (${category}) -> ${result}`);
  }

  console.log(`6. Autoevaluación de ${subjectEmail}...`);
  const pendingSelf = await rpc("get_my_pending_invitations", subjectToken, {});
  const selfInvite = pendingSelf.find((p) => p.evaluator_category === "self");
  if (selfInvite) {
    const result = await submitFor(subjectToken, selfInvite.token, 0);
    console.log(`   autoevaluación -> ${result}`);
  } else {
    console.log("   (!) sin autoevaluación pendiente");
  }

  const progress = await rpc("get_feedback_request_progress", subjectToken, {
    p_request_id: requestId,
  });
  console.log("7. Progreso:", progress);

  if (CONFIG.closeAtEnd) {
    console.log("8. Cerrando el 360...");
    await rpc("close_cycle_request", subjectToken, { p_request_id: requestId });
    console.log("   cerrado");
  } else {
    console.log("8. Se deja abierto (revelado, listo para 'Finalizar informe' desde la app).");
  }

  console.log(
    `\nListo — /dashboard/feedback/${requestId} (login ${subjectEmail} / ${CONFIG.password})`
  );
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});

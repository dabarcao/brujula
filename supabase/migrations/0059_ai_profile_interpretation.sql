-- Brújula — hueco para la interpretación del perfil 360 por IA (Anthropic,
-- sección 17 del spec). Se guarda en la propia solicitud en vez de
-- recalcularse en cada visita: evita coste de llamada a la API en cada
-- vista y, sobre todo, evita que la misma persona reciba una
-- interpretación distinta cada vez que entra (rompería la confianza en
-- el informe). `generated_at` queda para cuando se decida la regla de
-- regeneración (candidato: solo una vez el informe pasa a "definitivo",
-- sección 4.1 — no tiene sentido gastar una llamada interpretando un
-- perfil que todavía puede cambiar).
--
-- Esta migración solo añade las columnas — todavía no hay ninguna
-- función ni lógica que las rellene automáticamente. De momento se
-- rellenan a mano (ver 0060 o el propio SQL Editor) para poder ver cómo
-- queda el informe antes de conectar con la API real.

alter table feedback_requests add column ai_interpretation text;
alter table feedback_requests add column ai_interpretation_generated_at timestamptz;

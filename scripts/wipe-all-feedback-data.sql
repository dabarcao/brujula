-- Brújula — borra TODO el feedback ya dado en toda la plataforma (todas
-- las empresas y cuentas individuales), para poder pasar al nuevo modelo
-- de competencias (16 en vez de 15) sin informes viejos colgando de
-- competencias que van a desaparecer. NO toca organizaciones, miembros,
-- ni la configuración de la plataforma — solo las solicitudes de
-- feedback, sus respuestas, los ciclos y los informes de grupo.
--
-- Ejecutar ANTES de la migración 0071 (el cambio de modelo) — esa
-- migración borra y recrea las preguntas de default_360_cycle, y
-- survey_questions no se puede borrar mientras haya feedback_answers
-- que la referencien.
--
-- Irreversible. Ejecutar a mano en el SQL Editor de Supabase.

delete from feedback_answers;
delete from feedback_responses;
delete from feedback_invitations;
delete from feedback_requests;
delete from feedback_cycle_participants;
delete from feedback_cycles;
delete from report_group_members;
delete from report_groups;

-- Plantillas clonadas por cada ciclo de empresa (create_feedback_cycle,
-- una por ciclo, código 'cycle_...') — ya huérfanas tras borrar
-- feedback_requests y feedback_cycles. Sus preguntas se borran solas
-- (survey_questions.template_id tiene on delete cascade).
delete from survey_templates where code like 'cycle_%';

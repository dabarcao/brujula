-- Brújula — tipos de solicitud ágil, cada uno con su propia plantilla
-- guiada. El tipo "general" reutiliza la plantilla ya existente
-- (default_open_feedback); los otros tres son nuevos.

alter table feedback_requests
  add column subtype text check (subtype in ('meeting', 'collaboration', 'leadership_initiative', 'general'));

update feedback_requests set subtype = 'general' where request_type = 'ad_hoc';

insert into survey_templates (code, name) values
  ('ad_hoc_meeting', 'Feedback de reunión/presentación'),
  ('ad_hoc_collaboration', 'Feedback de colaboración'),
  ('ad_hoc_leadership_initiative', 'Feedback de liderazgo de iniciativa');

insert into survey_questions (template_id, position, prompt, question_type, required)
select t.id, v.position, v.prompt, 'open', v.required
from survey_templates t
cross join (values
  (1, '¿Qué es lo que más te ha gustado o funcionado de la reunión o presentación?', true),
  (2, '¿Qué parte te ha costado más seguir o entender?', true),
  (3, '¿Qué cambiarías para la próxima vez?', true),
  (4, '¿El objetivo de la reunión o presentación ha quedado claro? ¿Por qué?', true),
  (5, '¿Algo más que quieras añadir?', false)
) as v(position, prompt, required)
where t.code = 'ad_hoc_meeting';

insert into survey_questions (template_id, position, prompt, question_type, required)
select t.id, v.position, v.prompt, 'open', v.required
from survey_templates t
cross join (values
  (1, '¿Qué ha funcionado bien en la colaboración con esta persona?', true),
  (2, '¿Qué dificultad has encontrado al trabajar con ella?', true),
  (3, '¿Qué te gustaría que mantuviera en futuras colaboraciones?', true),
  (4, '¿Qué podría mejorar para que trabajar juntos sea más fácil?', true),
  (5, '¿Algo más que quieras añadir?', false)
) as v(position, prompt, required)
where t.code = 'ad_hoc_collaboration';

insert into survey_questions (template_id, position, prompt, question_type, required)
select t.id, v.position, v.prompt, 'open', v.required
from survey_templates t
cross join (values
  (1, '¿Qué ha hecho bien esta persona liderando la iniciativa?', true),
  (2, '¿En qué momento crees que su liderazgo podría haber sido más efectivo?', true),
  (3, '¿Qué te gustaría que siguiera haciendo como líder de iniciativas?', true),
  (4, '¿Qué le ayudaría a liderar mejor la próxima vez?', true),
  (5, '¿Algo más que quieras añadir?', false)
) as v(position, prompt, required)
where t.code = 'ad_hoc_leadership_initiative';

-- ============================================================
-- create_ad_hoc_feedback_request — ahora recibe el tipo y elige la
-- plantilla correspondiente. Cambia de firma (añade p_subtype), hay que
-- borrar la versión de un solo parámetro de la migración 0011 primero.
-- ============================================================
drop function if exists create_ad_hoc_feedback_request(uuid[]);

create or replace function create_ad_hoc_feedback_request(
  p_invitee_member_ids uuid[],
  p_subtype text default 'general'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  min_invitees integer;
  chosen_template_id uuid;
  new_request_id uuid;
  invitee_id uuid;
  invitee_count integer;
  template_code text;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como empleado activo para pedir feedback.';
  end if;

  if p_subtype not in ('meeting', 'collaboration', 'leadership_initiative', 'general') then
    raise exception 'Tipo de solicitud no válido.';
  end if;

  if exists (
    select 1 from feedback_requests
    where requester_member_id = caller_member.id
      and request_type = 'ad_hoc'
      and status = 'open'
  ) then
    raise exception 'Ya tienes una solicitud de feedback abierta. Ciérrala o modifícala antes de crear otra.';
  end if;

  invitee_count := coalesce(array_length(p_invitee_member_ids, 1), 0);

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if invitee_count < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  if caller_member.id = any(p_invitee_member_ids) then
    raise exception 'No puedes invitarte a ti mismo.';
  end if;

  if exists (
    select 1
    from unnest(p_invitee_member_ids) as invitee(id)
    left join members m on m.id = invitee.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
  ) then
    raise exception 'Todos los invitados deben ser empleados activos de tu organización.';
  end if;

  template_code := case p_subtype
    when 'meeting' then 'ad_hoc_meeting'
    when 'collaboration' then 'ad_hoc_collaboration'
    when 'leadership_initiative' then 'ad_hoc_leadership_initiative'
    else 'default_open_feedback'
  end;

  select id into chosen_template_id from survey_templates where code = template_code;

  insert into feedback_requests (organization_id, requester_member_id, request_type, subtype, template_id)
  values (caller_member.organization_id, caller_member.id, 'ad_hoc', p_subtype, chosen_template_id)
  returning id into new_request_id;

  foreach invitee_id in array p_invitee_member_ids loop
    insert into feedback_invitations (feedback_request_id, invitee_member_id)
    values (new_request_id, invitee_id);
  end loop;

  return new_request_id;
end;
$$;

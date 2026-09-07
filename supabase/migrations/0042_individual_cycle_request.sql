-- Brújula — una cuenta individual puede pedir un 360 completo (cuestionario
-- de 28 preguntas de escala + autoevaluación) sin depender de que un
-- Supervisor cree un ciclo y la seleccione como participante — no tiene
-- sentido para alguien que no pertenece a ninguna empresa. Se reutiliza
-- el mismo modelo (feedback_requests.request_type = 'cycle', misma
-- plantilla base, mismo informe de comparación autoevaluación vs.
-- media), pero sin fila en feedback_cycles: cycle_id se deja a null, que
-- ya es el caso contemplado en el resto del código ("null = flujo ágil"
-- decía el comentario original, pero cycle_id nulo con request_type =
-- 'cycle' ya se maneja sin romper nada en feedback/[id]/page.tsx). Los
-- evaluadores se invitan por email, igual que en el flujo ágil individual
-- — sin categoría (jefe/equipo/empresa/otro no encaja para alguien sin
-- empresa), así que el desglose por grupo simplemente no aparece para
-- estas solicitudes.

create or replace function create_individual_cycle_request(p_evaluator_emails text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  caller_org organizations;
  min_invitees integer;
  base_template_id uuid;
  new_request_id uuid;
  normalized_emails text[];
  evaluator_email text;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como usuario activo para pedir feedback.';
  end if;

  select * into caller_org from organizations where id = caller_member.organization_id;

  if caller_org.kind <> 'individual' then
    raise exception 'Esta función es solo para cuentas individuales.';
  end if;

  if exists (
    select 1 from feedback_requests
    where requester_member_id = caller_member.id
      and request_type = 'cycle'
      and status = 'open'
  ) then
    raise exception 'Ya tienes un 360 abierto. Espera a que termine antes de pedir otro.';
  end if;

  select array_agg(distinct lower(trim(e))) into normalized_emails
  from unnest(p_evaluator_emails) as e
  where trim(e) <> '';

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if coalesce(array_length(normalized_emails, 1), 0) < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  if exists (
    select 1 from unnest(normalized_emails) as e
    where e !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
  ) then
    raise exception 'Algún email no es válido.';
  end if;

  if lower(trim(caller_member.email)) = any(normalized_emails) then
    raise exception 'No puedes invitarte a ti mismo como evaluador: tu autoevaluación se añade automáticamente.';
  end if;

  select id into base_template_id from survey_templates where code = 'default_360_cycle';

  insert into feedback_requests (organization_id, requester_member_id, cycle_id, request_type, template_id)
  values (caller_member.organization_id, caller_member.id, null, 'cycle', base_template_id)
  returning id into new_request_id;

  foreach evaluator_email in array normalized_emails loop
    insert into feedback_invitations (feedback_request_id, invitee_email)
    values (new_request_id, evaluator_email);
  end loop;

  insert into feedback_invitations (feedback_request_id, invitee_member_id, evaluator_category)
  values (new_request_id, caller_member.id, 'self');

  return new_request_id;
end;
$$;

grant execute on function create_individual_cycle_request(text[]) to authenticated;

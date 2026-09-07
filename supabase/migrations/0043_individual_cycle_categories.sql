-- Brújula — al pedir un 360 como cuenta individual, cada evaluador
-- invitado por email también lleva su categoría (jefe/equipo/empresa/
-- otro), igual que ya podían elegir las empresas. Cambia la firma
-- (se añade el array de categorías), así que hay que borrar la función
-- vieja antes de recrearla.

drop function if exists create_individual_cycle_request(text[]);

create or replace function create_individual_cycle_request(
  p_evaluator_emails text[],
  p_evaluator_categories text[]
)
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
  i integer;
  evaluator_email text;
  category text;
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

  if coalesce(array_length(p_evaluator_emails, 1), 0)
      is distinct from coalesce(array_length(p_evaluator_categories, 1), 0) then
    raise exception 'Datos de evaluadores incompletos.';
  end if;

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if coalesce(array_length(p_evaluator_emails, 1), 0) < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  if exists (
    select 1 from unnest(p_evaluator_emails) as e
    where trim(e) = '' or lower(trim(e)) !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
  ) then
    raise exception 'Algún email no es válido.';
  end if;

  if (
    select count(distinct lower(trim(e))) from unnest(p_evaluator_emails) as e
  ) <> array_length(p_evaluator_emails, 1) then
    raise exception 'Hay un email repetido.';
  end if;

  if exists (
    select 1 from unnest(p_evaluator_emails) as e
    where lower(trim(e)) = lower(trim(caller_member.email))
  ) then
    raise exception 'No puedes invitarte a ti mismo como evaluador: tu autoevaluación se añade automáticamente.';
  end if;

  select id into base_template_id from survey_templates where code = 'default_360_cycle';

  insert into feedback_requests (organization_id, requester_member_id, cycle_id, request_type, template_id)
  values (caller_member.organization_id, caller_member.id, null, 'cycle', base_template_id)
  returning id into new_request_id;

  for i in 1 .. array_length(p_evaluator_emails, 1) loop
    evaluator_email := lower(trim(p_evaluator_emails[i]));
    category := p_evaluator_categories[i];

    if category not in ('manager', 'team', 'organization', 'other') then
      raise exception 'Categoría de evaluador no válida: %', category;
    end if;

    insert into feedback_invitations (feedback_request_id, invitee_email, evaluator_category)
    values (new_request_id, evaluator_email, category);
  end loop;

  insert into feedback_invitations (feedback_request_id, invitee_member_id, evaluator_category)
  values (new_request_id, caller_member.id, 'self');

  return new_request_id;
end;
$$;

grant execute on function create_individual_cycle_request(text[], text[]) to authenticated;

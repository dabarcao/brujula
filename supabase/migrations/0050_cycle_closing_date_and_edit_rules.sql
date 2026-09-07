-- Brújula — un 360 individual no tiene fecha de cierre de ciclo (eso solo
-- existe para empresa, vía feedback_cycles): alguien podría no responder
-- nunca, sin nada que fuerce el cierre del proceso. Se añade una fecha de
-- cierre por solicitud (feedback_requests.closes_at), elegida por la
-- persona al crear su 360 individual, y copiada desde el ciclo para el
-- caso de empresa — así el resto del código lee siempre la misma columna
-- sin distinguir el origen.
--
-- Además, dos reglas de edición nuevas para AMBOS casos (empresa e
-- individual):
-- - Modificar la categoría o quitar a alguien ya invitado: solo mientras
--   nadie haya respondido todavía.
-- - Añadir más evaluadores: siempre posible mientras el proceso no esté
--   cerrado (ni por fecha ni por estar ya al 100%), aunque ya haya
--   respuestas.

alter table feedback_requests add column closes_at date;

-- ============================================================
-- organize_cycle_evaluators — copia la fecha de cierre del ciclo a la
-- propia solicitud al crearla (mismo comportamiento de siempre, ninguna
-- validación nueva aquí).
-- ============================================================
create or replace function organize_cycle_evaluators(
  p_cycle_id uuid,
  p_evaluator_member_ids uuid[],
  p_evaluator_categories text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  cycle feedback_cycles;
  min_invitees integer;
  new_request_id uuid;
  i integer;
  evaluator_id uuid;
  category text;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como empleado activo.';
  end if;

  select * into cycle from feedback_cycles
  where id = p_cycle_id and organization_id = caller_member.organization_id;

  if cycle is null then
    raise exception 'Ciclo no encontrado.';
  end if;

  if not exists (
    select 1 from feedback_cycle_participants
    where cycle_id = p_cycle_id and member_id = caller_member.id
  ) then
    raise exception 'No has sido seleccionado como participante de este ciclo.';
  end if;

  if current_date < cycle.opens_at or current_date > cycle.closes_at then
    raise exception 'El ciclo no está abierto actualmente.';
  end if;

  if exists (
    select 1 from feedback_requests
    where cycle_id = p_cycle_id and requester_member_id = caller_member.id
  ) then
    raise exception 'Ya has organizado tus evaluadores para este ciclo.';
  end if;

  if coalesce(array_length(p_evaluator_member_ids, 1), 0)
      is distinct from coalesce(array_length(p_evaluator_categories, 1), 0) then
    raise exception 'Datos de evaluadores incompletos.';
  end if;

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if coalesce(array_length(p_evaluator_member_ids, 1), 0) < min_invitees then
    raise exception 'Tienes que organizar al menos % evaluadores.', min_invitees;
  end if;

  if caller_member.id = any(p_evaluator_member_ids) then
    raise exception 'No puedes incluirte a ti mismo como evaluador: tu autoevaluación se añade automáticamente.';
  end if;

  if exists (
    select 1
    from unnest(p_evaluator_member_ids) as e(id)
    left join members m on m.id = e.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
       or m.is_supervisor
  ) then
    raise exception 'Todos los evaluadores deben ser empleados activos de tu organización (el Supervisor no puede ser invitado a dar feedback).';
  end if;

  insert into feedback_requests (organization_id, requester_member_id, cycle_id, request_type, template_id, closes_at)
  values (caller_member.organization_id, caller_member.id, p_cycle_id, 'cycle', cycle.template_id, cycle.closes_at)
  returning id into new_request_id;

  for i in 1 .. array_length(p_evaluator_member_ids, 1) loop
    evaluator_id := p_evaluator_member_ids[i];
    category := p_evaluator_categories[i];

    if category not in ('manager', 'team', 'organization', 'other') then
      raise exception 'Categoría de evaluador no válida: %', category;
    end if;

    insert into feedback_invitations (feedback_request_id, invitee_member_id, evaluator_category)
    values (new_request_id, evaluator_id, category);
  end loop;

  insert into feedback_invitations (feedback_request_id, invitee_member_id, evaluator_category)
  values (new_request_id, caller_member.id, 'self');

  return new_request_id;
end;
$$;

-- ============================================================
-- create_individual_cycle_request — añade p_closes_at (obligatoria,
-- tiene que ser una fecha futura). Cambia la firma, hay que borrar la
-- función vieja.
-- ============================================================
drop function if exists create_individual_cycle_request(text[], text[]);

create or replace function create_individual_cycle_request(
  p_evaluator_emails text[],
  p_evaluator_categories text[],
  p_closes_at date
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

  if p_closes_at is null or p_closes_at <= current_date then
    raise exception 'La fecha de cierre tiene que ser una fecha futura.';
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
    raise exception 'No puedes invitarte a ti mismo.';
  end if;

  select id into base_template_id from survey_templates where code = 'default_360_cycle';

  insert into feedback_requests (organization_id, requester_member_id, cycle_id, request_type, template_id, closes_at)
  values (caller_member.organization_id, caller_member.id, null, 'cycle', base_template_id, p_closes_at)
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

grant execute on function create_individual_cycle_request(text[], text[], date) to authenticated;

-- ============================================================
-- update_cycle_request_evaluators (empresa) — antes bloqueaba toda
-- edición en cuanto había una respuesta. Ahora: sin respuestas, edición
-- completa (como antes); con respuestas, solo se pueden AÑADIR nuevos
-- evaluadores (nunca quitar ni cambiar los que ya estaban), y solo si el
-- proceso no ha cerrado por fecha.
-- ============================================================
create or replace function update_cycle_request_evaluators(
  p_request_id uuid,
  p_evaluator_member_ids uuid[],
  p_evaluator_categories text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  req feedback_requests;
  min_invitees integer;
  total_response_count integer;
  i integer;
  evaluator_id uuid;
  category text;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into req from feedback_requests where id = p_request_id;

  if req is null or req.requester_member_id <> caller_member.id then
    raise exception 'Solicitud no encontrada.';
  end if;

  if req.request_type <> 'cycle' then
    raise exception 'Solo se pueden modificar solicitudes de un ciclo 360.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  if req.closes_at is not null and current_date > req.closes_at then
    raise exception 'El proceso ya ha cerrado, no se puede modificar.';
  end if;

  if coalesce(array_length(p_evaluator_member_ids, 1), 0)
      is distinct from coalesce(array_length(p_evaluator_categories, 1), 0) then
    raise exception 'Datos de evaluadores incompletos.';
  end if;

  if caller_member.id = any(p_evaluator_member_ids) then
    raise exception 'No puedes incluirte a ti mismo como evaluador: tu autoevaluación ya está incluida aparte.';
  end if;

  if exists (
    select 1
    from unnest(p_evaluator_member_ids) as e(id)
    left join members m on m.id = e.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
       or m.is_supervisor
  ) then
    raise exception 'Todos los evaluadores deben ser empleados activos de tu organización (el Supervisor no puede ser invitado a dar feedback).';
  end if;

  select count(*)::integer into total_response_count
  from feedback_responses where feedback_request_id = p_request_id;

  if total_response_count = 0 then
    select coalesce(
      (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
      (select min_invitees_per_request from platform_settings where organization_id is null),
      5
    ) into min_invitees;

    if coalesce(array_length(p_evaluator_member_ids, 1), 0) < min_invitees then
      raise exception 'Tienes que organizar al menos % evaluadores.', min_invitees;
    end if;

    delete from feedback_invitations
    where feedback_request_id = p_request_id and evaluator_category <> 'self';

    for i in 1 .. array_length(p_evaluator_member_ids, 1) loop
      evaluator_id := p_evaluator_member_ids[i];
      category := p_evaluator_categories[i];

      if category not in ('manager', 'team', 'organization', 'other') then
        raise exception 'Categoría de evaluador no válida: %', category;
      end if;

      insert into feedback_invitations (feedback_request_id, invitee_member_id, evaluator_category)
      values (p_request_id, evaluator_id, category);
    end loop;
  else
    -- ya hay respuestas: solo se añaden los que todavía no estuvieran
    for i in 1 .. coalesce(array_length(p_evaluator_member_ids, 1), 0) loop
      evaluator_id := p_evaluator_member_ids[i];
      category := p_evaluator_categories[i];

      if category not in ('manager', 'team', 'organization', 'other') then
        raise exception 'Categoría de evaluador no válida: %', category;
      end if;

      if not exists (
        select 1 from feedback_invitations
        where feedback_request_id = p_request_id and invitee_member_id = evaluator_id
      ) then
        insert into feedback_invitations (feedback_request_id, invitee_member_id, evaluator_category)
        values (p_request_id, evaluator_id, category);
      end if;
    end loop;
  end if;
end;
$$;

-- ============================================================
-- update_individual_cycle_request_evaluators — misma lógica que la de
-- arriba, pero por email (cuentas individuales). Nueva función.
-- ============================================================
create or replace function update_individual_cycle_request_evaluators(
  p_request_id uuid,
  p_evaluator_emails text[],
  p_evaluator_categories text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  caller_org organizations;
  req feedback_requests;
  min_invitees integer;
  total_response_count integer;
  i integer;
  evaluator_email text;
  category text;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into caller_org from organizations where id = caller_member.organization_id;

  if caller_org.kind <> 'individual' then
    raise exception 'Esta función es solo para cuentas individuales.';
  end if;

  select * into req from feedback_requests where id = p_request_id;

  if req is null or req.requester_member_id <> caller_member.id then
    raise exception 'Solicitud no encontrada.';
  end if;

  if req.request_type <> 'cycle' then
    raise exception 'Solo se pueden modificar solicitudes de un 360.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  if req.closes_at is not null and current_date > req.closes_at then
    raise exception 'El proceso ya ha cerrado, no se puede modificar.';
  end if;

  if coalesce(array_length(p_evaluator_emails, 1), 0)
      is distinct from coalesce(array_length(p_evaluator_categories, 1), 0) then
    raise exception 'Datos de evaluadores incompletos.';
  end if;

  if exists (
    select 1 from unnest(p_evaluator_emails) as e
    where trim(e) = '' or lower(trim(e)) !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
  ) then
    raise exception 'Algún email no es válido.';
  end if;

  if (
    select count(distinct lower(trim(e))) from unnest(p_evaluator_emails) as e
  ) <> coalesce(array_length(p_evaluator_emails, 1), 0) then
    raise exception 'Hay un email repetido.';
  end if;

  if exists (
    select 1 from unnest(p_evaluator_emails) as e
    where lower(trim(e)) = lower(trim(caller_member.email))
  ) then
    raise exception 'No puedes invitarte a ti mismo como evaluador: tu autoevaluación ya está incluida aparte.';
  end if;

  select count(*)::integer into total_response_count
  from feedback_responses where feedback_request_id = p_request_id;

  if total_response_count = 0 then
    select coalesce(
      (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
      (select min_invitees_per_request from platform_settings where organization_id is null),
      5
    ) into min_invitees;

    if coalesce(array_length(p_evaluator_emails, 1), 0) < min_invitees then
      raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
    end if;

    delete from feedback_invitations
    where feedback_request_id = p_request_id and evaluator_category <> 'self';

    for i in 1 .. array_length(p_evaluator_emails, 1) loop
      evaluator_email := lower(trim(p_evaluator_emails[i]));
      category := p_evaluator_categories[i];

      if category not in ('manager', 'team', 'organization', 'other') then
        raise exception 'Categoría de evaluador no válida: %', category;
      end if;

      insert into feedback_invitations (feedback_request_id, invitee_email, evaluator_category)
      values (p_request_id, evaluator_email, category);
    end loop;
  else
    for i in 1 .. coalesce(array_length(p_evaluator_emails, 1), 0) loop
      evaluator_email := lower(trim(p_evaluator_emails[i]));
      category := p_evaluator_categories[i];

      if category not in ('manager', 'team', 'organization', 'other') then
        raise exception 'Categoría de evaluador no válida: %', category;
      end if;

      if not exists (
        select 1 from feedback_invitations
        where feedback_request_id = p_request_id and invitee_email = evaluator_email
      ) then
        insert into feedback_invitations (feedback_request_id, invitee_email, evaluator_category)
        values (p_request_id, evaluator_email, category);
      end if;
    end loop;
  end if;
end;
$$;

grant execute on function update_individual_cycle_request_evaluators(uuid, text[], text[]) to authenticated;

-- ============================================================
-- get_feedback_request_progress — para un ciclo 360, "revelado" ahora
-- exige además haber completado el 80% o más de las respuestas
-- (autoevaluación incluida), no solo el mínimo de 3 — para no estar
-- mostrando el informe moviéndose constantemente con muy pocos datos.
-- El mínimo de 3 en sí no cambia, sigue siendo el suelo de anonimato.
-- ============================================================
create or replace function get_feedback_request_progress(p_request_id uuid)
returns table (response_count integer, threshold integer, revealed boolean, self_responded boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  req feedback_requests;
  peer_count_val integer;
  self_responded_val boolean;
  threshold_val integer;
  total_invitees_val integer;
  completed_ratio numeric;
  revealed_val boolean;
begin
  select * into req from feedback_requests where id = p_request_id;

  if req is null then
    raise exception 'Solicitud no encontrada.';
  end if;

  if not exists (
    select 1 from members where id = req.requester_member_id and auth_user_id = auth.uid()
  ) then
    raise exception 'No tienes acceso a esta solicitud.';
  end if;

  select count(*)::integer into peer_count_val
  from feedback_responses
  where feedback_request_id = p_request_id and is_self = false;

  select exists(
    select 1 from feedback_responses
    where feedback_request_id = p_request_id and is_self = true
  ) into self_responded_val;

  select coalesce(
    (select min_responses_to_reveal from platform_settings where organization_id = req.organization_id),
    (select min_responses_to_reveal from platform_settings where organization_id is null),
    3
  ) into threshold_val;

  if req.request_type = 'cycle' then
    select count(*)::integer into total_invitees_val
    from feedback_invitations where feedback_request_id = p_request_id;

    completed_ratio := case
      when total_invitees_val > 0
      then (peer_count_val + case when self_responded_val then 1 else 0 end)::numeric / total_invitees_val
      else 0
    end;

    revealed_val := peer_count_val >= threshold_val
      and self_responded_val
      and completed_ratio >= 0.8;
  else
    revealed_val := peer_count_val >= threshold_val;
  end if;

  return query select peer_count_val, threshold_val, revealed_val, self_responded_val;
end;
$$;

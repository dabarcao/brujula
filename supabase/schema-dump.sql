--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: accept_member_invite(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_member_invite(p_token uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  target members;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para aceptar la invitación.';
  end if;

  select * into target from members where invite_token = p_token and status = 'invited';

  if target is null then
    raise exception 'Invitación no válida o ya utilizada.';
  end if;

  if lower(target.email) <> lower(auth.email()) then
    raise exception 'Esta invitación fue enviada a otro email.';
  end if;

  update members
    set auth_user_id = auth.uid(), status = 'active', accepted_at = now()
    where id = target.id;

  update feedback_invitations
    set invitee_member_id = target.id
    where lower(invitee_email) = lower(target.email)
      and invitee_member_id is null
      and used_at is null;

  return target.organization_id;
end;
$$;


--
-- Name: auth_member_organization_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_member_organization_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select organization_id from members where auth_user_id = auth.uid();
$$;


--
-- Name: cancel_ad_hoc_feedback_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_ad_hoc_feedback_request(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  req feedback_requests;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into req from feedback_requests where id = p_request_id;

  if req is null or req.requester_member_id <> caller_member.id then
    raise exception 'Solicitud no encontrada.';
  end if;

  if req.request_type <> 'ad_hoc' then
    raise exception 'Solo se pueden cancelar solicitudes del flujo ágil.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  if feedback_response_count(p_request_id) > 0 then
    raise exception 'No se puede cancelar: ya hay respuestas.';
  end if;

  update feedback_requests set status = 'closed' where id = p_request_id;
end;
$$;


--
-- Name: claim_pending_email_invitations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_pending_email_invitations() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null then
    return;
  end if;

  update feedback_invitations
  set invitee_member_id = caller_member.id
  where lower(invitee_email) = lower(caller_member.email)
    and invitee_member_id is null
    and used_at is null;
end;
$$;


--
-- Name: close_ad_hoc_feedback_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_ad_hoc_feedback_request(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  req feedback_requests;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into req from feedback_requests where id = p_request_id;

  if req is null or req.requester_member_id <> caller_member.id then
    raise exception 'Solicitud no encontrada.';
  end if;

  if req.request_type <> 'ad_hoc' then
    raise exception 'Solo se pueden cerrar solicitudes del flujo ágil.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  update feedback_requests set status = 'closed' where id = p_request_id;
end;
$$;


--
-- Name: close_cycle_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_cycle_request(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  req feedback_requests;
  is_revealed boolean;
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
    raise exception 'Esta función es solo para ciclos 360.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  select revealed into is_revealed from get_feedback_request_progress(p_request_id);
  if not is_revealed then
    raise exception 'Todavía no se puede finalizar: hace falta llegar al mínimo de respuestas y tu propia autoevaluación.';
  end if;

  update feedback_requests
  set status = 'closed', closes_at = current_date
  where id = p_request_id;
end;
$$;


--
-- Name: close_report_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_report_group(p_group_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  grp report_groups;
  accepted_count integer;
  min_needed integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into grp from report_groups where id = p_group_id;
  if grp is null then
    raise exception 'Grupo no encontrado.';
  end if;

  if grp.status <> 'open' then
    raise exception 'Este grupo ya está cerrado.';
  end if;

  if not exists (
    select 1 from report_group_members
    where group_id = p_group_id and member_id = caller_member.id and status = 'accepted'
  ) then
    raise exception 'Solo alguien que haya aceptado formar parte del grupo puede cerrarlo.';
  end if;

  select count(*) into accepted_count
  from report_group_members
  where group_id = p_group_id and status = 'accepted';

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = grp.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_needed;

  if accepted_count < min_needed then
    raise exception 'Hacen falta al menos % personas aceptadas para cerrar el grupo.', min_needed;
  end if;

  update report_groups set status = 'closed', closed_at = now() where id = p_group_id;
end;
$$;


--
-- Name: create_ad_hoc_feedback_request(uuid[], text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_ad_hoc_feedback_request(p_invitee_member_ids uuid[], p_subtype text DEFAULT 'general'::text, p_name text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  min_invitees integer;
  chosen_template_id uuid;
  new_request_id uuid;
  invitee_id uuid;
  invitee_count integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como empleado activo para pedir feedback.';
  end if;

  if p_subtype not in ('meeting', 'collaboration', 'leadership_initiative', 'general', 'competencias') then
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
       or m.is_supervisor
  ) then
    raise exception 'Todos los invitados deben ser empleados activos de tu organización (el Supervisor no puede ser invitado a dar feedback).';
  end if;

  select id into chosen_template_id
  from survey_templates
  where subtype = p_subtype and organization_id = caller_member.organization_id
  limit 1;

  if chosen_template_id is null then
    select id into chosen_template_id
    from survey_templates
    where subtype = p_subtype and organization_id is null
    limit 1;
  end if;

  insert into feedback_requests (organization_id, requester_member_id, request_type, subtype, template_id, name)
  values (caller_member.organization_id, caller_member.id, 'ad_hoc', p_subtype, chosen_template_id, nullif(trim(p_name), ''))
  returning id into new_request_id;

  foreach invitee_id in array p_invitee_member_ids loop
    insert into feedback_invitations (feedback_request_id, invitee_member_id)
    values (new_request_id, invitee_id);
  end loop;

  return new_request_id;
end;
$$;


--
-- Name: create_ad_hoc_feedback_request_for_individual(text[], text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_ad_hoc_feedback_request_for_individual(p_invitee_emails text[], p_subtype text DEFAULT 'general'::text, p_name text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  caller_member members;
  caller_org organizations;
  min_invitees integer;
  chosen_template_id uuid;
  new_request_id uuid;
  normalized_emails text[];
  invitee_email text;
  invitee_count integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como usuario activo para pedir feedback.';
  end if;

  select * into caller_org from organizations where id = caller_member.organization_id;

  if caller_org.kind <> 'individual' then
    raise exception 'Esta función es solo para cuentas individuales.';
  end if;

  if p_subtype not in ('meeting', 'collaboration', 'leadership_initiative', 'general', 'competencias') then
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

  select array_agg(distinct lower(trim(e))) into normalized_emails
  from unnest(p_invitee_emails) as e
  where trim(e) <> '';

  invitee_count := coalesce(array_length(normalized_emails, 1), 0);

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if invitee_count < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  if exists (
    select 1 from unnest(normalized_emails) as e
    where e !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
  ) then
    raise exception 'Algún email no es válido.';
  end if;

  if lower(trim(caller_member.email)) = any(normalized_emails) then
    raise exception 'No puedes invitarte a ti mismo.';
  end if;

  select id into chosen_template_id
  from survey_templates
  where subtype = p_subtype and organization_id is null
  limit 1;

  insert into feedback_requests (organization_id, requester_member_id, request_type, subtype, template_id, name)
  values (caller_member.organization_id, caller_member.id, 'ad_hoc', p_subtype, chosen_template_id, nullif(trim(p_name), ''))
  returning id into new_request_id;

  foreach invitee_email in array normalized_emails loop
    insert into feedback_invitations (feedback_request_id, invitee_email)
    values (new_request_id, invitee_email);
  end loop;

  return new_request_id;
end;
$_$;


--
-- Name: create_department(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_department(p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  new_department_id uuid;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or not caller_member.is_supervisor then
    raise exception 'Solo un administrador puede crear departamentos.';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'El nombre del departamento es obligatorio.';
  end if;

  insert into departments (organization_id, name)
  values (caller_member.organization_id, trim(p_name))
  returning id into new_department_id;

  return new_department_id;
end;
$$;


--
-- Name: create_feedback_cycle(text, date, date, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_feedback_cycle(p_name text, p_opens_at date, p_closes_at date, p_participant_member_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  base_template_id uuid;
  extra_template_id uuid;
  cycle_template_id uuid;
  new_cycle_id uuid;
  q record;
  pos integer := 0;
  conflicting_names text;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or not caller_member.is_supervisor then
    raise exception 'Solo un administrador puede crear un ciclo 360.';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'El nombre del ciclo es obligatorio.';
  end if;

  if p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at then
    raise exception 'Las fechas del ciclo no son válidas.';
  end if;

  if coalesce(array_length(p_participant_member_ids, 1), 0) = 0 then
    raise exception 'Selecciona al menos un participante para el ciclo.';
  end if;

  if exists (
    select 1
    from unnest(p_participant_member_ids) as p(id)
    left join members m on m.id = p.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
  ) then
    raise exception 'Todos los participantes deben ser empleados activos de tu organización.';
  end if;

  -- Un mismo empleado no puede quedar metido en dos ciclos 360 abiertos a
  -- la vez, aunque la empresa sí pueda tener varios ciclos simultáneos
  -- con participantes distintos.
  select string_agg(distinct coalesce(m.full_name, m.email), ', ')
  into conflicting_names
  from feedback_cycle_participants fcp
  join feedback_cycles fc on fc.id = fcp.cycle_id
  join members m on m.id = fcp.member_id
  where fcp.member_id = any(p_participant_member_ids)
    and fc.organization_id = caller_member.organization_id
    and fc.closes_at >= current_date;

  if conflicting_names is not null then
    raise exception 'Ya tienen un ciclo 360 abierto, no se les puede incluir en otro hasta que termine: %', conflicting_names;
  end if;

  select id into base_template_id from survey_templates where code = 'default_360_cycle';

  select id into extra_template_id
  from survey_templates
  where organization_id = caller_member.organization_id and subtype = '360_extra';

  insert into survey_templates (code, name, organization_id)
  values ('cycle_' || gen_random_uuid()::text, trim(p_name), caller_member.organization_id)
  returning id into cycle_template_id;

  for q in
    select position, prompt, question_type, required, competency_code, applies_to
    from survey_questions
    where template_id = base_template_id
    order by position
  loop
    pos := pos + 1;
    insert into survey_questions (template_id, position, prompt, question_type, required, competency_code, applies_to)
    values (cycle_template_id, pos, q.prompt, q.question_type, q.required, q.competency_code, q.applies_to);
  end loop;

  if extra_template_id is not null then
    for q in
      select prompt, question_type, required
      from survey_questions
      where template_id = extra_template_id
      order by position
    loop
      pos := pos + 1;
      insert into survey_questions (template_id, position, prompt, question_type, required, applies_to)
      values (cycle_template_id, pos, q.prompt, q.question_type, q.required, 'all');
    end loop;
  end if;

  insert into feedback_cycles (organization_id, name, opens_at, closes_at, template_id)
  values (caller_member.organization_id, trim(p_name), p_opens_at, p_closes_at, cycle_template_id)
  returning id into new_cycle_id;

  insert into feedback_cycle_participants (cycle_id, member_id)
  select new_cycle_id, unnest(p_participant_member_ids);

  return new_cycle_id;
end;
$$;


--
-- Name: create_individual_account(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_individual_account(p_full_name text, p_email text) RETURNS TABLE(member_id uuid, organization_id uuid, organization_name text, organization_kind text, is_supervisor boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  new_org_id uuid;
  new_org_name text;
  default_department_id uuid;
  new_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if exists (select 1 from members where auth_user_id = auth.uid()) then
    raise exception 'Ya tienes una cuenta asociada.';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'No se pudo determinar tu email.';
  end if;

  new_org_name := coalesce(nullif(trim(p_full_name), ''), p_email);

  insert into organizations (name, kind)
  values (new_org_name, 'individual')
  returning id into new_org_id;

  insert into departments (organization_id, name)
  values (new_org_id, 'General')
  returning id into default_department_id;

  insert into members (
    organization_id, auth_user_id, email, full_name, is_supervisor, status, department_id
  )
  values (
    new_org_id,
    auth.uid(),
    p_email,
    nullif(trim(p_full_name), ''),
    true,
    'active',
    default_department_id
  )
  returning id into new_member_id;

  update feedback_invitations
    set invitee_member_id = new_member_id
    where lower(invitee_email) = lower(p_email)
      and invitee_member_id is null
      and used_at is null;

  return query select new_member_id, new_org_id, new_org_name, 'individual'::text, true;
end;
$$;


--
-- Name: create_individual_cycle_request(text[], text[], date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_individual_cycle_request(p_evaluator_emails text[], p_evaluator_categories text[], p_closes_at date, p_name text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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

  insert into feedback_requests (organization_id, requester_member_id, cycle_id, request_type, template_id, closes_at, name)
  values (caller_member.organization_id, caller_member.id, null, 'cycle', base_template_id, p_closes_at, nullif(trim(p_name), ''))
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
$_$;


--
-- Name: create_org_ad_hoc_template(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_org_ad_hoc_template(p_subtype text, p_name text, p_questions jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'Los cuestionarios los gestiona el administrador de la plataforma, no cada empresa.';
end;
$$;


--
-- Name: create_organization_and_admin(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_organization_and_admin(org_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'El alta de empresas ya no es autoservicio. Solo el administrador de la plataforma puede crear empresas nuevas.';
end;
$$;


--
-- Name: create_organization_as_admin(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_organization_as_admin(p_org_name text, p_admin_email text, p_admin_full_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  new_org_id uuid;
  default_department_id uuid;
  new_token uuid;
begin
  if not is_platform_admin() then
    raise exception 'Solo el administrador de la plataforma puede crear empresas.';
  end if;

  if p_org_name is null or trim(p_org_name) = '' then
    raise exception 'El nombre de la empresa es obligatorio.';
  end if;

  if p_admin_email is null or trim(p_admin_email) = '' then
    raise exception 'El email del primer administrador es obligatorio.';
  end if;

  insert into organizations (name) values (trim(p_org_name))
    returning id into new_org_id;

  insert into departments (organization_id, name)
  values (new_org_id, 'General')
  returning id into default_department_id;

  insert into members (
    organization_id, email, full_name, role, status, department_id, is_supervisor
  )
  values (
    new_org_id,
    lower(trim(p_admin_email)),
    nullif(trim(coalesce(p_admin_full_name, '')), ''),
    'member',
    'invited',
    default_department_id,
    true
  )
  returning invite_token into new_token;

  return new_token;
end;
$$;


--
-- Name: create_report_group(text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_report_group(p_name text, p_member_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  caller_org organizations;
  new_group_id uuid;
  member_id uuid;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como empleado activo.';
  end if;

  select * into caller_org from organizations where id = caller_member.organization_id;
  if caller_org.kind <> 'company' then
    raise exception 'Los informes de grupo son solo para empresas.';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'El grupo necesita un nombre.';
  end if;

  if coalesce(array_length(p_member_ids, 1), 0) = 0 then
    raise exception 'Elige al menos a una persona.';
  end if;

  if exists (
    select 1
    from unnest(p_member_ids) as invitee(id)
    left join members m on m.id = invitee.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
       or not exists (
         select 1 from feedback_requests fr
         where fr.requester_member_id = m.id
           and fr.request_type = 'cycle'
           and fr.status = 'closed'
       )
  ) then
    raise exception 'Todos los invitados deben ser compañeros activos de tu empresa con al menos un 360 ya finalizado.';
  end if;

  insert into report_groups (organization_id, created_by_member_id, name)
  values (caller_member.organization_id, caller_member.id, trim(p_name))
  returning id into new_group_id;

  foreach member_id in array p_member_ids loop
    insert into report_group_members (group_id, member_id)
    values (new_group_id, member_id);
  end loop;

  return new_group_id;
end;
$$;


--
-- Name: delete_org_ad_hoc_template(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_org_ad_hoc_template(p_subtype text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'Los cuestionarios los gestiona el administrador de la plataforma, no cada empresa.';
end;
$$;


--
-- Name: feedback_response_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedback_response_count(p_request_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)::integer
  from feedback_responses
  where feedback_request_id = p_request_id and not is_self;
$$;


--
-- Name: get_colleagues_with_closed_cycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_colleagues_with_closed_cycle() RETURNS TABLE(id uuid, email text, full_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  return query
  select m.id, m.email, m.full_name
  from members m
  where m.organization_id = caller_member.organization_id
    and m.status = 'active'
    and m.id <> caller_member.id
    and exists (
      select 1 from feedback_requests fr
      where fr.requester_member_id = m.id
        and fr.request_type = 'cycle'
        and fr.status = 'closed'
    )
  order by m.email;
end;
$$;


--
-- Name: get_cycle_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_cycle_status(p_cycle_id uuid) RETURNS TABLE(member_id uuid, full_name text, email text, status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  cycle feedback_cycles;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or not caller_member.is_supervisor then
    raise exception 'Solo el administrador de la empresa puede ver el estado de un ciclo.';
  end if;

  select * into cycle from feedback_cycles where id = p_cycle_id;

  if cycle is null or cycle.organization_id <> caller_member.organization_id then
    raise exception 'Ciclo no encontrado.';
  end if;

  return query
  select
    m.id,
    m.full_name,
    m.email,
    case
      when fr.id is null then 'no_iniciado'
      when (
        fr.status = 'closed'
        or feedback_response_count(fr.id) >= (
          select count(*) from feedback_invitations where feedback_request_id = fr.id
        )
        or cycle.closes_at < current_date
      ) then 'completado'
      else 'en_progreso'
    end
  from feedback_cycle_participants fcp
  join members m on m.id = fcp.member_id
  left join feedback_requests fr
    on fr.cycle_id = fcp.cycle_id and fr.requester_member_id = fcp.member_id
  where fcp.cycle_id = p_cycle_id
  order by m.email;
end;
$$;


--
-- Name: get_feedback_request_progress(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_feedback_request_progress(p_request_id uuid) RETURNS TABLE(response_count integer, threshold integer, revealed boolean, self_responded boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: get_invite_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_invite_details(p_token uuid) RETURNS TABLE(organization_name text, email text, full_name text, valid boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select o.name, m.email, m.full_name, (m.status = 'invited')
  from members m
  join organizations o on o.id = m.organization_id
  where m.invite_token = p_token
  limit 1;
$$;


--
-- Name: get_my_competency_map(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_competency_map() RETURNS TABLE(competency_code text, base_value numeric, mention_delta integer, last_cycle_closed_at date)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  last_cycle_id uuid;
  last_closed_at date;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select fr.id, fr.closes_at
    into last_cycle_id, last_closed_at
  from feedback_requests fr
  where fr.requester_member_id = caller_member.id
    and fr.request_type = 'cycle'
    and fr.status = 'closed'
  order by fr.closes_at desc nulls last, fr.created_at desc
  limit 1;

  if last_cycle_id is null then
    return;
  end if;

  return query
  with base as (
    select
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      avg(fa.answer_value) as avgv
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id = last_cycle_id
      and fresp.is_self = false
      and fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
    group by coalesce(fa.competency_code, sq.competency_code)
  ),
  mentions as (
    select
      fa.competency_code as ccode,
      sum(case
        when sq.position = 1 then 1
        when sq.position in (2, 3) then -1
        else 0
      end) as delta
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    join feedback_requests fr on fr.id = fresp.feedback_request_id
    where fr.requester_member_id = caller_member.id
      and fr.request_type = 'ad_hoc'
      and sq.question_type = 'competency'
      and fa.competency_code is not null
      and fr.created_at::date >= last_closed_at
      and feedback_response_count(fr.id) >= coalesce(
        (select min_responses_to_reveal from platform_settings where organization_id = fr.organization_id),
        (select min_responses_to_reveal from platform_settings where organization_id is null),
        3
      )
    group by fa.competency_code
  )
  select
    cf.code,
    round(base.avgv, 2),
    coalesce(mentions.delta, 0)::integer,
    last_closed_at
  from competency_frameworks cf
  left join base on base.ccode = cf.code
  left join mentions on mentions.ccode = cf.code;
end;
$$;


--
-- Name: get_my_competency_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_competency_summary() RETURNS TABLE(competency_code text, competency_name text, principle_code text, principle_name text, role_code text, role_name text, avg_value numeric, response_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  return query
  with eligible_requests as (
    select fr.id
    from feedback_requests fr
    where fr.requester_member_id = caller_member.id
      and feedback_response_count(fr.id) >= coalesce(
        (select min_responses_to_reveal from platform_settings where organization_id = fr.organization_id),
        (select min_responses_to_reveal from platform_settings where organization_id is null),
        3
      )
  ),
  scores as (
    select
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      fa.answer_value as val
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id in (select id from eligible_requests)
      and fresp.is_self = false
      and fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
  )
  select
    s.ccode,
    cf.name,
    cp.code,
    cp.name,
    r.code,
    r.name,
    round(avg(s.val), 2),
    count(*)::integer
  from scores s
  join competency_frameworks cf on cf.code = s.ccode
  left join competency_principles cp on cp.id = cf.principle_id
  left join competency_roles r on r.id = cf.role_id
  group by s.ccode, cf.name, cp.code, cp.name, r.code, r.name
  order by cf.name;
end;
$$;


--
-- Name: get_my_pending_invitations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_pending_invitations() RETURNS TABLE(token uuid, created_at timestamp with time zone, evaluator_category text, requester_member_id uuid, requester_full_name text, requester_email text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    fi.token,
    fi.created_at,
    fi.evaluator_category,
    fr.requester_member_id,
    m.full_name,
    m.email
  from feedback_invitations fi
  join feedback_requests fr on fr.id = fi.feedback_request_id
  join members m on m.id = fr.requester_member_id
  join members caller on caller.auth_user_id = auth.uid()
  where fi.invitee_member_id = caller.id
    and fi.used_at is null
  order by fi.created_at;
$$;


--
-- Name: get_my_report_groups(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_report_groups() RETURNS TABLE(id uuid, name text, status text, created_by_member_id uuid, is_creator boolean, my_status text, accepted_count integer, total_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  return query
  select
    g.id,
    g.name,
    g.status,
    g.created_by_member_id,
    g.created_by_member_id = caller_member.id,
    rgm_self.status,
    (select count(*)::integer from report_group_members rgm where rgm.group_id = g.id and rgm.status = 'accepted'),
    (select count(*)::integer from report_group_members rgm where rgm.group_id = g.id)
  from report_groups g
  left join report_group_members rgm_self
    on rgm_self.group_id = g.id and rgm_self.member_id = caller_member.id
  where g.created_by_member_id = caller_member.id
     or rgm_self.member_id = caller_member.id
  order by g.created_at desc;
end;
$$;


--
-- Name: get_organization_competency_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_organization_competency_summary() RETURNS TABLE(competency_code text, competency_name text, principle_code text, principle_name text, role_code text, role_name text, avg_value numeric, response_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or not caller_member.is_supervisor then
    raise exception 'Solo el administrador de la empresa puede ver este informe.';
  end if;

  return query
  with eligible_requests as (
    select fr.id
    from feedback_requests fr
    where fr.organization_id = caller_member.organization_id
      and feedback_response_count(fr.id) >= coalesce(
        (select min_responses_to_reveal from platform_settings where organization_id = fr.organization_id),
        (select min_responses_to_reveal from platform_settings where organization_id is null),
        3
      )
  ),
  scores as (
    select
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      fa.answer_value as val
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id in (select id from eligible_requests)
      and fresp.is_self = false
      and fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
  )
  select
    s.ccode,
    cf.name,
    cp.code,
    cp.name,
    r.code,
    r.name,
    round(avg(s.val), 2),
    count(*)::integer
  from scores s
  join competency_frameworks cf on cf.code = s.ccode
  left join competency_principles cp on cp.id = cf.principle_id
  left join competency_roles r on r.id = cf.role_id
  group by s.ccode, cf.name, cp.code, cp.name, r.code, r.name
  order by cf.name;
end;
$$;


--
-- Name: get_report_group(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_report_group(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  grp report_groups;
  is_member boolean;
  is_creator boolean;
  my_status text;
  is_accepted boolean;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into grp from report_groups where id = p_group_id;
  if grp is null then
    raise exception 'Grupo no encontrado.';
  end if;

  select exists(
    select 1 from report_group_members where group_id = p_group_id and member_id = caller_member.id
  ) into is_member;

  is_creator := grp.created_by_member_id = caller_member.id;

  if not is_creator and not is_member then
    raise exception 'No tienes acceso a este grupo.';
  end if;

  select status into my_status
  from report_group_members
  where group_id = p_group_id and member_id = caller_member.id;

  is_accepted := coalesce(my_status = 'accepted', false);

  return jsonb_build_object(
    'id', grp.id,
    'name', grp.name,
    'status', grp.status,
    'is_creator', is_creator,
    'my_status', my_status,
    -- El contenido sensible (la interpretación) solo va aquí si el
    -- caller es creador o ya aceptó — un pendiente/rechazado ve el resto
    -- del grupo (para poder responder a su invitación) pero nunca esto,
    -- aunque la fila entera ya sea visible por RLS.
    'ai_interpretation', case when is_creator or is_accepted then grp.ai_interpretation else null end,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'member_id', m.id,
        'full_name', m.full_name,
        'email', m.email,
        'status', rgm.status
      ) order by m.email), '[]'::jsonb)
      from report_group_members rgm
      join members m on m.id = rgm.member_id
      where rgm.group_id = p_group_id
    )
  );
end;
$$;


--
-- Name: get_report_group_competency_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_report_group_competency_summary(p_group_id uuid) RETURNS TABLE(competency_code text, competency_name text, role_code text, role_name text, peer_avg_value numeric, self_avg_value numeric, member_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  grp report_groups;
  is_accepted boolean;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into grp from report_groups where id = p_group_id;
  if grp is null then
    raise exception 'Grupo no encontrado.';
  end if;

  select exists(
    select 1 from report_group_members
    where group_id = p_group_id and member_id = caller_member.id and status = 'accepted'
  ) into is_accepted;

  if grp.created_by_member_id <> caller_member.id and not is_accepted then
    raise exception 'No tienes acceso al informe de este grupo.';
  end if;

  if grp.status <> 'closed' then
    raise exception 'El informe de grupo todavía no está cerrado.';
  end if;

  return query
  with member_last_cycle as (
    select distinct on (rgm.member_id)
      rgm.member_id,
      fr.id as request_id
    from report_group_members rgm
    join feedback_requests fr
      on fr.requester_member_id = rgm.member_id
     and fr.request_type = 'cycle'
     and fr.status = 'closed'
    where rgm.group_id = p_group_id and rgm.status = 'accepted'
    order by rgm.member_id, fr.closes_at desc nulls last, fr.created_at desc
  ),
  per_member_peer as (
    select
      mlc.member_id,
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      avg(fa.answer_value) as avgv
    from member_last_cycle mlc
    join feedback_responses fresp on fresp.feedback_request_id = mlc.request_id and fresp.is_self = false
    join feedback_answers fa on fa.feedback_response_id = fresp.id
    join survey_questions sq on sq.id = fa.question_id
    where fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
    group by mlc.member_id, coalesce(fa.competency_code, sq.competency_code)
  ),
  per_member_self as (
    select
      mlc.member_id,
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      avg(fa.answer_value) as avgv
    from member_last_cycle mlc
    join feedback_responses fresp on fresp.feedback_request_id = mlc.request_id and fresp.is_self = true
    join feedback_answers fa on fa.feedback_response_id = fresp.id
    join survey_questions sq on sq.id = fa.question_id
    where fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
    group by mlc.member_id, coalesce(fa.competency_code, sq.competency_code)
  )
  select
    cf.code,
    cf.name,
    r.code,
    r.name,
    round(avg(pmp.avgv), 2),
    round(avg(pms.avgv), 2),
    count(distinct pmp.member_id)::integer
  from competency_frameworks cf
  left join competency_roles r on r.id = cf.role_id
  left join per_member_peer pmp on pmp.ccode = cf.code
  left join per_member_self pms on pms.ccode = cf.code
  group by cf.code, cf.name, r.code, r.name
  order by cf.name;
end;
$$;


--
-- Name: get_request_competency_by_category(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_request_competency_by_category(p_request_id uuid) RETURNS TABLE(competency_code text, evaluator_category text, avg_value numeric, response_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  req feedback_requests;
  response_count_val integer;
  threshold_val integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  select * into req from feedback_requests where id = p_request_id;

  if req is null or caller_member is null or req.requester_member_id <> caller_member.id then
    raise exception 'No tienes acceso a esta solicitud.';
  end if;

  response_count_val := feedback_response_count(p_request_id);

  select coalesce(
    (select min_responses_to_reveal from platform_settings where organization_id = req.organization_id),
    (select min_responses_to_reveal from platform_settings where organization_id is null),
    3
  ) into threshold_val;

  if response_count_val < threshold_val then
    return;
  end if;

  return query
  with category_response_counts as (
    select fresp.evaluator_category as category, count(distinct fresp.id)::integer as people_cnt
    from feedback_responses fresp
    where fresp.feedback_request_id = p_request_id
      and fresp.is_self = false
      and fresp.evaluator_category is not null
    group by fresp.evaluator_category
  ),
  by_category as (
    select
      sq.competency_code as ccode,
      fresp.evaluator_category as category,
      avg(fa.answer_value) as avgv
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id = p_request_id
      and fresp.is_self = false
      and fresp.evaluator_category is not null
      and fa.answer_value is not null
      and sq.competency_code is not null
    group by sq.competency_code, fresp.evaluator_category
  )
  select bc.ccode, bc.category, round(bc.avgv, 2), crc.people_cnt
  from by_category bc
  join category_response_counts crc on crc.category = bc.category
  where crc.people_cnt >= (case when bc.category = 'manager' then 1 else threshold_val end)
  order by bc.category, bc.ccode;
end;
$$;


--
-- Name: get_request_competency_comparison(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_request_competency_comparison(p_request_id uuid) RETURNS TABLE(competency_code text, competency_name text, principle_code text, principle_name text, role_code text, role_name text, self_value numeric, peer_avg_value numeric, peer_response_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  req feedback_requests;
  response_count_val integer;
  threshold_val integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  select * into req from feedback_requests where id = p_request_id;

  if req is null or caller_member is null or req.requester_member_id <> caller_member.id then
    raise exception 'No tienes acceso a esta solicitud.';
  end if;

  response_count_val := feedback_response_count(p_request_id);

  select coalesce(
    (select min_responses_to_reveal from platform_settings where organization_id = req.organization_id),
    (select min_responses_to_reveal from platform_settings where organization_id is null),
    3
  ) into threshold_val;

  if response_count_val < threshold_val then
    return;
  end if;

  return query
  with self_scores as (
    select sq.competency_code as ccode, avg(fa.answer_value) as val
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id = p_request_id
      and fresp.is_self = true
      and fa.answer_value is not null
      and sq.competency_code is not null
    group by sq.competency_code
  ),
  peer_scores as (
    select
      sq.competency_code as ccode,
      avg(fa.answer_value) as avgv,
      count(*)::integer as cnt
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id = p_request_id
      and fresp.is_self = false
      and fa.answer_value is not null
      and sq.competency_code is not null
    group by sq.competency_code
  )
  select
    cf.code,
    cf.name,
    cp.code,
    cp.name,
    r.code,
    r.name,
    round(s.val, 2),
    round(p.avgv, 2),
    coalesce(p.cnt, 0)
  from competency_frameworks cf
  left join competency_principles cp on cp.id = cf.principle_id
  left join competency_roles r on r.id = cf.role_id
  left join self_scores s on s.ccode = cf.code
  left join peer_scores p on p.ccode = cf.code
  order by cf.name;
end;
$$;


--
-- Name: get_request_competency_narrative(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_request_competency_narrative(p_request_id uuid) RETURNS TABLE(question_position integer, question_prompt text, competency_code text, competency_name text, role_code text, mention_count integer, avg_value numeric, comments text[])
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  req feedback_requests;
  response_count_val integer;
  threshold_val integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  select * into req from feedback_requests where id = p_request_id;

  if req is null or caller_member is null or req.requester_member_id <> caller_member.id then
    raise exception 'No tienes acceso a esta solicitud.';
  end if;

  response_count_val := feedback_response_count(p_request_id);

  select coalesce(
    (select min_responses_to_reveal from platform_settings where organization_id = req.organization_id),
    (select min_responses_to_reveal from platform_settings where organization_id is null),
    3
  ) into threshold_val;

  if response_count_val < threshold_val then
    return;
  end if;

  return query
  select
    sq.position,
    sq.prompt,
    fa.competency_code,
    cf.name,
    cr.code,
    count(*)::integer as mention_count,
    round(avg(fa.answer_value), 2) as avg_value,
    array_remove(array_agg(nullif(trim(fa.answer_text), '')), null) as comments
  from feedback_answers fa
  join feedback_responses fresp on fresp.id = fa.feedback_response_id
  join survey_questions sq on sq.id = fa.question_id
  join competency_frameworks cf on cf.code = fa.competency_code
  left join competency_roles cr on cr.id = cf.role_id
  where fresp.feedback_request_id = p_request_id
    and fresp.is_self = false
    and sq.question_type = 'competency'
    and fa.competency_code is not null
  group by sq.position, sq.prompt, fa.competency_code, cf.name, cr.code
  order by sq.position, count(*) desc;
end;
$$;


--
-- Name: get_request_competency_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_request_competency_summary(p_request_id uuid) RETURNS TABLE(competency_code text, competency_name text, avg_value numeric, response_count integer, percentile_empresa numeric, percentile_global numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  req feedback_requests;
  response_count_val integer;
  threshold_val integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  select * into req from feedback_requests where id = p_request_id;

  if req is null or caller_member is null or req.requester_member_id <> caller_member.id then
    raise exception 'No tienes acceso a esta solicitud.';
  end if;

  response_count_val := feedback_response_count(p_request_id);

  select coalesce(
    (select min_responses_to_reveal from platform_settings where organization_id = req.organization_id),
    (select min_responses_to_reveal from platform_settings where organization_id is null),
    3
  ) into threshold_val;

  if response_count_val < threshold_val then
    return;
  end if;

  return query
  with this_request_scores as (
    select
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      avg(fa.answer_value) as avgv,
      count(*)::integer as cnt
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id = p_request_id
      and fresp.is_self = false
      and fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
    group by coalesce(fa.competency_code, sq.competency_code)
  ),
  all_request_scores as (
    select
      fr.organization_id as org_id,
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      avg(fa.answer_value) as avgv
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    join feedback_requests fr on fr.id = fresp.feedback_request_id
    where fresp.is_self = false
      and fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
    group by fresp.feedback_request_id, fr.organization_id, coalesce(fa.competency_code, sq.competency_code)
  )
  select
    t.ccode,
    cf.name,
    round(t.avgv, 2),
    t.cnt,
    round(
      100.0 * (
        select count(*) from all_request_scores a
        where a.ccode = t.ccode and a.org_id = req.organization_id and a.avgv <= t.avgv
      )
      / nullif(
        (select count(*) from all_request_scores a where a.ccode = t.ccode and a.org_id = req.organization_id),
        0
      ),
      0
    ),
    round(
      100.0 * (
        select count(*) from all_request_scores a
        where a.ccode = t.ccode and a.avgv <= t.avgv
      )
      / nullif((select count(*) from all_request_scores a where a.ccode = t.ccode), 0),
      0
    )
  from this_request_scores t
  left join competency_frameworks cf on cf.code = t.ccode
  order by cf.name;
end;
$$;


--
-- Name: get_request_saboteadores(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_request_saboteadores(p_request_id uuid) RETURNS TABLE(saboteador_code text, avg_value numeric, is_high boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  req feedback_requests;
  threshold_val numeric;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  select * into req from feedback_requests where id = p_request_id;

  if req is null or caller_member is null or req.requester_member_id <> caller_member.id then
    raise exception 'No tienes acceso a esta solicitud.';
  end if;

  select coalesce(
    (select saboteador_threshold from platform_settings where organization_id = req.organization_id),
    (select saboteador_threshold from platform_settings where organization_id is null),
    4
  ) into threshold_val;

  return query
  select
    sq.saboteador_code,
    round(avg(fa.answer_value), 2) as avgv,
    round(avg(fa.answer_value), 2) >= threshold_val
  from feedback_answers fa
  join feedback_responses fresp on fresp.id = fa.feedback_response_id
  join survey_questions sq on sq.id = fa.question_id
  where fresp.feedback_request_id = p_request_id
    and fresp.is_self = true
    and sq.self_only = true
    and sq.saboteador_code is not null
  group by sq.saboteador_code
  order by avgv desc;
end;
$$;


--
-- Name: get_responder_context(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_responder_context(p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  invitation feedback_invitations;
  invitee members;
  req feedback_requests;
  is_self_flag boolean;
begin
  select * into invitation from feedback_invitations where token = p_token;

  if invitation is null then
    return jsonb_build_object('valid', false);
  end if;

  if invitation.invitee_member_id is not null then
    select * into invitee from members where id = invitation.invitee_member_id;
    if invitee.auth_user_id is distinct from auth.uid() then
      return jsonb_build_object('valid', false, 'requires_login', true);
    end if;
  end if;

  if invitation.used_at is not null then
    return jsonb_build_object('valid', true, 'used', true);
  end if;

  is_self_flag := coalesce(invitation.evaluator_category = 'self', false);

  select * into req from feedback_requests where id = invitation.feedback_request_id;

  return jsonb_build_object(
    'valid', true,
    'used', false,
    'is_self', is_self_flag,
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sq.id,
        'prompt', sq.prompt,
        'required', sq.required,
        'question_type', sq.question_type,
        'max_selections', sq.max_selections
      ) order by sq.position), '[]'::jsonb)
      from survey_questions sq
      where sq.template_id = req.template_id
        and not (is_self_flag and sq.question_type = 'open')
        and not (not is_self_flag and sq.self_only)
    ),
    'scale_levels', (
      select coalesce(jsonb_agg(jsonb_build_object('level', level, 'label', label) order by level), '[]'::jsonb)
      from rating_scale_levels
    ),
    'competencies', (
      select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name) order by name), '[]'::jsonb)
      from competency_frameworks
    )
  );
end;
$$;


--
-- Name: invite_member(text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invite_member(p_email text, p_full_name text, p_department_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  new_token uuid;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null then
    raise exception 'Debes iniciar sesión para invitar a un empleado.';
  end if;

  if not caller_member.is_supervisor then
    raise exception 'Solo un administrador puede invitar empleados.';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'El email es obligatorio.';
  end if;

  if p_department_id is null or not exists (
    select 1 from departments
    where id = p_department_id and organization_id = caller_member.organization_id
  ) then
    raise exception 'Selecciona un departamento válido de tu organización.';
  end if;

  if exists (
    select 1 from members
    where organization_id = caller_member.organization_id
      and lower(email) = lower(trim(p_email))
  ) then
    raise exception 'Ya existe un empleado con ese email en tu organización.';
  end if;

  insert into members (
    organization_id, email, full_name, role, status, invited_by, department_id
  )
  values (
    caller_member.organization_id,
    lower(trim(p_email)),
    nullif(trim(coalesce(p_full_name, '')), ''),
    'member',
    'invited',
    caller_member.id,
    p_department_id
  )
  returning invite_token into new_token;

  return new_token;
end;
$$;


--
-- Name: is_platform_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from platform_admins where lower(email) = lower(auth.email())
  );
$$;


--
-- Name: list_organization_members(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_organization_members(p_org_id uuid) RETURNS TABLE(id uuid, email text, full_name text, status text, is_supervisor boolean, department_name text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    m.id,
    m.email,
    m.full_name,
    m.status,
    m.is_supervisor,
    d.name,
    m.created_at
  from members m
  left join departments d on d.id = m.department_id
  where m.organization_id = p_org_id and is_platform_admin()
  order by m.created_at;
$$;


--
-- Name: list_organizations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_organizations() RETURNS TABLE(id uuid, name text, created_at timestamp with time zone, supervisor_email text, supervisor_status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    o.id,
    o.name,
    o.created_at,
    m.email,
    m.status
  from organizations o
  left join members m on m.organization_id = o.id and m.is_supervisor
  where is_platform_admin()
  order by o.created_at desc;
$$;


--
-- Name: organize_cycle_evaluators(uuid, uuid[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.organize_cycle_evaluators(p_cycle_id uuid, p_evaluator_member_ids uuid[], p_evaluator_categories text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: respond_to_report_group(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_to_report_group(p_group_id uuid, p_accept boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  grp report_groups;
  membership report_group_members;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into grp from report_groups where id = p_group_id;
  if grp is null then
    raise exception 'Grupo no encontrado.';
  end if;

  if grp.status <> 'open' then
    raise exception 'Este grupo ya está cerrado.';
  end if;

  select * into membership from report_group_members
  where group_id = p_group_id and member_id = caller_member.id;

  if membership is null then
    raise exception 'No estás invitado a este grupo.';
  end if;

  update report_group_members
  set status = case when p_accept then 'accepted' else 'rejected' end,
      responded_at = now()
  where id = membership.id;
end;
$$;


--
-- Name: save_ai_interpretation(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_ai_interpretation(p_request_id uuid, p_text text, p_saboteadores_text text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  req feedback_requests;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into req from feedback_requests where id = p_request_id;

  if req is null or req.requester_member_id <> caller_member.id then
    raise exception 'Solicitud no encontrada.';
  end if;

  if req.status <> 'closed' then
    raise exception 'Solo se puede guardar una interpretación de un informe ya cerrado.';
  end if;

  update feedback_requests
  set
    ai_interpretation = p_text,
    ai_saboteadores_text = p_saboteadores_text,
    ai_interpretation_generated_at = now()
  where id = p_request_id;
end;
$$;


--
-- Name: save_report_group_interpretation(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_report_group_interpretation(p_group_id uuid, p_text text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  grp report_groups;
  is_accepted boolean;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into grp from report_groups where id = p_group_id;
  if grp is null then
    raise exception 'Grupo no encontrado.';
  end if;

  select exists(
    select 1 from report_group_members
    where group_id = p_group_id and member_id = caller_member.id and status = 'accepted'
  ) into is_accepted;

  if grp.created_by_member_id <> caller_member.id and not is_accepted then
    raise exception 'No tienes acceso a este grupo.';
  end if;

  if grp.status <> 'closed' then
    raise exception 'El grupo todavía no está cerrado.';
  end if;

  update report_groups
  set ai_interpretation = p_text, ai_interpretation_generated_at = now()
  where id = p_group_id;
end;
$$;


--
-- Name: set_org_360_extra_questions(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_org_360_extra_questions(p_questions jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'Los cuestionarios los gestiona el administrador de la plataforma, no cada empresa.';
end;
$$;


--
-- Name: submit_feedback_response(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_feedback_response(p_token uuid, p_answers jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  invitation feedback_invitations;
  invitee members;
  is_self_response boolean;
  request_template_id uuid;
  new_response_id uuid;
  answer jsonb;
  missing_required integer;
  foreign_answers integer;
  invalid_competency_answers integer;
  q_id uuid;
  q_max integer;
  selected_count integer;
begin
  select * into invitation from feedback_invitations where token = p_token and used_at is null;

  if invitation is null then
    raise exception 'Invitación no válida o ya utilizada.';
  end if;

  if invitation.invitee_member_id is not null then
    select * into invitee from members where id = invitation.invitee_member_id;
    if invitee.auth_user_id is distinct from auth.uid() then
      raise exception 'Esta invitación no corresponde a tu usuario.';
    end if;
  end if;

  is_self_response := coalesce(invitation.evaluator_category = 'self', false);

  select fr.template_id
    into request_template_id
  from feedback_requests fr
  where fr.id = invitation.feedback_request_id;

  select count(*) into foreign_answers
  from jsonb_array_elements(p_answers) a
  where not exists (
    select 1 from survey_questions sq
    where sq.id = (a->>'question_id')::uuid
      and sq.template_id = request_template_id
  );

  if foreign_answers > 0 then
    raise exception 'Alguna respuesta no corresponde a la plantilla de esta solicitud.';
  end if;

  select count(*) into invalid_competency_answers
  from jsonb_array_elements(p_answers) a
  where (a->>'competency_code') is not null
    and not exists (select 1 from competency_frameworks cf where cf.code = a->>'competency_code');

  if invalid_competency_answers > 0 then
    raise exception 'Alguna respuesta hace referencia a una competencia que no existe.';
  end if;

  for q_id, q_max in
    select sq.id, sq.max_selections
    from survey_questions sq
    where sq.template_id = request_template_id and sq.max_selections is not null
  loop
    select count(distinct a->>'competency_code') into selected_count
    from jsonb_array_elements(p_answers) a
    where (a->>'question_id')::uuid = q_id
      and (a->>'competency_code') is not null;

    if selected_count > q_max then
      raise exception 'Se ha elegido más competencias de las permitidas en alguna pregunta.';
    end if;
  end loop;

  select count(*) into missing_required
  from survey_questions sq
  where sq.template_id = request_template_id
    and sq.required
    and not (is_self_response and sq.question_type = 'open')
    and not (not is_self_response and sq.self_only)
    and not exists (
      select 1 from jsonb_array_elements(p_answers) a
      where (a->>'question_id')::uuid = sq.id
        and (
          coalesce(trim(a->>'answer_text'), '') <> ''
          or (a->>'answer_value') is not null
        )
    );

  if missing_required > 0 then
    raise exception 'Faltan respuestas obligatorias.';
  end if;

  insert into feedback_responses (feedback_request_id, is_self, evaluator_category)
  values (invitation.feedback_request_id, is_self_response, invitation.evaluator_category)
  returning id into new_response_id;

  for answer in select * from jsonb_array_elements(p_answers)
  loop
    insert into feedback_answers (feedback_response_id, question_id, answer_text, answer_value, competency_code)
    values (
      new_response_id,
      (answer->>'question_id')::uuid,
      answer->>'answer_text',
      nullif(answer->>'answer_value', '')::numeric,
      answer->>'competency_code'
    );
  end loop;

  update feedback_invitations set used_at = now() where id = invitation.id;

  return new_response_id;
end;
$$;


--
-- Name: update_ad_hoc_feedback_request_evaluators(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_ad_hoc_feedback_request_evaluators(p_request_id uuid, p_invitee_member_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  caller_member members;
  req feedback_requests;
  min_invitees integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into req from feedback_requests where id = p_request_id;

  if req is null or req.requester_member_id <> caller_member.id then
    raise exception 'Solicitud no encontrada.';
  end if;

  if req.request_type <> 'ad_hoc' then
    raise exception 'Solo se pueden modificar solicitudes del flujo ágil.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  if feedback_response_count(p_request_id) > 0 then
    raise exception 'No se puede modificar: ya hay respuestas.';
  end if;

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if coalesce(array_length(p_invitee_member_ids, 1), 0) < min_invitees then
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
       or m.is_supervisor
  ) then
    raise exception 'Todos los invitados deben ser empleados activos de tu organización (el Supervisor no puede ser invitado a dar feedback).';
  end if;

  delete from feedback_invitations where feedback_request_id = p_request_id;

  insert into feedback_invitations (feedback_request_id, invitee_member_id)
  select p_request_id, unnest(p_invitee_member_ids);
end;
$$;


--
-- Name: update_cycle_request_evaluators(uuid, uuid[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_cycle_request_evaluators(p_request_id uuid, p_evaluator_member_ids uuid[], p_evaluator_categories text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: update_individual_cycle_request_evaluators(uuid, text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_individual_cycle_request_evaluators(p_request_id uuid, p_evaluator_emails text[], p_evaluator_categories text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


--
-- Name: update_organization_name(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_organization_name(p_org_id uuid, p_new_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_platform_admin() then
    raise exception 'Solo el administrador de la plataforma puede editar empresas.';
  end if;

  if p_new_name is null or trim(p_new_name) = '' then
    raise exception 'El nombre de la empresa es obligatorio.';
  end if;

  update organizations set name = trim(p_new_name) where id = p_org_id;

  if not found then
    raise exception 'Empresa no encontrada.';
  end if;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: competency_frameworks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competency_frameworks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    principle_id uuid,
    role_id uuid
);


--
-- Name: competency_principles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competency_principles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "position" integer NOT NULL
);


--
-- Name: competency_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competency_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    principle_id uuid,
    "position" integer NOT NULL
);


--
-- Name: competency_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competency_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id uuid NOT NULL,
    competency_code text NOT NULL,
    score numeric(4,2) NOT NULL,
    response_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: feedback_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feedback_response_id uuid NOT NULL,
    question_id uuid NOT NULL,
    answer_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    answer_value numeric(2,1),
    competency_code text,
    CONSTRAINT feedback_answers_answer_value_check CHECK (((answer_value IS NULL) OR ((answer_value >= (1)::numeric) AND (answer_value <= (5)::numeric) AND ((answer_value * (2)::numeric) = round((answer_value * (2)::numeric))))))
);


--
-- Name: feedback_cycle_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_cycle_participants (
    cycle_id uuid NOT NULL,
    member_id uuid NOT NULL
);


--
-- Name: feedback_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    opens_at date NOT NULL,
    closes_at date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    template_id uuid
);


--
-- Name: feedback_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feedback_request_id uuid NOT NULL,
    invitee_member_id uuid,
    evaluator_category text,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    invitee_email text,
    invitee_name text,
    CONSTRAINT feedback_invitations_evaluator_category_check CHECK ((evaluator_category = ANY (ARRAY['self'::text, 'manager'::text, 'team'::text, 'organization'::text, 'other'::text])))
);


--
-- Name: feedback_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    requester_member_id uuid NOT NULL,
    cycle_id uuid,
    request_type text NOT NULL,
    name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    template_id uuid,
    subtype text,
    closes_at date,
    ai_interpretation text,
    ai_interpretation_generated_at timestamp with time zone,
    ai_saboteadores_text text,
    CONSTRAINT feedback_requests_request_type_check CHECK ((request_type = ANY (ARRAY['ad_hoc'::text, 'cycle'::text]))),
    CONSTRAINT feedback_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text]))),
    CONSTRAINT feedback_requests_subtype_check CHECK ((subtype = ANY (ARRAY['meeting'::text, 'collaboration'::text, 'leadership_initiative'::text, 'general'::text, 'competencias'::text])))
);


--
-- Name: feedback_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feedback_request_id uuid NOT NULL,
    text_content text,
    survey_answers jsonb,
    suggested_competency_tags text[],
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    is_self boolean DEFAULT false NOT NULL,
    evaluator_category text
);


--
-- Name: insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id uuid NOT NULL,
    competency_code text NOT NULL,
    summary text NOT NULL,
    based_on_response_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    auth_user_id uuid,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    invite_token uuid DEFAULT gen_random_uuid() NOT NULL,
    invited_by uuid,
    accepted_at timestamp with time zone,
    department_id uuid NOT NULL,
    is_supervisor boolean DEFAULT false NOT NULL,
    CONSTRAINT members_role_check CHECK ((role = ANY (ARRAY['member'::text, 'org_admin'::text]))),
    CONSTRAINT members_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text])))
);


--
-- Name: org_competencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_competencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    applies_to text DEFAULT 'all'::text NOT NULL,
    CONSTRAINT org_competencies_applies_to_check CHECK ((applies_to = ANY (ARRAY['all'::text, 'manager_only'::text])))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'company'::text NOT NULL,
    CONSTRAINT organizations_kind_check CHECK ((kind = ANY (ARRAY['company'::text, 'individual'::text])))
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    min_invitees_per_request integer DEFAULT 5 NOT NULL,
    min_responses_to_reveal integer DEFAULT 3 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    saboteador_threshold numeric DEFAULT 4 NOT NULL,
    CONSTRAINT min_invitees_floor CHECK ((min_invitees_per_request >= 5)),
    CONSTRAINT min_responses_floor CHECK ((min_responses_to_reveal >= 3))
);


--
-- Name: platform_texts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_texts (
    key text NOT NULL,
    content text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rating_scale_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rating_scale_levels (
    level integer NOT NULL,
    label text NOT NULL,
    description text NOT NULL
);


--
-- Name: report_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    member_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT report_group_members_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])))
);


--
-- Name: report_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    created_by_member_id uuid NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    ai_interpretation text,
    ai_interpretation_generated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    CONSTRAINT report_groups_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: survey_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    "position" integer NOT NULL,
    prompt text NOT NULL,
    question_type text DEFAULT 'open'::text NOT NULL,
    required boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    competency_code text,
    applies_to text DEFAULT 'all'::text NOT NULL,
    max_selections integer,
    self_only boolean DEFAULT false NOT NULL,
    saboteador_code text,
    CONSTRAINT survey_questions_applies_to_check CHECK ((applies_to = ANY (ARRAY['all'::text, 'manager_only'::text]))),
    CONSTRAINT survey_questions_question_type_check CHECK ((question_type = ANY (ARRAY['open'::text, 'scale'::text, 'multiple_choice'::text, 'competency'::text])))
);


--
-- Name: survey_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    organization_id uuid,
    subtype text,
    CONSTRAINT survey_templates_subtype_check CHECK ((subtype = ANY (ARRAY['meeting'::text, 'collaboration'::text, 'leadership_initiative'::text, 'general'::text, '360_extra'::text, 'competencias'::text])))
);


--
-- Name: competency_frameworks competency_frameworks_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_frameworks
    ADD CONSTRAINT competency_frameworks_code_key UNIQUE (code);


--
-- Name: competency_frameworks competency_frameworks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_frameworks
    ADD CONSTRAINT competency_frameworks_pkey PRIMARY KEY (id);


--
-- Name: competency_principles competency_principles_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_principles
    ADD CONSTRAINT competency_principles_code_key UNIQUE (code);


--
-- Name: competency_principles competency_principles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_principles
    ADD CONSTRAINT competency_principles_pkey PRIMARY KEY (id);


--
-- Name: competency_roles competency_roles_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_roles
    ADD CONSTRAINT competency_roles_code_key UNIQUE (code);


--
-- Name: competency_roles competency_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_roles
    ADD CONSTRAINT competency_roles_pkey PRIMARY KEY (id);


--
-- Name: competency_scores competency_scores_member_id_competency_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_scores
    ADD CONSTRAINT competency_scores_member_id_competency_code_key UNIQUE (member_id, competency_code);


--
-- Name: competency_scores competency_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_scores
    ADD CONSTRAINT competency_scores_pkey PRIMARY KEY (id);


--
-- Name: departments departments_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_organization_id_name_key UNIQUE (organization_id, name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: feedback_answers feedback_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_answers
    ADD CONSTRAINT feedback_answers_pkey PRIMARY KEY (id);


--
-- Name: feedback_cycle_participants feedback_cycle_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_cycle_participants
    ADD CONSTRAINT feedback_cycle_participants_pkey PRIMARY KEY (cycle_id, member_id);


--
-- Name: feedback_cycles feedback_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_cycles
    ADD CONSTRAINT feedback_cycles_pkey PRIMARY KEY (id);


--
-- Name: feedback_invitations feedback_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_invitations
    ADD CONSTRAINT feedback_invitations_pkey PRIMARY KEY (id);


--
-- Name: feedback_invitations feedback_invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_invitations
    ADD CONSTRAINT feedback_invitations_token_key UNIQUE (token);


--
-- Name: feedback_requests feedback_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_requests
    ADD CONSTRAINT feedback_requests_pkey PRIMARY KEY (id);


--
-- Name: feedback_responses feedback_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_responses
    ADD CONSTRAINT feedback_responses_pkey PRIMARY KEY (id);


--
-- Name: insights insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insights
    ADD CONSTRAINT insights_pkey PRIMARY KEY (id);


--
-- Name: members members_invite_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_invite_token_key UNIQUE (invite_token);


--
-- Name: members members_organization_id_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_organization_id_auth_user_id_key UNIQUE (organization_id, auth_user_id);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: org_competencies org_competencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_competencies
    ADD CONSTRAINT org_competencies_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (email);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: platform_texts platform_texts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_texts
    ADD CONSTRAINT platform_texts_pkey PRIMARY KEY (key);


--
-- Name: rating_scale_levels rating_scale_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rating_scale_levels
    ADD CONSTRAINT rating_scale_levels_pkey PRIMARY KEY (level);


--
-- Name: report_group_members report_group_members_group_id_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_group_members
    ADD CONSTRAINT report_group_members_group_id_member_id_key UNIQUE (group_id, member_id);


--
-- Name: report_group_members report_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_group_members
    ADD CONSTRAINT report_group_members_pkey PRIMARY KEY (id);


--
-- Name: report_groups report_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_groups
    ADD CONSTRAINT report_groups_pkey PRIMARY KEY (id);


--
-- Name: survey_questions survey_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_questions
    ADD CONSTRAINT survey_questions_pkey PRIMARY KEY (id);


--
-- Name: survey_questions survey_questions_template_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_questions
    ADD CONSTRAINT survey_questions_template_id_position_key UNIQUE (template_id, "position");


--
-- Name: survey_templates survey_templates_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_templates
    ADD CONSTRAINT survey_templates_code_key UNIQUE (code);


--
-- Name: survey_templates survey_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_templates
    ADD CONSTRAINT survey_templates_pkey PRIMARY KEY (id);


--
-- Name: feedback_answers_feedback_response_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_answers_feedback_response_id_idx ON public.feedback_answers USING btree (feedback_response_id);


--
-- Name: feedback_cycles_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_cycles_organization_id_idx ON public.feedback_cycles USING btree (organization_id);


--
-- Name: feedback_invitations_feedback_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_invitations_feedback_request_id_idx ON public.feedback_invitations USING btree (feedback_request_id);


--
-- Name: feedback_requests_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_requests_organization_id_idx ON public.feedback_requests USING btree (organization_id);


--
-- Name: feedback_requests_requester_member_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_requests_requester_member_id_idx ON public.feedback_requests USING btree (requester_member_id);


--
-- Name: feedback_responses_feedback_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_responses_feedback_request_id_idx ON public.feedback_responses USING btree (feedback_request_id);


--
-- Name: insights_member_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insights_member_id_idx ON public.insights USING btree (member_id);


--
-- Name: members_one_supervisor_per_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX members_one_supervisor_per_org_idx ON public.members USING btree (organization_id) WHERE is_supervisor;


--
-- Name: members_organization_email_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX members_organization_email_unique_idx ON public.members USING btree (organization_id, lower(email));


--
-- Name: members_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX members_organization_id_idx ON public.members USING btree (organization_id);


--
-- Name: org_competencies_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_competencies_organization_id_idx ON public.org_competencies USING btree (organization_id);


--
-- Name: report_group_members_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX report_group_members_group_id_idx ON public.report_group_members USING btree (group_id);


--
-- Name: report_group_members_member_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX report_group_members_member_id_idx ON public.report_group_members USING btree (member_id);


--
-- Name: report_groups_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX report_groups_organization_id_idx ON public.report_groups USING btree (organization_id);


--
-- Name: competency_frameworks competency_frameworks_principle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_frameworks
    ADD CONSTRAINT competency_frameworks_principle_id_fkey FOREIGN KEY (principle_id) REFERENCES public.competency_principles(id);


--
-- Name: competency_frameworks competency_frameworks_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_frameworks
    ADD CONSTRAINT competency_frameworks_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.competency_roles(id);


--
-- Name: competency_roles competency_roles_principle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_roles
    ADD CONSTRAINT competency_roles_principle_id_fkey FOREIGN KEY (principle_id) REFERENCES public.competency_principles(id);


--
-- Name: competency_scores competency_scores_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competency_scores
    ADD CONSTRAINT competency_scores_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: departments departments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: feedback_answers feedback_answers_competency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_answers
    ADD CONSTRAINT feedback_answers_competency_code_fkey FOREIGN KEY (competency_code) REFERENCES public.competency_frameworks(code);


--
-- Name: feedback_answers feedback_answers_feedback_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_answers
    ADD CONSTRAINT feedback_answers_feedback_response_id_fkey FOREIGN KEY (feedback_response_id) REFERENCES public.feedback_responses(id) ON DELETE CASCADE;


--
-- Name: feedback_answers feedback_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_answers
    ADD CONSTRAINT feedback_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.survey_questions(id);


--
-- Name: feedback_cycle_participants feedback_cycle_participants_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_cycle_participants
    ADD CONSTRAINT feedback_cycle_participants_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.feedback_cycles(id) ON DELETE CASCADE;


--
-- Name: feedback_cycle_participants feedback_cycle_participants_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_cycle_participants
    ADD CONSTRAINT feedback_cycle_participants_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: feedback_cycles feedback_cycles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_cycles
    ADD CONSTRAINT feedback_cycles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: feedback_cycles feedback_cycles_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_cycles
    ADD CONSTRAINT feedback_cycles_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.survey_templates(id);


--
-- Name: feedback_invitations feedback_invitations_feedback_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_invitations
    ADD CONSTRAINT feedback_invitations_feedback_request_id_fkey FOREIGN KEY (feedback_request_id) REFERENCES public.feedback_requests(id) ON DELETE CASCADE;


--
-- Name: feedback_invitations feedback_invitations_invitee_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_invitations
    ADD CONSTRAINT feedback_invitations_invitee_member_id_fkey FOREIGN KEY (invitee_member_id) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: feedback_requests feedback_requests_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_requests
    ADD CONSTRAINT feedback_requests_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.feedback_cycles(id) ON DELETE SET NULL;


--
-- Name: feedback_requests feedback_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_requests
    ADD CONSTRAINT feedback_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: feedback_requests feedback_requests_requester_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_requests
    ADD CONSTRAINT feedback_requests_requester_member_id_fkey FOREIGN KEY (requester_member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: feedback_requests feedback_requests_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_requests
    ADD CONSTRAINT feedback_requests_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.survey_templates(id);


--
-- Name: feedback_responses feedback_responses_feedback_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_responses
    ADD CONSTRAINT feedback_responses_feedback_request_id_fkey FOREIGN KEY (feedback_request_id) REFERENCES public.feedback_requests(id) ON DELETE CASCADE;


--
-- Name: insights insights_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insights
    ADD CONSTRAINT insights_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: members members_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: members members_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: members members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.members(id) ON DELETE SET NULL;


--
-- Name: members members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_competencies org_competencies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_competencies
    ADD CONSTRAINT org_competencies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: platform_settings platform_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: report_group_members report_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_group_members
    ADD CONSTRAINT report_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.report_groups(id) ON DELETE CASCADE;


--
-- Name: report_group_members report_group_members_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_group_members
    ADD CONSTRAINT report_group_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: report_groups report_groups_created_by_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_groups
    ADD CONSTRAINT report_groups_created_by_member_id_fkey FOREIGN KEY (created_by_member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- Name: report_groups report_groups_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_groups
    ADD CONSTRAINT report_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: survey_questions survey_questions_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_questions
    ADD CONSTRAINT survey_questions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.survey_templates(id) ON DELETE CASCADE;


--
-- Name: survey_templates survey_templates_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_templates
    ADD CONSTRAINT survey_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: competency_frameworks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competency_frameworks ENABLE ROW LEVEL SECURITY;

--
-- Name: competency_frameworks competency_frameworks readable by anyone authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "competency_frameworks readable by anyone authenticated" ON public.competency_frameworks FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: competency_principles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competency_principles ENABLE ROW LEVEL SECURITY;

--
-- Name: competency_principles competency_principles readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "competency_principles readable by authenticated" ON public.competency_principles FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: competency_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competency_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: competency_roles competency_roles readable by anyone authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "competency_roles readable by anyone authenticated" ON public.competency_roles FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: competency_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.competency_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: competency_scores competency_scores visible to own member only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "competency_scores visible to own member only" ON public.competency_scores FOR SELECT USING ((member_id IN ( SELECT members.id
   FROM public.members
  WHERE (members.auth_user_id = auth.uid()))));


--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: departments departments scoped to organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "departments scoped to organization" ON public.departments FOR SELECT USING ((organization_id IN ( SELECT public.auth_member_organization_ids() AS auth_member_organization_ids)));


--
-- Name: feedback_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_answers feedback_answers visible with same threshold as feedback_respon; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "feedback_answers visible with same threshold as feedback_respon" ON public.feedback_answers FOR SELECT USING ((feedback_response_id IN ( SELECT feedback_responses.id
   FROM public.feedback_responses)));


--
-- Name: feedback_cycle_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback_cycle_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_cycles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback_cycles ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_cycles feedback_cycles scoped to organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "feedback_cycles scoped to organization" ON public.feedback_cycles FOR SELECT USING ((organization_id IN ( SELECT public.auth_member_organization_ids() AS auth_member_organization_ids)));


--
-- Name: feedback_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_invitations feedback_invitations visible to own invitee; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "feedback_invitations visible to own invitee" ON public.feedback_invitations FOR SELECT USING ((invitee_member_id IN ( SELECT members.id
   FROM public.members
  WHERE (members.auth_user_id = auth.uid()))));


--
-- Name: feedback_invitations feedback_invitations visible to requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "feedback_invitations visible to requester" ON public.feedback_invitations FOR SELECT USING ((feedback_request_id IN ( SELECT fr.id
   FROM (public.feedback_requests fr
     JOIN public.members m ON ((m.id = fr.requester_member_id)))
  WHERE (m.auth_user_id = auth.uid()))));


--
-- Name: feedback_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_requests feedback_requests scoped to organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "feedback_requests scoped to organization" ON public.feedback_requests FOR SELECT USING ((organization_id IN ( SELECT public.auth_member_organization_ids() AS auth_member_organization_ids)));


--
-- Name: feedback_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_responses feedback_responses visible to requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "feedback_responses visible to requester" ON public.feedback_responses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.feedback_requests fr
     JOIN public.members m ON ((m.id = fr.requester_member_id)))
  WHERE ((fr.id = feedback_responses.feedback_request_id) AND (m.auth_user_id = auth.uid()) AND (feedback_responses.is_self OR (public.feedback_response_count(fr.id) >= COALESCE(( SELECT platform_settings.min_responses_to_reveal
           FROM public.platform_settings
          WHERE (platform_settings.organization_id = fr.organization_id)), ( SELECT platform_settings.min_responses_to_reveal
           FROM public.platform_settings
          WHERE (platform_settings.organization_id IS NULL)), 3)))))));


--
-- Name: insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

--
-- Name: insights insights visible to own member only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insights visible to own member only" ON public.insights FOR SELECT USING ((member_id IN ( SELECT members.id
   FROM public.members
  WHERE (members.auth_user_id = auth.uid()))));


--
-- Name: members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_cycle_participants members read their own cycle participation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members read their own cycle participation" ON public.feedback_cycle_participants FOR SELECT USING ((member_id IN ( SELECT members.id
   FROM public.members
  WHERE (members.auth_user_id = auth.uid()))));


--
-- Name: members members see colleagues in same organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members see colleagues in same organization" ON public.members FOR SELECT USING ((organization_id IN ( SELECT public.auth_member_organization_ids() AS auth_member_organization_ids)));


--
-- Name: organizations members see their own organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "members see their own organization" ON public.organizations FOR SELECT USING ((id IN ( SELECT public.auth_member_organization_ids() AS auth_member_organization_ids)));


--
-- Name: org_competencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_competencies ENABLE ROW LEVEL SECURITY;

--
-- Name: org_competencies org_competencies scoped to organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "org_competencies scoped to organization" ON public.org_competencies FOR SELECT USING ((organization_id IN ( SELECT public.auth_member_organization_ids() AS auth_member_organization_ids)));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings platform_settings readable by org members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform_settings readable by org members" ON public.platform_settings FOR SELECT USING (((organization_id IS NULL) OR (organization_id IN ( SELECT public.auth_member_organization_ids() AS auth_member_organization_ids))));


--
-- Name: platform_texts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_texts ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_texts platform_texts readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "platform_texts readable by authenticated" ON public.platform_texts FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: rating_scale_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rating_scale_levels ENABLE ROW LEVEL SECURITY;

--
-- Name: rating_scale_levels rating_scale_levels readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rating_scale_levels readable by authenticated" ON public.rating_scale_levels FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: report_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: report_group_members report_group_members visible to creator and members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "report_group_members visible to creator and members" ON public.report_group_members FOR SELECT USING (((group_id IN ( SELECT report_groups.id
   FROM public.report_groups
  WHERE (report_groups.created_by_member_id IN ( SELECT members.id
           FROM public.members
          WHERE (members.auth_user_id = auth.uid()))))) OR (member_id IN ( SELECT members.id
   FROM public.members
  WHERE (members.auth_user_id = auth.uid())))));


--
-- Name: report_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: report_groups report_groups visible to creator and members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "report_groups visible to creator and members" ON public.report_groups FOR SELECT USING (((created_by_member_id IN ( SELECT members.id
   FROM public.members
  WHERE (members.auth_user_id = auth.uid()))) OR (id IN ( SELECT rgm.group_id
   FROM (public.report_group_members rgm
     JOIN public.members m ON ((m.id = rgm.member_id)))
  WHERE (m.auth_user_id = auth.uid())))));


--
-- Name: survey_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: survey_questions survey_questions readable via template; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "survey_questions readable via template" ON public.survey_questions FOR SELECT USING ((template_id IN ( SELECT survey_templates.id
   FROM public.survey_templates)));


--
-- Name: survey_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: survey_templates survey_templates readable by platform or own org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "survey_templates readable by platform or own org" ON public.survey_templates FOR SELECT USING (((organization_id IS NULL) OR (organization_id IN ( SELECT public.auth_member_organization_ids() AS auth_member_organization_ids))));


--
-- PostgreSQL database dump complete
--



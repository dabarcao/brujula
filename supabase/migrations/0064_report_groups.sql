-- Brújula — Informes de grupo (spec.md sección 17), fase 1: agregado de
-- competencias del último 360 cerrado de cada miembro aceptado, más
-- interpretación por IA. Solo para empresa (organizations.kind =
-- 'company') — no tiene sentido para una cuenta individual, que no tiene
-- compañeros.
--
-- No se apoya en feedback_requests/feedback_invitations: no se le pide a
-- nadie que responda nada nuevo, solo se agrega el 360 que cada persona
-- ya tiene. Dos tablas nuevas, deliberadamente separadas de `departments`
-- (estructura oficial asignada por RRHH) — este grupo lo arma cualquier
-- empleado por su cuenta, con el consentimiento explícito de cada
-- invitado.

create table report_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_by_member_id uuid not null references members(id) on delete cascade,
  name text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  ai_interpretation text,
  ai_interpretation_generated_at timestamptz,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index report_groups_organization_id_idx on report_groups(organization_id);

create table report_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references report_groups(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (group_id, member_id)
);

create index report_group_members_group_id_idx on report_group_members(group_id);
create index report_group_members_member_id_idx on report_group_members(member_id);

alter table report_groups enable row level security;
alter table report_group_members enable row level security;

-- Visible para quien lo creó y para cualquiera que esté en la lista de
-- miembros (pendiente, aceptado o rechazado) — hace falta verlo para
-- poder responder a la invitación. El contenido sensible (el agregado de
-- competencias real) nunca sale de aquí — vive en una función aparte que
-- hace su propia comprobación de "aceptado y cerrado" (más abajo).
create policy "report_groups visible to creator and members"
  on report_groups for select
  using (
    created_by_member_id in (select id from members where auth_user_id = auth.uid())
    or id in (
      select rgm.group_id from report_group_members rgm
      join members m on m.id = rgm.member_id
      where m.auth_user_id = auth.uid()
    )
  );

create policy "report_group_members visible to creator and members"
  on report_group_members for select
  using (
    group_id in (
      select id from report_groups
      where created_by_member_id in (select id from members where auth_user_id = auth.uid())
    )
    or member_id in (select id from members where auth_user_id = auth.uid())
  );

-- Sin políticas de insert/update/delete: todo escribe a través de
-- funciones security definer, mismo patrón que el resto de la app.

-- ============================================================
-- create_report_group — solo empresa, solo a compañeros de la misma
-- organización que ya tengan al menos un 360 cerrado (si no, no hay
-- nada real que agregar).
-- ============================================================
create or replace function create_report_group(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

grant execute on function create_report_group(text, uuid[]) to authenticated;

-- ============================================================
-- get_colleagues_with_closed_cycle — para el selector de la pantalla de
-- creación: solo compañeros que ya tienen al menos un 360 cerrado (si no,
-- no hay nada real que agregar). Un empleado normal no puede ver el
-- feedback_requests de otro por RLS, de ahí esta función aparte.
-- ============================================================
create or replace function get_colleagues_with_closed_cycle()
returns table (id uuid, email text, full_name text)
language plpgsql
security definer
set search_path = public
as $$
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

grant execute on function get_colleagues_with_closed_cycle() to authenticated;

-- ============================================================
-- respond_to_report_group — confirmar o rechazar la propia invitación.
-- ============================================================
create or replace function respond_to_report_group(p_group_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

grant execute on function respond_to_report_group(uuid, boolean) to authenticated;

-- ============================================================
-- close_report_group — cualquiera de los ya aceptados puede cerrarlo
-- (no es exclusivo de quien lo creó, mismo espíritu que "el usuario es
-- el dueño de su proceso", aquí en plural). Congela la membresía en
-- quienes hubieran aceptado hasta ese momento — reutiliza
-- min_invitees_per_request (5 por defecto) como umbral mínimo.
-- ============================================================
create or replace function close_report_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

grant execute on function close_report_group(uuid) to authenticated;

-- ============================================================
-- get_my_report_groups — grupos donde soy creador o estoy invitado
-- (cualquier estado), para el panel principal.
-- ============================================================
create or replace function get_my_report_groups()
returns table (
  id uuid,
  name text,
  status text,
  created_by_member_id uuid,
  is_creator boolean,
  my_status text,
  accepted_count integer,
  total_count integer
)
language plpgsql
security definer
set search_path = public
as $$
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
    (select count(*)::integer from report_group_members where group_id = g.id and status = 'accepted'),
    (select count(*)::integer from report_group_members where group_id = g.id)
  from report_groups g
  left join report_group_members rgm_self
    on rgm_self.group_id = g.id and rgm_self.member_id = caller_member.id
  where g.created_by_member_id = caller_member.id
     or rgm_self.member_id = caller_member.id
  order by g.created_at desc;
end;
$$;

grant execute on function get_my_report_groups() to authenticated;

-- ============================================================
-- get_report_group — detalle de un grupo (nombre, estado, lista de
-- miembros con su estado) para la pantalla de progreso/informe. Caller
-- tiene que ser el creador o estar en la lista de miembros.
-- ============================================================
create or replace function get_report_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

grant execute on function get_report_group(uuid) to authenticated;

-- ============================================================
-- get_report_group_competency_summary — el agregado real, solo si el
-- grupo está cerrado y solo para quien lo creó o ya aceptó. Un valor por
-- persona = el último 360 cerrado que tenga (peer, sin autoevaluación),
-- agregado con el resto de miembros aceptados.
-- ============================================================
create or replace function get_report_group_competency_summary(p_group_id uuid)
returns table (
  competency_code text,
  competency_name text,
  role_code text,
  role_name text,
  avg_value numeric,
  member_count integer
)
language plpgsql
security definer
set search_path = public
as $$
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
  scores as (
    select
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      fa.answer_value as val,
      mlc.member_id
    from member_last_cycle mlc
    join feedback_responses fresp on fresp.feedback_request_id = mlc.request_id
    join feedback_answers fa on fa.feedback_response_id = fresp.id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.is_self = false
      and fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
  )
  select
    cf.code,
    cf.name,
    r.code,
    r.name,
    round(avg(s.val), 2),
    count(distinct s.member_id)::integer
  from scores s
  join competency_frameworks cf on cf.code = s.ccode
  left join competency_roles r on r.id = cf.role_id
  group by cf.code, cf.name, r.code, r.name
  order by cf.name;
end;
$$;

grant execute on function get_report_group_competency_summary(uuid) to authenticated;

-- ============================================================
-- save_report_group_interpretation — misma idea que
-- save_ai_interpretation (sección 17), a nivel de grupo.
-- ============================================================
create or replace function save_report_group_interpretation(p_group_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

grant execute on function save_report_group_interpretation(uuid, text) to authenticated;

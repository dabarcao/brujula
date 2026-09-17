-- Brújula — informes de grupo: 3 cambios reales de comportamiento pedidos
-- por el usuario tras revisar la funcionalidad en detalle.
--
-- 1) create_report_group ahora exige que QUIEN CREA el grupo tenga
--    también su propio 360 finalizado (antes solo se exigía a los
--    invitados), y ahora TAMBIÉN se guarda a sí mismo como miembro del
--    grupo, ya aceptado (report_group_members, status='accepted',
--    responded_at=now()) -- antes el creador nunca aparecía como miembro
--    en absoluto, lo que además le impedía cerrar su propio grupo
--    (close_report_group exige ser un miembro ya aceptado). El umbral de
--    "mínimo de personas" (ver punto 2) pasa así a contar personas del
--    grupo de verdad, creador incluido -- no "creador + 5 invitados"
--    (el usuario, explícito: "5 miembros, mas que 5 invitados"). Cambia
--    de returns uuid a returns table(...) para poder devolver también
--    los datos de cada invitado nuevo (email/nombre) y de quien invita,
--    de un solo viaje -- se usan para mandar el email de invitación
--    desde el manager, sin una segunda consulta (nunca se manda ese
--    email al propio creador, claro).
--
-- 2) close_report_group ya no cierra con un mínimo de aceptados
--    (min_invitees_per_request, antes 5) mientras el resto sigue sin
--    responder -- ahora exige que TODOS los miembros actuales del grupo
--    hayan aceptado (ninguno en pending/rejected). El mínimo de personas
--    se mantiene como suelo de anonimato (siguen haciendo falta esas
--    mismas personas como mínimo, solo que ahora deben estar TODAS
--    aceptadas, no solo alguna).
--
-- 3) Dos funciones nuevas para gestionar la membresía mientras el grupo
--    sigue abierto: add_report_group_members (invitar a alguien nuevo, o
--    volver a invitar a quien había rechazado -- mismo patrón "solo las
--    filas nuevas" que update_cycle_request_evaluators,
--    0090_add_evaluators_email_only_new_new.sql) y
--    remove_report_group_member (para quitar a quien no responde o
--    rechazó, y así poder llegar al 100% con el resto). Ambas las puede
--    usar quien creó el grupo o cualquiera que ya haya aceptado --mismo
--    espíritu que close_report_group ("el usuario es el dueño de su
--    proceso, aquí en plural")--, con la excepción deliberada de que aquí
--    SÍ se incluye a quien creó el grupo aunque él mismo no sea todavía
--    miembro aceptado: si no, no habría forma de corregir una invitación
--    equivocada antes de que nadie hubiera aceptado nada todavía.
--
-- No se toca quién puede CERRAR el grupo (close_report_group sigue
-- exigiendo ser un miembro ya aceptado) -- eso no formaba parte de lo
-- pedido, solo la condición de cierre y la gestión de miembros.

drop function if exists create_report_group(text, uuid[]);

create or replace function create_report_group(p_name text, p_member_ids uuid[])
returns table (
  group_id uuid,
  member_id uuid,
  email text,
  full_name text,
  inviter_full_name text,
  inviter_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  caller_org organizations;
  new_group_id uuid;
  mid uuid;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como empleado activo.';
  end if;

  select * into caller_org from organizations where id = caller_member.organization_id;
  if caller_org.kind <> 'company' then
    raise exception 'Los informes de grupo son solo para empresas.';
  end if;

  if not exists (
    select 1 from feedback_requests fr
    where fr.requester_member_id = caller_member.id
      and fr.request_type = 'cycle'
      and fr.status = 'closed'
  ) then
    raise exception 'Necesitas tener tu propio 360 finalizado antes de poder crear un grupo.';
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
       or m.id = caller_member.id
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

  -- Quien crea el grupo cuenta como miembro desde ya, ya aceptado --
  -- nunca se le pide confirmar su propia invitación (ver comentario de
  -- cabecera del archivo). p_member_ids ya no puede contener su propio
  -- id (comprobación justo arriba), así que no hay riesgo de duplicado
  -- con el bucle de abajo.
  insert into report_group_members (group_id, member_id, status, responded_at)
  values (new_group_id, caller_member.id, 'accepted', now());

  foreach mid in array p_member_ids loop
    insert into report_group_members (group_id, member_id)
    values (new_group_id, mid);
  end loop;

  return query
  select
    new_group_id,
    m.id,
    m.email,
    m.full_name,
    caller_member.full_name,
    caller_member.email
  from members m
  where m.id = any(p_member_ids)
  order by m.email;
end;
$$;

grant execute on function create_report_group(text, uuid[]) to authenticated;

-- ============================================================
-- add_report_group_members -- invita a más gente a un grupo YA abierto,
-- o vuelve a invitar (pending) a quien había rechazado. Nunca toca a
-- quien ya está 'pending' o 'accepted' (idempotente, como
-- update_cycle_request_evaluators). Devuelve solo las filas realmente
-- tocadas -- nuevas o reinvitadas --, para que el manager mande el email
-- únicamente a esas personas.
-- ============================================================
create or replace function add_report_group_members(p_group_id uuid, p_member_ids uuid[])
returns table (
  member_id uuid,
  email text,
  full_name text,
  inviter_full_name text,
  inviter_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  grp report_groups;
  is_allowed boolean;
  mid uuid;
  touched_ids uuid[] := '{}';
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

  select (caller_member.id = grp.created_by_member_id) or exists (
    select 1 from report_group_members
    where group_id = p_group_id and member_id = caller_member.id and status = 'accepted'
  ) into is_allowed;

  if not is_allowed then
    raise exception 'Solo quien creó el grupo, o alguien que ya haya aceptado formar parte, puede invitar a más personas.';
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
    raise exception 'Todos deben ser compañeros activos de tu empresa con al menos un 360 ya finalizado.';
  end if;

  foreach mid in array p_member_ids loop
    -- Ya está dentro (pendiente o aceptado): no se toca, no se re-manda
    -- email -- mismo criterio "solo lo nuevo" que update_cycle_request_evaluators.
    if exists (
      select 1 from report_group_members
      where group_id = p_group_id and member_id = mid and status in ('pending', 'accepted')
    ) then
      continue;
    end if;

    if exists (select 1 from report_group_members where group_id = p_group_id and member_id = mid) then
      -- Estaba 'rejected': se reinvita, vuelve a 'pending'.
      update report_group_members
      set status = 'pending', responded_at = null
      where group_id = p_group_id and member_id = mid;
    else
      insert into report_group_members (group_id, member_id) values (p_group_id, mid);
    end if;

    touched_ids := array_append(touched_ids, mid);
  end loop;

  return query
  select m.id, m.email, m.full_name, caller_member.full_name, caller_member.email
  from members m
  where m.id = any(touched_ids)
  order by m.email;
end;
$$;

grant execute on function add_report_group_members(uuid, uuid[]) to authenticated;

-- ============================================================
-- remove_report_group_member -- quita a alguien de un grupo YA abierto
-- (típicamente quien no responde o rechazó, para poder llegar al 100% de
-- aceptados con el resto). Mismo criterio de "quién puede" que
-- add_report_group_members.
-- ============================================================
create or replace function remove_report_group_member(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  grp report_groups;
  is_allowed boolean;
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

  select (caller_member.id = grp.created_by_member_id) or exists (
    select 1 from report_group_members
    where group_id = p_group_id and member_id = caller_member.id and status = 'accepted'
  ) into is_allowed;

  if not is_allowed then
    raise exception 'Solo quien creó el grupo, o alguien que ya haya aceptado formar parte, puede quitar a alguien del grupo.';
  end if;

  delete from report_group_members
  where group_id = p_group_id and member_id = p_member_id;
end;
$$;

grant execute on function remove_report_group_member(uuid, uuid) to authenticated;

-- ============================================================
-- close_report_group -- ahora exige el 100% de los miembros actuales
-- aceptados (ninguno pending/rejected), no solo un mínimo. El mínimo de
-- personas (min_invitees_per_request) se mantiene como suelo de
-- anonimato: sigue haciendo falta ese mínimo de aceptados, pero ahora
-- además todos los que queden en el grupo tienen que haber aceptado --
-- si alguien no responde o rechaza, hay que quitarlo con
-- remove_report_group_member para poder cerrar.
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

  if exists (
    select 1 from report_group_members
    where group_id = p_group_id and status in ('pending', 'rejected')
  ) then
    raise exception 'Todavía hay invitados que no han aceptado. Espera a que respondan, o quítalos del grupo si hace falta.';
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
    raise exception 'Hacen falta al menos % personas en el grupo para poder cerrarlo.', min_needed;
  end if;

  update report_groups set status = 'closed', closed_at = now() where id = p_group_id;
end;
$$;

grant execute on function close_report_group(uuid) to authenticated;

-- ============================================================
-- Textos de la pantalla de informes de grupo, en platform_texts (antes
-- hardcodeados en el JSX) -- uno para el listado (/dashboard/groups) y
-- otro para la creación (/dashboard/groups/nuevo), más el email de
-- invitación (antes inexistente).
-- ============================================================
insert into platform_texts (key, content) values (
  'report_groups_intro',
  'Un informe de grupo junta el 360 ya finalizado de varias personas en una sola vista agregada — útil para ver cómo se percibe a un equipo o a un conjunto de personas en su conjunto, no solo individualmente.

Cualquiera puede crear uno, siempre que ya tenga su propio 360 finalizado. Solo se puede invitar a compañeros que también lo tengan — es lo único que se agrega, no se pide feedback nuevo a nadie.

Cada persona invitada recibe un email y decide si acepta o rechaza. El informe se genera cuando todos los miembros del grupo han aceptado.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'report_group_creation_intro',
  'Elige a quién invitar. Cada uno recibirá un email avisándole de que le has invitado a este grupo, y podrá aceptar o rechazar desde su panel — el informe agregado solo se genera cuando **todos** hayan aceptado.

Solo aparecen compañeros que ya tienen su propio 360 finalizado: es lo único que se agrega, no se pide nada nuevo. Mientras el grupo siga abierto podrás invitar a más personas, o quitar a quien no responda o rechace.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'report_group_invite_email_subject',
  '{nombre} te ha invitado a un grupo: {grupo}'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'report_group_invite_email_body',
  '**{nombre}** te ha invitado a formar parte del grupo **{grupo}** en Brújula — un informe agregado que junta el 360 ya finalizado de varias personas.

Puedes aceptar o rechazar la invitación desde tu panel. Si aceptas, tu 360 (ya finalizado) se suma al agregado del grupo — nadie ve tu resultado individual dentro de él, solo la media conjunta.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

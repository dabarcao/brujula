-- Brújula — borra SOLO las cuentas individuales de prueba (organizations.kind
-- = 'individual': el flujo "no soy una empresa" de create_individual_account),
-- con cascada a sus members, feedback_requests/invitations/responses/answers
-- y platform_settings propios. NO TOCA ninguna empresa (Kairos Experience
-- incluida) ni al Admin general — pensado para limpiar el jaleo de cuentas
-- verifica-*/prueba-*/etc. de testing manual antes de volver a sembrar datos
-- limpios con scripts/seed-full-360.mjs.
--
-- organizations->members tiene "on delete cascade", pero members->auth.users
-- va en la otra dirección (borrar el auth.user borraría el member, no al
-- revés) — así que primero se capturan los auth_user_id afectados en una
-- tabla temporal, se borran las organizations, y solo entonces se borran
-- esos auth.users ya huérfanos.
--
-- Irreversible. Pensado para ejecutarse a mano en el SQL Editor de Supabase.

create temporary table _individual_auth_ids as
select m.auth_user_id
from members m
join organizations o on o.id = m.organization_id
where o.kind = 'individual';

delete from organizations where kind = 'individual';

delete from auth.users where id in (select auth_user_id from _individual_auth_ids);

drop table _individual_auth_ids;

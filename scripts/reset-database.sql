-- Brújula — reset completo de datos de piloto. Borra TODAS las empresas
-- (con cascada a empleados, departamentos, ciclos, solicitudes y
-- respuestas de feedback) y TODAS las cuentas de auth, dejando solo el
-- Admin general admin@brujula.es. No toca el esquema (tablas, funciones),
-- solo los datos.
--
-- Irreversible. Pensado para ejecutarse a mano en el SQL Editor de
-- Supabase cuando se pida explícitamente un reset del piloto.

delete from organizations;

delete from platform_admins where lower(email) <> 'admin@brujula.es';

delete from auth.users where lower(email) <> 'admin@brujula.es';

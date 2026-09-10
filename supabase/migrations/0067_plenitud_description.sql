-- Brújula — Biblioteca (sección 15/17 del spec): el texto de "Plenitud" que
-- se muestra al hacer clic en el modelo estaba hardcodeado en
-- biblioteca/page.tsx porque competency_principles no tenía columna
-- description (a diferencia de competency_roles y competency_frameworks,
-- que sí la tenían desde el principio). Se añade aquí para poder editarlo
-- sin tocar código, igual que el resto de textos del modelo.

alter table competency_principles add column description text;

update competency_principles
set description = 'Plenitud no es un rol más: es la coherencia interna de la persona, la base sobre la que se apoyan los cuatro roles. No depende de qué tarea toque hacer ni de qué rol se esté ejerciendo en cada momento — está siempre presente, o no, debajo de todo lo demás.'
where code = 'wholeness';

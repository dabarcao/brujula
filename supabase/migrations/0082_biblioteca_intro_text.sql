-- Brújula — el párrafo de intro de la Biblioteca estaba escrito directo
-- en biblioteca/page.tsx (por eso hacía falta desplegar solo para
-- corregir "15" a "16" competencias, hace un rato). Se mueve a
-- platform_texts, mismo mecanismo que ya usan los textos del asistente
-- del 360 — editable sin desplegar.

insert into platform_texts (key, content) values (
  'biblioteca_intro',
  'El modelo de competencias de Brújula: Plenitud y los cuatro roles VACC, con las 16 competencias que los componen.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

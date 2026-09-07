-- Brújula — tabla genérica de textos editables de la interfaz (clave →
-- contenido), para no dejar cada texto explicativo escrito a mano en el
-- código cuando conviene poder cambiarlo sin desplegar. Por ahora se edita
-- directamente aquí, en el SQL Editor — el panel de admin para gestionarlo
-- queda pendiente (mismo patrón ya anotado en el backlog para cuestionarios
-- y competencias, spec.md sección 17).

create table platform_texts (
  key text primary key,
  content text not null,
  updated_at timestamptz not null default now()
);

alter table platform_texts enable row level security;

create policy "platform_texts readable by authenticated"
  on platform_texts for select
  using (auth.role() = 'authenticated');

insert into platform_texts (key, content) values (
  'individual_360_intro',
  'El cuestionario completo de 360º (las 14 competencias) más tu propia autoevaluación. Elige quién te evalúa y, para cada persona, en qué grupo encaja: "jefe o responsable directo" (alguien con autoridad formal sobre tu trabajo), "compañero de equipo" (con quien trabajas codo con codo), "compañero" (te conoce pero no es de tu equipo cercano) u "otro" (por ejemplo, un cliente o colaborador externo). No hace falta que encajen perfectamente — elige lo que más se le parezca. Nadie sabrá qué respondió quién, y no verás nada hasta que respondan al menos 3 personas.'
);

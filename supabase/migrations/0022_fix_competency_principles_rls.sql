-- Brújula — arregla un olvido de la migración 0021: competency_principles
-- se creó sin RLS ni política de lectura, así que quedaba invisible para
-- cualquiera (mismo patrón que ya tenía competency_frameworks).

alter table competency_principles enable row level security;

create policy "competency_principles readable by authenticated"
  on competency_principles for select
  using (auth.role() = 'authenticated');

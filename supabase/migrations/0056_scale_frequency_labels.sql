-- Brújula — las etiquetas de rating_scale_levels eran de evaluación de
-- desempeño ("No cumple con las expectativas"... "Supera las
-- expectativas ampliamente") — no pegan con el tono humanista de la
-- plataforma (sección 7 del spec: "no mide desempeño ni skills
-- técnicos"). Las preguntas de escala son afirmaciones de comportamiento
-- ("Mantiene la calma...", "Tiene claro para qué existe su trabajo..."),
-- así que una escala de frecuencia encaja mejor que una de desempeño o
-- de satisfacción.

update rating_scale_levels set label = 'Nunca', description = 'No se observa este comportamiento.' where level = 1;
update rating_scale_levels set label = 'Pocas veces', description = 'Se observa en contadas ocasiones.' where level = 2;
update rating_scale_levels set label = 'A veces', description = 'Se observa con cierta frecuencia, sin ser lo habitual.' where level = 3;
update rating_scale_levels set label = 'A menudo', description = 'Se observa la mayoría de las veces.' where level = 4;
update rating_scale_levels set label = 'Siempre', description = 'Se observa de forma constante.' where level = 5;

-- Brújula — "Propósito (articulación con sentido)" era el único nombre de
-- competencia bastante más largo que el resto (todas las demás son de una
-- o dos palabras), así que se recorta en el radar de la Biblioteca. Se deja
-- como "Propósito", igual de corto que sus 15 hermanas — la explicación
-- más larga ya vive en `description`, no hace falta repetirla en el
-- nombre.

update competency_frameworks
set name = 'Propósito'
where code = 'proposito_articulacion';

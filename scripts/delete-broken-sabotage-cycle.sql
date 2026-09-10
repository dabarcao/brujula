-- Brújula — borra la tanda de 5 informes 360 de Kairos Experience creada
-- justo antes de aplicar la migración 0070 (David, Sonia, María, Javier,
-- Laura), clonada con el bug de self_only/saboteador_code perdidos —
-- los evaluadores respondieron 43 preguntas en vez de 33. Ya se generó una
-- tanda nueva y buena (otro cycle_id) para los mismos 5, así que esta no
-- hace falta conservarla. No toca ningún otro ciclo — ni el de antes de la
-- 0053 (VACC) que quedó como ejemplo de dato viejo, ni los usados para
-- Informes de grupo.
--
-- Irreversible. Ejecutar a mano en el SQL Editor de Supabase.

delete from feedback_requests
where id in (
  '22cd26cd-61b8-419d-a800-de81b425de70', -- sonia.hernandez
  '13aa4fb1-8918-4464-adcf-bb78873d4172', -- davidabarca
  'd7386ab4-98af-4abe-ad3b-950d8cf16788', -- maria.lopez
  '77f63dab-ab0e-4fb9-a756-aaded1267f22', -- javier.martin
  '5cb12391-bf94-4def-bc7a-70f818da729f'  -- laura.sanchez
);

-- La plantilla clonada para ese ciclo (preguntas propias, ya sin ningún
-- feedback_requests que la use) se borra junto con el propio ciclo.
delete from survey_templates
where id = (select template_id from feedback_cycles where id = '745a3146-bb5d-44a3-bdc8-bfc6941076da');

delete from feedback_cycles where id = '745a3146-bb5d-44a3-bdc8-bfc6941076da';

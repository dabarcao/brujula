-- Brújula — Biblioteca: texto de "Organizaciones Teal" con **negrita**
-- (ahora ya soportada ahí, componente FormattedText compartido con el
-- asistente del 360) y la enumeración final de los 5 roles reescrita como
-- lista — cada uno en su propio párrafo (línea en blanco entre ellos) en
-- vez de una sola frase corrida, para que se vea como lista real y no
-- como texto que se junta todo en una línea.

update competency_principles
set description = '**En la mayoría de las organizaciones** actuales la estructura se distribuye de forma jerárquica: una jerarquía con delegación en la que, en la mayoría de las ocasiones, **lo que se delega son las acciones a realizar, pero no las decisiones.**

Esto hace que, a la hora de tomar decisiones, los propios equipos deban escalarlas hacia arriba, provocando cuellos de botella y lentitud.

Existe una forma diferente de enfrentarnos a un mundo cada vez más ágil y cambiante: delegar también las decisiones.

Para ello es necesario transformar la entidad de equipos delegados a equipos autoorganizados — equipos con poder y autoridad, asegurando que las decisiones que toman están alineadas con la visión estratégica y el propósito de la organización.

Un equipo autoorganizado no nace de que alguien "le dé" más poder a sus miembros: nace de que cada persona se vuelve consciente del poder que ya tiene — para decidir, para actuar, para cuestionar, para cuidar de sí misma y del equipo — y que la organización jerárquica normalmente mantiene invisible o inhibido.

**Brújula** no reparte competencias ni autoridad: es un espejo que hace visible dónde ya se está ejerciendo ese poder, con más o menos fuerza, en cada una de las cinco dimensiones.

Para que un equipo pueda desarrollar todo su potencial hacen falta las siguientes condiciones:

**Plenitud** —> Cada individuo sea la mejor versión de sí mismo.

**Visión** —> El equipo tiene una visión clara hacia dónde va.

**Catalizador** —> Gestionar de forma colectiva la energía del equipo y usarla para avanzar.

**Arquitecto** —> Desarrollar la cultura y procesos internos.

**Coach** —> Apoyarse unos a otros en el proceso de desarrollo tanto individual como colectivo.'
where code = 'organizacion_teal';

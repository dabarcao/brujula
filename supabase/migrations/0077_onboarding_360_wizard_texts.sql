-- Brújula — textos del asistente de onboarding al iniciar un 360 (tres
-- pasos: contexto antes de elegir evaluadores, explicación de la selección,
-- y nota final de cómo invitarlos). Mismo mecanismo que ya existe en
-- platform_texts (0044) — editable sin desplegar. Compartidos entre el
-- flujo de empresa (organizar evaluadores en un ciclo) y el individual
-- (pedir un 360 propio): el contenido no depende de cuál sea.
--
-- **negrita** al estilo markdown: es la única marca que entiende
-- Onboarding360Wizard (componente FormattedParagraph) — lo que no encaje
-- con ese patrón se muestra tal cual, nunca se interpreta como HTML.
--
-- ON CONFLICT DO UPDATE en vez de un insert simple: así esta migración se
-- puede volver a pegar sin problema aunque ya se hubiera aplicado antes
-- (por ejemplo, para recoger este cambio de formato sobre el texto ya
-- insertado), en vez de fallar por clave duplicada.

insert into platform_texts (key, content) values (
  'onboarding_360_intro',
  '**Bienvenido a tu proceso de Feedback 360**

Vas a pedirle a las personas que te rodean que te cuenten algo que casi nunca nos atrevemos a preguntar: **qué impacto tienes en ellas**.

Esto no es una evaluación de desempeño, ni un examen de si lo estás haciendo bien o mal. Es información — sobre cómo te perciben los demás — que hoy permanece casi siempre invisible. No busca decirte quién eres, sino ayudarte a ser más intencional en cómo te relacionas, decides y lideras.

**Todo lo que recibas es anónimo.** Nadie —ni la empresa, ni tú mismo— puede saber qué respondió cada persona, ni siquiera quién decidió no responder. Responder es una elección libre de cada evaluador, y es justamente esa libertad la que hace que el feedback que sí llega sea honesto.

Antes de elegir a quién se lo vas a pedir, tómate un momento para responder, aunque sea para ti mismo a las siguientes preguntas: 

¿para qué quiero hacer este 360 ahora? 
¿Qué es lo que quiero cambiar o trabajar? 

Y sobre todo: ¿qué busco en las personas que voy a elegir — que me desafíen, que me muestren algo incómodo, que me den confianza?

Esa intención es la que va a guiar a quién eliges y cómo lees lo que te digan. No se trata de encontrar las respuestas correctas ahora — se trata de empezar con los ojos abiertos.

**¿Comenzamos?**'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'onboarding_360_seleccion',
  '**Selección de evaluadores** — para que el feedback sea rico y de verdad útil, elige personas que te vean trabajar desde distintos ángulos, no solo a las que tienes más cerca.

**Jefe:** cualquier persona con la que hayas tenido una relación jerárquica por encima de ti — tu responsable actual, o alguien que lo haya sido antes.

**Equipo:** las personas con las que trabajas codo a codo en el día a día.

**Empresa:** compañeros con un rol y nivel similar al tuyo, con quienes coincides en proyectos transversales pero no forman parte de tu equipo directo.

**Otros:** un grupo con algo en común entre sí — por ejemplo, gente con la que participas en un proyecto puntual, o con la que te reúnes semanalmente para tratar temas concretos. No es un cajón de sastre: elige a quienes comparten ese contexto específico contigo.

Para que cada grupo cuente con anonimato garantizado, necesitas un mínimo de 3 respuestas por grupo — te recomendamos invitar al menos 4 personas por grupo, por si alguna no llega a responder.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'onboarding_360_confirmacion',
  '**Cómo invitar a participar a tus evaluadores**

Hemos enviado un email a todos tus evaluadores, no obstante como vivimos en un mundo en el que recibimos constantemente correos nuestra invitación es a que te acerques a tus evaluadores.

Un mensaje tuyo antes o después de que llegue —por WhatsApp, en persona o por email— cambia mucho cómo se recibe la invitación. No hace falta nada elaborado: basta con decirle a esa persona que la has elegido a propósito, que responda cuando le venga bien, y que su feedback es importante para ti. Ese gesto es lo que convierte un email más en una invitación genuina.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

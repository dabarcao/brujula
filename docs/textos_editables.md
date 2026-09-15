# Mapa de textos editables sin desplegar

Referencia de todo el texto de producto que vive en la base de datos (Supabase)
en vez de escrito en el código — y por tanto se puede cambiar pegando un
`update`/`insert` en el SQL Editor, sin tocar `brujula-app` ni hacer un
`git push`. No incluye textos hardcodeados en componentes (esos solo cambian
con un despliegue).

Cuando se añada un texto editable nuevo, añádelo aquí también — no hay
ningún sitio del código que liste esto automáticamente; esta tabla es la
única fuente de verdad y hay que mantenerla a mano.

## 1. `platform_texts` — textos sueltos de pantallas concretas

Tabla genérica `key text primary key, content text` (migración `0044`). Sin
categorías ni prefijos obligatorios — la convención es que las claves
relacionadas comparten un prefijo común a simple vista.

| Key | Para qué | Se usa en |
|---|---|---|
| `individual_360_intro` | Texto de intro del 360 individual (histórico — sustituido en la práctica por `onboarding_360_intro` + `onboarding_360_seleccion`, ver más abajo; se deja la fila sin borrar) | ya no se lee desde código |
| `onboarding_360_intro` | Paso 1 del asistente: contexto/reflexión antes de elegir evaluadores | [cycles/[id]/page.tsx](../src/app/dashboard/cycles/[id]/page.tsx), [feedback/nueva-360/page.tsx](../src/app/dashboard/feedback/nueva-360/page.tsx) |
| `onboarding_360_seleccion` | Paso 2: qué significa cada categoría de evaluador (jefe/equipo/empresa/otros) y el mínimo recomendado | mismos dos archivos |
| `onboarding_360_confirmacion` | Paso 3: cómo invitar a los evaluadores tras confirmar | mismos dos archivos |

Si se añade una key nueva, el sitio donde buscarla en código es
`grep -rn "getPlatformText(" src` — el segundo argumento de cada llamada es
la key, el tercero es el texto de repuesto que se usa si la fila no existe
todavía en Supabase.

## 2. Modelo de competencias (Biblioteca)

Tres tablas relacionadas, todas leídas por
[biblioteca/page.tsx](../src/app/dashboard/biblioteca/page.tsx). A diferencia
de `platform_texts`, cada fila se identifica por un `code` propio del
dominio, no por una key de texto libre.

### `competency_principles` — marco general y Plenitud

| code | name | description |
|---|---|---|
| `organizacion_teal` | Organizaciones Teal | Introducción al marco (Frederic Laloux) que da contexto a los 4 roles VACC |
| `wholeness` | Plenitud | Qué es Plenitud y por qué no es "un rol más" |
| `evolutionary_purpose`, `self_organizing_team` | — | Filas antiguas sin `description`, no se exponen al usuario |

### `competency_roles` — los 4 roles VACC

| code | name actual | description |
|---|---|---|
| `visionario` | Visión | (el `code` se quedó igual al renombrar en la v2 del modelo para no romper referencias en el frontend — ver `GROUP_COLORS`/`GROUP_LABELS` en [CompetencyRadar.tsx](../src/components/CompetencyRadar.tsx)) |
| `arquitecto` | Arquitecto | — |
| `catalizador` | Catalizador | — |
| `coach` | Coach | — |

### `competency_frameworks` — las 16 competencias

`code, name, description, role_id`. El `description` de cada una es lo que
se muestra en la Biblioteca **y** el tooltip al pasar el ratón por una
competencia mencionada en una interpretación de IA
([InterpretationText.tsx](../src/components/InterpretationText.tsx)) — un
cambio aquí afecta a los dos sitios a la vez.

Lista completa de `code` actuales (16, modelo v2): `vision_estrategica`,
`proposito_articulacion`, `orientacion_valor`, `orientacion_resultados`,
`direccion_compartida`, `cultura`, `organizacion_trabajo`, `presencia`,
`toma_decisiones`, `valentia`, `sentido_colectivo`, `mentoring`,
`coaching`, `inteligencia_relacional`, `autenticidad`, `gestion_emocional`.

## 3. `survey_questions.prompt` — texto de las preguntas del cuestionario

También en BBDD y técnicamente editable igual que lo anterior, pero **no
recomendado tocar como si fuera copy suelto**: cada pregunta está ligada por
`position` y `competency_code`/`saboteador_code` a la lógica de puntuación y
al agrupamiento del informe (ver migración `0071`). Cambiar el texto de una
pregunta es seguro; cambiar a qué competencia apunta o su orden, no — eso es
un cambio de modelo, no de redacción.

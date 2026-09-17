import { redirect } from "next/navigation";

// Nunca hubo una landing pública real que mostrar aquí -- este archivo era
// un placeholder mínimo desde el arranque del proyecto (copy genérico,
// clases sueltas sin el sistema de diseño de DESIGN.md), fácil de
// confundir con una pantalla vieja/sin terminar. La raíz del dominio pasa
// directo a /login; /registro (alta de cuenta individual) sigue
// existiendo y accesible directamente, solo deja de enlazarse desde aquí.
export default function Home() {
  redirect("/login");
}

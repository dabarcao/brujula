import type { Metadata } from "next";
import "./globals.css";

// Usamos la pila de fuentes del sistema en vez de next/font/google: evita
// una dependencia de red en tiempo de build y es más rápido de servir.

export const metadata: Metadata = {
  title: "Brújula",
  // Deliberadamente distinta del tagline que ya lleva horneado
  // opengraph-image.tsx ("Encuentra tu rumbo, con feedback seguro.") --
  // en la vista previa de WhatsApp salen los dos a la vez (uno dentro de
  // la imagen, este como texto debajo), y el usuario prefirió verlos
  // complementarse en vez de repetirse.
  description: "Tu brújula para crecer: feedback anónimo y honesto de las personas que te conocen mejor.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

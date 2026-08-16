import type { Metadata } from "next";
import "./globals.css";

// Usamos la pila de fuentes del sistema en vez de next/font/google: evita
// una dependencia de red en tiempo de build y es más rápido de servir.

export const metadata: Metadata = {
  title: "Brújula",
  description: "Feedback anónimo entre compañeros, con orientación hacia la mejora.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

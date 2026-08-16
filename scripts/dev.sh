#!/bin/bash
# Arranca "next dev" forzando Node 20+ (instalado vía Homebrew como node@20),
# porque el Node por defecto del sistema (v18) es demasiado antiguo para
# Next.js 16 (requiere >=20.9.0). Ver conversación de configuración inicial.
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "$(dirname "$0")/.."
exec npm run dev

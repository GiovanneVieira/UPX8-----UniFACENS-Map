import { ScrollViewStyleReset } from "expo-router/html";
import type { ReactNode } from "react";

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>UniFACENS Map — Locais do campus</title>
        <ScrollViewStyleReset />
        <style
          // Scrollbar sutil e consistente (painel admin em navegadores
          // WebKit/Firefox) — o default do SO destoa do tema claro do painel.
          dangerouslySetInnerHTML={{
            __html: `
              ::-webkit-scrollbar { width: 10px; height: 10px; }
              ::-webkit-scrollbar-track { background: #f1f5f9; }
              ::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 999px;
                border: 2px solid #f1f5f9;
              }
              ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
              * { scrollbar-width: thin; scrollbar-color: #cbd5e1 #f1f5f9; }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

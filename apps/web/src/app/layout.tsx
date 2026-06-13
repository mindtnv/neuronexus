import { Inter_Tight, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { Bootstrap } from "@/lib/bootstrap";
import { I18nProvider } from "@/lib/i18n";
import { DialogProvider } from "@/components/dialog";
import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

export { metadata, viewport } from "./layout.metadata";

// Anti-FOUC theme bootstrap — runs synchronously in <head> BEFORE the body
// paints, so theme users never see the wrong palette. Reads the persisted
// preference (default 'system') and stamps the concrete data-theme plus its
// light/dark family. Kept in lock-step with lib/theme.ts.
const THEME_INIT_SCRIPT = `(function(){try{var m={dark:'dark',light:'light',aurora:'dark',bloom:'light',dracula:'dark',nord:'dark',solarized:'light',gruvbox:'dark',catppuccin:'dark',monokai:'dark',rosepine:'dark',tokyonight:'dark',onedark:'dark',everforest:'dark',kanagawa:'dark',ayu:'dark',material:'dark',synthwave:'dark'};var p=localStorage.getItem('nn:theme');if(!m[p]&&p!=='system')p='system';var t=p;if(p==='system')t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';var e=document.documentElement;e.setAttribute('data-theme',t);e.setAttribute('data-theme-mode',m[t]||'dark');}catch(_){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <I18nProvider>
          <DialogProvider>
            <Bootstrap />
            {children}
          </DialogProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

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
// paints, so a light-mode user never sees a dark flash. Reads the persisted
// preference ('dark'|'light'|'system', default 'system') and sets/removes the
// `data-theme="light"` attribute on <html>. Kept in lock-step with lib/theme.ts.
const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('nn:theme');if(p!=='dark'&&p!=='light'&&p!=='system')p='system';var light=p==='light'||(p==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches);var e=document.documentElement;if(light)e.setAttribute('data-theme','light');else e.removeAttribute('data-theme');}catch(_){}})();`;

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

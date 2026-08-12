import { Inter_Tight, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { Bootstrap } from "@/lib/bootstrap";
import { I18nProvider } from "@/lib/i18n";
import { DialogProvider } from "@/components/dialog";
import { AppNavigationProvider } from "@/components/navigation";
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
const THEME_INIT_SCRIPT = `(function(){try{var m={dark:'dark',light:'light',aurora:'dark',bloom:'light',dracula:'dark',nord:'dark',solarized:'light',gruvbox:'dark',catppuccin:'dark',monokai:'dark',rosepine:'dark',tokyonight:'dark',onedark:'dark',everforest:'dark',kanagawa:'dark',ayu:'dark',material:'dark',synthwave:'dark'};var c={dark:'#111317',light:'#ffffff',aurora:'#0b1714',bloom:'#ffffff',dracula:'#343746',nord:'#343b49',solarized:'#fffaf0',gruvbox:'#32302f',catppuccin:'#242438',monokai:'#303126',rosepine:'#211f30',tokyonight:'#1f2335',onedark:'#2f343f',everforest:'#303a40',kanagawa:'#252532',ayu:'#171d26',material:'#2d3b42',synthwave:'#2a2040'};var p=localStorage.getItem('nn:theme');if(!m[p]&&p!=='system')p='system';var t=p;if(p==='system')t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';var e=document.documentElement;e.setAttribute('data-theme',t);e.setAttribute('data-theme-mode',m[t]||'dark');var tc=c[t]||c.dark;var metas=document.querySelectorAll('meta[name="theme-color"]');if(metas.length){for(var i=0;i<metas.length;i++){metas[i].setAttribute('content',tc);metas[i].removeAttribute('media');}}else{var meta=document.createElement('meta');meta.name='theme-color';meta.content=tc;document.head.appendChild(meta);}}catch(_){}})();`;

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
            <AppNavigationProvider>
              <Bootstrap />
              {children}
            </AppNavigationProvider>
          </DialogProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

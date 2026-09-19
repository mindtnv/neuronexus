import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { THEME_CSS, THEME_INIT_SCRIPT } from "@/lib/theme";
import { Bootstrap } from "@/lib/bootstrap";
import { I18nProvider } from "@/lib/i18n";
import { DialogProvider } from "@/components/dialog";
import { AppNavigationProvider } from "@/components/navigation";
import "./globals.css";
import "@/components/design-system/components.css";

const golos = localFont({ src: './fonts/GolosText.ttf', variable: '--font-golos-text', weight: '400 900', display: 'swap' });
const literata = localFont({ src: './fonts/Literata.ttf', variable: '--font-literata', weight: '200 900', display: 'swap' });

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export { metadata, viewport } from "./layout.metadata";

// Shared runtime paints mode, palette and browser chrome before hydration.

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${golos.variable} ${jetbrainsMono.variable} ${literata.variable}`}

    >
      <head>
        <style data-reomi-palettes>{THEME_CSS}</style>
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

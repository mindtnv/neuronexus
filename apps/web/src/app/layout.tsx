import localFont from "next/font/local";
import { THEME_CSS, THEME_INIT_SCRIPT } from "@/lib/theme";
import { Bootstrap } from "@/lib/bootstrap";
import { I18nProvider } from "@/lib/i18n";
import { DialogProvider } from "@/components/dialog";
import { AppNavigationSessionProvider } from "@/components/navigation";
import { Suspense } from 'react';
import { NNPageSkeleton } from '@/components/ui';
import { NAVIGATION_HISTORY_INIT_SCRIPT } from '@/lib/navigation-history';
import "./globals.css";
import "@/components/design-system/components.css";

const golos = localFont({ src: './fonts/GolosText.ttf', variable: '--font-golos-text', weight: '400 900', display: 'swap' });
const literata = localFont({ src: './fonts/Literata.ttf', variable: '--font-literata', weight: '200 900', display: 'swap' });

const jetbrainsMono = localFont({
  src: './fonts/JetBrainsMono.ttf',
  variable: "--font-jetbrains-mono",
  weight: '400 600',
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
        <script dangerouslySetInnerHTML={{ __html: NAVIGATION_HISTORY_INIT_SCRIPT }} />
        <style data-reomi-palettes>{THEME_CSS}</style>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <I18nProvider>
          <DialogProvider>
            <Suspense fallback={<NNPageSkeleton />}><AppNavigationSessionProvider>
              <Bootstrap />
              {children}
            </AppNavigationSessionProvider></Suspense>
          </DialogProvider>
        </I18nProvider>
      </body>
    </html>
  );
}


import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "BlackWorld — Dark Fantasy MMORPG",
  description: "A brutal, turn-based dark fantasy MMORPG. Descend into the abyss, master ancient blood magic, forge legendary artifacts, and survive the apocalypse. Free to play.",
  keywords: ["MMORPG", "dark fantasy", "browser game", "text RPG", "PvP", "BlackWorld", "online RPG", "free MMORPG"],
  authors: [{ name: "BlackWorld" }],
  creator: "BlackWorld",
  metadataBase: new URL("https://blackworld.vercel.app"),
  openGraph: {
    title: "BlackWorld — Dark Fantasy MMORPG",
    description: "Descend into the abyss. A brutal, free-to-play text MMORPG with PvP, guilds, crafting, and a living dark world.",
    url: "https://blackworld.vercel.app",
    siteName: "BlackWorld",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "BlackWorld — Dark Fantasy MMORPG",
    description: "Descend into the abyss. A brutal, free-to-play text MMORPG with PvP, guilds, crafting, and a living dark world.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
  },
  manifest: "/manifest.json",
  other: {
    "theme-color": "#030303",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

import ErrorBoundary from "@/components/ErrorBoundary";
import SoundEngine from "@/components/SoundEngine";

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
          <ErrorBoundary>
            <SoundEngine>
              {children}
            </SoundEngine>
          </ErrorBoundary>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "./theme";
import "./globals.css";
import "./modules.css";
import "./backend.css";
import "./auth.css";
import "./invitations.css";
import "./client-file.css";
import "./weekly-control.css";
import "./letter-library.css";
import "./new-case.css";
import "./client-admin.css";
import "./client-credit-report.css";
import "./plan-download.css";
import "./theme.css";
import "./report-analysis.css";
import "./workday-report.css";
import "./responsive.css";
import "./agent-assist.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OXXUS Credit Solutions",
  description: "Gestión profesional de clientes, casos y disputas de crédito.",
  openGraph: {
    title: "OXXUS Credit Solutions",
    description: "Tu operación de crédito, en un solo lugar.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "OXXUS Credit Solutions",
    description: "Tu operación de crédito, en un solo lugar.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "OXXUS",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1524" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning className={`${plexSans.variable} ${geistMono.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('oxxus-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.setAttribute('data-theme','dark');}else{document.documentElement.setAttribute('data-theme','light');}}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
      </head>
      <body className={`${plexSans.className} antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

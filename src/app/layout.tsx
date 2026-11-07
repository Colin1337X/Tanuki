import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './studio.css';

const fredoka = localFont({ src: './fonts/Fredoka.ttf', variable: '--font-fredoka', display: 'swap', weight: '300 700' });

export const metadata: Metadata = {
  title: 'Tanuki Stories',
  description: 'A personal reading and writing studio for curious minds',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tanuki Stories',
  },
};

export const viewport: Viewport = {
  themeColor: '#f5f3ec',
  width: 'device-width',
  initialScale: 1,
  // No maximumScale/user-scalable lock: iPadOS ignores it anyway, and keeping
  // pinch-zoom available is an accessibility win. viewportFit lets iPad
  // safe-area padding (added in globals.css) take effect.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={fredoka.variable}>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}

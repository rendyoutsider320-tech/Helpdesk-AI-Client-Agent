import type { Metadata } from 'next'
import './globals.css'
import AuthProvider from '@/components/AuthProvider'

export const metadata: Metadata = {
  title: 'Helpdesk AI - Enterprise Ticketing System',
  description: 'AI-powered enterprise helpdesk with monitoring and troubleshooting',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className="dark" style={{ backgroundColor: '#050b14' }}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (theme === 'light') {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.classList.add('light');
                    document.documentElement.style.backgroundColor = '#f5f3ec';
                  } else {
                    document.documentElement.classList.add('dark');
                    document.documentElement.classList.remove('light');
                    document.documentElement.style.backgroundColor = '#050b14';
                  }
                } catch (e) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased" style={{ backgroundColor: '#050b14' }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}

import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'BudgetLens',
  description: 'Your personal financial tracking dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-background`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="absolute right-4 top-4">
            <ThemeToggle />
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

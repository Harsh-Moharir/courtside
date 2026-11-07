import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { TournamentProvider } from '@/components/providers/tournament-context';
import { getActiveTournament } from '@/lib/queries/tournament';
import { getServerClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

const display = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-display', display: 'swap' });
const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getActiveTournament();
  const name = t?.name ?? 'Basketball Tournament';
  return {
    metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
    title: { default: name, template: `%s | ${name}` },
    description: t?.tagline ?? `${name}: teams, player auction, fixtures, live scores, points table and playoffs.`,
    openGraph: { siteName: name, type: 'website' },
    twitter: { card: 'summary_large_image' },
  };
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tournament = await getActiveTournament();
  const supabase = await getServerClient();
  const { count } = await supabase.from('fixtures').select('id', { count: 'exact', head: true }).eq('status', 'live');
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-sans">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <TournamentProvider initial={tournament}>
          <Navbar initialLiveCount={count ?? 0} />
          <main id="main">{children}</main>
          <Footer />
        </TournamentProvider>
        <Toaster theme="dark" position="bottom-center" richColors closeButton />
      </body>
    </html>
  );
}

import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

/** Signs the user out (cookies can only be cleared in a Route Handler) and returns to the login page. */
export async function GET(request: NextRequest) {
  const supabase = await getServerClient();
  await supabase.auth.signOut();
  const error = request.nextUrl.searchParams.get('error');
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = error ? `?error=${encodeURIComponent(error)}` : '';
  return NextResponse.redirect(url);
}

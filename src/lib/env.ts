import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({ message: 'NEXT_PUBLIC_SUPABASE_URL must be the Supabase project URL' }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, { message: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing' }),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
});

// Next.js inlines NEXT_PUBLIC_ variables only when they are referenced literally.
const parsed = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
});

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration. Copy .env.example to .env.local and fill it in.\n${lines}`);
}

export const env = parsed.data;

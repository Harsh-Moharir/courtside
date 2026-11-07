/**
 * Grants admin rights to an existing Supabase Auth user (create the user first in the dashboard:
 * Authentication > Users > Add user). Usage: pnpm tsx scripts/add-admin.ts someone@example.com
 */
import { serviceClient } from './_client';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: pnpm tsx scripts/add-admin.ts <email>');
    process.exit(1);
  }
  const supabase = serviceClient();
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!userId) {
    console.error(`No auth user with email ${email}. Create it in Supabase: Authentication > Users > Add user.`);
    process.exit(1);
  }
  const { error } = await supabase.from('administrators').upsert({ user_id: userId, email }, { onConflict: 'user_id' });
  if (error) throw error;
  console.log(`✔ ${email} is now an administrator.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

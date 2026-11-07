/**
 * Creates the first administrator (idempotent). Uses the service-role key, so run it locally only:
 *   pnpm tsx scripts/bootstrap-admin.ts
 */
import { serviceClient } from './_client';

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in .env.local first.');
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
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created auth user ${email}`);
  } else {
    console.log(`Auth user ${email} already exists`);
  }
  const { error } = await supabase.from('administrators').upsert({ user_id: userId, email }, { onConflict: 'user_id' });
  if (error) throw error;
  console.log(`✔ ${email} is an administrator.`);
  console.log('Reminder: sign in and change this password at /admin/account.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

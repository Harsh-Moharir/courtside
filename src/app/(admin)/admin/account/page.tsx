import type { Metadata } from 'next';
import { AccountForm } from '@/components/admin/account-form';
import { PageHeader } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Account' };

export default function AccountPage() {
  return (
    <div className="max-w-xl">
      <PageHeader title="Account" subtitle="Change your password. Use a long, unique password." />
      <AccountForm />
    </div>
  );
}

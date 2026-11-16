import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import Nav from '@/components/Nav';
import { UserProvider } from '@/components/UserContext';

export const dynamic = 'force-dynamic';

export default async function MainLayout({ children }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  return (
    <UserProvider user={user}>
      <Nav user={user} />
      <main className="main">{children}</main>
    </UserProvider>
  );
}

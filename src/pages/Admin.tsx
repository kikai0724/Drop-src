import { useEffect } from 'react';
import { discordRPC } from '../utils/discordRPC';

const ADMIN_URL = ((import.meta as any).env?.VITE_ADMIN_URL as string) || '/admin';

interface AdminProps {
  user: {
    username: string;
    avatar_url: string;
  };
}

export default function AdminPage({ user }: AdminProps) {
  useEffect(() => {
    if (user?.avatar_url && user?.username) {
      discordRPC.setShopActivity(user.avatar_url, user.username);
    }
  }, [user?.avatar_url, user?.username]);

  return (
    <div className="w-full h-screen relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none" />
      <div className="relative z-10 h-full p-4 sm:p-6">
        <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          <iframe
            src={ADMIN_URL}
            title="Admin"
            className="h-full w-full border-0"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}

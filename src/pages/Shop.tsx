import { useEffect } from 'react';
import { discordRPC } from '../utils/discordRPC';
import t from '../utils/i18n';

interface ShopProps {
  user: {
    username: string;
    avatar_url: string;
    accountId: string;
    email?: string;
    password?: string;
    mtxCurrency?: string;
  };
}

const SHOP_URL = ((import.meta as any).env?.VITE_SHOP_URL as string) || 'http://35.221.95.153:3551/shop';

export default function Shop({ user }: ShopProps) {
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
            src={SHOP_URL}
            title={t('shopSubtitle') || 'Shop'}
            className="h-full w-full border-0"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}

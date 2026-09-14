import { useEffect, useState } from 'react';
import { discordRPC } from '../utils/discordRPC';

interface StatsProps {
  user: {
    username: string;
    avatar_url: string;
    accountId: string;
    email?: string;
    password?: string;
    mtxCurrency?: string;
  };
}

const DEFAULT_STATS_URL = 'http://35.221.95.153:3551/gsstats';
const STATS_URL = ((import.meta as any).env?.VITE_STATS_URL as string) || DEFAULT_STATS_URL;
const hasStatsEndpoint = Boolean(STATS_URL && STATS_URL.trim().length > 0);

export default function Stats({ user }: StatsProps) {
  const [hasStatsLoadError, setHasStatsLoadError] = useState(false);

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
          {!hasStatsEndpoint || hasStatsLoadError ? (
            <div className="flex h-full w-full items-center justify-center bg-slate-950 text-slate-200">
              <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 px-8 py-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.4)]">
                <div className="text-2xl font-semibold tracking-tight">No status yet</div>
                <div className="mt-3 text-sm leading-6 text-slate-400">
                  There is no status source configured for this launcher yet, so there is nothing to display here.
                </div>
              </div>
            </div>
          ) : (
            <iframe
              src={STATS_URL}
              title={'Status'}
              className="h-full w-full border-0"
              loading="lazy"
              onError={() => setHasStatsLoadError(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

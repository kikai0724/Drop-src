import { useState } from 'react';
import { BiRefresh } from 'react-icons/bi';
import t from '../utils/i18n';

export default function Server() {
  const [isLoading, setIsLoading] = useState(false);

  const refresh = async () => {
    setIsLoading(true);
    // iframe reload is handled by key change or DOM; here we just toggle loading indicator briefly
    setTimeout(() => setIsLoading(false), 800);
  };

  return (
    <div className="p-8 h-screen relative overflow-auto">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none z-0"></div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm text-white/60 uppercase tracking-widest">{t('dropStatusTitle')}</div>
            <h1 className="text-white font-bold font-['Bricolage_Grotesque'] text-4xl">{t('gameServerStatus')}</h1>
            <p className="text-white/60 mt-1 text-sm">{t('dropStatusSubtitle')}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              disabled={isLoading}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors duration-200 disabled:opacity-50"
            >
              <BiRefresh size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-4 border border-white/10 shadow-lg">
          <div className="overflow-hidden rounded-lg border-2 border-white/5">
            <iframe
              src="https://dropstats.up.railway.app/"
              title="Drop Server Status"
              className="w-full h-[75vh] bg-transparent"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              frameBorder="0"
              scrolling="yes"
            />
          </div>

          <p className="mt-4 text-white/80 font-['Bricolage_Grotesque'] text-center text-sm">
            {t('dropStatusDescription')}{' '}
            <a
              href="https://dropstats.up.railway.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300"
            >{t('statsPageLinkText')}</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

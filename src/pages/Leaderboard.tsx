import { FaDiscord } from 'react-icons/fa';
import t from '../utils/i18n';

export default function Leaderboard() {
  return (
    <div className="p-8 h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none z-0"></div>
      
      <div className="flex flex-col items-center justify-center h-full relative z-10">
        <iframe
          src="https://drop-stats.up.railway.app/"
          title={t('stats')}
          className="w-full max-w-5xl h-[85vh] rounded-xl border shadow-lg"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          frameBorder="0"
          scrolling="yes"
        />
        <p className="mt-6 text-white/80 font-['Bricolage_Grotesque'] text-center text-sm">
          {t('statsPageIntro')}{' '}
          <a
            href="https://drop-stats.up.railway.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300"
          >
            {t('stats')}
          </a>
          .
        </p>
        <a 
          href="https://discord.gg/dropfn" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-white hover:text-indigo-300 transition-colors duration-200 mt-4"
        >
          <FaDiscord size={24} />
          <span className="font-['Bricolage_Grotesque'] font-medium text-lg">{t('discordLinkText')}</span>
        </a>
      </div>
    </div>
  );
}

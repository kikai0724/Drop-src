import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { MdOutlineFolder } from "react-icons/md";
import { IoCartOutline } from "react-icons/io5";
import { FaMusic, FaHome, FaShieldAlt, FaChartBar } from "react-icons/fa";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi";
import Settings from './Settings';
import { useSidebar } from './Layout';
import { useTheme } from '../contexts/ThemeContext';
import t from '../utils/i18n';
import { getDisplayName, getRoleTag } from '../utils/userHelpers';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  text: string;
  isActive: boolean;
  isCollapsed: boolean;
}

interface SidebarProps {
  user: {
    username: string;
    avatar_url: string;
    email: string;
    accountId: string;
    role: {
      name: string;
      color: string;
      badge?: string | null;
      hasTesterRole?: boolean;
      hasAdminRole?: boolean;
      roleId?: string | null;
    };
  };
  onLogout: () => void;
  onUpdateDisplayName: (displayName: string) => void;
}

const NavItem = ({ to, icon, text, isActive, isCollapsed }: NavItemProps) => (
  <Link
    to={to}
    className={`flex items-center w-[97%] h-10 rounded-lg transition-all duration-200 mb-2.5 ${isCollapsed ? 'px-2 justify-center' : 'px-4'}
                font-['Bricolage_Grotesque'] group relative
                ${isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
  >
    <span className={`${isCollapsed ? 'text-4xl' : 'text-2xl'} transition-all duration-200`}>{icon}</span>
    {!isCollapsed && <span className="ml-3.5 font-medium text-[14px]">{text}</span>}
    {isCollapsed && !isActive && (
      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900/95 backdrop-blur-md rounded-md text-white text-sm font-['Bricolage_Grotesque'] opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-[100]">
        {text}
      </div>
    )}
  </Link>
);

export default function Sidebar({ user, onLogout, onUpdateDisplayName }: SidebarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<'profile' | 'themes' | 'other'>('profile');
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const { currentTheme } = useTheme();
  const location = useLocation();
  const currentPath = location.pathname;
  const roleTag = getRoleTag(user);
  const canAccessAdmin = !!user.role?.hasAdminRole;

  useEffect(() => {
    const handleOpenSettings = (event: CustomEvent) => {
      const section = event.detail?.section;
      if (section === 'themes') {
        setSettingsSection('themes');
      } else if (section === 'other') {
        setSettingsSection('other');
      } else {
        setSettingsSection('profile');
      }
      setIsSettingsOpen(true);
    };

    window.addEventListener('openSettings', handleOpenSettings as EventListener);
    return () => {
      window.removeEventListener('openSettings', handleOpenSettings as EventListener);
    };
  }, []);

  return (
    <>
      <aside className={`${isCollapsed ? 'w-[110px]' : 'w-[260px]'} h-full fixed left-3 top-3 z-10 transition-all duration-300`}>
        <div
          className="absolute inset-0 overflow-hidden rounded-[28px] border border-white/10 shadow-[0_25px_60px_rgba(15,23,42,0.45)]"
          style={{ background: currentTheme.colors.sidebar }}
        ></div>
        <div className="absolute inset-0 bg-slate-950/10 backdrop-blur-xl pointer-events-none rounded-[28px]" />

        <div className="relative z-10 flex h-full flex-col p-3.5">
          <div className="flex items-center justify-center mb-7 mt-2">
            {isCollapsed ? (
              <img
                src="../SidebarDrop.png"
                alt="Drop"
                className="w-12 h-12 rounded-2xl object-cover shadow-lg shadow-violet-500/20"
              />
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 w-full justify-center">
                <span className="text-[26px] font-black tracking-[-0.08em] text-white">Drop</span>
              </div>
            )}
          </div>

          <div className={`space-y-1.5 ${isCollapsed ? 'mt-4' : ''}`}>
            <NavItem
              to="/home"
              icon={<FaHome size={18} />}
              text={t('home') || 'Home'}
              isActive={currentPath === '/home'}
              isCollapsed={isCollapsed}
            />
            <NavItem
              to="/library"
              icon={<MdOutlineFolder size={20} />}
              text={t('library')}
              isActive={currentPath === '/library'}
              isCollapsed={isCollapsed}
            />
            <NavItem
              to="/music"
              icon={<FaMusic size={18} />}
              text={t('music')}
              isActive={currentPath === '/music'}
              isCollapsed={isCollapsed}
            />
            <NavItem
              to="/shop"
              icon={<IoCartOutline size={19} />}
              text={t('shop') || 'Shop'}
              isActive={currentPath === '/shop'}
              isCollapsed={isCollapsed}
            />
            <NavItem
              to="/stats"
              icon={<FaChartBar size={18} />}
              text={'Status'}
              isActive={currentPath === '/stats'}
              isCollapsed={isCollapsed}
            />
            {canAccessAdmin && (
              <NavItem
                to="/admin"
                icon={<FaShieldAlt size={18} />}
                text="Admin"
                isActive={currentPath === '/admin'}
                isCollapsed={isCollapsed}
              />
            )}
          </div>

          <div className="mt-auto">
            <div className="flex justify-center mb-3">
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-9 h-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all duration-200"
              >
                {isCollapsed ? <HiChevronRight size={16} /> : <HiChevronLeft size={16} />}
              </button>
            </div>

            <div className="h-px bg-white/10 mb-3" />

            {isCollapsed ? (
              <div className="flex flex-col items-center gap-3">
                <button
                  className="p-2 transition-all duration-200 hover:bg-white/10 rounded-xl group relative border border-white/5 bg-white/5"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <img src="/setting.png" alt="Settings" className="w-5 h-5" />
                  <div className="absolute left-full ml-2 px-2 py-1 bg-slate-950/90 border border-white/10 rounded-md text-white text-xs opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-[100]">
                    {t('settings')}
                  </div>
                </button>
                <div className="w-11 h-11 rounded-full overflow-hidden ring-2 ring-white/10 shadow-lg shadow-slate-950/50 group relative">
                  <img
                    src={user.avatar_url || 'https://i.imgur.com/BlTvkMc.png'}
                    alt={`${getDisplayName(user)}'s avatar`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute left-full ml-2 px-2 py-1 bg-slate-950/90 border border-white/10 rounded-md text-white text-xs opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-[100]">
                    {getDisplayName(user)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5 flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/10">
                  <img
                    src={user.avatar_url || 'https://i.imgur.com/BlTvkMc.png'}
                    alt={`${getDisplayName(user)}'s avatar`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="text-white font-semibold font-['Bricolage_Grotesque'] text-xs truncate leading-tight">
                    <strong style={{
                      fontSize: getDisplayName(user).length > 12 ?
                        `${Math.max(10, 12 - (getDisplayName(user).length - 12) * 0.5)}px` :
                        '12px'
                    }}>
                      {getDisplayName(user)}
                    </strong>
                  </p>
                  <div className="mt-1 flex items-center gap-1">
                    {roleTag ? (
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                        style={{
                          backgroundColor: `${roleTag.color}22`,
                          borderColor: `${roleTag.color}55`,
                          color: roleTag.color,
                        }}
                      >
                        {roleTag.label}
                      </span>
                    ) : (
                      <p
                        className="text-[10px] font-['Bricolage_Grotesque']"
                        style={{ color: currentTheme.colors.textSecondary }}
                      >
                        {t('member')}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="ml-auto p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all duration-200 border border-white/5"
                  aria-label={t('settings')}
                >
                  <img src="/setting.png" alt="Settings" className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialSection={settingsSection}
        user={user}
        onLogout={onLogout}
        onUpdateDisplayName={onUpdateDisplayName}
      />
    </>
  );
}

import { useLocation } from 'react-router-dom';
import { useState, createContext, useContext } from 'react';
import Frame from "./Frame";
import Sidebar from "./Sidebar";
import { useTheme } from '../contexts/ThemeContext';

const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const SidebarContext = createContext<{
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}>({
  isCollapsed: false,
  setIsCollapsed: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

interface LayoutProps {
  children: React.ReactNode;
  user: any | null;
  isPreparing: boolean;
  onLogout: () => void;
  onUpdateDisplayName: (displayName: string) => void;
}

export default function Layout({ children, user, isPreparing, onLogout, onUpdateDisplayName }: LayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const isInitialPath = location.pathname === '/';
  const { currentTheme } = useTheme();

  const showSidebar = !isLoginPage && !isInitialPath && user && !isPreparing;

  return (
    <SidebarContext.Provider value={{ isCollapsed, setIsCollapsed }}>
      <div
        className="min-h-screen px-3 pb-3 pt-[48px]"
        style={{
          backgroundColor: currentTheme.colors.background,
          background: currentTheme.id === 'default'
            ? `radial-gradient(circle at top left, ${hexToRgba(currentTheme.colors.primary, 0.26)}, transparent 25%), radial-gradient(circle at bottom right, ${hexToRgba(currentTheme.colors.secondary, 0.22)}, transparent 28%), ${currentTheme.colors.background}`
            : `radial-gradient(circle at top left, ${hexToRgba(currentTheme.colors.primary, 0.34)}, transparent 24%), radial-gradient(circle at bottom right, ${hexToRgba(currentTheme.colors.secondary, 0.28)}, transparent 30%), linear-gradient(to bottom, ${hexToRgba(currentTheme.colors.primary, 0.4)}, ${hexToRgba(currentTheme.colors.secondary, 0.35)}, ${hexToRgba(currentTheme.colors.accent, 0.3)})`
        }}
      >
        <Frame />
        <div className="mx-auto flex h-[calc(100vh-60px)] max-w-[1700px] overflow-hidden rounded-[30px] border border-white/10 bg-slate-950/40 shadow-[0_25px_80px_rgba(15,23,42,0.6)] backdrop-blur-xl">
          {showSidebar && <Sidebar user={user} onLogout={onLogout} onUpdateDisplayName={onUpdateDisplayName} />}
          <main
            className={`flex-1 transition-all duration-300 overflow-y-auto min-h-full ${showSidebar ? (isCollapsed ? 'ml-[110px]' : 'ml-[260px]') : ''}`}
            style={{
              background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.34), rgba(15, 23, 42, 0.12))',
            }}
          >
            <div className="h-full w-full p-4 md:p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}

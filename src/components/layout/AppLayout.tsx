/**
 * F004: App Layout - Main application layout wrapper
 * 
 * Features:
 * - Responsive sidebar navigation
 * - Header with user menu
 * - Mobile-friendly hamburger menu
 * - Smooth transitions with Framer Motion
 * 
 * @module components/layout/AppLayout
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Menu,
  X,
  Settings,
  LogOut,
  Plus,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  id: string;
  label: string;
  href: string;
  badge?: string;
}

const navItems: NavItem[] = [
  { id: 'chat', label: 'Companion', href: '/' },
  { id: 'journal', label: 'Journal', href: '/journal' },
  { id: 'voice', label: 'Voice', href: '/voice' },
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'reports', label: 'Reports', href: '/reports' },
  { id: 'assessment', label: 'Check-in', href: '/assessment' },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const handleNavClick = (href: string) => {
    setLocation(href);
    setMobileMenuOpen(false);
  };

  const triggerChatAction = (action: 'new' | 'history') => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pendingChatAction', action);
      window.dispatchEvent(new CustomEvent('mindscribe:chat-action', { detail: action }));
    }
    setLocation('/');
    setMobileMenuOpen(false);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isActive = (href: string) => {
    if (href === '/') return location === '/';
    return location.startsWith(href);
  };

  return (
    <div className="journal-shell min-h-screen bg-[var(--bg)] text-[var(--text-primary)] [font-family:Inter,sans-serif]">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 bg-[var(--surface)] border-b border-[var(--inner)]">
        <div className="flex items-center justify-between h-full px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            className="text-[var(--text-secondary)] hover:bg-[var(--inner)] hover:text-[var(--text-primary)] transition-colors duration-200"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <span className="nav-title text-lg text-[var(--text-primary)]">MindScribe</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-[var(--inner)] text-[var(--text-primary)] text-xs">
                    {getInitials(user?.name || user?.username || 'User')}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{user?.name || user?.username}</span>
                  <span className="text-xs text-muted-foreground">{user?.email || user?.username}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-red-700">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-50 bg-black/20"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-[var(--surface)] shadow-lg"
            >
              <div className="flex flex-col h-full">
                {/* Mobile Menu Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--inner)]">
                  <span className="nav-title text-lg text-[var(--text-primary)]">MindScribe</span>
                  <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="text-[var(--text-secondary)] hover:bg-[var(--inner)] hover:text-[var(--text-primary)] transition-colors duration-200">
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                {/* Mobile Navigation */}
                <nav className="flex-1 p-4 space-y-1">
                  {navItems.map((item) => (
                    item.id === 'chat' ? (
                      <div
                        key={item.id}
                        className={cn(
                          'w-full px-4 py-3 rounded-[10px] transition-colors duration-200 flex items-center justify-between gap-2',
                          isActive(item.href)
                            ? 'bg-[var(--inner)] text-[var(--accent)] font-medium'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--inner)]/70 hover:text-[var(--text-primary)]'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleNavClick(item.href)}
                          className="font-medium text-left"
                        >
                          {item.label}
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => triggerChatAction('new')}
                            className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-[var(--card)]/70 transition-colors duration-200"
                            aria-label="Create new chat"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerChatAction('history')}
                            className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-[var(--card)]/70 transition-colors duration-200"
                            aria-label="Open chat history"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        key={item.id}
                        onClick={() => handleNavClick(item.href)}
                        className={cn(
                          'w-full px-4 py-3 rounded-[10px] text-left transition-colors duration-200',
                          isActive(item.href)
                            ? 'bg-[var(--inner)] text-[var(--accent)] font-medium'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--inner)]/70 hover:text-[var(--text-primary)]'
                        )}
                      >
                        <span className="font-medium">{item.label}</span>
                        {item.badge && (
                          <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-[var(--inner)]">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    )
                  ))}
                </nav>

                {/* Mobile Menu Footer */}
                <div className="p-4 border-t border-[var(--inner)]">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-[var(--text-secondary)] hover:bg-[var(--inner)] hover:text-[var(--text-primary)] transition-colors duration-200 mb-2"
                    onClick={() => handleNavClick('/settings')}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-red-700 hover:bg-red-50 transition-colors duration-200"
                    onClick={logout}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 280 : 80 }}
        transition={{ duration: 0.2 }}
        className="hidden lg:flex fixed left-0 top-0 bottom-0 z-40 flex-col bg-[var(--surface)] border-r border-[var(--inner)]"
      >
        {/* Sidebar Header */}
        <div className="flex items-center p-4 h-16">
          <AnimatePresence>
            {sidebarOpen && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="nav-title text-lg text-[var(--text-primary)] whitespace-nowrap overflow-hidden"
              >
                MindScribe
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            item.id === 'chat' && sidebarOpen ? (
              <div
                key={item.id}
                className={cn(
                  'w-full px-3 py-3 rounded-[10px] transition-colors duration-200 flex items-center justify-between gap-2',
                  isActive(item.href)
                    ? 'bg-[var(--inner)] text-[var(--accent)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--inner)]/70 hover:text-[var(--text-primary)]'
                )}
              >
                <button
                  type="button"
                  onClick={() => handleNavClick(item.href)}
                  className="font-medium text-left"
                >
                  {item.label}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => triggerChatAction('new')}
                    className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-[var(--card)]/70 transition-colors duration-200"
                    aria-label="Create new chat"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerChatAction('history')}
                    className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-[var(--card)]/70 transition-colors duration-200"
                    aria-label="Open chat history"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.href)}
                className={cn(
                  'w-full px-3 py-3 rounded-[10px] text-left transition-colors duration-200 group relative',
                  isActive(item.href)
                    ? 'bg-[var(--inner)] text-[var(--accent)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--inner)]/70 hover:text-[var(--text-primary)]'
                )}
              >
                <AnimatePresence>
                  {sidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="font-medium whitespace-nowrap overflow-hidden"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                
                {/* Tooltip for collapsed state */}
                {!sidebarOpen && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-[var(--card)] text-[var(--text-primary)] text-sm rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-[var(--inner)]">
                    {item.label}
                  </div>
                )}
              </button>
            )
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[var(--inner)]">
          <Button
            variant="ghost"
            onClick={() => handleNavClick('/settings')}
            className={cn(
              'w-full mb-2 transition-colors duration-200',
              sidebarOpen ? 'justify-start' : 'justify-center',
              isActive('/settings')
                ? 'bg-[var(--inner)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--inner)] hover:text-[var(--text-primary)]'
            )}
          >
            <Settings className={cn('h-4 w-4', sidebarOpen ? 'mr-2' : '')} />
            {sidebarOpen && 'Settings'}
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={cn('w-full hover:bg-[var(--inner)] transition-colors duration-200', sidebarOpen ? 'justify-start' : 'justify-center')}>
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-[var(--inner)] text-[var(--text-primary)] text-xs">
                    {getInitials(user?.name || user?.username || 'User')}
                  </AvatarFallback>
                </Avatar>
                {sidebarOpen && (
                  <div className="ml-3 text-left overflow-hidden">
                    <div className="font-medium text-sm truncate">{user?.name || user?.username}</div>
                    <div className="text-xs text-[var(--text-secondary)] truncate">{user?.email || user?.username}</div>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-red-700">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main
        className={cn(
          'h-screen transition-all duration-200 journal-main',
          'pt-16 lg:pt-0', // Mobile header offset
          sidebarOpen ? 'lg:pl-[280px]' : 'lg:pl-20'
        )}
      >
        <div className="h-full journal-main">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;

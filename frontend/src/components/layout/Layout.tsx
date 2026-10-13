import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import GTSLogo from '../ui/GTSLogo';
import {
  LayoutDashboard,
  BarChart3,
  FileText,
  FilePlus,
  Calendar,
  CreditCard,
  TrendingUp,
  MapPin,
  Building2,
  Mail,
  Download,
  Users,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Billing Projections', path: '/projections', icon: BarChart3 },
    { label: 'Invoice Register', path: '/invoices', icon: FileText },
    { label: 'Create Invoice', path: '/invoices/new', icon: FilePlus },
    { label: 'Submission Tracker', path: '/submission', icon: Calendar },
    { label: 'Payment & Collections', path: '/payments', icon: CreditCard },
    { label: 'DSO & Ageing', path: '/dso', icon: TrendingUp },
    { label: 'Regions & Sites', path: '/regions', icon: MapPin },
    { label: 'Client Master', path: '/clients', icon: Building2 },
    { label: 'Outlook Integration', path: '/outlook', icon: Mail },
    { label: 'Reports & Exports', path: '/reports', icon: Download },
    ...(user?.role === 'SUPER_ADMIN'
      ? [{ label: 'User Management', path: '/users', icon: Users }]
      : []),
    ...(user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGEMENT'
      ? [{ label: 'Audit Logs', path: '/audit', icon: Shield }]
      : []),
    ...(user?.role === 'SUPER_ADMIN'
      ? [{ label: 'Settings', path: '/settings', icon: Settings }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-gts-900 text-white shrink-0 shadow-lg">
        {/* Brand Header */}
        <div className="p-4 border-b border-gts-800 flex items-center justify-center">
          <GTSLogo className="h-10" />
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gts-700 text-white shadow-sm'
                      : 'text-purple-100 hover:bg-gts-800 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="p-4 border-t border-gts-800 bg-gts-950/40">
          <div className="flex items-center justify-between">
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-white truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-purple-200 truncate">{user?.role?.replace('_', ' ')}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-1.5 text-purple-200 hover:text-white hover:bg-gts-800 rounded transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 sm:px-6 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded text-gray-600 hover:bg-gray-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <h1 className="text-lg font-bold text-gray-800 tracking-tight">
              Invoice-to-Collection Management System
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 text-sm text-gray-700 font-medium hover:text-gts-900 focus:outline-none"
              >
                <span className="w-8 h-8 rounded-full bg-gts-100 text-gts-900 font-bold flex items-center justify-center">
                  {user?.name ? user.name[0].toUpperCase() : 'G'}
                </span>
                <span className="hidden sm:inline">{user?.name}</span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-100 py-1 z-20">
                  <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-500">
                    Signed in as <br />
                    <span className="font-semibold text-gray-800">{user?.email}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative flex flex-col w-64 max-w-xs bg-gts-900 text-white z-50 p-4">
              <div className="flex items-center justify-between pb-4 border-b border-gts-800">
                <GTSLogo className="h-8" />
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto py-3 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
                          isActive ? 'bg-gts-700 text-white' : 'text-purple-100 hover:bg-gts-800'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Main Workspace Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  HomeIcon,
  CreditCardIcon,
  CheckCircleIcon,
  UsersIcon,
  CogIcon,
  ArrowRightOnRectangleIcon as LogoutIcon,
  Bars3Icon as MenuIcon,
  XMarkIcon as XIcon
} from '@heroicons/react/24/outline';

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: HomeIcon },
    { name: 'All Expenses', href: '/expenses', icon: CreditCardIcon },
    ...(user?.role === 'manager' || user?.role === 'admin' 
      ? [{ name: 'Approvals', href: '/approvals', icon: CheckCircleIcon }] 
      : []
    ),
    ...(user?.role === 'admin' 
      ? [
          { name: 'Users', href: '/users', icon: UsersIcon },
          { name: 'Settings', href: '/settings', icon: CogIcon }
        ] 
      : []
    ),
  ];

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        <div className={`relative flex flex-col w-64 bg-gradient-to-b from-slate-900 to-slate-800 shadow-2xl transform transition-all duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
                <span className="text-white font-bold text-lg">EF</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">ExpenseFlow</h1>
                <p className="text-xs text-slate-400">Expense Management</p>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white transition-colors duration-200">
              <XIcon className="w-6 h-6" />
            </button>
          </div>
          <nav className="flex-1 px-4 py-6 space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-6 px-3">Navigation</p>
            {navigation.map((item, index) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200 transform hover:scale-105 ${
                    isActive 
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg' 
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className={`p-2 rounded-lg mr-3 transition-all duration-200 ${
                    isActive 
                      ? 'bg-white/20' 
                      : 'bg-slate-700 group-hover:bg-slate-600'
                  }`}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="font-medium">{item.name}</span>
                  {isActive && (
                    <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse" />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t border-slate-700">
            <div className="flex items-center mb-4 p-3 bg-slate-700/50 rounded-xl">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mr-3">
                <span className="text-white font-medium text-sm">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-white">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-3 py-2 text-sm font-medium text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-all duration-200"
            >
              <LogoutIcon className="w-5 h-5 mr-3" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:bg-gradient-to-b lg:from-slate-900 lg:to-slate-800 lg:shadow-xl">
        <div className="flex items-center px-6 py-6 border-b border-slate-700">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
            <span className="text-white font-bold text-lg">EF</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">ExpenseFlow</h1>
            <p className="text-xs text-slate-400">Expense Management</p>
          </div>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-6 px-3">Navigation</p>
          {navigation.map((item, index) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`group flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200 transform hover:scale-105 animate-slide-up ${
                  isActive 
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg' 
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className={`p-2 rounded-lg mr-3 transition-all duration-200 ${
                  isActive 
                    ? 'bg-white/20' 
                    : 'bg-slate-700 group-hover:bg-slate-600'
                }`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="font-medium">{item.name}</span>
                {isActive && (
                  <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center mb-4 p-3 bg-slate-700/50 rounded-xl">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mr-3">
              <span className="text-white font-medium text-sm">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-2 text-sm font-medium text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-all duration-200"
          >
            <LogoutIcon className="w-5 h-5 mr-3" />
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 lg:hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-500 hover:text-gray-700 transition-colors duration-200 p-2 rounded-lg hover:bg-gray-100"
            >
              <MenuIcon className="w-6 h-6" />
            </button>
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-2">
                <span className="text-white font-bold text-sm">EF</span>
              </div>
              <h1 className="text-lg font-bold text-gray-900">ExpenseFlow</h1>
            </div>
            <div className="w-10" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-6 animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
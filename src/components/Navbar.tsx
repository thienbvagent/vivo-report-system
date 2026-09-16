'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, UploadCloud, LayoutDashboard, KeyRound } from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';

interface NavbarProps {
  user: {
    centerCode: string;
    centerName: string;
  };
}

export default function Navbar({ user }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      <header className="bg-slate-900 text-white shadow-md sticky top-0 z-50">
        <div className="w-full max-w-[99%] xl:max-w-[98%] 2xl:max-w-[97%] mx-auto px-3 sm:px-5">
          <div className="flex justify-between h-16 items-center">
            {/* Logo & Brand */}
            <div className="flex items-center space-x-4">
              <div className="bg-blue-600 p-2 rounded-lg font-black tracking-wider text-xl">
                vivo
              </div>
              <div>
                <div className="text-xs text-blue-400 font-semibold tracking-wide uppercase">
                  Hệ Thống Báo Cáo Bảo Hành CSKH
                </div>
                <div className="text-sm font-bold text-slate-100 flex items-center space-x-1.5">
                  <span>{user.centerName}</span>
                  <span className="bg-slate-800 text-blue-300 text-xs px-2 py-0.5 rounded font-mono border border-slate-700">
                    {user.centerCode}
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Link
                href="/dashboard"
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                  pathname === '/dashboard'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>

              <Link
                href="/uploads"
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                  pathname === '/uploads'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                <span>Tải Lên Excel</span>
              </Link>

              {/* Đổi Mật Khẩu */}
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(true)}
                title="Đổi mật khẩu TTBH"
                className="flex items-center space-x-1.5 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white rounded-md transition border border-slate-700"
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span className="hidden md:inline">Đổi Mật Khẩu</span>
              </button>

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                title="Đăng xuất"
                className="flex items-center space-x-1 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-950/40 hover:text-red-300 rounded-md transition ml-1 border border-red-900/50"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Thoát</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </>
  );
}

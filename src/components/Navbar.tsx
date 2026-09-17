'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, UploadCloud, LayoutDashboard, KeyRound, Menu, X, ChevronRight, Building2 } from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';

interface NavbarProps {
  user: {
    centerCode: string;
    centerName: string;
    mustChangePassword?: boolean;
  };
}

export default function Navbar({ user }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(Boolean(user?.mustChangePassword));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Đóng mobile menu khi chuyển trang
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      {user?.mustChangePassword && (
        <div className="bg-amber-500 text-slate-950 px-3 sm:px-4 py-2.5 text-xs font-bold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-base flex-shrink-0">⚠️</span>
            <span>Cảnh báo an ninh: TTBH đang sử dụng mật khẩu mặc định. Vui lòng đổi mật khẩu mới để bảo mật dữ liệu.</span>
          </div>
          <button
            onClick={() => setIsPasswordModalOpen(true)}
            className="w-full sm:w-auto px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-xs font-semibold transition shrink-0 text-center"
          >
            Đổi Mật Khẩu Ngay
          </button>
        </div>
      )}

      <header className="bg-slate-900 text-white shadow-md sticky top-0 z-40">
        <div className="w-full max-w-[99%] xl:max-w-[98%] 2xl:max-w-[97%] mx-auto px-3 sm:px-5">
          <div className="flex justify-between h-16 items-center">
            {/* Logo & Brand */}
            <div className="flex items-center space-x-2.5 sm:space-x-4 min-w-0">
              <Link href="/dashboard" className="bg-blue-600 hover:bg-blue-500 p-1.5 sm:p-2 rounded-lg font-black tracking-wider text-lg sm:text-xl flex-shrink-0 transition">
                vivo
              </Link>
              <div className="min-w-0">
                <div className="text-[10px] sm:text-xs text-blue-400 font-semibold tracking-wide uppercase truncate hidden xs:block">
                  Hệ Thống Báo Cáo Bảo Hành CSKH
                </div>
                <div className="text-xs sm:text-sm font-bold text-slate-100 flex items-center space-x-1.5 truncate">
                  <span className="truncate max-w-[150px] xs:max-w-[200px] sm:max-w-[280px] md:max-w-none">{user.centerName}</span>
                  <span className="bg-slate-800 text-blue-300 text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-mono border border-slate-700 flex-shrink-0">
                    {user.centerCode}
                  </span>
                </div>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center space-x-2 lg:space-x-3">
              <Link
                href="/dashboard"
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  pathname === '/dashboard'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>

              <Link
                href="/uploads"
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  pathname === '/uploads'
                    ? 'bg-blue-600 text-white shadow-sm'
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
                className="flex items-center space-x-1.5 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition border border-slate-700"
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Đổi Mật Khẩu</span>
              </button>

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                title="Đăng xuất"
                className="flex items-center space-x-1.5 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-950/40 hover:text-red-300 rounded-lg transition ml-1 border border-red-900/50"
              >
                <LogOut className="w-4 h-4" />
                <span>Thoát</span>
              </button>
            </div>

            {/* Mobile Hamburger Button */}
            <div className="flex md:hidden items-center space-x-1">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label={isMobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6 text-slate-200" /> : <Menu className="w-6 h-6 text-slate-200" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown / Drawer Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-slate-900/95 backdrop-blur-md px-4 pt-3 pb-5 space-y-3 animate-in fade-in slide-in-from-top-3 duration-150">
            {/* Center Info Card */}
            <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 flex items-start space-x-3">
              <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg flex-shrink-0 mt-0.5">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-400 font-medium">Trung tâm đăng nhập</div>
                <div className="text-sm font-bold text-slate-100 truncate">{user.centerName}</div>
                <div className="text-xs font-mono text-blue-400 mt-0.5">{user.centerCode}</div>
              </div>
            </div>

            {/* Navigation Links List */}
            <nav className="space-y-1.5">
              <Link
                href="/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition min-h-[44px] ${
                  pathname === '/dashboard'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <LayoutDashboard className="w-5 h-5 text-blue-400" />
                  <span>Bảng Điều Khiển (Dashboard)</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </Link>

              <Link
                href="/uploads"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition min-h-[44px] ${
                  pathname === '/uploads'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <UploadCloud className="w-5 h-5 text-emerald-400" />
                  <span>Tải Lên Báo Cáo & Jobcard</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </Link>

              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsPasswordModalOpen(true);
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition min-h-[44px]"
              >
                <div className="flex items-center space-x-2.5">
                  <KeyRound className="w-5 h-5 text-amber-400" />
                  <span>Đổi Mật Khẩu TTBH</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center space-x-2 px-3.5 py-2.5 rounded-xl text-sm font-bold text-red-400 bg-red-950/30 hover:bg-red-950/60 border border-red-900/50 transition min-h-[44px]"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Đăng Xuất Khỏi Hệ Thống</span>
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </>
  );
}

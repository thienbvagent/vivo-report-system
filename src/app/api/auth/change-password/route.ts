import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession, hashPassword, verifyPassword } from '@/lib/auth';
import { findUserByCode, updateUserPassword } from '@/lib/db-storage';

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.' }, { status: 401 });
    }

    const { currentPassword, newPassword, confirmPassword } = await req.json();

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng điền đầy đủ mật khẩu hiện tại, mật khẩu mới và xác nhận mật khẩu.' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'Xác nhận mật khẩu mới không khớp.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Mật khẩu mới phải có độ dài tối thiểu 8 ký tự.' },
        { status: 400 }
      );
    }

    if (newPassword === currentPassword) {
      return NextResponse.json(
        { success: false, error: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.' },
        { status: 400 }
      );
    }

    const user = findUserByCode(session.centerCode);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy thông tin tài khoản TTBH.' },
        { status: 404 }
      );
    }

    const isMatch = await verifyPassword(currentPassword, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json(
        { success: false, error: 'Mật khẩu hiện tại không chính xác.' },
        { status: 400 }
      );
    }

    const newHash = await hashPassword(newPassword);
    const updated = updateUserPassword(session.centerCode, newHash);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Không thể cập nhật mật khẩu vào cơ sở dữ liệu.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Đổi mật khẩu thành công! Vui lòng ghi nhớ mật khẩu mới của bạn.'
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Lỗi hệ thống khi xử lý đổi mật khẩu.' },
      { status: 500 }
    );
  }
}

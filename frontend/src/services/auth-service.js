import { SupabaseApiError, check } from './service-helpers.js';

export function createAuthService({ supabase, onUnauthorized = () => {} }) {
  async function user(required = true) {
    const result = await supabase.auth.getUser();
    if (result.error || !result.data.user) {
      if (required) {
        onUnauthorized();
        throw new SupabaseApiError('Phiên đăng nhập đã hết hạn.', 401);
      }
      return null;
    }
    return result.data.user;
  }

  async function profile(required = true) {
    const current = await user(required);
    if (!current) return null;
    const result = await supabase
      .from('profiles')
      .select('id,name,email,is_system_admin,avatar_path,created_at,updated_at')
      .eq('id', current.id)
      .maybeSingle();
    const row =
      check(result) || {
        id: current.id,
        name: current.user_metadata?.name || '',
        email: current.email,
        is_system_admin: false,
      };
    return {
      ...row,
      is_system_admin: Boolean(row.is_system_admin),
      avatar_version: row.avatar_path || null,
    };
  }

  async function uploadPrivateImage(path, file) {
    if (!file || !file.type?.startsWith('image/')) {
      throw new SupabaseApiError('Tệp ảnh không hợp lệ.', 422, {
        image: ['Chọn JPG, PNG hoặc WEBP.'],
      });
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new SupabaseApiError('Ảnh vượt quá 5 MB.', 422, {
        image: ['Ảnh tối đa 5 MB.'],
      });
    }
    const result = await supabase.storage.from('fcms-private').upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '31536000',
    });
    if (result.error) {
      throw new SupabaseApiError(result.error.message, 422, {
        image: [result.error.message],
      });
    }
    return path;
  }

  async function deletePrivateImage(path) {
    if (!path) return;
    const result = await supabase.storage.from('fcms-private').remove([path]);
    if (result.error) throw new SupabaseApiError(result.error.message, 422);
  }

  async function handleAuthRequest(clean, method, data, params, current, silentUnauthorized) {
    if (clean === '/auth/user') {
      return { data: await profile(!silentUnauthorized) };
    }

    if (clean === '/auth/register' && method === 'POST') {
      const result = await supabase.auth.signUp({
        email: String(data.email).toLowerCase(),
        password: data.password,
        options: { data: { name: data.name } },
      });
      if (result.error) throw new SupabaseApiError(result.error.message, 422);
      if (!result.data.session) {
        throw new SupabaseApiError(
          'Đăng ký thành công. Hãy xác minh email trước khi đăng nhập.',
          202
        );
      }
      return { data: await profile() };
    }

    if (clean === '/auth/login' && method === 'POST') {
      const result = await supabase.auth.signInWithPassword({
        email: String(data.email).toLowerCase(),
        password: data.password,
      });
      if (result.error) {
        throw new SupabaseApiError('Thông tin đăng nhập không chính xác.', 422, {
          email: ['Thông tin đăng nhập không chính xác.'],
        });
      }
      return { data: await profile() };
    }

    if (clean === '/auth/logout') {
      await supabase.auth.signOut();
      return {};
    }

    if (clean === '/auth/profile' && method === 'PATCH') {
      const result = await supabase.auth.updateUser({
        ...(data.email ? { email: data.email } : {}),
        data: { name: data.name },
      });
      if (result.error) throw new SupabaseApiError(result.error.message, 422);
      check(
        await supabase
          .from('profiles')
          .update({ name: data.name })
          .eq('id', current.id)
          .select('id')
          .single()
      );
      return { data: await profile() };
    }

    if (clean === '/auth/password' && method === 'PATCH') {
      const auth = await supabase.auth.signInWithPassword({
        email: current.email,
        password: data.current_password,
      });
      if (auth.error) {
        throw new SupabaseApiError('Mật khẩu hiện tại không chính xác.', 422, {
          current_password: ['Mật khẩu hiện tại không chính xác.'],
        });
      }
      const result = await supabase.auth.updateUser({ password: data.password });
      if (result.error) throw new SupabaseApiError(result.error.message, 422);
      return {};
    }

    if (clean === '/auth/forgot-password' && method === 'POST') {
      const result = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${location.origin}/#reset-password`,
      });
      if (result.error) throw new SupabaseApiError(result.error.message, 422);
      return { message: 'Nếu email tồn tại, liên kết đặt lại mật khẩu đã được gửi.' };
    }

    if (clean === '/auth/reset-password' && method === 'POST') {
      const result = await supabase.auth.updateUser({ password: data.password });
      if (result.error) throw new SupabaseApiError(result.error.message, 422);
      return {};
    }

    if (clean === '/auth/verification-notification') {
      const result = await supabase.auth.resend({
        type: 'signup',
        email: current.email,
      });
      if (result.error) throw new SupabaseApiError(result.error.message, 422);
      return { data: { message: 'Liên kết xác minh đã được gửi tới email của bạn.' } };
    }

    if (clean === '/auth/avatar' && (method === 'POST' || method === 'DELETE')) {
      const old = check(
        await supabase
          .from('profiles')
          .select('avatar_path')
          .eq('id', current.id)
          .single()
      )?.avatar_path;
      if (method === 'DELETE') {
        check(
          await supabase
            .from('profiles')
            .update({ avatar_path: null })
            .eq('id', current.id)
        );
        await deletePrivateImage(old);
        return { data: { version: null } };
      }
      const file = data.image;
      const path = `accounts/${current.id}/avatar-${crypto.randomUUID()}.${file.type.split('/')[1] || 'bin'}`;
      await uploadPrivateImage(path, file);
      check(
        await supabase
          .from('profiles')
          .update({ avatar_path: path })
          .eq('id', current.id)
      );
      if (old) await deletePrivateImage(old);
      return { data: { version: path } };
    }

    return null;
  }

  return {
    user,
    profile,
    uploadPrivateImage,
    deletePrivateImage,
    handleAuthRequest,
  };
}

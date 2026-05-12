import api from './api';
import { AuthUser } from '../types';

export const authService = {
  async login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const { data } = await api.post('/auth/login', { email, password });
    return data.data;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },

  async me(): Promise<AuthUser> {
    const { data } = await api.get('/auth/me');
    return data.data;
  },

  async forgotPassword(email: string): Promise<void> {
    await api.post('/auth/forgot-password', { email });
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await api.post('/auth/reset-password', { token, newPassword });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.put('/auth/change-password', { currentPassword, newPassword });
  },
};

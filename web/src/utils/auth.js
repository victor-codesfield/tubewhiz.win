import { auth as authApi, setToken, clearToken } from './api';

export async function loginWithGoogle(credentialResponse) {
  const result = await authApi.googleLogin(credentialResponse.credential);
  if (result.token) setToken(result.token);
  return result;
}

export async function loginDev() {
  const result = await authApi.devLogin();
  if (result.token) setToken(result.token);
  return result;
}

export async function fetchProfile() {
  return authApi.getProfile();
}

export function logout() {
  clearToken();
}

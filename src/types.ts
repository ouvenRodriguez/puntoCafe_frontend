export interface SessionUser {
  id: string;
  email: string;
  nombre: string;
}

export interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}

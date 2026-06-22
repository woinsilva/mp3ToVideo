export interface ApiErrorPayload {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthOrganization {
  id: string;
  name: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
  organization: AuthOrganization;
}

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: 'super_admin' | 'admin' | 'operator' | 'user';
  is_active: boolean;
  totp_enabled: boolean;
  totp_secret?: string;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
}

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
  expires_at: Date;
  revoked: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  runtime: 'nodejs' | 'python' | 'php' | 'static' | 'custom';
  entry_file?: string;
  start_command?: string;
  working_directory: string;
  port?: number;
  domain?: string;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'failed' | 'unknown';
  pid?: number;
  pm2_name?: string;
  env_vars?: Record<string, string>;
  restart_policy: 'always' | 'on-failure' | 'never';
  max_restarts: number;
  created_at: Date;
  updated_at: Date;
}

export interface Database {
  id: string;
  name: string;
  owner_id: string;
  engine: 'postgresql' | 'mariadb';
  host: string;
  port: number;
  db_username: string;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  ip_address?: string;
  details?: Record<string, unknown>;
  created_at: Date;
}

export interface ApiToken {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  scopes: string[];
  expires_at?: Date;
  last_used?: Date;
  created_at: Date;
  revoked: boolean;
}

export interface BackupJob {
  id: string;
  type: 'config' | 'database' | 'project';
  resource_id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  file_path?: string;
  file_size?: number;
  error?: string;
  created_at: Date;
  completed_at?: Date;
}

export interface AuthRequest extends Express.Request {
  user?: User;
  token?: ApiToken;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
      apiToken?: ApiToken;
    }
  }
}

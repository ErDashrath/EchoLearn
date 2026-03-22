/**
 * F001: Auth Service - Secure local authentication
 *
 * Features:
 * - PBKDF2 password hashing with unique salts
 * - In-memory auth session so encrypted data always requires a fresh key
 * - User data stored in device-local persistence with encryption
 *
 * @module services/auth-service
 */

import { storageService, CryptoUtils } from './storage-service';

// =============================================================================
// TYPES
// =============================================================================

export interface User {
  username: string;
  name?: string; // Display name (optional)
  email?: string;
  createdAt: string;
  lastLogin: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

// =============================================================================
// AUTH SERVICE CLASS
// =============================================================================

class AuthService {
  private currentUser: User | null = null;

  // ---------------------------------------------------------------------------
  // REGISTRATION
  // ---------------------------------------------------------------------------

  /**
   * Register a new user with encrypted credentials
   * @param username - Unique username
   * @param password - Plain text password (will be hashed)
   * @param email - Optional email address
   */
  async register(
    username: string,
    password: string,
    email?: string,
  ): Promise<AuthResult> {
    try {
      if (!username || username.length < 3) {
        return { success: false, error: 'Username must be at least 3 characters' };
      }

      if (!password || password.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters' };
      }

      const existing = await storageService.users.get(`user_${username}`);
      if (existing) {
        return { success: false, error: 'Username already exists' };
      }

      const salt = CryptoUtils.generateSalt();
      const hashedPassword = await this.hashPassword(password, salt);

      await storageService.users.save(`salt_${username}`, Array.from(salt));

      const user: User & { password: string } = {
        username,
        email,
        password: hashedPassword,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };

      await storageService.users.save(`user_${username}`, user);

      this.currentUser = {
        username,
        email,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      };

      console.log('User registered:', username);
      return { success: true, user: this.currentUser };
    } catch (error) {
      console.error('Registration failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------------------------

  /**
   * Authenticate user with credentials
   * @param username - Username
   * @param password - Plain text password
   */
  async login(username: string, password: string): Promise<AuthResult> {
    try {
      const saltArray = await storageService.users.get(`salt_${username}`);
      if (!saltArray) {
        return { success: false, error: 'Invalid username or password' };
      }

      const salt = new Uint8Array(saltArray as number[]);
      const user = (await storageService.users.get(`user_${username}`)) as
        | (User & { password: string })
        | null;

      if (!user) {
        return { success: false, error: 'Invalid username or password' };
      }

      const hashedPassword = await this.hashPassword(password, salt);
      if (user.password !== hashedPassword) {
        return { success: false, error: 'Invalid username or password' };
      }

      user.lastLogin = new Date().toISOString();
      await storageService.users.save(`user_${username}`, user);

      this.currentUser = {
        username,
        email: user.email,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      };

      await storageService.initializeForUser(password, salt);

      console.log('User logged in:', username);
      return { success: true, user: this.currentUser };
    } catch (error) {
      console.error('Login failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // LOGOUT
  // ---------------------------------------------------------------------------

  /**
   * Log out current user and clear session
   */
  logout(): void {
    this.currentUser = null;
    storageService.clearEncryptionKeys();
    console.log('User logged out');
  }

  // ---------------------------------------------------------------------------
  // SESSION MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Get current authenticated user
   */
  getCurrentUser(): User | null {
    return this.currentUser;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  }

  // ---------------------------------------------------------------------------
  // PASSWORD HASHING
  // ---------------------------------------------------------------------------

  /**
   * Hash password using PBKDF2 with salt
   * @param password - Plain text password
   * @param salt - Unique salt for this user
   */
  private async hashPassword(password: string, salt: Uint8Array): Promise<string> {
    const encoder = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256,
    );

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((value) => value.toString(16).padStart(2, '0')).join('');
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const authService = new AuthService();
export default authService;

/**
 * F001: Auth Service - Secure local authentication
 * 
 * Features:
 * - PBKDF2 password hashing with unique salts
 * - Session management via sessionStorage
 * - User data stored in LocalForage with encryption
 * 
 * @module services/auth-service
 */

import { storageService, CryptoUtils } from './storage-service';

// =============================================================================
// TYPES
// =============================================================================

export interface User {
  username: string;
  name?: string;       // Display name (optional)
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
    email?: string
  ): Promise<AuthResult> {
    try {
      // Validate inputs
      if (!username || username.length < 3) {
        return { success: false, error: 'Username must be at least 3 characters' };
      }
      
      if (!password || password.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters' };
      }
      
      // Check if username exists
      const existing = await storageService.users.get(`user_${username}`);
      if (existing) {
        return { success: false, error: 'Username already exists' };
      }
      
      // Generate unique salt for this user
      const salt = CryptoUtils.generateSalt();
      
      // Hash password with salt
      const hashedPassword = await this.hashPassword(password, salt);
      
      // Store salt (can be stored plainly - not secret)
      await storageService.users.save(`salt_${username}`, Array.from(salt));
      
      // Create user object
      const user: User & { password: string } = {
        username,
        email,
        password: hashedPassword,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      
      // Save user
      await storageService.users.save(`user_${username}`, user);
      
      // Set current user (without password)
      this.currentUser = { username, email, createdAt: user.createdAt, lastLogin: user.lastLogin };
      
      // Save session
      sessionStorage.setItem('mindscribe_user', JSON.stringify(this.currentUser));
      
      console.log('✅ User registered:', username);
      
      return { success: true, user: this.currentUser };
      
    } catch (error) {
      console.error('❌ Registration failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Registration failed' 
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
      // Get user's salt
      const saltArray = await storageService.users.get(`salt_${username}`);
      
      if (!saltArray) {
        return { success: false, error: 'Invalid username or password' };
      }
      
      const salt = new Uint8Array(saltArray as number[]);
      
      // Get user
      const user = await storageService.users.get(`user_${username}`) as (User & { password: string }) | null;
      
      if (!user) {
        return { success: false, error: 'Invalid username or password' };
      }
      
      // Verify password
      const hashedPassword = await this.hashPassword(password, salt);
      
      if (user.password !== hashedPassword) {
        return { success: false, error: 'Invalid username or password' };
      }
      
      // Update last login
      user.lastLogin = new Date().toISOString();
      await storageService.users.save(`user_${username}`, user);
      
      // Set current user (without password)
      this.currentUser = { 
        username, 
        email: user.email, 
        createdAt: user.createdAt, 
        lastLogin: user.lastLogin 
      };
      
      // Save session
      sessionStorage.setItem('mindscribe_user', JSON.stringify(this.currentUser));
      
      // Initialize encrypted storage for user data
      await storageService.initializeForUser(password, salt);
      
      console.log('✅ User logged in:', username);
      
      return { success: true, user: this.currentUser };
      
    } catch (error) {
      console.error('❌ Login failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Login failed' 
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
    sessionStorage.removeItem('mindscribe_user');
    storageService.clearEncryptionKeys();
    console.log('✅ User logged out');
  }
  
  // ---------------------------------------------------------------------------
  // SESSION MANAGEMENT
  // ---------------------------------------------------------------------------
  
  /**
   * Get current authenticated user
   */
  getCurrentUser(): User | null {
    if (this.currentUser) {
      return this.currentUser;
    }
    
    // Try to restore from session
    const sessionData = sessionStorage.getItem('mindscribe_user');
    
    if (sessionData) {
      try {
        this.currentUser = JSON.parse(sessionData);
        return this.currentUser;
      } catch {
        sessionStorage.removeItem('mindscribe_user');
      }
    }
    
    return null;
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
    
    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    // Derive hash using PBKDF2 with ArrayBuffer (not Uint8Array directly)
    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: 100000,  // High iteration count for security
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    
    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const authService = new AuthService();
export default authService;

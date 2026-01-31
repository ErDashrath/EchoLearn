/**
 * F001: Auth Context - React context for authentication state
 * 
 * Features:
 * - Global auth state management
 * - Login/Register/Logout actions
 * - DASS-21 assessment tracking
 * - Protected route support
 * 
 * @module contexts/AuthContext
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authService, User, AuthResult } from '@/services/auth-service';
import { storageService } from '@/services/storage-service';

// =============================================================================
// TYPES
// =============================================================================

interface AuthContextType {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasCompletedDASS21: boolean;
  
  // Actions
  login: (username: string, password: string) => Promise<AuthResult>;
  register: (username: string, password: string, email?: string) => Promise<AuthResult>;
  logout: () => void;
  
  // DASS-21
  setHasCompletedDASS21: (completed: boolean) => void;
  saveDASS21Results: (results: any) => Promise<boolean>;
  getDASS21Results: () => Promise<any>;
}

// =============================================================================
// CONTEXT
// =============================================================================

const AuthContext = createContext<AuthContextType | null>(null);

// =============================================================================
// HOOK
// =============================================================================

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

// =============================================================================
// PROVIDER
// =============================================================================

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompletedDASS21, setHasCompletedDASS21] = useState(false);
  
  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------
  
  useEffect(() => {
    const initAuth = async () => {
      // Check for existing session
      const currentUser = authService.getCurrentUser();
      setUser(currentUser);
      
      // Check DASS-21 completion if user exists
      if (currentUser) {
        await checkDASS21Completion(currentUser.username);
      }
      
      setIsLoading(false);
    };
    
    initAuth();
  }, []);
  
  // ---------------------------------------------------------------------------
  // DASS-21 HELPERS
  // ---------------------------------------------------------------------------
  
  const checkDASS21Completion = async (username: string): Promise<void> => {
    try {
      const assessment = await storageService.assessments.get(`dass21_${username}`);
      setHasCompletedDASS21(!!assessment);
    } catch (error) {
      console.error('Error checking DASS-21 status:', error);
      setHasCompletedDASS21(false);
    }
  };
  
  const saveDASS21Results = useCallback(async (results: any): Promise<boolean> => {
    if (!user) return false;
    
    try {
      await storageService.assessments.save(`dass21_${user.username}`, results);
      setHasCompletedDASS21(true);
      return true;
    } catch (error) {
      console.error('Error saving DASS-21:', error);
      return false;
    }
  }, [user]);
  
  const getDASS21Results = useCallback(async (): Promise<any> => {
    if (!user) return null;
    return storageService.assessments.get(`dass21_${user.username}`);
  }, [user]);
  
  // ---------------------------------------------------------------------------
  // AUTH ACTIONS
  // ---------------------------------------------------------------------------
  
  const login = useCallback(async (username: string, password: string): Promise<AuthResult> => {
    const result = await authService.login(username, password);
    
    if (result.success && result.user) {
      setUser(result.user);
      
      // Check DASS-21 completion
      await checkDASS21Completion(username);
    }
    
    return result;
  }, []);
  
  const register = useCallback(async (
    username: string, 
    password: string, 
    email?: string
  ): Promise<AuthResult> => {
    const result = await authService.register(username, password, email);
    
    if (result.success && result.user) {
      setUser(result.user);
      
      // Initialize encrypted storage for new user
      const saltArray = await storageService.users.get(`salt_${username}`);
      if (saltArray) {
        const salt = new Uint8Array(saltArray as number[]);
        await storageService.initializeForUser(password, salt);
      }
      
      // New user hasn't completed DASS-21
      setHasCompletedDASS21(false);
    }
    
    return result;
  }, []);
  
  const logout = useCallback((): void => {
    authService.logout();
    setUser(null);
    setHasCompletedDASS21(false);
  }, []);
  
  // ---------------------------------------------------------------------------
  // CONTEXT VALUE
  // ---------------------------------------------------------------------------
  
  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    hasCompletedDASS21,
    login,
    register,
    logout,
    setHasCompletedDASS21,
    saveDASS21Results,
    getDASS21Results
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;

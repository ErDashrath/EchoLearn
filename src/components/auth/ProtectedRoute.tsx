/**
 * F001: Protected Route - Require authentication for routes
 * 
 * Features:
 * - Redirect to login if not authenticated
 * - Loading state while checking auth
 * - Optional DASS-21 requirement
 * 
 * @module components/auth/ProtectedRoute
 */

import React from 'react';
import { Redirect } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Brain } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireDASS21?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requireDASS21 = false 
}) => {
  const { isAuthenticated, isLoading, hasCompletedDASS21 } = useAuth();
  
  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25 animate-pulse">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading MindScribe...</span>
          </div>
        </div>
      </div>
    );
  }
  
  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }
  
  // Redirect to assessment if required and not completed
  if (requireDASS21 && !hasCompletedDASS21) {
    return <Redirect to="/assessment" />;
  }
  
  return <>{children}</>;
};

export default ProtectedRoute;

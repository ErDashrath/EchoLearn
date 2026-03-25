/**
 * F001: Login Page - Enterprise-grade authentication UI
 * 
 * Features:
 * - Login/Register toggle
 * - Form validation
 * - Animated transitions
 * - Loading states
 * - Error handling
 * 
 * @module pages/Login
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, User, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';

// =============================================================================
// ANIMATIONS
// =============================================================================

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
};

const cardVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3, delay: 0.1 } }
};

// =============================================================================
// COMPONENT
// =============================================================================

const LoginPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const { login, register, isAuthenticated, hasCompletedDASS21, isLoading: authLoading, getDASS21Results } = useAuth();
  const initialRedirectCheckedRef = React.useRef(false);
  
  // Form state
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  
  // Redirect if already authenticated
  React.useEffect(() => {
    // Only auto-redirect once for already-authenticated users visiting /login.
    if (initialRedirectCheckedRef.current || authLoading) return;
    initialRedirectCheckedRef.current = true;

    if (isAuthenticated) {
      setLocation(hasCompletedDASS21 ? '/' : '/assessment');
    }
  }, [isAuthenticated, hasCompletedDASS21, authLoading, setLocation]);
  
  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      if (isLoginMode) {
        // LOGIN
        const result = await login(formData.username, formData.password);
        
        if (!result.success) {
          setError(result.error || 'Login failed');
        } else {
          const assessment = await getDASS21Results();
          setLocation(assessment ? '/' : '/assessment');
        }
      } else {
        // REGISTER
        // Validation
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match');
          setIsLoading(false);
          return;
        }
        
        if (formData.password.length < 6) {
          setError('Password must be at least 6 characters');
          setIsLoading(false);
          return;
        }
        
        if (formData.username.length < 3) {
          setError('Username must be at least 3 characters');
          setIsLoading(false);
          return;
        }
        
        const result = await register(
          formData.username, 
          formData.password, 
          formData.email || undefined
        );
        
        if (!result.success) {
          setError(result.error || 'Registration failed');
        } else {
          setLocation('/assessment');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
    setError('');
    setFormData({ username: '', email: '', password: '', confirmPassword: '' });
  };
  
  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="login-theme min-h-screen flex items-center justify-center p-4 bg-[var(--bg)] [font-family:Inter,sans-serif]"
    >
      <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 lg:gap-14 items-center">
        
        {/* Left Side - Calming Message */}
        <motion.div 
          variants={cardVariants}
          className="hidden lg:flex justify-center"
        >
          <div className="max-w-sm">
            <p className="text-3xl leading-tight text-[var(--text-secondary)]">
              A quiet space to return to your thoughts.
            </p>
          </div>
        </motion.div>
        
        {/* Right Side - Form */}
        <motion.div variants={cardVariants}>
          <Card className="w-full max-w-md mx-auto bg-[var(--card)] border-0 shadow-[0_14px_36px_rgba(58,74,99,0.14)] transition-shadow duration-200 hover:shadow-[0_18px_44px_rgba(58,74,99,0.18)]">
            <CardHeader className="space-y-1 text-center pb-2">
              <div className="lg:hidden mb-2">
                <p className="text-lg text-[var(--text-secondary)]">
                  A quiet space to return to your thoughts.
                </p>
              </div>
              
              <CardTitle className="text-3xl text-[var(--text-primary)] font-['Playfair_Display']">
                {isLoginMode ? 'Welcome back' : 'Create account'}
              </CardTitle>
              <CardDescription className="text-[var(--text-secondary)] text-base">
                {isLoginMode 
                  ? 'Pick up where you left off' 
                  : 'Start your mental wellness journey'}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Mode Toggle */}
              <div className="flex rounded-xl bg-[var(--inner)] p-1">
                <button
                  type="button"
                  onClick={() => !isLoginMode && toggleMode()}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium text-[var(--text-primary)] transition-colors duration-200 ${
                    isLoginMode 
                      ? 'bg-[var(--card)] shadow-sm' 
                      : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => isLoginMode && toggleMode()}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium text-[var(--text-primary)] transition-colors duration-200 ${
                    !isLoginMode 
                      ? 'bg-[var(--card)] shadow-sm' 
                      : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  Sign Up
                </button>
              </div>
              
              {/* Error Alert */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username */}
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-[var(--text-primary)]">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                    <Input
                      id="username"
                      name="username"
                      type="text"
                      placeholder="Enter username"
                      value={formData.username}
                      onChange={handleInputChange}
                      className="pl-10 pr-3 py-[14px] h-auto bg-[var(--inner)] border-0 rounded-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 transition-colors duration-200"
                      required
                      autoComplete="username"
                    />
                  </div>
                </div>
                
                {/* Email (Register only) */}
                <AnimatePresence>
                  {!isLoginMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2"
                    >
                      <Label htmlFor="email" className="text-[var(--text-primary)]">Email (optional)</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder="Enter email"
                          value={formData.email}
                          onChange={handleInputChange}
                          className="pl-10 pr-3 py-[14px] h-auto bg-[var(--inner)] border-0 rounded-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 transition-colors duration-200"
                          autoComplete="email"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[var(--text-primary)]">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className="pl-10 pr-10 py-[14px] h-auto bg-[var(--inner)] border-0 rounded-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 transition-colors duration-200"
                      required
                      autoComplete={isLoginMode ? 'current-password' : 'new-password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                
                {/* Confirm Password (Register only) */}
                <AnimatePresence>
                  {!isLoginMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2"
                    >
                      <Label htmlFor="confirmPassword" className="text-[var(--text-primary)]">Confirm Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                        <Input
                          id="confirmPassword"
                          name="confirmPassword"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Confirm password"
                          value={formData.confirmPassword}
                          onChange={handleInputChange}
                          className="pl-10 pr-3 py-[14px] h-auto bg-[var(--inner)] border-0 rounded-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 transition-colors duration-200"
                          required={!isLoginMode}
                          autoComplete="new-password"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Registration Warning */}
                <AnimatePresence>
                  {!isLoginMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <Alert className="border-amber-300/70 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30">
                        <AlertDescription className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>
                            Keep your password saved securely. For privacy, this app does not provide password recovery.
                            If you forget your password, this account cannot be accessed.
                          </span>
                        </AlertDescription>
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {/* Submit Button */}
                <Button 
                  type="submit" 
                  className="w-full rounded-full bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white h-12 shadow-[0_10px_24px_rgba(216,122,67,0.28)] transition-colors duration-200"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isLoginMode ? 'Signing in...' : 'Creating account...'}
                    </>
                  ) : (
                    'Continue'
                  )}
                </Button>
              </form>
              
              {/* Privacy Notice */}
              <p className="text-sm text-center text-[var(--text-secondary)]">
                🔒 Your thoughts stay private and on your device.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default LoginPage;

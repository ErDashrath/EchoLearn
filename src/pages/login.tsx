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
import { Loader2, Brain, Shield, Lock, User, Mail, Eye, EyeOff } from 'lucide-react';

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

const featureVariants = {
  initial: { opacity: 0, x: -20 },
  animate: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, delay: 0.2 + i * 0.1 }
  })
};

// =============================================================================
// COMPONENT
// =============================================================================

const LoginPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const { login, register, isAuthenticated, hasCompletedDASS21 } = useAuth();
  
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
    if (isAuthenticated) {
      setLocation(hasCompletedDASS21 ? '/' : '/assessment');
    }
  }, [isAuthenticated, hasCompletedDASS21, setLocation]);
  
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
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
    >
      <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-center">
        
        {/* Left Side - Branding */}
        <motion.div 
          variants={cardVariants}
          className="hidden lg:block space-y-8"
        >
          {/* Logo */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  MindScribe
                </h1>
                <p className="text-sm text-muted-foreground">
                  Your Mental Health Companion
                </p>
              </div>
            </div>
          </div>
          
          {/* Features */}
          <div className="space-y-4">
            {[
              { icon: Shield, title: '100% Private', desc: 'All data stays on your device' },
              { icon: Brain, title: 'AI-Powered', desc: 'Smart insights from your journals' },
              { icon: Lock, title: 'Encrypted', desc: 'Military-grade AES-256 encryption' }
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                custom={i}
                variants={featureVariants}
                initial="initial"
                animate="animate"
                className="flex items-start gap-4 p-4 rounded-xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center shrink-0">
                  <feature.icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
        
        {/* Right Side - Form */}
        <motion.div variants={cardVariants}>
          <Card className="w-full max-w-md mx-auto shadow-xl border-slate-200/50 dark:border-slate-800/50 backdrop-blur-sm">
            <CardHeader className="space-y-1 text-center pb-2">
              {/* Mobile Logo */}
              <div className="lg:hidden flex justify-center mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Brain className="w-6 h-6 text-white" />
                </div>
              </div>
              
              <CardTitle className="text-2xl font-bold">
                {isLoginMode ? 'Welcome back' : 'Create account'}
              </CardTitle>
              <CardDescription>
                {isLoginMode 
                  ? 'Enter your credentials to continue' 
                  : 'Start your mental wellness journey'}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Mode Toggle */}
              <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => !isLoginMode && toggleMode()}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                    isLoginMode 
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => isLoginMode && toggleMode()}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                    !isLoginMode 
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="username"
                      name="username"
                      type="text"
                      placeholder="Enter username"
                      value={formData.username}
                      onChange={handleInputChange}
                      className="pl-10"
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
                      <Label htmlFor="email">Email (optional)</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder="Enter email"
                          value={formData.email}
                          onChange={handleInputChange}
                          className="pl-10"
                          autoComplete="email"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className="pl-10 pr-10"
                      required
                      autoComplete={isLoginMode ? 'current-password' : 'new-password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="confirmPassword"
                          name="confirmPassword"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Confirm password"
                          value={formData.confirmPassword}
                          onChange={handleInputChange}
                          className="pl-10"
                          required={!isLoginMode}
                          autoComplete="new-password"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {/* Submit Button */}
                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg shadow-blue-500/25"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isLoginMode ? 'Signing in...' : 'Creating account...'}
                    </>
                  ) : (
                    isLoginMode ? 'Sign In' : 'Create Account'
                  )}
                </Button>
              </form>
              
              {/* Privacy Notice */}
              <p className="text-xs text-center text-muted-foreground">
                🔒 Your data is encrypted and stored locally. 
                <br />
                We never send your information to any server.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default LoginPage;

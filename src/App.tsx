import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/pages/login";
import AssessmentPage from "@/pages/assessment";
import TestPage from "@/pages/test";
import ChatPage from "@/pages/chat-v2"; // F010: Using new persistent chat page
import VoicePage from "@/pages/voice"; // F012-F016: Voice Therapy
import JournalPage from "@/pages/journal"; // F017-F020: Mental Health Journal
import DashboardPage from "@/pages/dashboard"; // F021-F025: Mental Health Dashboard
import ReportsPage from "@/pages/reports"; // F026-F027: Reports & Export
import NotFound from "@/pages/not-found";
import { SystemPromptDemo } from "@/components/demo/SystemPromptDemo";

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/login" component={LoginPage} />
      
      {/* Assessment Route (Protected but no layout - standalone flow) */}
      <Route path="/assessment">
        <ProtectedRoute>
          <AssessmentPage />
        </ProtectedRoute>
      </Route>
      
      {/* Protected Routes with Layout */}
      <Route path="/">
        <ProtectedRoute>
          <AppLayout>
            <ChatPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/test">
        <ProtectedRoute>
          <AppLayout>
            <TestPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/demo">
        <ProtectedRoute>
          <AppLayout>
            <SystemPromptDemo />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Journal - Mental Health Journaling with AI Analysis */}
      <Route path="/journal">
        <ProtectedRoute>
          <AppLayout>
            <JournalPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Dashboard - Mental Health Analytics */}
      <Route path="/dashboard">
        <ProtectedRoute>
          <AppLayout>
            <DashboardPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Reports - Export & PDF Generation */}
      <Route path="/reports">
        <ProtectedRoute>
          <AppLayout>
            <ReportsPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Voice Therapy - Full screen experience */}
      <Route path="/voice">
        <ProtectedRoute>
          <VoicePage />
        </ProtectedRoute>
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="mindscribe-theme">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

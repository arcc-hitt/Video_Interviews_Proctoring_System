
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster } from './components/ui/sonner';
import { AuthPage, ProtectedRoute } from './components/auth';
import { CandidateDashboard, InterviewerDashboard } from './components/dashboard';
import ReportDashboardPage from './components/dashboard/ReportDashboardPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            {/* Public Routes */}
            <Route path="/auth" element={<AuthPage />} />
            
            {/* Protected Routes */}
            <Route
              path="/candidate"
              element={
                <ProtectedRoute requiredRole="candidate">
                  <CandidateDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interviewer"
              element={
                <ProtectedRoute requiredRole="interviewer">
                  <InterviewerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/report/:sessionId"
              element={
                <ProtectedRoute requiredRole="interviewer">
                  <ReportDashboardPage />
                </ProtectedRoute>
              }
            />
            
            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/auth" replace />} />
            
          {/* Catch all route */}
          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
      </div>
      <Toaster duration={2000} />
    </Router>
    </AuthProvider>
  );
}

export default App;

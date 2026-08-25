import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import AuthPage from "@/pages/AuthPage";
import OTCMarketDashboard from "@/pages/OTCMarketDashboard";
import VisualEngineDashboard from "@/pages/VisualEngineDashboard";
import YoddhaXDashboard from "@/pages/YoddhaXDashboard";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#FFD700] border-t-transparent rounded-full" />
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/auth" replace />;
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/dashboard/otc"
            element={
              <ProtectedRoute>
                <OTCMarketDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/ai"
            element={
              <ProtectedRoute>
                <VisualEngineDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/yoddhax"
            element={
              <ProtectedRoute>
                <YoddhaXDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/auth" replace />} />
          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

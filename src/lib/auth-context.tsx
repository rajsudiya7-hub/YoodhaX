import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  country: string;
  currency: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  country: string;
  currency: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("yoddha_user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("yoddha_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    setError(null);
    try {
      if (!email || !password) {
        throw new Error("Email and password are required");
      }

      const mockUser: User = {
        id: `user_${Date.now()}`,
        name: email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        email,
        country: "India",
        currency: "INR",
      };

      setUser(mockUser);
      localStorage.setItem("yoddha_user", JSON.stringify(mockUser));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      throw err;
    }
  };

  const register = async (data: RegisterData): Promise<void> => {
    setError(null);
    try {
      if (!data.email || !data.password) {
        throw new Error("Email and password are required");
      }

      const newUser: User = {
        id: `user_${Date.now()}`,
        name: data.name || data.email.split("@")[0],
        email: data.email,
        country: data.country,
        currency: data.currency,
      };

      setUser(newUser);
      localStorage.setItem("yoddha_user", JSON.stringify(newUser));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      throw err;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("yoddha_user");
    setError(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

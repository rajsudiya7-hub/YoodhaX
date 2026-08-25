import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Shield, TrendingUp, Zap, Eye, EyeOff, ChevronDown, Check, Crown, Bell, Rocket, FileText, Lock, RotateCcw, Mail, MessageCircle } from "lucide-react";

const COUNTRIES = [
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
];

const CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
];

function YoddhaWarriorLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
  };

  return (
    <div className={`${sizeClasses[size]} relative`}>
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
        <defs>
          <linearGradient id="shieldGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFD700" />
            <stop offset="50%" stopColor="#DAA520" />
            <stop offset="100%" stopColor="#B8860B" />
          </linearGradient>
          <linearGradient id="helmetGold" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFD700" />
            <stop offset="100%" stopColor="#B8860B" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d="M50 5 L90 20 L90 50 C90 75 50 95 50 95 C50 95 10 75 10 50 L10 20 Z"
          fill="url(#shieldGold)"
          stroke="#FFD700"
          strokeWidth="2"
          filter="url(#glow)"
        />

        <path
          d="M50 12 L82 24 L82 48 C82 70 50 87 50 87 C50 87 18 70 18 48 L18 24 Z"
          fill="#1a1a2e"
        />

        <ellipse cx="50" cy="42" rx="20" ry="22" fill="url(#helmetGold)" />
        <ellipse cx="50" cy="42" rx="16" ry="18" fill="#1a1a2e" />

        <path d="M50 15 Q55 25 50 35 Q45 25 50 15" fill="url(#helmetGold)" />
        <path d="M35 30 Q50 20 65 30" fill="none" stroke="#FFD700" strokeWidth="3" strokeLinecap="round" />

        <ellipse cx="42" cy="45" rx="4" ry="3" fill="#00FF88" filter="url(#glow)" />
        <ellipse cx="58" cy="45" rx="4" ry="3" fill="#00FF88" filter="url(#glow)" />

        <path d="M38 52 L50 60 L62 52" fill="none" stroke="#DAA520" strokeWidth="2" strokeLinecap="round" />

        <text x="50" y="78" textAnchor="middle" fill="#FFD700" fontSize="14" fontWeight="bold" fontFamily="Arial Black">
          X
        </text>
      </svg>
    </div>
  );
}

function CornerLogo({ position }: { position: "top-left" | "top-right" | "bottom-left" | "bottom-right" }) {
  const positionClasses = {
    "top-left": "top-4 left-4",
    "top-right": "top-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "bottom-right": "bottom-4 right-4",
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-10 opacity-40 hover:opacity-70 transition-opacity duration-300`}>
      <YoddhaWarriorLogo size="sm" />
    </div>
  );
}

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [selectedCurrency, setSelectedCurrency] = useState(CURRENCIES[0]);
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const navigate = useNavigate();
  const { login, register } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) return;

    setIsLoading(true);
    try {
      await login(loginEmail, loginPassword);
      navigate("/dashboard/otc");
    } catch {
      alert("Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerEmail || !registerPassword || !confirmPassword || !ageConfirmed) return;
    if (registerPassword !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    setIsLoading(true);
    try {
      await register({
        name: registerEmail.split("@")[0],
        email: registerEmail,
        password: registerPassword,
        country: selectedCountry.name,
        currency: selectedCurrency.code,
      });
      navigate("/dashboard/otc");
    } catch {
      alert("Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d1a] flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 relative">
      <CornerLogo position="top-left" />
      <CornerLogo position="top-right" />
      <CornerLogo position="bottom-left" />
      <CornerLogo position="bottom-right" />

      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-[#DAA520]/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[600px] h-[300px] bg-[#00FF88]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-[#DAA520]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-7xl flex-col items-stretch gap-8 lg:flex-row lg:items-center lg:gap-12">
        <div className="flex w-full min-w-0 lg:w-1/2">
          <div className="w-full rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e]/70 p-6 sm:p-8 lg:p-10 shadow-2xl shadow-black/40 backdrop-blur-sm">
            <div className="relative block min-h-[320px] aspect-[4/5] sm:aspect-[3/2] lg:aspect-[4/5] w-full overflow-hidden rounded-xl border border-[#FFD700]/20 shadow-xl shadow-black/40">
              <img src="/1.png" alt="banner" className="block h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/5" />
            </div>
          </div>
        </div>

        <div className="w-full min-w-0 lg:w-1/2">
        <div className="flex flex-col items-center mb-6">
          <div className="mb-4 animate-pulse">
            <YoddhaWarriorLogo size="lg" />
          </div>
          <h1 className="text-4xl font-black tracking-wider">
            <span className="text-[#FFD700]">YODDHA</span>
            <span className="text-[#00FF88] ml-2">X</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1 tracking-wide">PREMIUM TRADING SIGNALS</p>
        </div>

        <div className="bg-[#1a1a2e]/90 backdrop-blur-xl border border-[#2a2a4a] rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
          <div className="flex">
            <button
              onClick={() => setActiveTab("login")}
              className={`flex-1 py-4 text-center font-bold text-sm tracking-wider transition-all relative ${
                activeTab === "login" ? "text-[#FFD700] bg-[#1a1a2e]" : "text-gray-500 bg-[#12121f] hover:text-gray-300"
              }`}
            >
              LOGIN
              {activeTab === "login" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#FFD700] to-transparent" />}
            </button>
            <button
              onClick={() => setActiveTab("register")}
              className={`flex-1 py-4 text-center font-bold text-sm tracking-wider transition-all relative ${
                activeTab === "register" ? "text-[#00FF88] bg-[#1a1a2e]" : "text-gray-500 bg-[#12121f] hover:text-gray-300"
              }`}
            >
              REGISTRATION
              {activeTab === "register" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#00FF88] to-transparent" />}
            </button>
          </div>

          <div className="p-6">
            {activeTab === "login" ? (
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-xs text-gray-400 mb-2 tracking-wide uppercase">Email</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full bg-[#12121f] border border-[#2a2a4a] rounded-lg px-4 py-3.5 text-white placeholder:text-gray-600 focus:outline-none focus:border-[#FFD700] focus:ring-1 focus:ring-[#FFD700]/50 transition-all"
                    placeholder="Enter your email"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-2 tracking-wide uppercase">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full bg-[#12121f] border border-[#2a2a4a] rounded-lg px-4 py-3.5 pr-12 text-white placeholder:text-gray-600 focus:outline-none focus:border-[#FFD700] focus:ring-1 focus:ring-[#FFD700]/50 transition-all"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#FFD700] transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-[#FFD700] to-[#DAA520] hover:from-[#DAA520] hover:to-[#B8860B] text-black font-bold py-4 rounded-lg transition-all shadow-lg shadow-[#FFD700]/20 hover:shadow-[#FFD700]/40 disabled:opacity-50 disabled:cursor-not-allowed text-sm tracking-wider"
                >
                  {isLoading ? "SIGNING IN..." : "LOGIN"}
                </button>

                <p className="text-center text-gray-500 text-xs mt-4">
                  Forgot password? <span className="text-[#FFD700] cursor-pointer hover:underline">Reset here</span>
                </p>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="relative">
                  <label className="block text-xs text-gray-400 mb-2 tracking-wide uppercase">Country</label>
                  <button
                    type="button"
                    onClick={() => {
                      setCountryDropdownOpen(!countryDropdownOpen);
                      setCurrencyDropdownOpen(false);
                    }}
                    className="w-full bg-[#12121f] border border-[#2a2a4a] rounded-lg px-4 py-3.5 text-white flex items-center justify-between focus:outline-none focus:border-[#00FF88] focus:ring-1 focus:ring-[#00FF88]/50 transition-all"
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-2xl">{selectedCountry.flag}</span>
                      <span>{selectedCountry.name}</span>
                    </span>
                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${countryDropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {countryDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                      {COUNTRIES.map((country) => (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => {
                            setSelectedCountry(country);
                            setCountryDropdownOpen(false);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#2a2a4a] transition-colors text-white"
                        >
                          <span className="text-2xl">{country.flag}</span>
                          <span>{country.name}</span>
                          {selectedCountry.code === country.code && <Check className="w-4 h-4 ml-auto text-[#00FF88]" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-2 tracking-wide uppercase">Email</label>
                  <input
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    className="w-full bg-[#12121f] border border-[#2a2a4a] rounded-lg px-4 py-3.5 text-white placeholder:text-gray-600 focus:outline-none focus:border-[#00FF88] focus:ring-1 focus:ring-[#00FF88]/50 transition-all"
                    placeholder="Enter your email"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-2 tracking-wide uppercase">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      className="w-full bg-[#12121f] border border-[#2a2a4a] rounded-lg px-4 py-3.5 pr-12 text-white placeholder:text-gray-600 focus:outline-none focus:border-[#00FF88] focus:ring-1 focus:ring-[#00FF88]/50 transition-all"
                      placeholder="Create a password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#00FF88] transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-2 tracking-wide uppercase">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-[#12121f] border border-[#2a2a4a] rounded-lg px-4 py-3.5 pr-12 text-white placeholder:text-gray-600 focus:outline-none focus:border-[#00FF88] focus:ring-1 focus:ring-[#00FF88]/50 transition-all"
                      placeholder="Confirm your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#00FF88] transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-xs text-gray-400 mb-2 tracking-wide uppercase">Account Currency</label>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrencyDropdownOpen(!currencyDropdownOpen);
                      setCountryDropdownOpen(false);
                    }}
                    className="w-full bg-[#12121f] border border-[#2a2a4a] rounded-lg px-4 py-3.5 text-white flex items-center justify-between focus:outline-none focus:border-[#00FF88] focus:ring-1 focus:ring-[#00FF88]/50 transition-all"
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-xl font-bold text-[#FFD700]">{selectedCurrency.symbol}</span>
                      <span>{selectedCurrency.code} - {selectedCurrency.name}</span>
                    </span>
                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${currencyDropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {currencyDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                      {CURRENCIES.map((currency) => (
                        <button
                          key={currency.code}
                          type="button"
                          onClick={() => {
                            setSelectedCurrency(currency);
                            setCurrencyDropdownOpen(false);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#2a2a4a] transition-colors text-white"
                        >
                          <span className="text-xl font-bold text-[#FFD700]">{currency.symbol}</span>
                          <span>{currency.code} - {currency.name}</span>
                          {selectedCurrency.code === currency.code && <Check className="w-4 h-4 ml-auto text-[#00FF88]" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setAgeConfirmed(!ageConfirmed)}
                    className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                      ageConfirmed ? "bg-[#00FF88] border-[#00FF88]" : "border-[#2a2a4a] hover:border-[#00FF88]"
                    }`}
                  >
                    {ageConfirmed && <Check className="w-4 h-4 text-black" />}
                  </button>
                  <span className="text-xs text-gray-400 leading-relaxed">
                    I confirm that I am <span className="text-[#FFD700] font-bold">18 years of age or older</span> and agree to the Terms of Service and Privacy Policy
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !ageConfirmed}
                  className="w-full bg-gradient-to-r from-[#00FF88] to-[#00CC6A] hover:from-[#00CC6A] hover:to-[#009950] text-black font-bold py-4 rounded-lg transition-all shadow-lg shadow-[#00FF88]/20 hover:shadow-[#00FF88]/40 disabled:opacity-50 disabled:cursor-not-allowed text-sm tracking-wider mt-2"
                >
                  {isLoading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT"}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center text-center bg-[#1a1a2e]/50 rounded-xl p-4 border border-[#2a2a4a]/50">
            <div className="w-12 h-12 rounded-full bg-[#FFD700]/10 flex items-center justify-center mb-2">
              <Zap className="w-6 h-6 text-[#FFD700]" />
            </div>
            <span className="text-xs text-gray-400">Real-time Signals</span>
          </div>
          <div className="flex flex-col items-center text-center bg-[#1a1a2e]/50 rounded-xl p-4 border border-[#2a2a4a]/50">
            <div className="w-12 h-12 rounded-full bg-[#00FF88]/10 flex items-center justify-center mb-2">
              <TrendingUp className="w-6 h-6 text-[#00FF88]" />
            </div>
            <span className="text-xs text-gray-400">90%+ Accuracy</span>
          </div>
          <div className="flex flex-col items-center text-center bg-[#1a1a2e]/50 rounded-xl p-4 border border-[#2a2a4a]/50">
            <div className="w-12 h-12 rounded-full bg-[#FFD700]/10 flex items-center justify-center mb-2">
              <Shield className="w-6 h-6 text-[#FFD700]" />
            </div>
            <span className="text-xs text-gray-400">Perfect Sync</span>
          </div>
        </div>
        </div>
      </div>

      <section className="relative z-10 w-full max-w-5xl mt-16 px-2">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-black tracking-wide">
            <span className="text-[#FFD700]">PRICING</span>
            <span className="text-white"> PLANS</span>
          </h2>
          <p className="text-gray-400 text-sm mt-2">Choose the plan that fits your trading journey</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e]/70 p-8 shadow-xl shadow-black/40 backdrop-blur-sm flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#FFD700]/10 flex items-center justify-center">
                <Zap className="w-6 h-6 text-[#FFD700]" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Free Plan</h3>
                <p className="text-gray-500 text-xs">Standard signals</p>
              </div>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-black text-white">₹0</span>
              <span className="text-gray-500 text-sm ml-1">/ forever</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              <li className="flex items-center gap-3 text-sm text-gray-300">
                <Check className="w-4 h-4 text-[#00FF88] flex-shrink-0" /> Basic features
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-300">
                <Check className="w-4 h-4 text-[#00FF88] flex-shrink-0" /> Standard trading signals
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-300">
                <Check className="w-4 h-4 text-[#00FF88] flex-shrink-0" /> Community access
              </li>
            </ul>
            <button
              onClick={() => setActiveTab("register")}
              className="w-full bg-[#12121f] border border-[#2a2a4a] hover:border-[#FFD700]/50 text-gray-300 hover:text-[#FFD700] font-bold py-3.5 rounded-lg transition-all text-sm tracking-wider"
            >
              GET STARTED FREE
            </button>
          </div>

          <div className="relative rounded-2xl border border-[#FFD700]/40 bg-gradient-to-b from-[#1a1a2e]/90 to-[#12121f]/90 p-8 shadow-2xl shadow-[#FFD700]/10 backdrop-blur-sm flex flex-col">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#FFD700] to-[#DAA520] text-black text-xs font-bold px-4 py-1 rounded-full tracking-wider shadow-lg">
              MOST POPULAR
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#FFD700]/20 flex items-center justify-center">
                <Crown className="w-6 h-6 text-[#FFD700]" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Pro AI Plan</h3>
                <p className="text-[#FFD700]/70 text-xs">Premium experience</p>
              </div>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-black text-[#FFD700]">₹199</span>
              <span className="text-gray-400 text-sm ml-1">/ 12 days</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              <li className="flex items-center gap-3 text-sm text-gray-200">
                <Check className="w-4 h-4 text-[#00FF88] flex-shrink-0" /> High-accuracy AI Trading Signals
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-200">
                <Check className="w-4 h-4 text-[#00FF88] flex-shrink-0" /> Premium Alerts
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-200">
                <Check className="w-4 h-4 text-[#00FF88] flex-shrink-0" /> Priority Execution &amp; Real-time Notifications
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-200">
                <Rocket className="w-4 h-4 text-[#FFD700] flex-shrink-0" /> Faster signal delivery
              </li>
              <li className="flex items-center gap-3 text-sm text-gray-200">
                <Bell className="w-4 h-4 text-[#FFD700] flex-shrink-0" /> Instant push notifications
              </li>
            </ul>
            <button
              onClick={() => setActiveTab("register")}
              className="w-full bg-gradient-to-r from-[#FFD700] to-[#DAA520] hover:from-[#DAA520] hover:to-[#B8860B] text-black font-bold py-3.5 rounded-lg transition-all shadow-lg shadow-[#FFD700]/30 hover:shadow-[#FFD700]/50 text-sm tracking-wider"
            >
              UPGRADE TO PRO
            </button>
          </div>
        </div>
      </section>

      <footer className="relative z-10 w-full max-w-5xl mt-16 px-2 pb-10">
        <div className="rounded-2xl border border-[#2a2a4a] bg-[#1a1a2e]/60 p-8 backdrop-blur-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <YoddhaWarriorLogo size="sm" />
                <h3 className="text-lg font-black tracking-wider">
                  <span className="text-[#FFD700]">YODDHA</span>
                  <span className="text-[#00FF88] ml-1">X</span>
                </h3>
              </div>
              <p className="text-gray-500 text-xs leading-relaxed">
                Premium AI-powered trading signals for OTC markets. Trade with confidence.
              </p>
            </div>

            <div>
              <h4 className="text-white font-bold text-sm mb-4 tracking-wide">LEGAL</h4>
              <ul className="space-y-3">
                <li>
                  <button className="flex items-center gap-2 text-gray-400 hover:text-[#FFD700] transition-colors text-sm">
                    <Lock className="w-4 h-4" /> Privacy Policy
                  </button>
                </li>
                <li>
                  <button className="flex items-center gap-2 text-gray-400 hover:text-[#FFD700] transition-colors text-sm">
                    <FileText className="w-4 h-4" /> Terms &amp; Conditions
                  </button>
                </li>
                <li>
                  <button className="flex items-center gap-2 text-gray-400 hover:text-[#FFD700] transition-colors text-sm">
                    <RotateCcw className="w-4 h-4" /> Refund &amp; Cancellation
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold text-sm mb-4 tracking-wide">SUPPORT</h4>
              <ul className="space-y-3">
                <li>
                  <button className="flex items-center gap-2 text-gray-400 hover:text-[#00FF88] transition-colors text-sm">
                    <Mail className="w-4 h-4" /> Contact Us
                  </button>
                </li>
                <li>
                  <button className="flex items-center gap-2 text-gray-400 hover:text-[#00FF88] transition-colors text-sm">
                    <MessageCircle className="w-4 h-4" /> Live Chat Support
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold text-sm mb-4 tracking-wide">RISK DISCLAIMER</h4>
              <p className="text-gray-500 text-xs leading-relaxed">
                Trading involves significant risk. Past performance does not guarantee future results. Only trade with capital you can afford to lose.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-[#2a2a4a] flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-gray-600 text-xs">© 2026 Yoddha X. All rights reserved.</p>
            <p className="text-gray-600 text-xs">Powered by AI-driven market intelligence</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

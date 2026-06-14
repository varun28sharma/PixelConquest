"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Mail, Lock, Eye, EyeOff, User, ChevronDown, Loader2 } from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");

  // Form fields
  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // State
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const switchMode = (m: "login" | "register") => {
    setMode(m);
    setError("");
    setUsername("");
    setEmail("");
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { username, email, password };

      const res = await fetch(`${BACKEND}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      // Save real user to localStorage — picked up by the pixel store
      localStorage.setItem(
        "pixel_user",
        JSON.stringify({
          id: data.id,
          username: data.username,
          email: data.email,
          color: data.color,
        })
      );

      router.push("/workspace");
    } catch (err) {
      setError("Cannot connect to server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#030614] text-white font-sans">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#0f0c29]/20 via-[#030614] to-[#030614]" />
        
        {/* Abstract Pixel Cluster */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-20 mix-blend-screen pointer-events-none flex items-center justify-center">
          <div className="grid grid-cols-12 grid-rows-12 gap-1 w-[600px] h-[600px] [transform:rotate(15deg)]">
            {Array.from({ length: 144 }).map((_, i) => {
              const row = Math.floor(i / 12);
              const col = i % 12;
              const distToCenter = Math.sqrt(Math.pow(row - 5.5, 2) + Math.pow(col - 5.5, 2));
              const isFilled = (Math.sin(i * 13) * 10 + Math.cos(i * 7) * 10) > distToCenter * 2;
              const colors = ['bg-purple-500', 'bg-blue-500', 'bg-teal-400', 'bg-pink-500', 'bg-amber-400'];
              const color = isFilled ? colors[(i * 7) % colors.length] : 'bg-transparent';
              
              return (
                <div
                  key={i}
                  className={`w-full h-full rounded-sm ${color} ${isFilled ? 'shadow-[0_0_15px_currentColor] animate-pulse' : ''}`}
                  style={isFilled ? { animationDuration: `${(i % 4) + 2}s`, animationDelay: `${(i % 3)}s` } : {}}
                />
              );
            })}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 w-full h-[30%] bg-[linear-gradient(transparent_95%,rgba(168,85,247,0.3)_100%),linear-gradient(90deg,transparent_95%,rgba(168,85,247,0.3)_100%)] bg-[length:40px_40px] [transform:perspective(500px)_rotateX(60deg)] [transform-origin:bottom]" />
      </div>

      {/* Top Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-10 py-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-500 rounded-md grid grid-cols-2 gap-[2px] p-[3px]">
            <div className="bg-white rounded-sm" />
            <div className="bg-[#030614] rounded-sm" />
            <div className="bg-[#030614] rounded-sm" />
            <div className="bg-white rounded-sm" />
          </div>
          <span className="text-xl font-bold tracking-wide">PixelConquest</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
          
          
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-10 max-w-7xl mx-auto w-full gap-20">

        {/* Left — Welcome Text */}
        <div className="flex-1 hidden lg:block">
          <h1 className="text-6xl font-bold tracking-wider mb-6 text-white drop-shadow-lg">
            {mode === "login" ? "WELCOME" : "JOIN THE\nCONQUEST"}
          </h1>
          <div className="w-16 h-1 bg-teal-400 mb-8" />
          <p className="text-gray-400 leading-relaxed max-w-md text-lg">
            {mode === "login"
              ? "Claim your territory on the shared pixel grid. Every tile is a battle — sign in and defend your turf."
              : "Create an account to start placing pixels, climb the leaderboard, and own your corner of the map."}
          </p>
        </div>

        {/* Right — Form Card */}
        <div className="w-full max-w-[440px]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-10 shadow-[0_0_40px_rgba(0,0,0,0.5)]">

            {/* Mode Toggle */}
            <div className="flex rounded-xl bg-white/5 p-1 mb-8 border border-white/5">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  mode === "login"
                    ? "bg-gradient-to-r from-[#00bfff]/80 to-[#8a2be2]/80 text-white shadow"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode("register")}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  mode === "register"
                    ? "bg-gradient-to-r from-[#00bfff]/80 to-[#8a2be2]/80 text-white shadow"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Create Account
              </button>
            </div>

            <h2 className="text-2xl font-semibold mb-1">
              {mode === "login" ? "Sign in" : "Create account"}
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              {mode === "login"
                ? "Welcome ! Please enter your details."
                : "Fill in your details to get started."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Username — register only */}
              {mode === "register" && (
                <div>
                  <label className="block mb-1.5 text-sm text-gray-300">Username</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-400">
                      <User className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#0a0d1a]/50 py-3 pl-11 pr-4 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                      placeholder="e.g. PixelWarrior42"
                      required
                      minLength={3}
                      maxLength={50}
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block mb-1.5 text-sm text-gray-300">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0a0d1a]/50 py-3 pl-11 pr-4 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block mb-1.5 text-sm text-gray-300">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0a0d1a]/50 py-3 pl-11 pr-12 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder={mode === "register" ? "Min. 6 characters" : "Enter your password"}
                    required
                    minLength={mode === "register" ? 6 : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Remember me / Forgot (login only) */}
              {mode === "login" && (
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="flex h-4 w-4 items-center justify-center rounded border border-gray-500 group-hover:border-blue-400 transition-colors">
                      <input type="checkbox" className="opacity-0 absolute" />
                    </div>
                    <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">Remember Me</span>
                  </label>
                  <a href="#" className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                    Forgot password?
                  </a>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-[#00bfff] to-[#8a2be2] py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(138,43,226,0.4)] transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(138,43,226,0.6)] mt-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "login" ? "Sign in now" : "Create my account"}
              </button>
            </form>

            {/* Switch mode link */}
            <p className="mt-6 text-center text-sm text-gray-500">
              {mode === "login" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button onClick={() => switchMode("register")} className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button onClick={() => switchMode("login")} className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
                    Sign in
                  </button>
                </>
              )}
            </p>

            <div className="mt-6 text-center text-xs text-gray-600">
              By continuing you agree to our{" "}
              <a href="/terms" className="text-gray-500 hover:text-white transition-colors">Terms</a>
              {" & "}
              <a href="/privacy" className="text-gray-500 hover:text-white transition-colors">Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

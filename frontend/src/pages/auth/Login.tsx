import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-black text-white flex-col justify-between p-12">
        <div>
          <img src="/alpas-logo.png" alt="ALPAS" className="w-80 brightness-0 invert" />
          <div className="text-gray-400 text-sm mt-3 uppercase tracking-widest">Time & Attendance System</div>
        </div>
        <div>
          <blockquote className="text-2xl font-light leading-relaxed">
            "Precision in time is <br />
            <span className="font-bold">precision in business."</span>
          </blockquote>
          <div className="mt-6 grid grid-cols-2 gap-4">
            {[
              { label: 'GPS Tracking', desc: 'Accurate location verification' },
              { label: 'Smart Overtime', desc: 'Auto-calculated credits' },
              { label: 'Leave Mgmt', desc: 'Digital approval workflow' },
              { label: 'Analytics', desc: 'Enterprise-grade reports' },
            ].map((f) => (
              <div key={f.label} className="border border-gray-700 rounded-lg p-3">
                <div className="text-sm font-semibold">{f.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-gray-600">© {new Date().getFullYear()} ALPAS. Enterprise Edition.</div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <img src="/alpas-logo.png" alt="ALPAS" className="w-64 mb-2" />
            <div className="text-gray-400 text-xs uppercase tracking-widest">Time & Attendance System</div>
          </div>

          <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
          <p className="text-gray-500 text-sm mb-8">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@company.com"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black text-xs"
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="flex justify-end mt-1">
                <Link to="/forgot-password" className="text-xs text-gray-500 hover:text-black">
                  Forgot password?
                </Link>
              </div>
            </div>

            <button type="submit" className="btn-primary w-full py-2.5 mt-2" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>


        </div>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function NotFound() {
  const { user } = useAuth();
  const home = user ? `/${user.role.toLowerCase().replace('_', '-')}` : '/login';

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
      <div className="text-8xl font-black mb-4">404</div>
      <div className="text-xl font-semibold mb-2">Page not found</div>
      <div className="text-sm text-gray-500 mb-8">The page you're looking for doesn't exist or you don't have access.</div>
      <Link to={home} className="btn-primary">Go Home</Link>
    </div>
  );
}

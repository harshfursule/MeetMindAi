import { Link } from 'react-router-dom';
import { Video, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <nav className="glass sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 group">
            <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 group-hover:from-indigo-400 group-hover:to-purple-500 transition-all">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">MeetMind AI</span>
          </Link>

          {/* User Info & Logout */}
          {user && (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 text-indigo-200">
                <User className="w-4 h-4" />
                <span className="text-sm font-medium">{user.name}</span>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-indigo-300 hover:text-white hover:bg-indigo-500/20 transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

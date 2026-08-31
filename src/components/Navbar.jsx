import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function navClasses({ isActive }) {
  return `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`
}

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <svg viewBox="0 0 32 32" fill="none" className="h-5 w-5">
              <path d="M16 7 6 14v11h7v-7h6v7h7V14L16 7Z" fill="currentColor" />
            </svg>
          </span>
          RentCheck
        </Link>

        {user && (
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClasses}>
              Requests
            </NavLink>
            <NavLink to="/requests/new" className={navClasses}>
              New Request
            </NavLink>
            <NavLink to="/settings" className={navClasses}>
              Property & Landlord
            </NavLink>
            <button onClick={handleSignOut} className="btn-secondary ml-2 !px-3 !py-1.5 text-sm">
              Sign out
            </button>
          </nav>
        )}
      </div>
    </header>
  )
}

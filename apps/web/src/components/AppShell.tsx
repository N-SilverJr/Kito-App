import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { DISCLAIMER } from '@nutripals/core';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useOnline } from '../lib/hooks';
import { startReminderLoop } from '../lib/notifications';
import { initial, todayKey } from '../lib/format';
import { Icon, type IconName } from './icons';
import { Companion } from './Companion';
import { IconButton } from './ui';

const RAIL: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: '/app', label: 'Today', icon: 'home', end: true },
  { to: '/app/log', label: 'Log food', icon: 'search' },
  { to: '/app/scan', label: 'Scan a meal', icon: 'camera' },
  { to: '/app/plans', label: 'Meal plans', icon: 'calendar' },
  { to: '/app/stats', label: 'Insights', icon: 'chart' },
  { to: '/app/companion', label: 'Kito', icon: 'heart' },
  { to: '/app/settings', label: 'Settings', icon: 'settings' },
];

const TITLES: Array<{ match: RegExp; title: string; subtitle?: string }> = [
  { match: /^\/app\/log/, title: 'Log food', subtitle: 'Search, describe, scan a barcode or add your own.' },
  { match: /^\/app\/scan/, title: 'Scan a meal', subtitle: 'A photo gives a starting estimate — you stay in control.' },
  { match: /^\/app\/meal\//, title: 'Edit meal' },
  { match: /^\/app\/water/, title: 'Hydration' },
  { match: /^\/app\/weight/, title: 'Weight' },
  { match: /^\/app\/fasting/, title: 'Fasting' },
  { match: /^\/app\/stats/, title: 'Insights', subtitle: 'Patterns from the days you have logged.' },
  { match: /^\/app\/companion/, title: 'Kito' },
  { match: /^\/app\/plans/, title: 'Meal plans' },
  { match: /^\/app\/settings/, title: 'Settings' },
];

export function AppShell() {
  const { session, signOut } = useAuth();
  const { resolved, cycleTheme } = useTheme();
  const online = useOnline();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const title = useMemo<{ title: string; subtitle?: string }>(() => {
    const found = TITLES.find((entry) => entry.match.test(location.pathname));
    return found ?? { title: 'Today' };
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  useEffect(() => {
    if (!session) return;
    const stop = startReminderLoop(
      () => session.preferences.reminders,
      () => todayKey(session.profile.timezone),
    );
    return stop;
  }, [session]);

  const profile = session?.profile;
  if (!session || !profile) return null;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="rail" aria-label="Primary">
        <Link to="/app" className="rail-brand">
          <img src="/icon.svg" alt="" width={38} height={38} />
          <strong>NutriPals</strong>
        </Link>
        <nav className="rail-nav">
          {RAIL.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="rail-link">
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="rail-footer">
          <Link to="/app/companion" className="rail-companion" aria-label={`Open ${session.companion.name}'s page`}>
            <Companion mood={session.companion.mood} accessories={session.companion.equipped} size={44} animate={false} />
            <div>
              <div className="strong" style={{ color: 'var(--ink)' }}>{session.companion.name}</div>
              <div className="tiny">Level {session.companion.level} · {session.companion.streak} day streak</div>
            </div>
          </Link>
          <p className="tiny" style={{ lineHeight: 1.5 }}>{DISCLAIMER}</p>
          <button type="button" className="rail-signout" onClick={() => void signOut()}>
            <Icon name="logout" size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="main-area">
        {!online ? (
          <div className="offline-banner" role="status">
            <Icon name="alert" size={16} /> You’re offline. Nothing new will be saved until you reconnect.
          </div>
        ) : null}
        <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
          <div className="topbar-title">
            {title.title}
            {title.subtitle ? <span>{title.subtitle}</span> : null}
          </div>
          <IconButton
            icon={resolved === 'dark' ? 'sun' : 'moon'}
            label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={cycleTheme}
          />
          <Link to="/app/settings" className="avatar-btn" aria-label="Open settings and profile">
            {initial(profile.display_name)}
          </Link>
        </header>

        <main id="main-content" className="content">
          <Outlet />
          <p className="version-note">{DISCLAIMER}</p>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Primary">
        <NavLink to="/app" end className="bottom-link">
          <Icon name="home" />
          <span>Today</span>
        </NavLink>
        <NavLink to="/app/log" className="bottom-link">
          <Icon name="search" />
          <span>Log</span>
        </NavLink>
        <NavLink to="/app/scan" className="bottom-scan" aria-label="Scan a meal">
          <Icon name="camera" size={24} />
        </NavLink>
        <NavLink to="/app/stats" className="bottom-link">
          <Icon name="chart" />
          <span>Insights</span>
        </NavLink>
        <NavLink to="/app/companion" className="bottom-link">
          <Icon name="heart" />
          <span>Kito</span>
        </NavLink>
      </nav>
    </div>
  );
}

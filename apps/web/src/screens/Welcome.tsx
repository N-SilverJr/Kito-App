import { Link } from 'react-router-dom';
import { DISCLAIMER } from '@nutripals/core';
import { AuthLayout } from '../components/AuthLayout';
import { Icon } from '../components/icons';

export default function Welcome() {
  return (
    <AuthLayout
      title="Food logging that feels like a friend, not a report card."
      subtitle="NutriPals turns everyday meals into a calm, useful picture — with a small forest companion who cheers for consistency, never for eating less."
      points={[
        { icon: 'camera', label: 'Photo estimates you can edit' },
        { icon: 'water', label: 'Hydration and habits' },
        { icon: 'heart', label: 'No shaming, ever' },
      ]}
      mood="happy"
    >
      <div className="auth-card stack">
        <div>
          <h2>Start with today</h2>
          <p className="muted" style={{ marginTop: 6, fontSize: '0.92rem' }}>
            Create a free account to keep meals, water, weight and fasting in sync across your devices.
          </p>
        </div>
        <div className="stack-sm">
          {[
            { icon: 'plate' as const, title: 'Log meals in seconds', body: 'Search the catalog, describe your plate in words, or scan a barcode.' },
            { icon: 'sparkles' as const, title: 'AI photo review', body: 'See each component, its confidence and its source before anything is saved.' },
            { icon: 'leaf' as const, title: 'Built for local food', body: 'Ubugari, isombe, ibishyimbo, matoke and more — with room for your own foods.' },
          ].map((item) => (
            <div key={item.title} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: 'var(--primary-soft)',
                  color: 'var(--primary-ink)',
                  display: 'grid',
                  placeItems: 'center',
                  flex: 'none',
                }}
              >
                <Icon name={item.icon} size={19} />
              </span>
              <div>
                <div className="strong">{item.title}</div>
                <div className="tiny muted">{item.body}</div>
              </div>
            </div>
          ))}
        </div>
        <Link to="/register" className="btn btn-primary btn-block">
          Create my account
        </Link>
        <Link to="/login" className="btn btn-ghost btn-block">I already have an account</Link>
        <p className="legal">{DISCLAIMER}</p>
      </div>
    </AuthLayout>
  );
}

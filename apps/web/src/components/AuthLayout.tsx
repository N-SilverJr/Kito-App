import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { CompanionMood } from '@nutripals/core';
import { Companion } from './Companion';
import type { IconName } from './icons';
import { Icon } from './icons';

export function AuthLayout({
  title,
  subtitle,
  points,
  children,
  mood = 'curious',
}: {
  title: string;
  subtitle: string;
  points: Array<{ icon: IconName; label: string }>;
  children: ReactNode;
  mood?: CompanionMood;
}) {
  return (
    <div className="auth-layout">
      <section className="auth-hero" aria-label="About NutriPals">
        <div className="auth-hero-inner">
          <Link to="/welcome" className="auth-brand">
            <img src="/icon.svg" alt="" width={40} height={40} />
            NutriPals
          </Link>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <div className="auth-points">
            {points.map((point) => (
              <span key={point.label} className="pill pill-green">
                <Icon name={point.icon} size={14} /> {point.label}
              </span>
            ))}
          </div>
          <Companion mood={mood} className="kito-hero" size={260} />
        </div>
      </section>
      <main className="auth-main">{children}</main>
    </div>
  );
}

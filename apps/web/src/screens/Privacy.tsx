import { Link } from 'react-router-dom';
import { APP_NAME } from '@nutripals/core';

/**
 * Public privacy policy. Both the App Store and Google Play require a reachable privacy-policy
 * URL, so this page is deliberately unauthenticated and self-contained.
 *
 * Replace SUPPORT_EMAIL and the effective date before submitting to a store — the store listing
 * URL must point at this page on the production domain (e.g. https://your-domain.example/privacy).
 */
const SUPPORT_EMAIL = 'privacy@nutripals.example';
const EFFECTIVE_DATE = '20 October 2026';

export default function Privacy() {
  return (
    <div className="legal-page">
      <div className="stack">
        <header className="stack-sm">
          <Link to="/" className="brand-inline">
            <img src="/icon.svg" alt="" width={36} height={36} />
            <strong>{APP_NAME}</strong>
          </Link>
          <h1>Privacy policy</h1>
          <p className="muted small">
            Effective {EFFECTIVE_DATE}. This policy describes what {APP_NAME} stores, why, and how you can
            get it back or delete it.
          </p>
        </header>

        <section className="legal-section">
          <h2>What we collect</h2>
          <ul>
            <li>
              <strong>Account:</strong> email address, a password hash (scrypt — we never store the password
              itself), and when you signed up.
            </li>
            <li>
              <strong>Profile you enter:</strong> display name, birth year, height, weight, target weight,
              activity level, goal, units, timezone, dietary preferences and allergies. Birth year and weight
              are optional; you can hide weight tracking entirely.
            </li>
            <li>
              <strong>Tracking records:</strong> meals and their components, hydration entries, weight entries
              with notes, fasting sessions, activity entries, meal plans, reminders, companion progress and
              achievement history.
            </li>
            <li>
              <strong>Technical:</strong> a session cookie (httpOnly), the time a session was last used, and a
              truncated user-agent string for session identification. No advertising identifiers, no
              third-party analytics scripts.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Photos and AI analysis</h2>
          <p>
            When you analyse a meal photo, the image is resized in your browser and sent over HTTPS to our
            server, which forwards it to the configured vision-model provider to produce an estimate. The
            provider is named in the app while the analysis runs. We store the resulting structured estimate
            (food names, portions, nutrition values, confidence) against your account; the <strong>photo
            itself is not written to our database</strong> and is not retained by us after the request
            completes.
          </p>
          <p className="muted small">
            The provider that processes the image may retain or review requests under its own terms for abuse
            prevention and service improvement. Check that provider&apos;s privacy terms before relying on the
            scanner for sensitive content. Nutrition estimates from a photo are approximate and are never
            presented as measured values.
          </p>
        </section>

        <section className="legal-section">
          <h2>Why we use it</h2>
          <ul>
            <li>To show your day, history and trends, and to calculate estimates you asked for.</li>
            <li>To keep your data separate from every other account — every record is scoped to your user id.</li>
            <li>To send account emails you request (verification, password reset) and reminders you enable.</li>
            <li>To protect the service: rate limiting and abuse prevention.</li>
          </ul>
          <p>
            We do not sell personal data, do not use it for advertising, and do not send your health entries to
            analytics providers.
          </p>
        </section>

        <section className="legal-section">
          <h2>Who can see it</h2>
          <p>
            Only you, plus the people who operate the server. Other users cannot read your records; access is
            enforced on the server for every request, not merely hidden in the interface. Third-party
            processors are limited to: the vision-model provider (only when you run a photo analysis), the
            nutrition-data sources queried for food search (food names only, never your identity), and your
            hosting provider.
          </p>
        </section>

        <section className="legal-section">
          <h2>Retention, export and deletion</h2>
          <p>
            Records stay until you delete them. <strong>Settings → Privacy and data</strong> lets you export
            everything as JSON and delete your account, which removes your profile, meals, water, weight,
            fasting, activity, plans, companion progress and sessions. Deletion is immediate and cannot be
            undone; limited backup copies may persist for the retention window of the hosting provider&apos;s
            backups.
          </p>
        </section>

        <section className="legal-section">
          <h2>Children</h2>
          <p>
            {APP_NAME} is not intended for children under 13. Onboarding requires a birth year that puts the
            account holder at 13 or older, and calorie targets for teenagers are capped more conservatively.
          </p>
        </section>

        <section className="legal-section">
          <h2>Health disclaimer</h2>
          <p>
            {APP_NAME} provides general wellness estimates, not medical advice, diagnosis or treatment.
            Nutrition targets, fasting windows and weight trends are informational. Speak to a qualified
            professional about medical conditions, pregnancy, or a history of disordered eating.
          </p>
        </section>

        <section className="legal-section">
          <h2>Contact</h2>
          <p>
            Questions or requests: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We reply to
            privacy and deletion requests within 30 days.
          </p>
          <p className="muted small">
            If you self-host {APP_NAME}, this page is a template: replace the contact address, effective date
            and hosting-provider details with your own before publishing the app.
          </p>
        </section>

        <div className="row wrap">
          <Link to="/" className="btn btn-ghost btn-sm">
            Back to {APP_NAME}
          </Link>
          <Link to="/app/settings" className="btn btn-ghost btn-sm">
            Privacy settings
          </Link>
        </div>
      </div>
    </div>
  );
}

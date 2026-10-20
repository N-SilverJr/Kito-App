import { Link } from 'react-router-dom';
import { Companion } from '../components/Companion';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card card-pad stack" style={{ maxWidth: 420, textAlign: 'center', alignItems: 'center' }}>
        <Companion mood="curious" size={180} />
        <h1>This page wandered off</h1>
        <p className="muted">Kito looked behind the leaves but couldn’t find it.</p>
        <Link to="/app" className="btn btn-primary">Back to today</Link>
      </div>
    </div>
  );
}

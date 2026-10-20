import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Companion } from './Companion';
import { ProgressRing, ProgressBar, Segmented } from './ui';

describe('Companion', () => {
  it('describes its mood for assistive technology', () => {
    const html = renderToStaticMarkup(<Companion mood="celebrating" size={120} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('Kito the forest fox, looking celebrating');
  });

  it('renders unlocked accessories only', () => {
    const withHat = renderToStaticMarkup(<Companion mood="happy" accessories={{ hat: 'hat_acorn' }} />);
    const bare = renderToStaticMarkup(<Companion mood="happy" />);
    expect(withHat.length).toBeGreaterThan(bare.length);
  });

  it('is stable for every mood the server can return', () => {
    for (const mood of ['happy', 'curious', 'encouraging', 'celebrating', 'resting', 'thinking', 'reminder'] as const) {
      expect(renderToStaticMarkup(<Companion mood={mood} />)).toContain(`looking ${mood}`);
    }
  });
});

describe('ProgressBar', () => {
  it('caps the fill at 100 percent', () => {
    expect(renderToStaticMarkup(<ProgressBar value={250} max={100} />)).toContain('width:100%');
  });

  it('handles a zero target without producing NaN', () => {
    const html = renderToStaticMarkup(<ProgressBar value={10} max={0} />);
    expect(html).toContain('width:0%');
    expect(html).not.toContain('NaN');
  });
});

describe('ProgressRing', () => {
  it('exposes an accessible percentage', () => {
    const html = renderToStaticMarkup(<ProgressRing value={50} max={100} label="Calories" center="50%" />);
    expect(html).toContain('aria-label="Calories: 50 percent"');
  });
});

describe('Segmented', () => {
  it('marks the active option as pressed', () => {
    const html = renderToStaticMarkup(
      <Segmented
        label="Range"
        value="7d"
        onChange={() => undefined}
        options={[
          { value: '7d', label: '7 days' },
          { value: '30d', label: '30 days' },
        ]}
      />,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Range"');
  });
});

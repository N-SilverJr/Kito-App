import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCESSORIES, type AchievementStatus, type CompanionState } from '@nutripals/core';
import { Button, Card, EmptyState, Field, Loading, Modal, ProgressBar, useToast } from '../components/ui';
import { Companion } from '../components/Companion';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage, useResource } from '../lib/hooks';
import { plural, prettyDate } from '../lib/format';

export default function CompanionScreen() {
  const { session, refresh } = useAuth();
  const toast = useToast();
  const resource = useResource<{ companion: CompanionState; achievements: AchievementStatus[] }>(
    `companion:${session?.user.id ?? ''}`,
    () => api.companion.get(),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const companion = resource.data?.companion ?? session?.companion ?? null;
  const achievements = resource.data?.achievements ?? [];

  if (!companion) {
    return resource.error ? <EmptyState title="Could not load your companion">{resource.error}</EmptyState> : <Loading />;
  }

  async function equip(id: string) {
    setBusy(id);
    setError(null);
    try {
      // The server toggles: sending the equipped item again takes it off.
      await api.companion.equip(id);
      resource.reload();
      void refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setError('Give your companion a name first.');
      return;
    }
    setBusy('name');
    try {
      await api.companion.rename(trimmed);
      setRenaming(false);
      resource.reload();
      void refresh();
      toast.push(`${trimmed} it is.`, 'success');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  const owned = new Set(companion.unlocked.map((item) => item.id));
  const slots: Array<{ slot: 'hat' | 'scarf' | 'face' | 'backdrop'; title: string }> = [
    { slot: 'scarf', title: 'Scarves' },
    { slot: 'hat', title: 'Hats' },
    { slot: 'face', title: 'Extras' },
    { slot: 'backdrop', title: 'Backdrops' },
  ];
  const remainingXp = companion.xp_for_next_level ? companion.xp_for_next_level - companion.xp : 0;

  return (
    <div className="stack-lg">
      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <div className={`kito-stage ${companion.equipped.backdrop === 'backdrop_night' ? 'night' : companion.equipped.backdrop === 'backdrop_garden' ? 'garden' : ''}`}>
        <Companion mood={companion.mood} accessories={companion.equipped} size={230} />
        <div className="bubble" role="status" aria-live="polite">
          <strong>{companion.name}</strong>
          <p>{companion.message}</p>
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-main stack-lg">
          <Card className="card-pad stack">
            <div className="row-between wrap">
              <div>
                <h2>Level {companion.level}</h2>
                <p className="small muted">
                  {companion.xp} XP total
                  {companion.xp_for_next_level ? ` · ${Math.max(0, companion.xp_for_next_level - companion.xp)} XP to level ${companion.level + 1}` : ' · top level reached'}
                </p>
              </div>
              <Button variant="ghost" size="sm" icon="edit" onClick={() => { setNameDraft(companion.name); setRenaming(true); }}>
                Rename
              </Button>
            </div>
            <ProgressBar value={companion.xp_into_level} max={companion.xp_into_level + remainingXp || 1} />
            <div className="row wrap" style={{ gap: 10, marginTop: 4 }}>
              <span className="pill pill-green">
                {companion.streak} {companion.streak === 1 ? 'day' : 'days'} streak
              </span>
              <span className="pill">Longest {plural(companion.longest_streak, 'day')}</span>
              <span className="pill">
                {companion.earned_achievements.length}{' '}
                {companion.earned_achievements.length === 1 ? 'achievement' : 'achievements'}
              </span>
            </div>
            <p className="tiny muted">
              XP rewards consistency — logging, hydration, check-ins and completed windows. It is never awarded for eating
              less.
            </p>
          </Card>

          <Card className="card-pad stack">
            <h2>Wardrobe</h2>
            <p className="small muted">Items unlock as you level up. Everything is cosmetic.</p>
            {slots.map(({ slot, title }) => {
              const items = ACCESSORIES.filter((item) => item.slot === slot);
              if (items.length === 0) return null;
              return (
                <div key={slot} className="slot-block">
                  <h3 className="slot-title">{title}</h3>
                  <div className="accessory-grid">
                    {items.map((item) => {
                      const isOwned = owned.has(item.id);
                      const isEquipped = companion.equipped[slot] === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`accessory ${isEquipped ? 'equipped' : ''} ${isOwned ? '' : 'locked'}`}
                          disabled={!isOwned || busy !== null}
                          aria-pressed={isEquipped}
                          onClick={() => void equip(item.id)}
                        >
                          <span className="accessory-name">{item.name}</span>
                          <span className="tiny muted">{item.description}</span>
                          <span className="tiny">
                            {isEquipped ? 'Wearing · tap to remove' : isOwned ? 'Tap to wear' : `Unlocks at level ${item.unlockLevel}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </Card>

          <Card className="card-pad stack">
            <h2>Achievements</h2>
            {achievements.length === 0 ? (
              <EmptyState icon="heart" title="Achievements load with your history">
                Add a meal or a water entry and progress will appear here.
              </EmptyState>
            ) : (
              <div className="achievement-list">
                {achievements.map((achievement) => (
                  <div key={achievement.id} className={`achievement ${achievement.earned ? 'earned' : ''}`}>
                    <span className="achievement-icon" aria-hidden="true">{achievement.icon}</span>
                    <div className="grow">
                      <div className="row-between">
                        <span className="strong small">{achievement.title}</span>
                        <span className="tiny muted">+{achievement.xp} XP</span>
                      </div>
                      <div className="tiny muted">{achievement.description}</div>
                      <ProgressBar value={achievement.progress} max={achievement.target} />
                      {achievement.earned_at ? (
                        <div className="tiny muted">Earned {prettyDate(achievement.earned_at.slice(0, 10))}</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="dash-side stack-lg">
          <Card className="card-pad stack-sm">
            <h3>Reward history</h3>
            {companion.recent_rewards.length === 0 ? (
              <p className="small muted">No rewards yet. Log something small to start.</p>
            ) : (
              <ul className="reward-list">
                {companion.recent_rewards.map((reward) => (
                  <li key={reward.id}>
                    <div className="grow">
                      <div className="strong small">{reward.label}</div>
                      <div className="tiny muted">{prettyDate(reward.created_at.slice(0, 10), { day: 'numeric', month: 'short' })}</div>
                    </div>
                    <span className="pill pill-green">+{reward.xp} XP</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="tiny muted">
              Each reward can only be earned once per event, so repeated taps can’t farm XP.
            </p>
          </Card>

          <Card className="card-pad stack-sm">
            <h3>What Kito will never do</h3>
            <ul className="observation-list">
              <li>Diagnose a health condition.</li>
              <li>Shame you for a meal, a missed day or going over a target.</li>
              <li>Suggest skipping meals or extreme restriction.</li>
            </ul>
            <p className="tiny muted">
              Kito is a friendly nudge, not a clinician. For medical advice, talk to a qualified professional.
            </p>
            <Link to="/app/settings" className="btn btn-ghost btn-sm">
              <Icon name="settings" size={14} /> Companion settings
            </Link>
          </Card>
        </aside>
      </div>

      {renaming ? (
        <Modal
          title="Name your companion"
          onClose={() => setRenaming(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
              <Button variant="primary" loading={busy === 'name'} onClick={() => void saveName()}>Save name</Button>
            </>
          }
        >
          <Field label="Companion name" htmlFor="companion-name" hint="Up to 24 characters. Pick anything you like.">
            <input
              id="companion-name"
              className="input"
              value={nameDraft}
              maxLength={24}
              onChange={(event) => setNameDraft(event.target.value)}
            />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}

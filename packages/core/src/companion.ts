/**
 * Kito, the NutriPals companion.
 *
 * Kito is an original character: a small round forest fox with oversized ears
 * and a leaf scarf. Dialogue is intentionally short, warm and non-judgmental.
 * Kito never diagnoses, never moralises about food, and never equates weight
 * with worth. These messages are used when AI-generated dialogue is disabled or
 * unavailable, and as the safe fallback in every case.
 */

export type CompanionMood =
  | 'happy'
  | 'curious'
  | 'encouraging'
  | 'celebrating'
  | 'resting'
  | 'thinking'
  | 'reminder';

export type CompanionContext =
  | 'meal_logged'
  | 'scan_reviewed'
  | 'water_goal'
  | 'water_progress'
  | 'weight_logged'
  | 'fast_complete'
  | 'streak'
  | 'achievement'
  | 'returning'
  | 'morning'
  | 'evening'
  | 'empty_day'
  | 'goal_met'
  | 'over_target'
  | 'idle';

interface Reaction {
  mood: CompanionMood;
  messages: readonly string[];
}

const REACTIONS: Record<CompanionContext, Reaction> = {
  meal_logged: {
    mood: 'happy',
    messages: [
      'Logged it. One less thing to remember today.',
      'Nice — that’s on the board. No judgement, just information.',
      'Noted! Your day is taking shape.',
    ],
  },
  scan_reviewed: {
    mood: 'thinking',
    messages: [
      'Photo estimates are a starting point — thanks for checking the portions.',
      'Good call reviewing that. Pictures can only tell us so much.',
    ],
  },
  water_goal: {
    mood: 'celebrating',
    messages: ['Hydration goal reached. Little win, logged.', 'Your water goal is done for today. Nice work.'],
  },
  water_progress: {
    mood: 'encouraging',
    messages: ['Sip when you’re thirsty — progress, not pressure.', 'Every glass counts, no rush.'],
  },
  weight_logged: {
    mood: 'resting',
    messages: [
      'Check-in saved. Day-to-day swings are normal — the trend is what matters.',
      'Thanks for recording it. One number doesn’t define your progress.',
    ],
  },
  fast_complete: {
    mood: 'celebrating',
    messages: ['Fast complete. However it went, you showed up.', 'Timer done. Be gentle with your next meal.'],
  },
  streak: {
    mood: 'celebrating',
    messages: ['Your consistency is showing. Nice streak!', 'Streak kept alive. Small habits add up.'],
  },
  achievement: {
    mood: 'celebrating',
    messages: ['New badge unlocked! You earned that one.', 'Achievement unlocked. Kito is doing a little dance.'],
  },
  returning: {
    mood: 'happy',
    messages: [
      'Good to see you again. Let’s start with today, nothing to catch up on.',
      'Welcome back! Pick up wherever you like.',
    ],
  },
  morning: {
    mood: 'curious',
    messages: ['Morning! What’s the plan for today?', 'New day, fresh page. What sounds good?'],
  },
  evening: {
    mood: 'resting',
    messages: ['Winding down? You can log later if you like.', 'Evening check-in whenever you’re ready.'],
  },
  empty_day: {
    mood: 'curious',
    messages: ['Nothing logged yet. Want to start with something simple?', 'Fresh page. Add a meal or just some water.'],
  },
  goal_met: {
    mood: 'happy',
    messages: ['You’re in a comfortable range today. Nice.', 'Targets are guides, and today landed well.'],
  },
  over_target: {
    mood: 'encouraging',
    messages: [
      'Numbers are just information. One day doesn’t undo anything.',
      'Thanks for logging honestly — that’s the useful part.',
    ],
  },
  idle: {
    mood: 'resting',
    messages: ['Kito is here whenever you need a check-in.', 'Take your time. Small steps count.'],
  },
};

export const MOODS: readonly CompanionMood[] = [
  'happy',
  'curious',
  'encouraging',
  'celebrating',
  'resting',
  'thinking',
  'reminder',
];

export const DEFAULT_COMPANION_NAME = 'Kito';

/** Stable hash so the same context+day shows the same line across reloads. */
function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value;
}

export function companionReaction(context: CompanionContext, seed = ''): { mood: CompanionMood; message: string } {
  const reaction = REACTIONS[context];
  const messages = reaction.messages;
  const index = hash(`${context}:${seed}`) % messages.length;
  return { mood: reaction.mood, message: messages[index] ?? messages[0] ?? 'Kito is here.' };
}

export function moodForDay(hasEntries: boolean, hourOfDay: number): CompanionMood {
  if (!hasEntries) return hourOfDay < 11 ? 'curious' : 'reminder';
  if (hourOfDay >= 21) return 'resting';
  return 'happy';
}

/** Safety guard for any model-generated companion line. */
export function sanitizeCompanionMessage(text: string, maxLength = 180): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const banned = /(diagnos|obese|fat shaming|starve|purge|stop eating|cheat day|guaranteed weight loss)/i;
  const fallback = 'Small steps count. Kito is cheering you on.';
  if (!collapsed || banned.test(collapsed)) return fallback;
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1).trimEnd()}…` : collapsed;
}

-- NutriPals initial schema.
-- Timestamps are ISO-8601 UTC strings. local_date is computed in the user's
-- timezone at write time so day aggregation stays correct across DST/offsets.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('verify_email','reset_password')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id, kind);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  birth_year INTEGER,
  height_cm REAL,
  weight_kg REAL,
  sex TEXT NOT NULL DEFAULT 'unspecified' CHECK (sex IN ('female','male','unspecified')),
  activity_level TEXT NOT NULL DEFAULT 'light'
    CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
  goal TEXT NOT NULL DEFAULT 'maintain' CHECK (goal IN ('lose','maintain','gain','habits')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  onboarding_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  unit_system TEXT NOT NULL DEFAULT 'metric' CHECK (unit_system IN ('metric','imperial')),
  calorie_tracking_enabled INTEGER NOT NULL DEFAULT 1 CHECK (calorie_tracking_enabled IN (0,1)),
  show_weight INTEGER NOT NULL DEFAULT 1 CHECK (show_weight IN (0,1)),
  fasting_enabled INTEGER NOT NULL DEFAULT 0 CHECK (fasting_enabled IN (0,1)),
  water_target_ml INTEGER NOT NULL DEFAULT 2000 CHECK (water_target_ml BETWEEN 500 AND 6000),
  weight_target_kg REAL,
  dietary_preferences TEXT NOT NULL DEFAULT '[]',
  allergies TEXT NOT NULL DEFAULT '[]',
  companion_name TEXT NOT NULL DEFAULT 'Kito',
  locale TEXT NOT NULL DEFAULT 'en',
  weekly_plan_budget TEXT NOT NULL DEFAULT 'medium' CHECK (weekly_plan_budget IN ('low','medium','high')),
  reminders TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE nutrition_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from TEXT NOT NULL,
  calories INTEGER NOT NULL CHECK (calories BETWEEN 800 AND 8000),
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  fiber_g REAL NOT NULL,
  water_ml INTEGER NOT NULL,
  method TEXT NOT NULL,
  assumptions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_goals_user ON nutrition_goals(user_id, created_at DESC);

CREATE TABLE foods (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  alt_names TEXT NOT NULL DEFAULT '[]',
  locale TEXT,
  brand TEXT,
  category TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  allergens TEXT NOT NULL DEFAULT '[]',
  per_100g TEXT NOT NULL,
  serving_sizes TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL CHECK (source IN ('catalog','open_food_facts','usda_fdc','ai_estimate','user_entered')),
  source_id TEXT,
  attribution TEXT,
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0,1)),
  created_by TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_foods_name ON foods(name);
CREATE INDEX idx_foods_creator ON foods(created_by);
CREATE INDEX idx_foods_source ON foods(source, source_id);

CREATE TABLE meals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  title TEXT,
  notes TEXT,
  eaten_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','plan')),
  ai_analysis_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_meals_user_date ON meals(user_id, local_date);
CREATE INDEX idx_meals_user_eaten ON meals(user_id, eaten_at DESC);

CREATE TABLE meal_items (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  food_id TEXT REFERENCES foods(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  grams REAL NOT NULL CHECK (grams > 0),
  kcal REAL NOT NULL CHECK (kcal >= 0),
  protein_g REAL NOT NULL CHECK (protein_g >= 0),
  carbs_g REAL NOT NULL CHECK (carbs_g >= 0),
  fat_g REAL NOT NULL CHECK (fat_g >= 0),
  fiber_g REAL,
  source TEXT NOT NULL CHECK (source IN ('catalog','open_food_facts','usda_fdc','ai_estimate','user_entered')),
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  portion_uncertainty TEXT CHECK (portion_uncertainty IS NULL OR portion_uncertainty IN ('low','medium','high')),
  ingredients TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_meal_items_meal ON meal_items(meal_id);
CREATE INDEX idx_meal_items_food ON meal_items(food_id);

CREATE TABLE hydration_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  amount_ml INTEGER NOT NULL CHECK (amount_ml BETWEEN 10 AND 5000),
  logged_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_hydration_user_date ON hydration_entries(user_id, local_date);

CREATE TABLE weight_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  weight_kg REAL NOT NULL CHECK (weight_kg BETWEEN 20 AND 400),
  note TEXT,
  logged_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_weight_user_logged ON weight_entries(user_id, logged_at DESC);

CREATE TABLE fasting_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  target_minutes INTEGER NOT NULL CHECK (target_minutes BETWEEN 60 AND 1440),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_fasting_user ON fasting_sessions(user_id, started_at DESC);
CREATE UNIQUE INDEX idx_fasting_one_active ON fasting_sessions(user_id) WHERE status = 'active';

CREATE TABLE activity_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  type TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 1440),
  steps INTEGER,
  kcal_burned INTEGER,
  note TEXT,
  logged_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_activity_user_date ON activity_entries(user_id, local_date);

CREATE TABLE companion_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Kito',
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  equipped TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE companion_inventory (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accessory_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  PRIMARY KEY (user_id, accessory_id)
);

CREATE TABLE companion_rewards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  label TEXT NOT NULL,
  xp INTEGER NOT NULL CHECK (xp >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, event_key)
);
CREATE INDEX idx_rewards_user_created ON companion_rewards(user_id, created_at DESC);

CREATE TABLE user_achievements (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE meal_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  title TEXT NOT NULL,
  preferences TEXT NOT NULL DEFAULT '{}',
  shopping_list TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_plans_user ON meal_plans(user_id, created_at DESC);

CREATE TABLE meal_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 1 AND 7),
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  title TEXT NOT NULL,
  ingredients TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '',
  totals TEXT NOT NULL,
  components TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_plan_items_plan ON meal_plan_items(plan_id);

CREATE TABLE ai_analyses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded','failed')),
  item_count INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  error_code TEXT,
  result TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ai_user_created ON ai_analyses(user_id, created_at DESC);

CREATE TABLE idempotency_keys (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status INTEGER NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

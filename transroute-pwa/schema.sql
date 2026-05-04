-- ============================================================
--  TRANSROUTE PWA — DATABASE SCHEMA
--  Run this entire file in Supabase → SQL Editor
-- ============================================================

-- 1. PROFILES (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  driver_id   TEXT        UNIQUE NOT NULL,
  name        TEXT        NOT NULL,
  phone       TEXT,
  role        TEXT        NOT NULL DEFAULT 'driver'
                          CHECK (role IN ('driver', 'admin')),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. VEHICLES
CREATE TABLE IF NOT EXISTS public.vehicles (
  id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_no  TEXT    UNIQUE NOT NULL,
  model            TEXT    NOT NULL,
  make             TEXT,
  year             INTEGER,
  current_mileage  INTEGER NOT NULL DEFAULT 0,
  next_service_km  INTEGER,
  status           TEXT    NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'maintenance', 'decommissioned')),
  notes            TEXT,
  assigned_driver_id TEXT REFERENCES public.profiles(driver_id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. BOOKINGS
CREATE TABLE IF NOT EXISTS public.bookings (
  id            UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_no    TEXT  UNIQUE NOT NULL,
  client_name   TEXT  NOT NULL,
  route         TEXT,
  tour_date     DATE  NOT NULL,
  passengers    INTEGER DEFAULT 1,
  amount        NUMERIC(10,2),
  status        TEXT  NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','invoiced','completed','cancelled')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. INSPECTIONS
CREATE TABLE IF NOT EXISTS public.inspections (
  id                   UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_no           TEXT    REFERENCES public.bookings(invoice_no) ON DELETE SET NULL,
  vehicle_reg          TEXT    NOT NULL REFERENCES public.vehicles(registration_no),
  driver_id            TEXT    NOT NULL REFERENCES public.profiles(driver_id),
  inspection_type      TEXT    NOT NULL CHECK (inspection_type IN ('pre-trip', 'post-trip')),
  checklist_json       JSONB   NOT NULL DEFAULT '{}',
  faults_json          JSONB   NOT NULL DEFAULT '[]',
  media_urls           JSONB   NOT NULL DEFAULT '[]',
  mileage_at_inspection INTEGER,
  notes                TEXT,
  has_critical_fault   BOOLEAN NOT NULL DEFAULT false,
  alert_sent           BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inspections_vehicle  ON public.inspections(vehicle_reg);
CREATE INDEX IF NOT EXISTS idx_inspections_driver   ON public.inspections(driver_id);
CREATE INDEX IF NOT EXISTS idx_inspections_date     ON public.inspections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_fault    ON public.inspections(has_critical_fault);
CREATE INDEX IF NOT EXISTS idx_bookings_date        ON public.bookings(tour_date);

-- ── UPDATED_AT TRIGGER ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── AUTO-CREATE PROFILE ON SIGN-UP ───────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, driver_id, name, role)
  VALUES (
    NEW.id,
    'DRV-' || UPPER(SUBSTRING(NEW.id::text, 1, 6)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'driver')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

-- profiles: users see their own; admins see all
CREATE POLICY "profiles_self"  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "profiles_admin" ON public.profiles FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- vehicles: all authenticated users can read; only admins can write
CREATE POLICY "vehicles_read"  ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "vehicles_admin" ON public.vehicles FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- bookings: all authenticated users can read; only admins can write
CREATE POLICY "bookings_read"  ON public.bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "bookings_admin" ON public.bookings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- inspections: drivers see their own; admins see all
CREATE POLICY "inspections_own"   ON public.inspections FOR SELECT
  USING (
    driver_id = (SELECT driver_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "inspections_insert" ON public.inspections FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "inspections_admin"  ON public.inspections FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ── SAMPLE SEED DATA (optional — delete if not needed) ────────
INSERT INTO public.vehicles (registration_no, model, make, year, current_mileage, next_service_km, status)
VALUES
  ('CA 123 456', 'Quantum 2.5 TDi', 'Toyota', 2021, 85000, 90000, 'active'),
  ('CA 789 012', 'Sprinter 316 CDI', 'Mercedes-Benz', 2020, 120000, 125000, 'active'),
  ('GP 345 678', 'Hiace 2.5 D4D', 'Toyota', 2019, 210000, 215000, 'maintenance')
ON CONFLICT DO NOTHING;

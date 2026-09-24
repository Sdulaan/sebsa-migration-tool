# SEBSA Migration Tool — UI Architecture

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15+ (App Router) |
| Styling | Plain CSS — `app/globals.css` (no Tailwind, no CSS Modules) |
| Icons | `@mui/icons-material` (Material UI Icons only) |
| State | React `useState` / `useEffect` (no Redux, no Zustand) |
| Auth | `sessionStorage` mock via `lib/auth.js` |
| Data | `localStorage` mock via `lib/migrationStore.js` |
| Runtime | Turbopack (Next.js 16.3.5) |

---

## Directory Structure

```
frontend/
├── app/
│   ├── globals.css            ← All styles live here (CSS variables, components)
│   ├── layout.jsx             ← Root layout (loads ThemeRegistry)
│   ├── login/
│   │   └── page.jsx           ← Login page (public route)
│   └── (app)/                 ← Protected route group
│       ├── layout.jsx         ← Wraps all app pages in <AppShell>
│       ├── page.jsx           ← Dashboard page
│       ├── new-migration/
│       │   └── page.jsx       ← New Migration wizard (3-step)
│       ├── history/
│       │   └── page.jsx       ← Migration History list
│       └── settings/
│           └── page.jsx       ← User Profile & Settings
├── components/
│   ├── AppShell.jsx           ← Sidebar + main layout wrapper
│   ├── MigrationStepper.jsx   ← Top step indicator
│   ├── ProtectedRoute.jsx     ← Auth guard
│   └── ThemeRegistry.jsx      ← MUI emotion cache setup
├── lib/
│   ├── auth.js                ← Mock login / logout / getSession (sessionStorage)
│   └── migrationStore.js      ← Mock data: entities, history, runMigration
└── public/
    └── sebsa-logo.png
```

---

## Routing

| Route | File | Access |
|---|---|---|
| `/login` | `app/login/page.jsx` | Public |
| `/` | `app/(app)/page.jsx` | Protected |
| `/new-migration` | `app/(app)/new-migration/page.jsx` | Protected |
| `/history` | `app/(app)/history/page.jsx` | Protected |
| `/settings` | `app/(app)/settings/page.jsx` | Protected |

---

## CSS Architecture (`app/globals.css`)

Styles are global, flat CSS. No scoping. All class names defined in `globals.css`.

### CSS Variables (`:root`)

| Variable | Description |
|---|---|
| `--bg` | Page background (light grey-blue) |
| `--surface` | Card/panel background (white) |
| `--border` / `--border-soft` | Border colours |
| `--text` / `--text-muted` / `--text-faint` | Text hierarchy |
| `--accent` | Primary brand purple `#5B3FD6` |
| `--accent-strong` | Darker purple `#4C1D8C` |
| `--accent-soft` | Light purple tint (secondary button BG) |
| `--grad-start/mid/end` | Gradient (hero banner, MigrationStepper) |
| `--success/warning/danger -bg/-text` | Badge colour pairs |
| `--radius` / `--radius-lg` | 10px / 14px |
| `--shadow` | Subtle box shadow |

### Key CSS Classes

| Class | Description |
|---|---|
| `.shell` | Grid layout (`255px sidebar + 1fr main`) |
| `aside` | Sidebar (dark blue-grey `#ECEEF5` background) |
| `nav a` | Sidebar nav links |
| `nav a.active` | Active nav (accent purple highlight) |
| `.sign-out-btn` | Red sign-out button (`#FFF1F2` background, `#BE123C` text) |
| `main` | Page content (`padding: 32px`, full width) |
| `.panel` | White card with border and shadow |
| `.cards` | 4-col auto-fit stat card grid |
| `button` | Primary button — solid purple (`--accent`) |
| `.secondary` | Soft purple outline button |
| `.ghost` | Grey subtle button |
| `.sign-out-btn` | Light red destructive button |
| `.eyebrow` | Small uppercase label |
| `.badge` `.HIGH` `.MEDIUM` `.LOW` | Status pills |
| `.config-layout` | 2-col master-detail grid |
| `.record-list` | Scrollable record list (max-height: 480px) |
| `.record-row` | Checkbox + record info row |
| `.column-grid` / `.column-card` | Entity selector cards |
| `.history-row` | Migration history row |

---

## Data Layer (`lib/migrationStore.js`)

### AVAILABLE_ENTITIES
Array of entity configs:
```js
{
  id: 'part',
  label: 'Part',
  idKey: 'partNo',          // Primary key field
  rowPrimary: 'description', // Main display field
  rowSecondary: ['partNo', 'site'],
  generator: mockPartRecord  // fn(i) => record object
}
```
Current entities: `customer`, `company`, `part`, `supplier`

### Part Entity — 4 Sequential Sub-Steps
```
1. Master Part → 2. Inventory Part → 3. Purchase Part → 4. Sales Part
```
- Each sub-step has its own independent selection Set.
- Checking record in step N auto-checks steps 1..N (IFS dependency rule).
- Unchecking in step N auto-unchecks steps N..4.

### Key Functions
| Function | Description |
|---|---|
| `fetchEntitiesData(ids)` | Returns `Promise<{ [id]: { total, records[] } }>` |
| `runMigration(from, to, breakdown[])` | Saves to localStorage, returns entry |
| `getHistory()` | Reads migration history from localStorage |

---

## New Migration Wizard State (`new-migration/page.jsx`)

```
Step 0: Configuration  → Pick environments + entities → Fetch
Step 1: Review Data    → Master-detail record review per entity
Step 2: Migrate        → Success summary
```

### Part Sub-Step State
```js
const [partSubStep, setPartSubStep] = useState(0) // 0–3
const [selectedRecordIds, setSelectedRecordIds] = useState({
  part: [new Set(), new Set(), new Set(), new Set()], // one per sub-step
  customer: new Set(),
  // ...
})
```

---

## Auth (`lib/auth.js`)

| Function | Description |
|---|---|
| `login(email, password)` | Validates `admin@sebsa.com` / `sebsa123`, stores in sessionStorage |
| `logout()` | Clears sessionStorage |
| `getSession()` | Returns session object or null |

---

## Responsive Breakpoints

| Breakpoint | Behaviour |
|---|---|
| `≤ 900px` | Sidebar collapses to horizontal top bar |
| `≤ 720px` | Config master-detail stacks vertically |
| `≤ 520px` | Full-width buttons, reduced padding |

---

## MUI Icon Convention

Always use the `Outlined` suffix (NOT `Outline`):
```js
// Correct
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'

// Wrong — causes "Module not found" build error
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
```

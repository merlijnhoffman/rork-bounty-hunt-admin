# Bounty Hunt Admin Control Panel


**Overview**
A sleek, dark command-center style admin app for managing live treasure hunt events. Dark backgrounds (#0A0A0A/#1A1A1A) with cyan (#00D4FF) accents and red (#FF6B6B) for destructive actions. Stack-based navigation — no tabs.

**Features**
- Sign in with email and password; only admin users can access the app
- View all events in a dashboard sorted by date, with status badges and ticket counts
- Create new treasure hunt events with city, date, time, pricing, and prize
- Control live events: start hunts, end hunts, and manage status transitions
- Send clues to players during live events with auto-numbering
- View, edit, and delete clue history for each event (clues are zone-free)
- Separate Zone Control section on event detail page: set up zone center/radius once, then live-control narrowed_percent with instant sync to event_zones table
- Draggable marker to move zone center during the game
- Debounced auto-save with "Synced"/"Saving…" indicator
- Reset zone to 0% narrowed with one button
- View live player list with emails, ticket counts, and connection stats
- See the event zone on an interactive map with initial+current circle overlays
- Edit all event details after creation
- Pull-to-refresh on all list screens
- Confirmation alerts before any destructive action
- Real-time updates via Supabase subscriptions (events, clues, tickets, connections, event_zones)

**Design**
- Dark, minimal "command center" aesthetic — inspired by mission control dashboards
- Primary background: near-black (#0A0A0A), card surfaces: dark grey (#1A1A1A)
- Cyan (#00D4FF) for primary actions, highlights, and active status indicators
- Red (#FF6B6B) for destructive buttons and warning states
- Clean sans-serif typography with high contrast white text
- Status badges: cyan for "live", amber for "scheduled", muted grey for "completed"
- Subtle borders and card separations, no heavy shadows
- Loading skeletons and spinners in cyan accent

**Screens**
- **Login** — Email and password fields on a dark background with the app logo/title, a cyan "Sign In" button
- **Access Denied** — Shown if the user is not an admin, with a message and sign-out option
- **Dashboard (Home)** — Scrollable list of event cards showing city, date, status badge, ticket count, and prize; floating "+" button to create a new event
- **Create Event** — Form with inputs for city, date, start time, ticket price, and prize amount; cyan "Create" button
- **Event Detail / Control** — Event info card at top; status control buttons (Start Hunt / End Hunt); Zone Control section (initial setup map + live narrowed_percent slider); clue sender with text, hint, and media; scrollable clue history with edit/delete per clue
- **Edit Event** — Pre-filled form for editing all event fields
- **Live Players** — Ticket holder count, player list with emails, connection count, and a map showing the event zone with initial+current circle overlays from event_zones
- **Edit Clue** — Form to update an existing clue's text and hint

**Database**
- `event_zones` — one row per event. Columns: event_id (PK, FK→events), center_latitude, center_longitude, initial_radius, narrowed_percent (0–100), zone_name, created_at, updated_at. The user app computes `current_radius = initial_radius * (1 - narrowed_percent/100)`.

**App Icon**
- A dark background with a glowing cyan crosshair/target symbol, evoking a treasure hunt command center

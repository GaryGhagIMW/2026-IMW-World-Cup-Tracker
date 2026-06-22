# Knockout stage setup (Power Automate + OneDrive)

The **Knockout** tab is live in the app. Players submit picks through the same Power Automate HTTP URL as group stage, with `phase: "knockout"` and `action: "submitKnockout"`.

## What you need to do

### 1. Create Knockout Entries Excel file

In OneDrive (`World Cup 2026 Pool/`):

1. Create **Knockout Entries.xlsx**
2. Add a table named **`KnockoutEntries`** with columns:

| Column | Notes |
|--------|--------|
| PlayerName | |
| Email | |
| SubmittedAt | |
| SubmitPhase | `early` or `full` |
| EntryJson | Full JSON backup (recommended) |
| Knockout_r32_1 … Knockout_final | Winner team code per match (optional flat columns) |
| FinalScoreHome | Tiebreaker |
| FinalScoreAway | Tiebreaker |

> Minimum: `PlayerName`, `Email`, `SubmittedAt`, `EntryJson`

### 2. Update your existing Power Automate flow

Open **World Cup 2026 - Save Entry to SharePoint** (same flow as group stage).

#### A. Extend the HTTP trigger schema

Add these fields to the sample JSON:

```json
{
  "action": "submitKnockout",
  "phase": "knockout",
  "submitPhase": "early",
  "playerName": "Jane Doe",
  "playerEmail": "jane.doe@imw.ca",
  "submittedAt": "2026-06-25T18:30:00.000Z",
  "entryJson": "{\"knockout\":{\"r32-1\":\"MEX\"}}",
  "Knockout_r32_1": "MEX",
  "FinalScoreHome": 2,
  "FinalScoreAway": 1
}
```

#### B. Add conditions after the trigger

```
IF action = list
  → existing list branch (Group Stage Entries.xlsx)

ELSE IF action = submitKnockout  (or phase = knockout)
  → Add row to Knockout Entries.xlsx / KnockoutEntries table
  → Response 200 { "status": "ok" }

ELSE
  → existing group stage submit branch (Group Stage Entries.xlsx)
```

Expression for knockout branch:

```
@equals(triggerBody()?['action'], 'submitKnockout')
```

Map dynamic content from the trigger to Excel columns. Store **EntryJson** — the app can parse knockout picks from it when syncing.

#### C. Save and test

Use **Test** in Power Automate with a sample `submitKnockout` payload before June 25.

## Submission windows (app-enforced)

| Window | Dates | Required picks |
|--------|-------|----------------|
| **Early** | June 25–26 | First 3 R32 games (Matches 49–51) |
| **Full** | June 29 – July 18 | All 32 knockout games + Final score |

## Scoring

- Enter knockout **results** in the site **Admin** tab (organizer PIN).
- The **Leaderboard** shows Group + KO + Total once results are saved.
- Final score is tiebreaker only (no points).

## Sync knockout picks to the leaderboard (optional)

Until a live fetch URL is configured, merge knockout data by:

1. Export **Knockout Entries.xlsx** from OneDrive, or
2. Parsing `EntryJson` when running a future sync script

Group stage picks remain in `Group Stage Entries.xlsx`; knockout picks go to the separate file above.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Submit button does nothing | Confirm `webhookUrl` in `config.js` and flow is turned on |
| Row lands in wrong Excel file | Check `action = submitKnockout` condition branch |
| Bracket shows "TBD" | Normal before group stage ends; updates from live group rankings |
| Can't pick R16 teams | Pick earlier round winners first — bracket cascades from your picks |

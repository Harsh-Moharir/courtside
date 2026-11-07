# Admin guide: running the tournament

This guide is for the people running the event. No technical knowledge is needed. Everything is done in the browser at **`/admin`** (sign in with your admin email and password). Spectators never need an account.

> **Golden rule:** the website saves every action the moment you press a button. If a button shows a spinner, wait for it. If something goes wrong you will see a red message saying what to do; nothing is half-saved.

---

## 1. Before the event (a few days ahead)

1. **Tournament details** — *Admin → Tournament*: name, tagline, logo, banner, time zone (default India), currency symbol (default ₹) and the default venue. The **Match rules** box sets quarters (default four 10-minute quarters), overtime length, shot clock (24 s), timeouts and the team-foul bonus.
2. **Teams** — *Admin → Teams → Add team* (up to 10). Enter the name, short name (3 letters, used on small screens), logo, the two team colours and the owner's name. The page warns you if the two colours are hard to tell apart.
3. **Players** — *Admin → Players*. Add players one at a time, or use **Import** to upload a spreadsheet (CSV or Excel). Download the template from the import page first. The preview shows every row as OK, Warning (possible duplicate) or Error; only good rows are imported and you get a file listing the skipped ones.
4. **Icon players** — open each team (*Admin → Teams → the team*) and choose **Icon player 1** and **Icon player 2**. Icons are not auctioned and cost nothing.
5. **Auction settings** — *Admin → Auction → Settings*: purse per team, base price, minimum and maximum squad size, bid increments (for example +100 up to 1,999, +250 up to 4,999, then +500), number of rounds and what happens to unsold players.
6. **Backup**: ask your technical contact to run `supabase db dump -f backup-before-event.sql`.

The **Dashboard** (*Admin* home) has a setup checklist that ticks itself as you go, and a list of warnings.

---

## 2. Auction day

* Put the projector/TV on **`/auction/display`** and press **F** for full screen. It updates by itself.
* On your laptop or tablet open **Admin → Auction → Console**.

1. Check the pre-start checklist and press **Start round 1**. (If some teams have fewer than two icon players the site asks you to confirm.)
2. Pick the next player from the list, or press **Random next**.
3. When a team raises its paddle, **tap that team** in the team grid, then press **Bid** (the minimum next bid is shown on the button), **+2 steps**, **+5 steps** or type an amount. Teams that cannot bid are greyed out with the reason (already leading, squad full, cannot afford).
4. Made a mistake? **Undo last bid** — you can undo all the way back to no bids.
5. Press **SOLD** (green) and confirm. The player joins that team immediately and the purse goes down. Or press **UNSOLD** (red).
6. Wrong player brought up? Use **⋯ → Cancel lot**: nothing is recorded and the player stays available.
7. When the pool is empty press **End round**. Tick the unsold players you want to bring back and **Start next round with selected**, or press **Complete auction**.

Keyboard shortcuts (when you are not typing in a box): **1–9, 0** select a team, **B** bid, **U** undo, **S** sold, **X** unsold.

**If two people operate the console at once** the second bid is refused with "The bid changed: check the new price" — just look at the new price and bid again.

**Fixing a sale afterwards** — *Admin → Auction → History and corrections*: **Reverse sale** (refunds the team, the player becomes available or unsold) or **Reassign** (move the player to another team and/or change the price). A short reason is always required and kept in the history.

---

## 3. Fixtures

*Admin → Fixtures*

1. **Generate league**: choose *single* (every team meets once) or *double* round robin (home and away).
2. **Auto-schedule**: pick the start date, the weekdays you play, first start time, slot length (90 minutes by default), the courts and how many slots per day. A team never plays twice on the same day.
3. Adjust any fixture: **Edit** (date, time, venue, notes), **Postpone** (with a reason), **Reschedule**, **Delete**. Warnings appear if a team plays twice within 2 hours or a court is double-booked; they never block you.
4. **Match of the Day**: star a fixture to feature it on the homepage.

Times on the public site always say *Approx.* because games can start late.

---

## 4. Match day: scoring a game

*Admin → Live scoring → Start match* opens the scoring console. The public scoreboard (`/live` and the match page) goes live at the same moment.

* **+1 / +2 / +3** under each team. **Foul +/−**. **Timeout** (the clocks stop automatically).
* **Start / Pause** the game clock (Space bar). **Shot 24** / **Shot 14**. **Set clock** fixes a wrong time.
* **End period** at the buzzer, then **Start next period**. If the score is level after the fourth quarter the button becomes **Start overtime**.
* **Undo** always says exactly what it will undo (for example *Undo: Tigers +3*).
* **Correct score** sets both scores directly (a reason is required).
* **End match** shows the final score (you can still change it) and saves the result. The points table updates immediately.

Keyboard: **Z X C** = home +1 +2 +3, **B N M** = away +1 +2 +3, **Space** start/pause, **R** shot 24, **T** shot 14, **U** undo.

**If the internet drops** during scoring, keep tapping: a red bar says *Not saved: N action(s) pending*. When the connection is back press **Retry** — every tap is saved exactly once and in order.

**If the laptop closes while the clock runs**, the public clock keeps counting correctly and stops at 0:00.

---

## 5. When something goes wrong

| Situation | What to do |
| --- | --- |
| Wrong final score entered | *Admin → Live scoring*, find the match → **Correct result** (note required). Standings recalculate automatically. |
| Match finished by mistake | **Reopen match** (only if it was scored live). It becomes live again with all its state. |
| Wrong match started | In the console, **Abandon match**: the fixture goes back to *Postponed* and nothing counts. |
| Team did not turn up | **Forfeit** on the fixture: the other team wins 20–0 (configurable). |
| Rain / power cut before a game | **Postpone** the fixture, later **Reschedule** it. |
| "Session expired" box appears | Sign in again inside the box. Your screen (scores, bids) is kept; then retry the last action. |
| Points table looks wrong | *Admin → Standings → Rebuild standings*. It is always recomputed from the saved results. |
| Two teams level on everything | Set a **manual tiebreak rank** under *Admin → Standings*. |

---

## 6. Playoffs and the champion

*Admin → Playoffs*: choose the format (default: top 4, Semifinal 1 = 1st v 4th, Semifinal 2 = 2nd v 3rd, then the Final; options include an IPL-style page playoff, a direct final, top 6 or top 8, and a third-place match) and press **Generate bracket**. Before the league ends the public page shows a *provisional* list; the moment the last league match is completed the semifinal teams fill in automatically. Schedule the playoff fixtures in *Admin → Fixtures* and score them like any match. The winner moves to the final automatically, and when the final is completed the **champion banner** appears on the homepage and the Playoffs page.

---

## 7. After the event

* Download the auction history (CSV/Excel) from `/auction`, rosters (PDF) from each team page and the fixtures (CSV/PDF/calendar) from `/fixtures`.
* Take a final backup: `supabase db dump -f backup-final.sql`.
* **Starting a new tournament**: the simplest way is a fresh Supabase project (repeat the README setup). To reuse the same project, your technical contact can run `supabase db reset` against a *staging* copy, or execute `truncate table public.tournaments cascade;` followed by re-running `supabase/migrations/0002_defaults.sql` — this deletes everything, so take a backup first.

# 🚀 Escape Velocity — Financial Flight Simulator

> Your debt is a gravitational field. We calculate the optimal path out.

Built for the **Refinn × Physics Hackathon** (SCBX audience).

---

## What it does

Escape Velocity treats Thai household debt as an orbital mechanics problem. Enter your debts, income, and expenses — the app finds the mathematically optimal payoff order and shows you a month-by-month roadmap to zero debt.

- **Debt priority scoring** — ranks debts by true cost, not just balance. หนี้นอกระบบ gets a safety multiplier and is always paid first.
- **Rate interval support** — enter interest as % per day, week, month, or year. Live APR conversion so you always know the real cost.
- **Two modes** — Pure Optimizer (maximum efficiency) or Risk-Adjusted (with emergency fund buffer).
- **Stable investments** — bank savings, fixed deposits, index funds, SSF/RMF run alongside debt payoff from day one.
- **Refinancing alert** — if you have informal debt, the app shows exactly how much you save by switching to a formal bank loan.
- **Saves to your device** — profile and roadmap stored in your browser. No account needed.

---

## Using the app

Open the hosted page, enter your name, then fill in your debts and income on the Profile tab. Hit **Save & Calculate** — your escape trajectory appears on the Roadmap tab.

> **Note:** The optimizer runs on a private API. The app works when the API server is online. If you see an "API unreachable" error, the server may be temporarily offline.

---

## Tech

Plain HTML · CSS · JavaScript — no framework, no build step.  
Optimizer: Node.js + Express, hosted privately.  
Charts: [Chart.js](https://www.chartjs.org/)

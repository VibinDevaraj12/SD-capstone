# ReFluxGuard Efficiency Analyzer

A browser-only engineering dashboard for the **ReFluxGuard** student capstone, *An N-Channel MOSFET Rectifier with Reduced Body-Diode Reverse Current*. It calculates simplified DC input/output power, loss, efficiency, voltage drop, and reverse-current magnitude from user-entered measurements. It also compares saved ReFluxGuard measurements with a conventional MOSFET rectifier baseline.

The application has no backend, account, database, or build step. Saved records are stored in the browser's `localStorage`. Chart.js is loaded from jsDelivr and Google Fonts are optional remote presentation assets; data and calculations remain in the browser.

## Files

- `index.html` — dashboard layout and forms
- `style.css` — responsive navy/cyan engineering theme
- `script.js` — validation, calculations, CSV handling, local storage, charts, and table
- `dataset.csv` — simulated demonstration records for loading through the dashboard

## Calculations

For DC measurements:

- Input power: `Pin = Vin × Iin` (W)
- Output power: `Pout = Vout × Iout` (W)
- Power loss: `Ploss = Pin − Pout` (W)
- Efficiency: `η = (Pout / Pin) × 100` (%)
- Voltage drop: `ΔV = Vin − Vout` (V)
- Reverse current in amperes: `Irev(A) = Irev(mA) / 1000`

Efficiency is not clamped to 100%. Output power greater than input power is retained and flagged as a measurement/model inconsistency. The warning is not a diagnosis of a hardware fault. For AC input, measure **real power**; for highly rippled waveforms, average instantaneous power `v(t) × i(t)` where appropriate. Multiplying average voltage and current may not represent average real power.

Configuration comparisons report:

- Efficiency difference in percentage points
- Relative efficiency improvement over the conventional baseline
- Reverse-current reduction relative to the conventional baseline
- Power-loss reduction relative to the conventional baseline

If a comparison denominator is zero, the corresponding relative value is shown as “Not available.” A negative value is shown as-is; ReFluxGuard is not assumed to perform better. Comparisons are meaningful only with sufficiently comparable test conditions.

## Field names and units

| Field | Meaning | Unit / validation |
|---|---|---|
| Experiment ID | Unique record key | Required text |
| Date | Measurement date | Required date |
| Configuration | Tested rectifier | ReFluxGuard or Conventional MOSFET Rectifier |
| Input voltage/current | DC input measurement | V (positive), A (positive) |
| Output voltage/current | DC output measurement | V and A (non-negative) |
| Reverse current magnitude | Measured reverse-current magnitude | mA (required, non-negative) |
| Switching frequency | Switching condition, if measured | Hz (optional, non-negative) |
| Load resistance | Load condition, if measured | Ω (optional, positive) |
| Ambient temperature | Ambient test condition | °C (optional; may be negative) |
| Experiment notes | Setup, uncertainty, and observations | Optional text |

Blank optional fields remain blank. Invalid or non-finite numeric values are rejected rather than being substituted with zero.

## Open locally with VS Code Live Server

1. Open the `ReFluxGuard-Efficiency-Analyzer` folder in VS Code (`File` → `Open Folder…`).
2. Install the **Live Server** extension by Ritwick Dey from the VS Code Extensions view if it is not already installed.
3. Open `index.html`, then click **Go Live** in the VS Code status bar (or right-click the file and choose **Open with Live Server**).
4. The dashboard opens in your browser. The sample dataset is fetched from the same local Live Server origin. Do not open the HTML directly as a `file://` page if you want to load the CSV.

Chart.js and Google Fonts use public CDNs. If those services are blocked or unavailable, the dashboard data-entry and calculation code still runs, but charts or custom fonts may not load. The app displays an error if charts cannot initialize.

## Using the dashboard

- **Calculate Efficiency** validates the current form and presents the calculated result cards. This does not save a record.
- **Save Experiment** validates and stores the record locally. Submitting an existing Experiment ID asks before replacing it; use **Edit** in the record table to intentionally update an existing measurement.
- **Load Sample Dataset** imports the bundled CSV. Every supplied record is marked **SIMULATED DEMONSTRATION DATA**. Existing IDs are skipped to avoid overwriting user records.
- **Import CSV** validates a selected CSV file using the same column names as `dataset.csv`. If an imported ID already exists, you can confirm replacement or cancel the import.
- **Load Example Experiment** fills the form with a simulated example record for inspection; it does not save automatically.
- **Compare Configurations** uses the most recently saved record for each configuration. Confirm the test conditions are comparable before interpreting the result.
- Search the experiment table and click sortable column headers to filter or sort records. **Edit** loads a record back into the form; **Delete** removes that record after confirmation.
- **Export All CSV** exports all saved records. **Export Filtered CSV** exports the current search results. Notes and other text fields are escaped according to CSV quoting rules.
- **Clear All Data** permanently removes all saved records from this browser after a confirmation prompt.

Records persist in local storage for this browser profile and origin. They are not synchronized across browsers/devices and may be removed by clearing site data. Export important work regularly.

## Demonstration data and experimental integrity

`dataset.csv` contains realistic-looking, internally consistent **simulated demonstration measurements** across multiple load conditions and both configurations. These values are illustrative only; they do not come from physical testing, a publication, or a verified prototype. Never present them as experimental evidence or as proof of ReFluxGuard's real-world superiority. Replace them with documented, calibrated measurements before drawing or reporting engineering conclusions.

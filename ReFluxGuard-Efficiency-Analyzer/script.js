(function () {
  "use strict";

  const STORAGE_KEY = "refluxguard-efficiency-analyzer-records-v1";
  const CONFIGS = ["ReFluxGuard", "Conventional MOSFET Rectifier"];
  const COLORS = { reflux: "#42d5df", baseline: "#ffad6e" };
  const $ = (selector) => document.querySelector(selector);
  const form = $("#experiment-form");
  const formError = $("#form-error");
  const notice = $("#notice");
  let records = [];
  let sortKey = "date";
  let sortDirection = "desc";
  let noticeTimer;
  const charts = {};

  function showNotice(message, type) {
    notice.textContent = message;
    notice.className = `notice ${type}`;
    notice.hidden = false;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 5500);
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function clearFormError() {
    formError.textContent = "";
    formError.hidden = true;
  }

  function readStoredRecords() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error("Stored record list is not an array.");
      return parsed.filter((record) => isValidStoredRecord(record));
    } catch (error) {
      console.error("Could not read saved experiment records:", error);
      showNotice("Saved browser data could not be read. The record list is starting empty; export or inspect the browser data if you need to recover it.", "error");
      return [];
    }
  }

  function isValidStoredRecord(record) {
    return record && typeof record.experiment_id === "string" &&
      CONFIGS.includes(record.configuration) &&
      Number.isFinite(record.vin_v) && record.vin_v > 0 &&
      Number.isFinite(record.iin_a) && record.iin_a > 0 &&
      Number.isFinite(record.vout_v) && record.vout_v >= 0 &&
      Number.isFinite(record.iout_a) && record.iout_a >= 0 &&
      Number.isFinite(record.reverse_current_ma) && record.reverse_current_ma >= 0 &&
      typeof record.date === "string";
  }

  function persistRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch (error) {
      console.error("Could not save experiment records:", error);
      showNotice("Could not save records to local storage. Check browser storage availability and try exporting your data.", "error");
      return false;
    }
  }

  function numberFromInput(id, label, options) {
    const input = document.getElementById(id);
    const raw = input.value.trim();
    if (!raw) {
      if (options.optional) return null;
      throw new Error(`${label} is required.`);
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${label} must be a valid finite number.`);
    if (options.positive && value <= 0) throw new Error(`${label} must be greater than zero.`);
    if (options.nonNegative && value < 0) throw new Error(`${label} cannot be negative.`);
    return value;
  }

  function calculate(record) {
    const pin = record.vin_v * record.iin_a;
    const pout = record.vout_v * record.iout_a;
    const loss = pin - pout;
    const efficiency = (pout / pin) * 100;
    const voltageDrop = record.vin_v - record.vout_v;
    const reverseCurrentA = record.reverse_current_ma / 1000;
    if (![pin, pout, loss, efficiency, voltageDrop, reverseCurrentA].every(Number.isFinite)) {
      throw new Error("The measurement values exceed the supported numeric range. Check the entries.");
    }
    return { pin, pout, loss, efficiency, voltageDrop, reverseCurrentA };
  }

  function readForm() {
    const id = $("#experiment-id").value.trim();
    if (!id) throw new Error("Experiment ID is required.");
    const date = $("#date").value;
    if (!date) throw new Error("Date is required.");
    const configuration = $("#configuration").value;
    if (!CONFIGS.includes(configuration)) throw new Error("Choose a valid rectifier configuration.");
    const record = {
      experiment_id: id,
      date,
      configuration,
      vin_v: numberFromInput("vin", "Input voltage", { positive: true }),
      iin_a: numberFromInput("iin", "Input current", { positive: true }),
      vout_v: numberFromInput("vout", "Output voltage", { nonNegative: true }),
      iout_a: numberFromInput("iout", "Output current", { nonNegative: true }),
      reverse_current_ma: numberFromInput("reverse-current", "Reverse current magnitude", { nonNegative: true }),
      switching_frequency_hz: numberFromInput("frequency", "Switching frequency", { optional: true, nonNegative: true }),
      load_resistance_ohm: numberFromInput("load-resistance", "Load resistance", { optional: true, positive: true }),
      ambient_temperature_c: numberFromInput("temperature", "Ambient temperature", { optional: true }),
      notes: $("#notes").value.trim(),
      data_type: "USER MEASURED",
      updated_at: new Date().toISOString()
    };
    const results = calculate(record);
    return { ...record, ...results };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "Not available";
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
  }

  function displayResults(record, label) {
    const result = calculate(record);
    $("#result-pin").innerHTML = `${formatNumber(result.pin, 4)} <small>W</small>`;
    $("#result-pout").innerHTML = `${formatNumber(result.pout, 4)} <small>W</small>`;
    $("#result-efficiency").innerHTML = `${formatNumber(result.efficiency, 3)} <small>%</small>`;
    $("#result-loss").innerHTML = `${formatNumber(result.loss, 4)} <small>W</small>`;
    $("#result-drop").innerHTML = `${formatNumber(result.voltageDrop, 4)} <small>V</small>`;
    $("#result-reverse").innerHTML = `${formatNumber(record.reverse_current_ma, 4)} <small>mA</small>`;
    $("#result-reverse-amps").textContent = `${formatNumber(result.reverseCurrentA, 7)} A`;
    $("#result-context").textContent = label;
    const gaugeWidth = Math.min(100, Math.max(0, result.efficiency));
    $("#efficiency-gauge").style.width = `${gaugeWidth}%`;
    const warning = $("#result-warning");
    const toleranceW = Math.max(0.01, result.pin * 0.005);
    if (result.pout > result.pin + toleranceW || result.efficiency > 100.5) {
      warning.innerHTML = "<strong>Measurement/model check:</strong> calculated output power exceeds input power beyond the small numerical tolerance. Verify probe placement, units, averaging method, and test conditions. This inconsistency alone does not establish a hardware fault.";
      warning.hidden = false;
    } else if (result.efficiency < 0 || result.efficiency > 100) {
      warning.textContent = "Efficiency is outside the physically expected 0–100% range for a passive rectifier. Investigate measurement or model consistency; this is not, by itself, a verified hardware fault.";
      warning.hidden = false;
    } else {
      warning.hidden = true;
      warning.textContent = "";
    }
    $("#results-section").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function getFormRecord() {
    clearFormError();
    try {
      const record = readForm();
      displayResults(record, `Current form · ${record.experiment_id}`);
      return record;
    } catch (error) {
      showFormError(error.message);
      $("#result-warning").hidden = true;
      return null;
    }
  }

  function toRecordFromCsv(row, rowNumber) {
    const value = (key) => (row[key] ?? "").trim();
    const numeric = (key, label, optional, rule) => {
      const raw = value(key);
      if (raw === "" && optional) return null;
      if (raw === "") throw new Error(`CSV row ${rowNumber}: ${label} is required.`);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) throw new Error(`CSV row ${rowNumber}: ${label} must be a finite number.`);
      if (rule === "positive" && parsed <= 0) throw new Error(`CSV row ${rowNumber}: ${label} must be greater than zero.`);
      if (rule === "nonnegative" && parsed < 0) throw new Error(`CSV row ${rowNumber}: ${label} cannot be negative.`);
      return parsed;
    };
    const id = value("experiment_id");
    const date = value("date");
    const configuration = value("configuration");
    if (!id || !date || !CONFIGS.includes(configuration)) throw new Error(`CSV row ${rowNumber}: experiment ID, date, and a supported configuration are required.`);
    const record = {
      experiment_id: id,
      date,
      configuration,
      vin_v: numeric("vin_v", "input voltage", false, "positive"),
      iin_a: numeric("iin_a", "input current", false, "positive"),
      vout_v: numeric("vout_v", "output voltage", false, "nonnegative"),
      iout_a: numeric("iout_a", "output current", false, "nonnegative"),
      reverse_current_ma: numeric("reverse_current_ma", "reverse current", false, "nonnegative"),
      switching_frequency_hz: numeric("switching_frequency_hz", "switching frequency", true, "nonnegative"),
      load_resistance_ohm: numeric("load_resistance_ohm", "load resistance", true, "positive"),
      ambient_temperature_c: numeric("ambient_temperature_c", "ambient temperature", true, null),
      notes: value("notes"),
      data_type: value("data_type") || "USER MEASURED",
      updated_at: new Date().toISOString()
    };
    return { ...record, ...calculate(record) };
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 1; }
          else quoted = false;
        } else cell += char;
      } else if (char === '"' && cell.length === 0) {
        quoted = true;
      } else if (char === ",") {
        row.push(cell); cell = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        row.push(cell); cell = "";
        if (row.some((entry) => entry !== "")) rows.push(row);
        row = [];
      } else {
        cell += char;
      }
    }
    if (quoted) throw new Error("CSV contains an unterminated quoted field.");
    row.push(cell);
    if (row.some((entry) => entry !== "")) rows.push(row);
    if (rows.length < 2) throw new Error("CSV has no data rows.");
    const headers = rows[0].map((header, index) => index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim());
    if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate column names.");
    return rows.slice(1).map((cells, index) => {
      if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${cells.length} columns; expected ${headers.length}.`);
      return Object.fromEntries(headers.map((header, column) => [header, cells[column]]));
    });
  }

  function csvEscape(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  const CSV_COLUMNS = [
    ["experiment_id", "experiment_id"], ["date", "date"], ["configuration", "configuration"],
    ["vin_v", "vin_v"], ["iin_a", "iin_a"], ["vout_v", "vout_v"], ["iout_a", "iout_a"],
    ["reverse_current_ma", "reverse_current_ma"], ["switching_frequency_hz", "switching_frequency_hz"],
    ["load_resistance_ohm", "load_resistance_ohm"], ["ambient_temperature_c", "ambient_temperature_c"],
    ["notes", "notes"], ["data_type", "data_type"]
  ];

  function downloadCsv(selectedRecords, filename) {
    const header = CSV_COLUMNS.map((column) => column[0]).join(",");
    const lines = selectedRecords.map((record) => CSV_COLUMNS.map((column) => csvEscape(record[column[1]])).join(","));
    const blob = new Blob(["\uFEFF", header, "\r\n", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function isSimulated(record) {
    return /simulated demonstration data/i.test(`${record.data_type || ""} ${record.notes || ""}`);
  }

  function filteredRecords() {
    const query = $("#table-search").value.trim().toLowerCase();
    const filtered = records.filter((record) => !query || [
      record.experiment_id, record.date, record.configuration, record.notes, record.data_type
    ].some((value) => String(value ?? "").toLowerCase().includes(query)));
    return filtered.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const comparison = typeof av === "number" && typeof bv === "number"
        ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true, sensitivity: "base" });
      return comparison * sortDirection;
    });
  }

  function sortValue(record, key) {
    if (["pin", "pout", "loss", "efficiency"].includes(key)) return calculate(record)[key];
    return record[key];
  }

  function renderTable() {
    const visible = filteredRecords();
    const body = $("#records-body");
    body.replaceChildren();
    visible.forEach((record) => {
      const result = calculate(record);
      const tr = document.createElement("tr");
      const cells = [
        record.experiment_id,
        record.date,
        record.configuration,
        `${formatNumber(result.pin, 4)} W`,
        `${formatNumber(result.pout, 4)} W`,
        `${formatNumber(result.efficiency, 3)}%`,
        `${formatNumber(result.loss, 4)} W`,
        `${formatNumber(record.reverse_current_ma, 4)} mA`,
        record.load_resistance_ohm == null ? "—" : `${formatNumber(record.load_resistance_ohm, 3)} Ω`,
        record.notes || "—"
      ];
      cells.forEach((text, index) => {
        const td = document.createElement("td");
        if (index === 2) {
          const tag = document.createElement("span");
          tag.className = `config-tag${record.configuration === CONFIGS[1] ? " conventional" : ""}`;
          tag.textContent = record.configuration === CONFIGS[0] ? "ReFluxGuard" : "Conventional";
          td.append(tag);
          if (isSimulated(record)) {
            const simulated = document.createElement("span");
            simulated.className = "simulated-tag";
            simulated.textContent = "SIMULATED";
            td.append(simulated);
          }
        } else {
          td.textContent = String(text);
          if (index === 9) td.title = String(text);
        }
        tr.append(td);
      });
      const actions = document.createElement("td");
      actions.className = "row-actions";
      const edit = document.createElement("button");
      edit.type = "button"; edit.className = "row-action"; edit.textContent = "Edit";
      edit.setAttribute("aria-label", `Edit ${record.experiment_id}`);
      edit.addEventListener("click", () => loadRecordIntoForm(record));
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "row-action delete"; remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete ${record.experiment_id}`);
      remove.addEventListener("click", () => deleteRecord(record.experiment_id));
      actions.append(edit, remove);
      tr.append(actions);
      body.append(tr);
    });
    $("#record-count").textContent = String(records.length);
    $("#filtered-count").textContent = `${visible.length} record${visible.length === 1 ? "" : "s"}`;
    $("#table-empty").hidden = visible.length > 0;
  }

  function chartBaseOptions(yTitle, extra = {}) {
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#9bb0c6", usePointStyle: true, pointStyle: "circle", boxWidth: 7, font: { size: 10 } } },
        tooltip: { backgroundColor: "#071426", titleColor: "#e7f0fb", bodyColor: "#b9cadb", borderColor: "#28435f", borderWidth: 1 }
      },
      scales: {
        x: { ticks: { color: "#8298b0", font: { size: 9 }, maxRotation: 45, autoSkip: true }, grid: { color: "rgba(91,119,151,.13)" } },
        y: { beginAtZero: true, title: { display: true, text: yTitle, color: "#8298b0", font: { size: 9 } }, ticks: { color: "#8298b0", font: { size: 9 } }, grid: { color: "rgba(91,119,151,.15)" } }
      },
      ...extra
    };
  }

  function updateChart(id, config, shouldShow) {
    const canvas = document.getElementById(id);
    const empty = canvas.parentElement.querySelector(".chart-empty");
    canvas.hidden = !shouldShow;
    empty.hidden = shouldShow;
    if (!window.Chart) {
      empty.hidden = false;
      empty.textContent = "Chart.js could not load. Check the internet connection or CDN access.";
      return;
    }
    if (!shouldShow) {
      if (charts[id]) { charts[id].destroy(); delete charts[id]; }
      return;
    }
    if (charts[id]) {
      charts[id].data = config.data;
      charts[id].options = config.options;
      charts[id].update();
    } else {
      charts[id] = new Chart(canvas, config);
    }
  }

  function updateCharts() {
    const hasRecords = records.length > 0;
    const labels = records.map((record) => record.experiment_id);
    const configs = (key) => CONFIGS.map((configuration) => {
      const color = configuration === CONFIGS[0] ? COLORS.reflux : COLORS.baseline;
      return {
        label: configuration,
        data: records.map((record) => record.configuration === configuration ? key(record) : null),
        backgroundColor: color, borderColor: color, borderWidth: 2, borderRadius: 4, spanGaps: false
      };
    });
    updateChart("efficiency-chart", {
      type: "bar",
      data: { labels, datasets: configs((record) => calculate(record).efficiency) },
      options: chartBaseOptions("Efficiency (%)", { plugins: { legend: { labels: { color: "#9bb0c6", usePointStyle: true, pointStyle: "circle", boxWidth: 7, font: { size: 9 } } }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatNumber(context.parsed.y, 3)}%` } } })
    }, hasRecords);

    const powerDatasets = [];
    CONFIGS.forEach((configuration) => {
      const color = configuration === CONFIGS[0] ? COLORS.reflux : COLORS.baseline;
      const selected = records.filter((record) => record.configuration === configuration);
      powerDatasets.push({ label: `${configuration} · Pin`, data: selected.map((record) => ({ x: record.experiment_id, y: calculate(record).pin })), backgroundColor: color, borderColor: color, borderWidth: 1, borderRadius: 3 });
      powerDatasets.push({ label: `${configuration} · Pout`, data: selected.map((record) => ({ x: record.experiment_id, y: calculate(record).pout })), backgroundColor: color, borderColor: color, borderWidth: 1, borderRadius: 3, borderSkipped: false });
    });
    updateChart("power-chart", { type: "bar", data: { labels, datasets: powerDatasets }, options: chartBaseOptions("Power (W)", { plugins: { legend: { labels: { color: "#9bb0c6", usePointStyle: true, boxWidth: 7, font: { size: 8 } } }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatNumber(context.parsed.y, 4)} W` } } }) }, hasRecords);

    updateChart("loss-chart", {
      type: "bar", data: { labels, datasets: configs((record) => calculate(record).loss) },
      options: chartBaseOptions("Power loss (W)", { plugins: { legend: { labels: { color: "#9bb0c6", usePointStyle: true, pointStyle: "circle", boxWidth: 7, font: { size: 9 } } }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatNumber(context.parsed.y, 4)} W` } } })
    }, hasRecords);
    updateChart("reverse-chart", {
      type: "bar", data: { labels, datasets: configs((record) => record.reverse_current_ma) },
      options: chartBaseOptions("Reverse current (mA)", { plugins: { legend: { labels: { color: "#9bb0c6", usePointStyle: true, pointStyle: "circle", boxWidth: 7, font: { size: 9 } } }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatNumber(context.parsed.y, 4)} mA` } } })
    }, hasRecords);

    const loadSeries = CONFIGS.map((configuration) => {
      const color = configuration === CONFIGS[0] ? COLORS.reflux : COLORS.baseline;
      return {
        label: configuration,
        data: records.filter((record) => record.configuration === configuration && Number.isFinite(record.load_resistance_ohm))
          .map((record) => ({ x: record.load_resistance_ohm, y: calculate(record).efficiency, experimentId: record.experiment_id }))
          .sort((a, b) => a.x - b.x),
        borderColor: color, backgroundColor: color, pointRadius: 4, showLine: true, tension: 0.25
      };
    });
    const loadPointCount = loadSeries.reduce((sum, series) => sum + series.data.length, 0);
    updateChart("load-chart", {
      type: "scatter", data: { datasets: loadSeries },
      options: {
        ...chartBaseOptions("Efficiency (%)"),
        scales: {
          x: { type: "linear", title: { display: true, text: "Load resistance (Ω)", color: "#8298b0", font: { size: 9 } }, ticks: { color: "#8298b0", font: { size: 9 } }, grid: { color: "rgba(91,119,151,.13)" } },
          y: { beginAtZero: true, title: { display: true, text: "Efficiency (%)", color: "#8298b0", font: { size: 9 } }, ticks: { color: "#8298b0", font: { size: 9 } }, grid: { color: "rgba(91,119,151,.15)" } }
        },
        plugins: { ...chartBaseOptions("").plugins, tooltip: { callbacks: { label: (context) => `${context.dataset.label} · ${context.raw.experimentId}: ${formatNumber(context.parsed.x, 3)} Ω, ${formatNumber(context.parsed.y, 3)}%` } } }
      }
    }, loadPointCount >= 2);
  }

  function renderAll() {
    renderTable();
    updateCharts();
    updateComparison();
  }

  function percentReduction(baseline, reflux) {
    if (baseline === 0) return null;
    return ((baseline - reflux) / baseline) * 100;
  }

  function latestRecord(configuration) {
    return records.filter((record) => record.configuration === configuration)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0] || null;
  }

  function metricText(value, suffix = "%", digits = 2) {
    return value === null || !Number.isFinite(value) ? "Not available" : `${formatNumber(value, digits)}${suffix}`;
  }

  function updateComparison() {
    const reflux = latestRecord(CONFIGS[0]);
    const baseline = latestRecord(CONFIGS[1]);
    const empty = $("#comparison-empty");
    const content = $("#comparison-content");
    if (!reflux || !baseline) {
      empty.hidden = false;
      content.hidden = true;
      return;
    }
    empty.hidden = true;
    content.hidden = false;
    const rg = calculate(reflux);
    const base = calculate(baseline);
    const delta = rg.efficiency - base.efficiency;
    const relative = base.efficiency === 0 ? null : (delta / base.efficiency) * 100;
    const reverse = percentReduction(baseline.reverse_current_ma, reflux.reverse_current_ma);
    const loss = percentReduction(base.loss, rg.loss);
    $("#comparison-rg-id").textContent = `${reflux.experiment_id} · ${reflux.date}`;
    $("#comparison-base-id").textContent = `${baseline.experiment_id} · ${baseline.date}`;
    const values = [
      ["delta-efficiency", metricText(delta, " pp", 3)],
      ["relative-efficiency", metricText(relative)],
      ["reverse-reduction", metricText(reverse)],
      ["loss-reduction", metricText(loss)]
    ];
    values.forEach(([id, value]) => {
      const element = document.getElementById(id);
      element.textContent = value;
      element.classList.toggle("negative", value !== "Not available" && Number.parseFloat(value) < 0);
    });
  }

  function loadRecordIntoForm(record) {
    $("#experiment-id").value = record.experiment_id;
    $("#date").value = record.date;
    $("#configuration").value = record.configuration;
    $("#vin").value = record.vin_v;
    $("#iin").value = record.iin_a;
    $("#vout").value = record.vout_v;
    $("#iout").value = record.iout_a;
    $("#reverse-current").value = record.reverse_current_ma;
    $("#frequency").value = record.switching_frequency_hz ?? "";
    $("#load-resistance").value = record.load_resistance_ohm ?? "";
    $("#temperature").value = record.ambient_temperature_c ?? "";
    $("#notes").value = record.notes || "";
    clearFormError();
    displayResults(record, `Editing · ${record.experiment_id}`);
    $("#experiment-form").scrollIntoView({ behavior: "smooth", block: "start" });
    showNotice(`Loaded ${record.experiment_id} into the form. Save to apply any edits.`, "info");
  }

  function deleteRecord(id) {
    if (!window.confirm(`Delete experiment "${id}"? This cannot be undone.`)) return;
    records = records.filter((record) => record.experiment_id !== id);
    if (persistRecords()) {
      renderAll();
      showNotice(`Deleted ${id}.`, "success");
    }
  }

  function saveRecord(record) {
    const index = records.findIndex((existing) => existing.experiment_id.toLowerCase() === record.experiment_id.toLowerCase());
    if (index >= 0 && !window.confirm(`An experiment with ID "${records[index].experiment_id}" already exists. Replace it with these values?`)) {
      showNotice("Save cancelled; the existing record was not changed.", "info");
      return;
    }
    if (index >= 0) {
      record.data_type = records[index].data_type;
      records[index] = record;
    } else records.push(record);
    if (persistRecords()) {
      renderAll();
      displayResults(record, `Saved · ${record.experiment_id}`);
      showNotice(index >= 0 ? `Replaced record ${record.experiment_id}.` : `Saved experiment ${record.experiment_id}.`, "success");
    }
  }

  function fillExample() {
    const sample = {
      experiment_id: "DEMO-EXAMPLE-12V",
      date: new Date().toISOString().slice(0, 10),
      configuration: CONFIGS[0],
      vin_v: 12, iin_a: 0.5, vout_v: 11, iout_a: 0.45,
      reverse_current_ma: 7.5, switching_frequency_hz: 100000,
      load_resistance_ohm: 24.4, ambient_temperature_c: 25,
      notes: "SIMULATED DEMONSTRATION DATA; illustrative example only, not a physical measurement.",
      data_type: "SIMULATED DEMONSTRATION DATA"
    };
    $("#experiment-id").value = sample.experiment_id;
    $("#date").value = sample.date;
    $("#configuration").value = sample.configuration;
    $("#vin").value = sample.vin_v;
    $("#iin").value = sample.iin_a;
    $("#vout").value = sample.vout_v;
    $("#iout").value = sample.iout_a;
    $("#reverse-current").value = sample.reverse_current_ma;
    $("#frequency").value = sample.switching_frequency_hz;
    $("#load-resistance").value = sample.load_resistance_ohm;
    $("#temperature").value = sample.ambient_temperature_c;
    $("#notes").value = sample.notes;
    clearFormError();
    displayResults(sample, "Simulated example · not a real measurement");
    showNotice("Filled the form with simulated demonstration values. This example has not been saved.", "info");
  }

  async function loadSampleDataset() {
    const button = $("#load-sample-button");
    button.disabled = true;
    try {
      const response = await fetch("dataset.csv", { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load dataset.csv (HTTP ${response.status}).`);
      const text = await response.text();
      const parsed = parseCsv(text);
      const imported = parsed.map((row, index) => toRecordFromCsv(row, index + 2));
      if (imported.some((record) => !isSimulated(record))) {
        throw new Error("Bundled sample CSV contains a record not explicitly marked as simulated demonstration data.");
      }
      const existing = new Set(records.map((record) => record.experiment_id.toLowerCase()));
      const additions = imported.filter((record) => !existing.has(record.experiment_id.toLowerCase()));
      if (!additions.length) {
        showNotice("The sample dataset is valid, but all its experiment IDs are already in your records.", "info");
        return;
      }
      records = records.concat(additions);
      if (persistRecords()) {
        renderAll();
        showNotice(`Loaded ${additions.length} simulated demonstration records. They are not real experimental results.`, "success");
      }
    } catch (error) {
      console.error("Sample dataset import failed:", error);
      showNotice(`${error.message} Open this project with Live Server and confirm dataset.csv is beside index.html.`, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function importCsvFile(file) {
    try {
      const parsed = parseCsv(await file.text());
      const imported = parsed.map((row, index) => toRecordFromCsv(row, index + 2));
      const ids = new Set();
      imported.forEach((record) => {
        const id = record.experiment_id.toLowerCase();
        if (ids.has(id)) throw new Error(`CSV contains duplicate experiment ID "${record.experiment_id}".`);
        ids.add(id);
      });
      const existing = new Set(records.map((record) => record.experiment_id.toLowerCase()));
      const duplicates = imported.filter((record) => existing.has(record.experiment_id.toLowerCase()));
      if (duplicates.length && !window.confirm(`${duplicates.length} imported ID(s) already exist. Replace matching records?`)) {
        showNotice("CSV import cancelled; no records were changed.", "info");
        return;
      }
      const importMap = new Map(imported.map((record) => [record.experiment_id.toLowerCase(), record]));
      records = records.filter((record) => !importMap.has(record.experiment_id.toLowerCase())).concat(imported);
      if (persistRecords()) {
        renderAll();
        showNotice(`Imported ${imported.length} validated CSV record(s).`, "success");
      }
    } catch (error) {
      console.error("CSV import failed:", error);
      showNotice(`CSV import failed: ${error.message}`, "error");
    } finally {
      $("#dataset-file").value = "";
    }
  }

  function compareConfigurations() {
    updateComparison();
    if (!latestRecord(CONFIGS[0]) || !latestRecord(CONFIGS[1])) {
      showNotice("Save at least one record for each configuration before comparing them.", "error");
      return;
    }
    $("#comparison-heading").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function initialize() {
    $("#date").value = new Date().toISOString().slice(0, 10);
    records = readStoredRecords();
    renderAll();

    $("#calculate-button").addEventListener("click", () => {
      if (getFormRecord()) showNotice("Calculated results from the current form. Save the experiment separately to keep a record.", "success");
    });
    $("#save-button").addEventListener("click", () => {
      const record = getFormRecord();
      if (record) saveRecord(record);
    });
    $("#reset-button").addEventListener("click", () => {
      window.setTimeout(() => {
        $("#date").value = new Date().toISOString().slice(0, 10);
        clearFormError();
        $("#result-warning").hidden = true;
      }, 0);
    });
    $("#compare-button").addEventListener("click", compareConfigurations);
    $("#load-sample-button").addEventListener("click", loadSampleDataset);
    $("#load-example-button").addEventListener("click", fillExample);
    $("#import-csv-button").addEventListener("click", () => $("#dataset-file").click());
    $("#table-search").addEventListener("input", renderTable);
    $("#records-table thead").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-sort]");
      if (!button) return;
      const key = button.dataset.sort;
      if (sortKey === key) sortDirection *= -1;
      else { sortKey = key; sortDirection = 1; }
      renderTable();
    });
    $("#export-button").addEventListener("click", () => {
      if (!records.length) { showNotice("There are no records to export.", "info"); return; }
      downloadCsv(records, "refluxguard-all-records.csv");
      showNotice(`Exported ${records.length} record(s) to CSV.`, "success");
    });
    $("#export-filtered-button").addEventListener("click", () => {
      const selected = filteredRecords();
      if (!selected.length) { showNotice("There are no filtered records to export.", "info"); return; }
      downloadCsv(selected, "refluxguard-filtered-records.csv");
      showNotice(`Exported ${selected.length} filtered record(s) to CSV.`, "success");
    });
    $("#clear-button").addEventListener("click", () => {
      if (!records.length) { showNotice("There are no saved records to clear.", "info"); return; }
      if (!window.confirm(`Clear all ${records.length} saved records from this browser? This cannot be undone.`)) return;
      const previous = records;
      records = [];
      if (persistRecords()) {
        renderAll();
        showNotice("All local experiment records were cleared.", "success");
      } else records = previous;
    });
    $("#dataset-file").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) importCsvFile(file);
    });
    $("#experiment-form").addEventListener("submit", (event) => event.preventDefault());
  }

  document.addEventListener("DOMContentLoaded", initialize);
}());

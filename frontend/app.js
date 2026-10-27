
const state = {
  caseId: "night-shift",
  events: [],
  report: null,
  detections: [],
  selectedFinding: null,
  selectedEvent: null,
};

const $ = (id) => document.getElementById(id);

async function boot() {
  try {
    const healthResponse = await fetch("/api/health");
    const health = await healthResponse.json();

    $("llm-status").textContent = health.llm
      ? `model · ${health.llm.name}`
      : "model · rules-only (no key needed)";

    const response = await fetch(`/api/cases/${state.caseId}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error("Could not load the investigation case.");
    }

    $("case-title").textContent = payload.case.title;
    $("case-question").textContent = payload.case.question;

    state.events = payload.events;

    renderCounts(payload.source_counts);
    renderTimeline();
  } catch (error) {
    console.error("WhyTrace startup failed:", error);
    $("case-title").textContent = "Could not load case";
    $("case-question").textContent = error.message;
  }
}

async function loadZetarisStatus() {
  const status = $("zetaris-status");
  const tables = $("zetaris-tables");

  if (!status || !tables) {
    console.error("Zetaris HTML elements are missing.");
    return;
  }

  status.textContent = "Checking Zetaris API...";
  tables.innerHTML = "";

  try {
    const response = await fetch("/api/zetaris/tables");

    if (!response.ok) {
      status.textContent = `API error: ${response.status}`;
      return;
    }

    const data = await response.json();

    if (!data.connected) {
      status.textContent =
        "Not connected: " + (data.error || "Unknown error");
      return;
    }

    status.textContent =
      `Connected to ${data.database} · ${data.table_count} tables available`;

    tables.innerHTML = data.tables
      .map((name) => `<li>${escapeHtml(name)}</li>`)
      .join("");
  } catch (error) {
    status.textContent = "Request failed: " + error.message;
    console.error("Zetaris request failed:", error);
  }
}

function renderCounts(counts) {
  $("source-counts").innerHTML = Object.entries(counts)
    .map(
      ([key, value]) =>
        `<div><dt>${escapeHtml(key)}</dt><dd>${value}</dd></div>`
    )
    .join("");
}

function renderTimeline(cited = new Set()) {
  const hitIds = new Set(
    state.detections.flatMap((detection) => detection.event_ids || [])
  );

  $("timeline").innerHTML = state.events
    .filter((event) => event.source !== "identity")
    .map((event) => {
      const classes = [
        "evt",
        hitIds.has(event.id) ? "hit" : "",
        cited.has(event.id) ? "cited" : "",
        state.selectedEvent === event.id ? "active" : "",
      ].join(" ");

      const summary =
        event.command_line ||
        event.object ||
        event.src_ip ||
        event.action ||
        "Event";

      return `
        <div class="${classes}" data-id="${escapeHtml(event.id)}">
          <span class="ts">${escapeHtml(
            event.ts.replace("T", " ").replace("Z", "")
          )}</span>
          <span class="src">${escapeHtml(event.source)}</span>
          <span>${escapeHtml(summary)}</span>
        </div>
      `;
    })
    .join("");

  $("timeline").querySelectorAll(".evt").forEach((element) => {
    element.addEventListener("click", () => {
      selectEvent(element.dataset.id);
    });
  });
}

function selectEvent(id) {
  state.selectedEvent = id;

  const event = state.events.find((item) => item.id === id);

  if (!event) return;

  const related = (state.report?.findings || []).filter((finding) =>
    (finding.evidence || []).some((evidence) => evidence.event_id === id)
  );

  $("detail").classList.remove("empty");

  $("detail").innerHTML = `
    <p class="mitre">${escapeHtml(event.id)} ·
      ${escapeHtml(event.source)} · ${escapeHtml(event.action)}</p>
    <p>${escapeHtml(
      event.command_line || event.object || event.action
    )}</p>
    <p>${[
      event.user,
      event.host,
      event.src_ip,
      event.dst_ip,
    ]
      .filter(Boolean)
      .map(escapeHtml)
      .join(" · ")}</p>
    ${
      related.length
        ? `<p><strong>Why this may be suspicious</strong></p>
           ${related
             .map(
               (finding) => `<p>${escapeHtml(finding.why)}</p>`
             )
             .join("")}`
        : `<p class="mitre">No finding currently cites this event.
           It may be baseline activity.</p>`
    }
  `;

  const finding = state.report?.findings.find(
    (item) => item.id === state.selectedFinding
  );

  const cited = new Set(
    (finding?.evidence || []).map((item) => item.event_id)
  );

  renderTimeline(cited);
}

function selectFinding(id) {
  if (!state.report) return;

  state.selectedFinding = id;

  const finding = state.report.findings.find((item) => item.id === id);

  if (!finding) return;

  $("detail").classList.remove("empty");

  $("detail").innerHTML = `
    <p class="sev ${escapeHtml(finding.severity)}">
      ${escapeHtml(finding.severity)}
    </p>
    <h3>${escapeHtml(finding.title)}</h3>
    <p><strong>Hypothesis.</strong>
      ${escapeHtml(finding.hypothesis)}</p>
    <p><strong>Why.</strong> ${escapeHtml(finding.why)}</p>
    <p class="mitre">
      ${(finding.mitre || []).map(escapeHtml).join(" · ")}
    </p>
    <div class="chips">
      ${(finding.evidence || [])
        .map(
          (evidence) => `
            <button type="button"
              data-eid="${escapeHtml(evidence.event_id)}"
              title="${escapeHtml(evidence.note)}">
              ${escapeHtml(evidence.event_id)}
            </button>
          `
        )
        .join("")}
    </div>
    <p><strong>Next.</strong>
      ${(finding.next_steps || []).map(escapeHtml).join(" ")}</p>
  `;

  $("detail").querySelectorAll("button[data-eid]").forEach((button) => {
    button.addEventListener("click", () => {
      selectEvent(button.dataset.eid);

      const row = document.querySelector(
        `.evt[data-id="${CSS.escape(button.dataset.eid)}"]`
      );

      row?.scrollIntoView({ block: "center" });
    });
  });

  document.querySelectorAll(".findings li").forEach((element) => {
    element.classList.toggle("active", element.dataset.id === id);
  });

  renderTimeline(
    new Set((finding.evidence || []).map((item) => item.event_id))
  );
}

function renderReport(report) {
  state.report = report;

  if (!document.querySelector(".verdict")) {
    const verdict = document.createElement("div");
    verdict.className = "verdict";
    verdict.id = "verdict";
    $("stage").after(verdict);
  }

  $("verdict").innerHTML = `
    <strong>${escapeHtml(report.confidence)} confidence.</strong>
    ${escapeHtml(report.verdict)}
    <p>${escapeHtml(report.executive_summary)}</p>
  `;

  $("findings").innerHTML = (report.findings || [])
    .map(
      (finding) => `
        <li data-id="${escapeHtml(finding.id)}">
          <span class="sev ${escapeHtml(finding.severity)}">
            ${escapeHtml(finding.severity)}
          </span>
          <h3>${escapeHtml(finding.title)}</h3>
          <p>${(finding.evidence || []).length} cited events</p>
        </li>
      `
    )
    .join("");

  $("findings").querySelectorAll("li").forEach((element) => {
    element.addEventListener("click", () => {
      selectFinding(element.dataset.id);
    });
  });

  $("narrative").innerHTML = (report.narrative || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  $("unanswered").innerHTML = (report.unanswered || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  if (report.findings?.[0]) {
    selectFinding(report.findings[0].id);
  }
}

async function runInvestigation() {
  const button = $("run");

  button.disabled = true;
  $("stage").hidden = false;
  $("stage").textContent = "Starting investigation...";

  try {
    const response = await fetch(
      `/api/cases/${state.caseId}/investigate`,
      { method: "POST" }
    );

    if (!response.ok) {
      throw new Error(`Investigation failed: HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error("The server did not return an investigation stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;

        const chunk = JSON.parse(line);

        $("stage").textContent =
          `${chunk.stage} · ${chunk.message}`;

        if (chunk.detections) {
          state.detections = chunk.detections;
        }

        if (chunk.stage === "detect") {
          renderTimeline();
        }

        if (chunk.report) {
          renderReport(chunk.report);
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      const chunk = JSON.parse(buffer);
      $("stage").textContent = `${chunk.stage} · ${chunk.message}`;

      if (chunk.detections) state.detections = chunk.detections;
      if (chunk.report) renderReport(chunk.report);
    }
  } catch (error) {
    console.error("Investigation failed:", error);
    $("stage").textContent = "Error: " + error.message;
  } finally {
    button.disabled = false;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

$("run").addEventListener("click", runInvestigation);

// Start the case and check Zetaris independently.
boot();
loadZetarisStatus();

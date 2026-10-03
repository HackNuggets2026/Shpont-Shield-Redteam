// Probe panel, rendered with the same Primer CSS building blocks as the Shield panels.
(function () {
  "use strict";
  const root = document.getElementById("acl-root");
  const ui = { scan: "", scanOut: null, busy: false, error: "", lastChange: null, fresh: false };

  // ---- formatting ---------------------------------------------------------------------

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pct = (x) => (x == null ? "n/a" : (x * 100).toFixed(1) + "%");
  const clock = (ts) => new Date(ts * 1000).toLocaleTimeString([], { hour12: false });
  const words = (s) => String(s ?? "").replace(/_/g, " ");

  // ---- Primer building blocks (kept identical to controllayer/dashboard/core.js) ---------

  const LABEL = { ok: "Label--success", warn: "Label--attention", bad: "Label--danger", info: "Label--accent", neutral: "Label--secondary" };
  const FLASH = { ok: "flash-success", warn: "flash-warn", bad: "flash-error" };
  const FG = { ok: "color-fg-success", warn: "color-fg-attention", bad: "color-fg-danger", info: "color-fg-accent" };
  const BG = { ok: "color-bg-success-emphasis", warn: "color-bg-attention-emphasis", bad: "color-bg-danger-emphasis", info: "color-bg-accent-emphasis" };
  const muted = (html) => `<span class="color-fg-muted f6">${html}</span>`;
  const empty = (text) => `<div class="color-fg-muted f6">${esc(text)}</div>`;
  const badge = (t, text) => `<span class="Label ${LABEL[t] || LABEL.neutral}">${esc(text)}</span>`;
  const note = (html, t, cls = "") => `<div class="flash ${FLASH[t] || ""} mb-3 ${cls}">${html}</div>`;
  const meter = (p, t) => `<span class="Progress acl-meter"><span class="Progress-item ${BG[t] || BG.info}" style="width:${p}%"></span></span>`;
  const card = (title, body, tools) => `<div class="Box">
      <div class="Box-header d-flex flex-items-center flex-wrap"><h3 class="Box-title flex-auto">${esc(title)}</h3><div class="acl-tools">${tools || ""}</div></div>
      <div class="Box-body">${body}</div></div>`;
  const table = (head, rows, num = []) => `<div class="markdown-body acl-scroll"><table>
      ${head ? `<thead><tr>${head.map((h, i) => `<th class="${num.includes(i) ? "acl-num" : ""}">${esc(h)}</th>`).join("")}</tr></thead>` : ""}
      <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${num.includes(i) ? "acl-num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const stats = (items) => `<div class="acl-stats">${items.map((k) => `<div>
      <div class="f6 color-fg-muted">${esc(k.label)}</div>
      <div class="acl-big ${FG[k.tone] || ""}">${esc(k.value)}</div>
      ${k.sub ? `<div class="f6 color-fg-muted">${esc(k.sub)}</div>` : ""}</div>`).join("")}</div>`;
  const grid = (items) => `<div class="acl-grid">${items.map(([span, html]) => `<div class="acl-s${span} acl-stack-cell">${html}</div>`).join("")}</div>`;
  const stack = (...cards) => `<div class="acl-stack">${cards.join("")}</div>`;
  const cap = (s) => { const w = words(s); return w.charAt(0).toUpperCase() + w.slice(1); };
  const mono = (s) => `<span class="text-mono f6">${esc(s)}</span>`;
  const clip = (s) => `<div class="acl-clip color-fg-muted" title="${esc(s)}">${esc(s)}</div>`;

  const STATE = { active: ["ok", "Enforcing"], monitor: ["warn", "Log only"], shadow: ["neutral", "Shadow"], off: ["bad", "Off"] };
  const postureTone = (p) => (p == null ? "" : p >= 90 ? "ok" : p >= 70 ? "warn" : "bad");

  // ---- cards --------------------------------------------------------------------------

  function postureCard(r, st, tw) {
    if (!r) return card("Posture", empty("The first corpus run has not finished yet."));
    const body = `<div class="d-flex flex-items-end mb-3" style="gap:12px">
        <div class="acl-hero ${FG[postureTone(r.posture)] || ""}">${r.posture}</div>
        <div class="color-fg-muted f6 pb-1">of 100, measured<br>${r.cases} payloads in ${r.seconds} s</div></div>
      ${stats([
        { label: "Attacks stopped", value: `${r.attacks.stopped} / ${r.attacks.total}`, sub: pct(r.protection) },
        { label: "Legit requests stopped", value: `${r.benign.stopped} / ${r.benign.total}`, tone: r.benign.stopped ? "warn" : "", sub: pct(r.friction) },
        { label: "Rewrites stopped", value: `${r.mutants.stopped} / ${r.mutants.total}`, sub: pct(r.evasion) },
        { label: "In-layer p95", value: `${r.latency_ms.p95} ms`, sub: `p50 ${r.latency_ms.p50} ms` },
        { label: "Decoy incidents", value: tw.incidents, tone: tw.incidents ? "bad" : "" },
        { label: "Corpus runs", value: st.poligon.runs },
      ])}
      <div class="f6 color-fg-muted mt-3">Posture = share of attacks stopped x (1 - share of legitimate requests stopped). The corpus is re-fired on every policy or feed change.</div>`;
    return card("Posture", body);
  }

  function changeRow(o) {
    const was = o.was_caught_by.length ? ` by ${o.was_caught_by.join(", ")}` : "";
    return [mono(o.id), badge("neutral", words(o.category)), muted(`${esc(o.was)}${esc(was)}`), badge(o.action === "block" || o.action === "redact" ? "ok" : "bad", o.action)];
  }

  function changeCard(changes) {
    if (!changes.length) return card("Last configuration change", empty("No change seen yet. Edit the policy file or the signature feed: within a few seconds this card lists the attacks the edit opened or closed."));
    const c = changes[0];
    const d = (c.posture_after ?? 0) - (c.posture_before ?? 0);
    const cause = words((c.cause || []).join(", ")) || "configuration";
    const cats = Object.entries(c.opened_by_category).map(([k, v]) => `${v} ${words(k)}`).join(", ");
    const tone = c.opened.length ? "bad" : c.closed.length ? "ok" : "warn";
    const head = note(`<b>Posture ${c.posture_before} → ${c.posture_after}</b> (${d > 0 ? "+" : ""}${d.toFixed(1)}) at ${clock(c.ts)}, after a change in: ${esc(cause)}.
      ${c.opened.length ? `<br>Opened ${c.opened.length} attacks: ${esc(cats)}.` : ""}${c.closed.length ? `<br>Closed ${c.closed.length} attacks.` : ""}${c.new_false_positives.length ? `<br>${c.new_false_positives.length} legitimate requests newly stopped.` : ""}${!c.changed ? "<br>No case changed outcome." : ""}`, tone, ui.fresh ? "acl-fresh" : "");
    const base = (xs) => xs.filter((o) => !o.technique);
    const rows = base(c.opened).concat(base(c.closed), c.new_false_positives, c.fixed_false_positives).slice(0, 12);
    const more = c.opened.length + c.closed.length - base(c.opened).length - base(c.closed).length;
    const older = changes.slice(1, 5).map((x) => `<li>${clock(x.ts)}: ${x.posture_before} → ${x.posture_after}, opened ${x.opened.length}, closed ${x.closed.length} (${esc(words((x.cause || []).join(", ")))})</li>`).join("");
    return card("Last configuration change", head +
      (rows.length ? table(["Case", "Class", "Before", "Now"], rows.map(changeRow)) : "") +
      (more > 0 ? `<div class="f6 color-fg-muted mt-2">Plus ${more} rewritten variants of these attacks.</div>` : "") +
      (older ? `<details class="mt-2 f6"><summary class="color-fg-muted">Earlier changes</summary><ul class="pl-3 mt-1">${older}</ul></details>` : ""));
  }

  function controlsCard(stage) {
    const count = {};
    for (const o of stage.outcomes) {
      if (o.rewrite) continue;
      const c = count[o.seg] || (count[o.seg] = { stop: 0, pass: 0, fp: 0 });
      if (o.attack) o.stopped ? c.stop++ : c.pass++;
      else if (o.stopped) c.fp++;
    }
    const rows = [];
    let n = 0;
    for (const ring of stage.rings) for (const s of ring.segments) {
      const c = count[s.id] || { stop: 0, pass: 0, fp: 0 }, [tone, text] = STATE[s.state] || ["neutral", s.state];
      rows.push([++n, `<b class="no-wrap">${esc(cap(s.label))}</b>`, muted(esc(ring.label)), badge(tone, text), c.stop || muted("0"),
        c.pass ? `<span class="color-fg-danger text-bold">${c.pass}</span>` : muted("0"), c.fp ? `<span class="color-fg-attention text-bold">${c.fp}</span>` : muted("0")]);
    }
    return card("Controls, in evaluation order", table(["#", "Control", "Stage", "State", "Stops", "Passes", "False stops"], rows, [0, 4, 5, 6]) +
      `<div class="f6 color-fg-muted mt-2">State is read from the live policy. Stops: corpus attacks this control stopped. Passes: attacks it is expected to catch that get through. False stops: legitimate requests it stopped.</div>`);
  }

  function decoysCard(tw) {
    const rows = tw.decoys.map((d) => {
      const hits = tw.alerts.filter((a) => a.decoy === d.id);
      return [`<b>${esc(d.label)}</b><div class="f6 color-fg-muted">${esc(d.planted_in)}</div>`, badge("neutral", d.class),
        hits.length ? badge("bad", `${hits.length} hit${hits.length > 1 ? "s" : ""}`) : badge("ok", "armed"), hits.length ? esc(hits[0].principal) : muted("nobody")];
    });
    const feed = tw.feed_applied ? `<span class="color-fg-success">enforced by the control layer</span>` : `<span class="color-fg-danger">not loaded by the control layer yet</span>`;
    return card("Tripwire decoys", table(["Decoy", "Class", "Status", "Last tripped by"], rows) +
      `<div class="f6 color-fg-muted mt-2">Feed <span class="text-mono">${esc(tw.feed_version)}</span>: ${feed}. ${tw.drills} self-test trips are not counted as incidents.${tw.feed_error ? ` <span class="color-fg-danger">${esc(tw.feed_error)}</span>` : ""}</div>`);
  }

  function incidentsCard(tw) {
    if (!tw.alerts.length) return card("Decoy incidents", empty("No decoy has been touched. Nothing legitimate touches one, so every row here is a confirmed incident."));
    const rows = tw.alerts.slice(0, 12).map((a) => [muted(clock(a.ts)), `<b>${esc(a.principal)}</b> ${muted(`${esc(a.team)}/${esc(a.role)}`)}`, esc(a.label),
      muted(`${esc(words(a.direction))}${a.tool ? " · " + esc(a.tool) : ""}`), badge(a.action === "block" ? "bad" : "warn", a.action)]);
    return card("Decoy incidents", table(["Time", "Who", "Decoy", "Via", "Action"], rows), tw.by_principal.map(([k, v]) => badge("bad", `${k} ×${v}`)).join(""));
  }

  function openCard(r) {
    if (!r) return card("Getting through right now", empty("Waiting for the first run."));
    const open = r.open_attacks.map((o) => [mono(o.id), badge("neutral", words(o.category)), muted(esc(words(o.direction))), clip(o.text)]);
    const fp = r.false_positives.map((o) => [mono(o.id), badge("warn", o.caught_by.join(", ") || o.action), muted(esc(words(o.direction))), clip(o.text)]);
    return card("Getting through right now",
      (open.length ? `<div class="text-bold mb-1">${open.length} attacks pass</div>` + table(["Case", "Class", "Direction", "Payload"], open) : note("Every known attack is stopped.", "ok")) +
      (fp.length ? `<div class="text-bold mt-3 mb-1">${fp.length} legitimate requests stopped</div>` + table(["Case", "Stopped by", "Direction", "Payload"], fp) : "") +
      `<details class="mt-3 f6"><summary class="color-fg-muted">${r.evaded.length} rewritten attacks evade a control that stops the original</summary>${table(null, r.evaded.slice(0, 40).map((o) => [mono(o.id), clip(o.text)]))}</details>`,
      `<a class="btn btn-sm" href="/api/report.md" target="_blank" rel="noopener">Report</a>`);
  }

  function coverageCard(r) {
    if (!r) return card("Coverage by attack class", empty("Waiting for the first run."));
    const rows = r.by_category.filter((g) => g.attacks).map((g) => [esc(words(g.name)), g.attacks, g.stopped,
      meter(g.protection * 100, g.protection >= 0.9 ? "ok" : g.protection >= 0.6 ? "warn" : "bad")]);
    const tech = r.by_technique.map((g) => [esc(words(g.name)), `${g.stopped} / ${g.total}`, meter(g.total ? (100 * g.stopped) / g.total : 0, "info")]);
    return card("Coverage by attack class", table(["Class", "Attacks", "Stopped", "Protection"], rows, [1, 2]) +
      `<div class="text-bold mt-3 mb-1">Evasion: rewritten attacks still stopped</div>` + table(["Technique", "Stopped", ""], tech, [1]));
  }

  function feedCard(fc) {
    const bad = fc.rows.filter((x) => !x.ok);
    const head = stats([
      { label: "Signatures", value: fc.signatures },
      { label: "Broken", value: fc.broken, tone: fc.broken ? "bad" : "ok" },
      { label: "With own test vectors", value: fc.self_tested },
    ]);
    const scan = `<div class="text-bold mt-3 mb-1">Check any text against the decoys</div>
      <textarea id="scan-text" class="form-control width-full input-monospace" rows="2" placeholder="Paste a prompt, a tool call or a model reply">${esc(ui.scan)}</textarea>
      <div class="acl-tools mt-2"><button type="button" class="btn btn-sm" data-act="scan">Scan</button>${ui.scanOut == null ? "" : ui.scanOut.tripped
        ? badge("bad", "tripped") + muted(ui.scanOut.hits.map((h) => `${esc(h.sig_id)} (${esc(h.variant)})`).join(", ")) : badge("ok", "clean")}</div>`;
    return card("Signature feed self-test", head + (bad.length ? table(["Signature", "Problem"], bad.map((x) => [mono(x.id), `<span class="color-fg-danger">${esc(x.problems.join("; "))}</span>`])) : "") + scan);
  }

  // ---- page ---------------------------------------------------------------------------

  function shell(st, stage) {
    const t = st.target || {}, r = st.poligon.report, tw = st.tripwire;
    const meta = t.error ? `target ${esc(t.name)}: ${esc(t.error)}`
      : `${esc(t.name)} · policy ${esc(t.policy?.version)} · feed ${esc(t.feed?.version)} · semantic ${esc(t.semantic?.backend)}`;
    const alerts = (st.poligon.error ? note(esc(st.poligon.error), "bad") : "") +
      (t.policy?.last_error ? note(`The control layer rejected the last policy edit and kept the previous policy: ${esc(t.policy.last_error)}`, "warn") : "") +
      (ui.error ? note(esc(ui.error), "bad") : "");
    return `
    <div class="Header">
      <div class="Header-item"><span class="Header-link f4 text-bold">Shpont Probe</span></div>
      <div class="Header-item Header-item--full"><span class="f6 text-mono" style="opacity:.75">${meta}</span></div>
      <div class="Header-item acl-tools">
        <button type="button" class="btn btn-sm btn-primary" data-act="run" ${ui.busy ? "disabled" : ""}>${ui.busy ? "Running…" : "Run corpus now"}</button>
      </div>
    </div>
    <div class="container-xl px-3 py-4">
      ${alerts}
      ${grid([
        [5, postureCard(r, st, tw)],
        [7, changeCard(st.poligon.changes)],
        [7, stack(controlsCard(stage), openCard(r))],
        [5, stack(decoysCard(tw), incidentsCard(tw), coverageCard(r), feedCard(st.feedcheck))],
      ])}
    </div>`;
  }

  async function load() {
    try {
      const [st, stage] = await Promise.all([fetch("/api/state").then((x) => x.json()), fetch("/api/stage").then((x) => x.json())]);
      const ts = st.poligon.changes[0]?.ts ?? null;
      ui.fresh = ui.lastChange !== null && ts !== ui.lastChange;
      ui.lastChange = ts ?? 0;
      ui.error = "";
      const focused = document.activeElement?.id === "scan-text";
      const open = [...root.querySelectorAll("details[open] > summary")].map((s) => s.textContent);
      if (focused) return; // do not rebuild under someone typing
      root.innerHTML = shell(st, stage);
      root.querySelectorAll("details > summary").forEach((s) => { if (open.includes(s.textContent)) s.parentElement.open = true; });
    } catch (e) {
      ui.error = "Probe API unreachable: " + e.message;
    }
  }

  root.addEventListener("input", (e) => { if (e.target.id === "scan-text") ui.scan = e.target.value; });
  root.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "run") {
      ui.busy = true; e.target.disabled = true;
      try { await fetch("/api/run", { method: "POST" }); } finally { ui.busy = false; document.activeElement?.blur(); load(); }
    } else if (act === "scan") {
      const r = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: ui.scan }) });
      ui.scanOut = await r.json(); document.activeElement?.blur(); load();
    }
  });

  load();
  setInterval(load, 1500);
})();

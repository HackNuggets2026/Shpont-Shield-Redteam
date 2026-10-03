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
  const card = (title, body, tools, sub) => `<div class="Box">
      <div class="Box-header d-flex flex-items-center flex-wrap"><div class="flex-auto"><h3 class="Box-title">${esc(title)}</h3>
        ${sub ? `<div class="f6 color-fg-muted mt-1">${esc(sub)}</div>` : ""}</div><div class="acl-tools">${tools || ""}</div></div>
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
    if (!r) return card("Score", empty("The first test run has not finished yet."));
    const body = `<div class="d-flex flex-items-end mb-3" style="gap:12px">
        <div class="acl-hero ${FG[postureTone(r.posture)] || ""}">${r.posture}</div>
        <div class="color-fg-muted f6 pb-1">out of 100<br>${r.cases} test messages sent in ${r.seconds} s</div></div>
      <p class="mb-3">The control layer stops <b>${r.attacks.stopped} of ${r.attacks.total}</b> known attacks and wrongly blocks <b>${r.benign.stopped} of ${r.benign.total}</b> normal requests.</p>
      ${stats([
        { label: "Attacks stopped", value: `${r.attacks.stopped} / ${r.attacks.total}`, sub: pct(r.protection) },
        { label: "Normal requests blocked", value: `${r.benign.stopped} / ${r.benign.total}`, tone: r.benign.stopped ? "warn" : "", sub: pct(r.friction) },
        { label: "Disguised attacks stopped", value: `${r.mutants.stopped} / ${r.mutants.total}`, sub: pct(r.evasion) },
        { label: "Delay added per message", value: `${r.latency_ms.p95} ms`, sub: `worst 5%; typical ${r.latency_ms.p50} ms` },
        { label: "Traps triggered", value: tw.incidents, tone: tw.incidents ? "bad" : "" },
        { label: "Test runs so far", value: st.poligon.runs },
      ])}
      <div class="f6 color-fg-muted mt-3">Score = share of attacks stopped x (1 - share of normal requests blocked). Blocking everything scores 0, and so does blocking nothing.</div>`;
    return card("Score", body, "", "One number for the whole control layer, measured by attacking it.");
  }

  const CHANGE_SUB = "After every edit of the policy or the signature feed, the test is repeated and the difference is listed here.";

  function changeRow(o) {
    const was = o.was_caught_by.length ? ` by ${o.was_caught_by.join(", ")}` : "";
    return [mono(o.id), badge("neutral", words(o.category)), muted(`${esc(o.was)}${esc(was)}`), badge(o.action === "block" || o.action === "redact" ? "ok" : "bad", o.action)];
  }

  function changeCard(changes) {
    if (!changes.length) return card("What the last settings change did", empty("Nothing has changed yet. Edit the policy file (for example set a control to mode: log) and within a few seconds this card lists the attacks that started getting through."), "", CHANGE_SUB);
    const c = changes[0];
    const d = (c.posture_after ?? 0) - (c.posture_before ?? 0);
    const cause = words((c.cause || []).join(", ")) || "configuration";
    const cats = Object.entries(c.opened_by_category).map(([k, v]) => `${v} ${words(k)}`).join(", ");
    const tone = c.opened.length ? "bad" : c.closed.length ? "ok" : "warn";
    const head = note(`<b>Score ${c.posture_before} → ${c.posture_after}</b> (${d > 0 ? "+" : ""}${d.toFixed(1)}) at ${clock(c.ts)}, after a change in: ${esc(cause)}.
      ${c.opened.length ? `<br>${c.opened.length} attacks now get through: ${esc(cats)}.` : ""}${c.closed.length ? `<br>${c.closed.length} attacks are stopped again.` : ""}${c.new_false_positives.length ? `<br>${c.new_false_positives.length} normal request(s) are now blocked by mistake.` : ""}${!c.changed ? "<br>No test message changed outcome." : ""}`, tone, ui.fresh ? "acl-fresh" : "");
    const base = (xs) => xs.filter((o) => !o.technique);
    const rows = base(c.opened).concat(base(c.closed), c.new_false_positives, c.fixed_false_positives).slice(0, 12);
    const more = c.opened.length + c.closed.length - base(c.opened).length - base(c.closed).length;
    const older = changes.slice(1, 5).map((x) => `<li>${clock(x.ts)}: ${x.posture_before} → ${x.posture_after}, opened ${x.opened.length}, closed ${x.closed.length} (${esc(words((x.cause || []).join(", ")))})</li>`).join("");
    return card("What the last settings change did", head +
      (rows.length ? table(["Test message", "Type", "Before the change", "Now"], rows.map(changeRow)) : "") +
      (more > 0 ? `<div class="f6 color-fg-muted mt-2">Plus ${more} rewritten variants of these attacks.</div>` : "") +
      (older ? `<details class="mt-2 f6"><summary class="color-fg-muted">Earlier changes</summary><ul class="pl-3 mt-1">${older}</ul></details>` : ""), "", CHANGE_SUB);
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
    return card("Safeguards, in the order they check a message", table(["#", "Safeguard", "Kind", "Status", "Stopped", "Missed", "Wrong blocks"], rows, [0, 4, 5, 6]) +
      `<div class="f6 color-fg-muted mt-2">Status comes from the live policy: Enforcing = blocks, Log only = records but lets through, Shadow = being evaluated, Off = disabled. Stopped = test attacks it stopped. Missed = test attacks it should catch but does not. Wrong blocks = normal requests it blocked.</div>`,
      "", "Every safeguard of the control layer, whether it is switched on, and how it did in the last test run.");
  }

  function decoysCard(tw) {
    const rows = tw.decoys.map((d) => {
      const hits = tw.alerts.filter((a) => a.decoy === d.id);
      return [`<b>${esc(d.label)}</b><div class="f6 color-fg-muted">${esc(d.planted_in)}</div>`, badge("neutral", d.class),
        hits.length ? badge("bad", `triggered ${hits.length}x`) : badge("ok", "untouched"), hits.length ? esc(hits[0].principal) : muted("nobody")];
    });
    const feed = tw.feed_applied ? `<span class="color-fg-success">enforced by the control layer</span>` : `<span class="color-fg-danger">not loaded by the control layer yet</span>`;
    return card("Traps", table(["Trap", "Type", "Status", "Last triggered by"], rows) +
      `<div class="f6 color-fg-muted mt-2">Feed <span class="text-mono">${esc(tw.feed_version)}</span>: ${feed}. ${tw.drills} triggers by our own test runs are not counted.${tw.feed_error ? ` <span class="color-fg-danger">${esc(tw.feed_error)}</span>` : ""}</div>`,
      "", "Fake secrets and records planted on purpose. Nobody honest ever uses them, so any use is a real incident.");
  }

  const INCIDENT_SUB = "Each row names the person or agent, the trap and the way the trap value was used.";

  function incidentsCard(tw) {
    if (!tw.alerts.length) return card("Who triggered a trap", empty("Nobody so far."), "", INCIDENT_SUB);
    const rows = tw.alerts.slice(0, 12).map((a) => [muted(clock(a.ts)), `<b>${esc(a.principal)}</b> ${muted(`${esc(a.team)}/${esc(a.role)}`)}`, esc(a.label),
      muted(`${esc(words(a.direction))}${a.tool ? " · " + esc(a.tool) : ""}`), badge(a.action === "block" ? "bad" : "warn", a.action)]);
    return card("Who triggered a trap", table(["Time", "Who", "Trap", "How", "Result"], rows), tw.by_principal.map(([k, v]) => badge("bad", `${k} ×${v}`)).join(""), INCIDENT_SUB);
  }

  function openCard(r) {
    if (!r) return card("Attacks that still get through", empty("Waiting for the first run."));
    const open = r.open_attacks.map((o) => [mono(o.id), badge("neutral", words(o.category)), muted(esc(words(o.direction))), clip(o.text)]);
    const fp = r.false_positives.map((o) => [mono(o.id), badge("warn", o.caught_by.join(", ") || o.action), muted(esc(words(o.direction))), clip(o.text)]);
    return card("Attacks that still get through",
      (open.length ? `<div class="text-bold mb-1">${open.length} attacks are not stopped</div>` + table(["Test message", "Type", "Sent as", "Text"], open) : note("Every known attack is stopped.", "ok")) +
      (fp.length ? `<div class="text-bold mt-3 mb-1">${fp.length} normal requests are blocked by mistake</div>` + table(["Test message", "Blocked by", "Sent as", "Text"], fp) : "") +
      `<details class="mt-3 f6"><summary class="color-fg-muted">${r.evaded.length} disguised versions of stopped attacks get through</summary>${table(null, r.evaded.slice(0, 40).map((o) => [mono(o.id), clip(o.text)]))}</details>`,
      `<a class="btn btn-sm" href="/api/report.md" target="_blank" rel="noopener">Full report</a>`,
      "The to-do list for whoever maintains the control layer.");
  }

  function coverageCard(r) {
    if (!r) return card("Results by type of attack", empty("Waiting for the first run."));
    const rows = r.by_category.filter((g) => g.attacks).map((g) => [esc(words(g.name)), g.attacks, g.stopped,
      meter(g.protection * 100, g.protection >= 0.9 ? "ok" : g.protection >= 0.6 ? "warn" : "bad")]);
    const tech = r.by_technique.map((g) => [esc(words(g.name)), `${g.stopped} / ${g.total}`, meter(g.total ? (100 * g.stopped) / g.total : 0, "info")]);
    return card("Results by type of attack", table(["Type", "Attacks", "Stopped", ""], rows, [1, 2]) +
      `<div class="text-bold mt-3 mb-1">Disguised attacks: the same attack rewritten to slip past a filter</div>` + table(["Disguise", "Stopped", ""], tech, [1]),
      "", "How many test attacks of each kind were stopped.");
  }

  function feedCard(fc) {
    const bad = fc.rows.filter((x) => !x.ok);
    const head = stats([
      { label: "Signatures", value: fc.signatures },
      { label: "Broken", value: fc.broken, tone: fc.broken ? "bad" : "ok" },
      { label: "With built-in examples", value: fc.self_tested },
    ]);
    const scan = `<div class="text-bold mt-3 mb-1">Try it: does this text contain a trap value?</div>
      <textarea id="scan-text" class="form-control width-full input-monospace" rows="2" placeholder="Paste a prompt, a tool call or a model reply">${esc(ui.scan)}</textarea>
      <div class="acl-tools mt-2"><button type="button" class="btn btn-sm" data-act="scan">Scan</button>${ui.scanOut == null ? "" : ui.scanOut.tripped
        ? badge("bad", "tripped") + muted(ui.scanOut.hits.map((h) => `${esc(h.sig_id)} (${esc(h.variant)})`).join(", ")) : badge("ok", "clean")}</div>`;
    return card("Attack signature list check", head + (bad.length ? table(["Signature", "Problem"], bad.map((x) => [mono(x.id), `<span class="color-fg-danger">${esc(x.problems.join("; "))}</span>`])) : "") + scan,
      "", "Signatures are patterns of known attacks, loaded from a feed. A broken pattern is reported here instead of failing silently.");
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
        <button type="button" class="btn btn-sm btn-primary" data-act="run" ${ui.busy ? "disabled" : ""}>${ui.busy ? "Testing…" : "Run the test now"}</button>
      </div>
    </div>
    <div class="container-xl px-3 py-4">
      ${alerts}
      <div class="Box color-bg-subtle p-3 mb-3">
        <div class="text-bold mb-1">What this page shows</div>
        <ol class="pl-3 mb-0 f5">
          <li>Probe keeps sending a fixed set of test messages to the AI control layer: known attacks and ordinary requests.</li>
          <li>It counts how many attacks were stopped and how many ordinary requests were blocked by mistake. That gives the score.</li>
          <li>When someone edits the control layer's settings, the test repeats within seconds and the page lists what the edit changed.</li>
          <li>Separately, planted traps reveal anyone who uses data they should never touch.</li>
        </ol>
      </div>
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

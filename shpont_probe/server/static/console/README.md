`app.js` and `core.css` are unmodified copies of the Shield security console shell
(`controllayer/dashboard/` at Shpont-Shield 22eeb4e). They are here so Probe's views run standalone.

`views/probe.js` is Probe's own code. It follows Shield's `docs/console-contract.md`, so merging means:
copy `views/probe.js` into Shield's `controllayer/dashboard/views/`, add its script tag to `panel.html`,
and point `window.PROBE_API` at the Probe service (or mount Probe's `/api` routes in the gateway).

`app.js` and `core.css` are unmodified copies of the Shield security console shell
(`controllayer/dashboard/` at Shpont-Shield 22eeb4e). They are here so Redteam's views run standalone.

`views/redteam.js` is Redteam's own code. It follows Shield's `docs/console-contract.md`, so merging means:
copy `views/redteam.js` into Shield's `controllayer/dashboard/views/`, add its script tag to `panel.html`,
and point `window.REDTEAM_API` at the Redteam service (or mount Redteam's `/api` routes in the gateway).

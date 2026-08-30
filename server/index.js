// Standalone API entry point — `npm run dev:api` / `npm run server`.
//
// The application itself lives in ./app.js so the exact same routers can also be
// mounted inside the Next.js deployment (see app/api/[...path]/route.ts).

const { createApp, initDb } = require('./app');

const app = createApp();

(async () => {
  await initDb();

  const PORT = process.env.PORT || 4000;
  const db = require('./db');
  app.listen(PORT, () =>
    console.log(
      `Shubh-Sanjog API listening on port ${PORT} [storage: ${db._mode}${db.isReady() ? '' : ' (degraded)'}]`
    )
  );
})();

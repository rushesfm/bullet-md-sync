export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- CORS HEADERS (Copy from previous step) ---
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // --- THE MAGIC: AUTO-INITIALIZATION ---
    // We try to run the Schema setup.
    // "CREATE TABLE IF NOT EXISTS" makes this safe to run many times.
    try {
      // D1 is fast; running this on every request is negligible for personal apps.
      await env.DB.exec(`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          content TEXT,
          updated_at INTEGER,
          deleted INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
      `);
    } catch (e) {
      // If this fails, the DB might not be bound correctly yet
      return new Response(`Database Error: ${e.message}`, {
        status: 500,
        headers: corsHeaders,
      });
    }

    // --- AUTHENTICATION ---
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${env.SYNC_TOKEN}`) {
      return new Response("Unauthorized", {
        status: 401,
        headers: corsHeaders,
      });
    }

    // --- YOUR ROUTES ---

    // ROUTE: Add Note (iOS Shortcuts)
    if (request.method === "POST" && url.pathname === "/api/add") {
      const { text } = await request.json();
      const id = crypto.randomUUID();
      const time = Date.now();

      await env.DB.prepare(
        "INSERT INTO notes (id, content, updated_at) VALUES (?, ?, ?)",
      )
        .bind(id, text, time)
        .run();

      return new Response("Note Saved", { status: 201, headers: corsHeaders });
    }

    // ROUTE: Sync (PWA)
    if (request.method === "GET" && url.pathname === "/api/sync") {
      const since = url.searchParams.get("since") || 0;
      const { results } = await env.DB.prepare(
        "SELECT * FROM notes WHERE updated_at > ?",
      )
        .bind(since)
        .run();

      return new Response(
        JSON.stringify({ changes: results, timestamp: Date.now() }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // ROUTE: Batch Push (PWA Upload)
    if (request.method === "POST" && url.pathname === "/api/sync") {
      const { changes } = await request.json();
      const stmt = env.DB.prepare(
        "INSERT OR REPLACE INTO notes (id, content, updated_at, deleted) VALUES (?, ?, ?, ?)",
      );
      const batch = changes.map((note) =>
        stmt.bind(note.id, note.content, note.updated_at, note.deleted || 0),
      );
      await env.DB.batch(batch);

      return new Response("Sync Complete", { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
};

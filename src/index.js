export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.SYNC_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (request.method === 'POST' && url.pathname === '/api/add') {
      let payload = {};
      try {
        payload = await request.json();
      } catch {
        return new Response('Invalid JSON', { status: 400 });
      }

      const text = typeof payload.text === 'string' ? payload.text.trim() : '';
      if (!text) {
        return new Response('`text` is required', { status: 400 });
      }

      const id = crypto.randomUUID();
      const time = Date.now();

      await env.DB.prepare('INSERT INTO notes (id, content, updated_at) VALUES (?, ?, ?)')
        .bind(id, text, time)
        .run();

      return new Response('Note Saved', { status: 201 });
    }

    if (request.method === 'GET' && url.pathname === '/api/sync') {
      const sinceParam = url.searchParams.get('since');
      const since = Number(sinceParam) || 0;

      const { results } = await env.DB.prepare('SELECT * FROM notes WHERE updated_at > ?')
        .bind(since)
        .run();

      return new Response(
        JSON.stringify({
          changes: results ?? [],
          timestamp: Date.now()
        }),
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (request.method === 'POST' && url.pathname === '/api/sync') {
      let payload = {};
      try {
        payload = await request.json();
      } catch {
        return new Response('Invalid JSON', { status: 400 });
      }

      const changes = Array.isArray(payload.changes) ? payload.changes : [];
      if (!changes.length) {
        return new Response('No changes provided', { status: 400 });
      }

      const stmt = env.DB.prepare(
        'INSERT OR REPLACE INTO notes (id, content, updated_at, deleted) VALUES (?, ?, ?, ?)'
      );
      const batch = changes.map((note) =>
        stmt.bind(
          note.id,
          note.content ?? '',
          Number(note.updated_at) || Date.now(),
          Number(note.deleted) || 0
        )
      );

      await env.DB.batch(batch);
      return new Response('Sync Complete');
    }

    return new Response('Not Found', { status: 404 });
  }
};

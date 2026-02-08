function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

async function supabaseQuery(env, table, { method = "GET", query = "", body = null, headers = {} } = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${query ? "?" + query : ""}`;

  const fetchHeaders = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...headers,
  };

  const options = { method, headers: fetchHeaders };
  if (body) {
    options.body = JSON.stringify(body);
  }

  return fetch(url, options);
}

function getExtension(mimeType) {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mimeType] || "jpg";
}

function randomId() {
  return Math.random().toString(36).substring(2, 10);
}

// OPTIONS /api/certifications
export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/certifications
export async function onRequestGet(context) {
  try {
    const res = await supabaseQuery(context.env, "certifications", {
      method: "GET",
      query: "select=*&order=created_at.desc&limit=100",
    });

    if (!res.ok) {
      const text = await res.text();
      return jsonResponse({ error: "DB read failed", detail: text }, 500);
    }

    const data = await res.json();
    return jsonResponse(data);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// POST /api/certifications
export async function onRequestPost(context) {
  try {
    const request = context.request;
    const env = context.env;
    const url = new URL(request.url);
    const formData = await request.formData();

    const rank = parseInt(formData.get("rank"));
    const count = parseInt(formData.get("count")) || 1;
    const round = formData.get("round") ? parseInt(formData.get("round")) : null;
    const prizePerTicket = parseInt(formData.get("prize_per_ticket")) || 0;
    const totalPrize = parseInt(formData.get("total_prize")) || 0;
    const comment = formData.get("comment") || "";
    const donated = formData.get("donated") === "true";
    const imageFile = formData.get("image");

    if (!rank || rank < 1 || rank > 5) {
      return jsonResponse({ error: "Invalid rank" }, 400);
    }

    let imageUrl = null;
    if (imageFile && imageFile.size > 0) {
      const ext = getExtension(imageFile.type);
      const key = `cert/${Date.now()}_${randomId()}.${ext}`;

      await env.IMAGES.put(key, imageFile.stream(), {
        httpMetadata: { contentType: imageFile.type },
      });

      imageUrl = `${url.origin}/images/${key}`;
    }

    const body = {
      rank,
      count,
      round,
      prize_per_ticket: prizePerTicket,
      total_prize: totalPrize,
      image_url: imageUrl,
      comment,
      donated,
    };

    const res = await supabaseQuery(env, "certifications", {
      method: "POST",
      body,
      headers: { Prefer: "return=representation" },
    });

    if (!res.ok) {
      const text = await res.text();
      return jsonResponse({ error: "DB insert failed", detail: text }, 500);
    }

    const [created] = await res.json();
    return jsonResponse(created, 201);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

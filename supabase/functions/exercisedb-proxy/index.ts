import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const API_BASE = "https://www.exercisedb.dev/api/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function clampLimit(value: string | null): number {
  const parsed = Number(value ?? "25");
  if (!Number.isFinite(parsed) || parsed < 1) return 25;
  if (parsed > 25) return 25;
  return parsed;
}

async function fetchJson(path: string, params?: URLSearchParams): Promise<any> {
  const query = params && params.toString() ? `?${params.toString()}` : "";
  const url = `${API_BASE}${path}${query}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`ExerciseDB error: ${response.status}`);
  }
  return response.json();
}

serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return jsonResponse(405, { success: false, error: "Method not allowed" });
  }

  try {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/^\/functions\/v1\/exercisedb-proxy/, "");

    if (pathname === "/meta" || pathname === "meta") {
      const [bodyParts, muscles, equipments] = await Promise.all([
        fetchJson("/bodyparts"),
        fetchJson("/muscles"),
        fetchJson("/equipments"),
      ]);

      return jsonResponse(200, {
        success: true,
        bodyParts: Array.isArray(bodyParts?.data) ? bodyParts.data : [],
        muscles: Array.isArray(muscles?.data) ? muscles.data : [],
        equipments: Array.isArray(equipments?.data) ? equipments.data : [],
      });
    }

    if (
      pathname === "/" ||
      pathname === "" ||
      pathname === "/exercises" ||
      pathname === "exercises"
    ) {
      const limit = clampLimit(url.searchParams.get("limit"));
      const offset = Number(url.searchParams.get("offset") ?? "0") || 0;
      const search = url.searchParams.get("search") ?? "";
      const bodyPart = url.searchParams.get("bodyPart") ?? "";
      const muscle = url.searchParams.get("muscle") ?? "";
      const equipment = url.searchParams.get("equipment") ?? "";

      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(Math.max(0, offset)));
      if (search) params.set("search", search);
      if (bodyPart) params.set("bodyParts", bodyPart);
      if (muscle) params.set("muscles", muscle);
      if (equipment) params.set("equipment", equipment);

      const payload = await fetchJson("/exercises/filter", params);
      return jsonResponse(200, payload);
    }

    const exerciseIdMatch = pathname.match(/^\/?exercises\/?([^/?#]+)$/);
    if (exerciseIdMatch) {
      const exerciseId = decodeURIComponent(exerciseIdMatch[1]);
      const payload = await fetchJson(`/exercises/${exerciseId}`);
      return jsonResponse(200, payload);
    }

    return jsonResponse(404, { success: false, error: "Route not found" });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export function GET() {
  return Response.json(
    {
      status: "ok",
      service: "vesperframe-web",
      time: new Date().toISOString(),
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}

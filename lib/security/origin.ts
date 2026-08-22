import { getPublicEnvironment } from "@/lib/env";

export function assertTrustedOrigin(request: Request) {
  const configured = new URL(getPublicEnvironment().NEXT_PUBLIC_APP_URL).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (
    !origin ||
    origin !== configured ||
    (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite))
  ) {
    throw new OriginError();
  }
}

export class OriginError extends Error {
  readonly status = 403;

  constructor() {
    super("Request origin was rejected");
    this.name = "OriginError";
  }
}

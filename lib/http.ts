import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthenticationError, AuthorizationError } from "@/lib/auth";
import { OriginError } from "@/lib/security/origin";
import { GenerationCompileError } from "@/server/generation/compiler";

export function apiError(error: unknown, correlationId: string) {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: error.message, code: error.code, correlationId },
      { status: error.status },
    );
  }
  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof OriginError
  ) {
    return NextResponse.json(
      { error: error.message, code: error.name, correlationId },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Request validation failed",
        code: "ValidationError",
        fields: error.flatten().fieldErrors,
        correlationId,
      },
      { status: 400 },
    );
  }
  if (error instanceof RequestSizeError || error instanceof InvalidJsonError) {
    return NextResponse.json(
      { error: error.message, code: error.name, correlationId },
      { status: error.status },
    );
  }
  if (error instanceof GenerationCompileError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.name,
        issues: error.issues,
        correlationId,
      },
      { status: 422 },
    );
  }
  return NextResponse.json(
    {
      error: "The request could not be completed",
      code: "InternalError",
      correlationId,
    },
    { status: 500 },
  );
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class RequestSizeError extends Error {
  readonly status = 413;

  constructor() {
    super("Request body is too large");
    this.name = "RequestSizeError";
  }
}

export class InvalidJsonError extends Error {
  readonly status = 400;

  constructor() {
    super("Request body must be valid JSON");
    this.name = "InvalidJsonError";
  }
}

export async function readLimitedJson(
  request: Request,
  maximumBytes = 262_144,
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maximumBytes)
    throw new RequestSizeError();
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maximumBytes)
    throw new RequestSizeError();
  try {
    return JSON.parse(raw);
  } catch {
    throw new InvalidJsonError();
  }
}

export function correlationId(request: Request) {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[A-Za-z0-9._-]{8,128}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

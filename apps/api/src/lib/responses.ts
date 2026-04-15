import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { isDevelopment, isProduction } from "./env";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

function resolveAllowedOrigin(): string {
  const configuredOrigin = process.env.APP_WEB_ORIGIN?.trim();

  if (configuredOrigin && configuredOrigin !== "") {
    return configuredOrigin;
  }

  if (isProduction()) {
    throw new Error("APP_WEB_ORIGIN must be set in production.");
  }

  return "http://localhost:5173";
}

export function getCorsHeaders() {
  const origin = resolveAllowedOrigin();

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (isDevelopment()) {
    headers["Access-Control-Allow-Headers"] += ", bypass-tunnel-reminder";
  }

  return headers;
}

export function optionsResponse() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders()
  });
}

export function jsonResponse(data: unknown, init?: ResponseInit) {
  return NextResponse.json(
    { data },
    {
      ...init,
      headers: {
        ...getCorsHeaders(),
        ...init?.headers
      }
    }
  );
}

export function handleRouteError(error: unknown) {
  if (error instanceof ApiError) {
    const body: Record<string, unknown> = { error: error.message };
    if (!isProduction()) {
      body.details = error.details;
    }
    return NextResponse.json(body, {
      status: error.status,
      headers: getCorsHeaders()
    });
  }

  if (error instanceof ZodError) {
    const body: Record<string, unknown> = {
      error: error.issues[0]?.message ?? "Gönderilen veri doğrulanamadı."
    };
    if (!isProduction()) {
      body.details = error.issues;
    }
    return NextResponse.json({ data: body }, {
      status: 400,
      headers: getCorsHeaders()
    });
  }

  console.error(error);
  return NextResponse.json(
    { error: "Beklenmeyen bir hata oluştu." },
    { status: 500, headers: getCorsHeaders() }
  );
}

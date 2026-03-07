import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function getCorsHeaders() {
  const origin = process.env.APP_WEB_ORIGIN ?? "*";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
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
    return NextResponse.json(
      { error: error.message, details: error.details },
      { status: error.status, headers: getCorsHeaders() }
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: "Beklenmeyen bir hata oluştu." },
    { status: 500, headers: getCorsHeaders() }
  );
}

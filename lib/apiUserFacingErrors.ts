import "server-only";

import { NextResponse } from "next/server";
import { fallbackForStatus, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";

type ErrorResponseOptions = {
  status?: number;
  fallback?: string;
  extra?: Record<string, unknown>;
  code?: string;
};

export function buildUserFacingErrorBody(input: unknown, options: ErrorResponseOptions = {}) {
  const status = options.status ?? 500;
  const userMessage = getSimpleFrenchErrorMessage(input, fallbackForStatus(status, options.fallback));

  return {
    error: userMessage,
    user_message: userMessage,
    error_code: options.code ?? `http_${status}`,
    ...(options.extra ?? {}),
  };
}

export function jsonUserFacingError(input: unknown, options: ErrorResponseOptions = {}) {
  const status = options.status ?? 500;
  return NextResponse.json(buildUserFacingErrorBody(input, { ...options, status }), { status });
}

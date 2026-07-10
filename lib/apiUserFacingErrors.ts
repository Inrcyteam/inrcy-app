import "server-only";

import { NextResponse } from "next/server";
import { fallbackForStatus, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";

type ErrorResponseOptions = {
  status?: number;
  fallback?: string;
  extra?: Record<string, unknown>;
  code?: string;
};

function getStructuredErrorCode(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const code = (input as { code?: unknown }).code;
  return typeof code === "string" ? code.trim() : "";
}

function resolveKnownErrorStatus(input: unknown, requestedStatus: number): number {
  const code = getStructuredErrorCode(input);
  if (code === "ai_gateway_account_limit_reached" || code === "ai_operation_budget_exceeded") {
    return 429;
  }
  return requestedStatus;
}

export function buildUserFacingErrorBody(input: unknown, options: ErrorResponseOptions = {}) {
  const status = resolveKnownErrorStatus(input, options.status ?? 500);
  const structuredCode = getStructuredErrorCode(input);
  const userMessage = getSimpleFrenchErrorMessage(input, fallbackForStatus(status, options.fallback));

  return {
    error: userMessage,
    user_message: userMessage,
    error_code: structuredCode || options.code || `http_${status}`,
    ...(options.extra ?? {}),
  };
}

export function jsonUserFacingError(input: unknown, options: ErrorResponseOptions = {}) {
  const status = resolveKnownErrorStatus(input, options.status ?? 500);
  return NextResponse.json(buildUserFacingErrorBody(input, { ...options, status }), { status });
}

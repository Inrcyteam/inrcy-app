import * as Sentry from '@sentry/nextjs';
import { log } from '@/lib/observability/logger';
import { getRequestId, getRequestMeta } from '@/lib/observability/request';

type OAuthOutcome =
  | 'started'
  | 'success'
  | 'cancelled'
  | 'state_invalid'
  | 'not_authenticated'
  | 'config_error'
  | 'failed';

type OAuthEventInput = {
  provider: string;
  outcome: OAuthOutcome;
  error?: string;
  message?: string;
  user_id?: string;
  return_to?: string;
  status_code?: number;
  capture_in_sentry?: boolean;
  [k: string]: unknown;
};

function levelForOutcome(outcome: OAuthOutcome): 'info' | 'warn' | 'error' {
  if (outcome === 'success' || outcome === 'started') return 'info';
  if (outcome === 'cancelled' || outcome === 'state_invalid' || outcome === 'not_authenticated') return 'warn';
  return 'error';
}

function sentryLevelForOutcome(outcome: OAuthOutcome): 'info' | 'warning' | 'error' {
  if (outcome === 'success' || outcome === 'started') return 'info';
  if (outcome === 'cancelled' || outcome === 'state_invalid' || outcome === 'not_authenticated') return 'warning';
  return 'error';
}

export function oauthCallbackEvent(req: Request, input: OAuthEventInput) {
  const request_id = getRequestId(req);
  const meta = getRequestMeta(req);
  const level = levelForOutcome(input.outcome);
  const sentryLevel = sentryLevelForOutcome(input.outcome);
  const payload = {
    request_id,
    route: meta.pathname,
    method: meta.method,
    ip: meta.ip,
    ...input,
  };

  log[level]('oauth_callback', payload);

  if (input.capture_in_sentry) {
    Sentry.withScope((scope: any) => {
      scope.setTag('area', 'oauth');
      scope.setTag('provider', input.provider);
      scope.setTag('outcome', input.outcome);
      if (request_id) scope.setTag('request_id', request_id);
      if (input.user_id) scope.setUser({ id: input.user_id });
      scope.setContext('oauth', {
        provider: input.provider,
        outcome: input.outcome,
        route: meta.pathname,
        method: meta.method,
        error: input.error,
        message: input.message,
        return_to: input.return_to,
      });
      Sentry.captureMessage(`oauth_callback:${input.provider}:${input.outcome}`, { level: sentryLevel });
    });
  }
}

export function oauthCallbackException(
  req: Request,
  provider: string,
  error: unknown,
  extra: Omit<OAuthEventInput, 'provider' | 'outcome'> = {},
) {
  const request_id = getRequestId(req);
  const meta = getRequestMeta(req);
  const message = error instanceof Error ? error.message : String(error);

  log.error('oauth_callback_exception', {
    request_id,
    route: meta.pathname,
    method: meta.method,
    ip: meta.ip,
    provider,
    outcome: 'failed',
    error: extra.error || 'oauth_callback_failed',
    message,
    ...extra,
  });

  Sentry.withScope((scope: any) => {
    scope.setTag('area', 'oauth');
    scope.setTag('provider', provider);
    scope.setTag('outcome', 'failed');
    if (request_id) scope.setTag('request_id', request_id);
    if (typeof extra.user_id === 'string') scope.setUser({ id: extra.user_id });
    scope.setContext('oauth', {
      route: meta.pathname,
      method: meta.method,
      provider,
      error: extra.error || 'oauth_callback_failed',
      return_to: extra.return_to,
      ...extra,
    });
    Sentry.captureException(error instanceof Error ? error : new Error(message));
  });
}

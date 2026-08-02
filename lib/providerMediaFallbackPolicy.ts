export function getProviderCreateFailureSafety(params: {
  httpStatus?: number | null;
  requestThrew?: boolean;
  successResponseMissingId?: boolean;
}) {
  const status = Number(params.httpStatus || 0);
  const explicitClientRejection = status >= 400 && status < 500;
  const ambiguous = Boolean(
    params.requestThrew ||
      params.successResponseMissingId ||
      status >= 500,
  );
  return {
    safeTextFallback: explicitClientRejection,
    requestMayHaveSucceeded: ambiguous,
  };
}

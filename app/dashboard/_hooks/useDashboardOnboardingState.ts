"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { resolveActiveBrowserUserId } from "@/lib/browserAccountCache";
import {
  DASHBOARD_ONBOARDING_SELECT,
  DASHBOARD_ONBOARDING_VERSION,
  isDashboardOnboardingFirstOpening,
  normalizeDashboardOnboardingRow,
  shouldRunDashboardOnboarding,
  type DashboardOnboardingRow,
  type DashboardOnboardingStatus,
  type DashboardOnboardingStep,
} from "@/lib/dashboardOnboarding";
import { ACTIVE_INRCY_ACCOUNT_EVENT } from "@/lib/multicompte/constants";
import { createClient } from "@/lib/supabaseClient";

type OnboardingState = {
  accountId: string | null;
  row: DashboardOnboardingRow | null;
  onboardingReady: boolean;
  onboardingAvailable: boolean;
  onboardingError: boolean;
  firstOpeningDetected: boolean;
};

const INITIAL_ONBOARDING_STATE: OnboardingState = {
  accountId: null,
  row: null,
  onboardingReady: false,
  onboardingAvailable: false,
  onboardingError: false,
  firstOpeningDetected: false,
};

const inFlightOnboardingLoads = new Map<
  string,
  Promise<DashboardOnboardingRow | null>
>();

async function resolveOnboardingAccountId() {
  const supabase = createClient();
  const { data: authData, error } = await supabase.auth.getUser();
  const user = authData?.user;
  if (error || !user) return null;

  return resolveActiveBrowserUserId(user.id);
}

async function loadOnboardingRow(
  accountId: string,
  options?: { force?: boolean },
) {
  if (options?.force) inFlightOnboardingLoads.delete(accountId);

  const existingRequest = inFlightOnboardingLoads.get(accountId);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("inrcy_onboarding_states")
      .select(DASHBOARD_ONBOARDING_SELECT)
      .eq("account_id", accountId)
      .maybeSingle();

    if (error) throw error;
    return normalizeDashboardOnboardingRow(data);
  })();

  inFlightOnboardingLoads.set(accountId, request);
  try {
    return await request;
  } finally {
    if (inFlightOnboardingLoads.get(accountId) === request) {
      inFlightOnboardingLoads.delete(accountId);
    }
  }
}

async function persistOnboardingRow(
  accountId: string,
  status: DashboardOnboardingStatus,
  currentStep: DashboardOnboardingStep,
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("inrcy_save_onboarding_state", {
    p_account_id: accountId,
    p_status: status,
    p_current_step: currentStep,
    p_version: DASHBOARD_ONBOARDING_VERSION,
  });

  if (error) throw error;

  const row = normalizeDashboardOnboardingRow(data);
  if (!row) throw new Error("INRCY_ONBOARDING_STATE_INVALID_RESPONSE");
  return row;
}

export function useDashboardOnboardingState() {
  const [state, setState] = useState<OnboardingState>(
    INITIAL_ONBOARDING_STATE,
  );
  const requestSequenceRef = useRef(0);
  const mutationSequenceRef = useRef(0);
  const activeAccountIdRef = useRef<string | null>(null);

  const refreshOnboarding = useCallback(
    async (options?: { force?: boolean; startPending?: boolean }) => {
      const requestSequence = ++requestSequenceRef.current;
      const accountId = await resolveOnboardingAccountId();
      if (requestSequence !== requestSequenceRef.current) return null;

      if (!accountId) {
        activeAccountIdRef.current = null;
        setState({
          accountId: null,
          row: null,
          onboardingReady: true,
          onboardingAvailable: false,
          onboardingError: true,
          firstOpeningDetected: false,
        });
        return null;
      }

      activeAccountIdRef.current = accountId;

      try {
        let row = await loadOnboardingRow(accountId, options);
        if (requestSequence !== requestSequenceRef.current) return null;

        const firstOpeningDetected = isDashboardOnboardingFirstOpening(row);

        if (
          row &&
          firstOpeningDetected &&
          options?.startPending !== false
        ) {
          row = await persistOnboardingRow(
            accountId,
            "in_progress",
            row.currentStep,
          );
        }

        if (requestSequence !== requestSequenceRef.current) return null;
        setState({
          accountId,
          row,
          onboardingReady: true,
          onboardingAvailable: Boolean(row),
          onboardingError: false,
          firstOpeningDetected,
        });
        return row;
      } catch {
        if (requestSequence !== requestSequenceRef.current) return null;
        setState({
          accountId,
          row: null,
          onboardingReady: true,
          onboardingAvailable: false,
          onboardingError: true,
          firstOpeningDetected: false,
        });
        return null;
      }
    },
    [],
  );

  const saveOnboardingState = useCallback(
    async (
      status: DashboardOnboardingStatus,
      currentStep: DashboardOnboardingStep,
    ) => {
      const mutationSequence = ++mutationSequenceRef.current;
      const currentAccountId = await resolveOnboardingAccountId();
      if (!currentAccountId) return null;

      const accountId = state.accountId ?? currentAccountId;
      if (accountId !== currentAccountId) return null;
      activeAccountIdRef.current = currentAccountId;

      try {
        const row = await persistOnboardingRow(accountId, status, currentStep);
        if (mutationSequence !== mutationSequenceRef.current) return null;
        if (activeAccountIdRef.current !== accountId) return null;

        setState({
          accountId,
          row,
          onboardingReady: true,
          onboardingAvailable: true,
          onboardingError: false,
          firstOpeningDetected: state.firstOpeningDetected,
        });
        return row;
      } catch {
        if (mutationSequence !== mutationSequenceRef.current) return null;
        if (activeAccountIdRef.current !== accountId) return null;
        setState((current) => ({ ...current, onboardingError: true }));
        return null;
      }
    },
    [state.accountId, state.firstOpeningDetected],
  );

  const setCurrentOnboardingStep = useCallback(
    (currentStep: Exclude<DashboardOnboardingStep, "completed">) =>
      saveOnboardingState("in_progress", currentStep),
    [saveOnboardingState],
  );

  const deferOnboarding = useCallback(() => {
    const currentStep = state.row?.currentStep;
    if (!currentStep || currentStep === "completed") return Promise.resolve(null);
    return saveOnboardingState("deferred", currentStep);
  }, [saveOnboardingState, state.row?.currentStep]);

  const resumeOnboarding = useCallback(() => {
    const currentStep = state.row?.currentStep;
    if (!currentStep || currentStep === "completed") return Promise.resolve(null);
    return saveOnboardingState("in_progress", currentStep);
  }, [saveOnboardingState, state.row?.currentStep]);

  const completeOnboarding = useCallback(
    () => saveOnboardingState("completed", "completed"),
    [saveOnboardingState],
  );

  useEffect(() => {
    void refreshOnboarding();

    const handleActiveAccountChange = () => {
      requestSequenceRef.current += 1;
      mutationSequenceRef.current += 1;
      activeAccountIdRef.current = null;
      setState(INITIAL_ONBOARDING_STATE);
      void refreshOnboarding({ force: true });
    };

    window.addEventListener(
      ACTIVE_INRCY_ACCOUNT_EVENT,
      handleActiveAccountChange,
    );
    return () => {
      window.removeEventListener(
        ACTIVE_INRCY_ACCOUNT_EVENT,
        handleActiveAccountChange,
      );
    };
  }, [refreshOnboarding]);

  return {
    ...state,
    onboardingStatus: state.row?.status ?? null,
    onboardingCurrentStep: state.row?.currentStep ?? null,
    onboardingVersion: state.row?.version ?? null,
    shouldRunOnboarding: shouldRunDashboardOnboarding(state.row),
    isFirstOnboardingOpening:
      state.firstOpeningDetected || isDashboardOnboardingFirstOpening(state.row),
    refreshOnboarding,
    setCurrentOnboardingStep,
    deferOnboarding,
    resumeOnboarding,
    completeOnboarding,
  };
}

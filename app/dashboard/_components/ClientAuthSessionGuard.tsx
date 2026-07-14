"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabaseClient";

const LOGIN_PATH = "/login?reason=session_expired";

export default function ClientAuthSessionGuard() {
  const redirectingRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const redirectToLogin = () => {
      if (!active || redirectingRef.current || typeof window === "undefined") return;
      if (window.location.pathname === "/login") return;
      redirectingRef.current = true;
      window.location.replace(LOGIN_PATH);
    };

    const handleInvalidSession = () => {
      void supabase.auth.signOut({ scope: "local" }).catch(() => null);
      redirectToLogin();
    };

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
        redirectToLogin();
      }
    });
    window.addEventListener("inrcy:auth-session-invalid", handleInvalidSession);

    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener("inrcy:auth-session-invalid", handleInvalidSession);
    };
  }, []);

  return null;
}

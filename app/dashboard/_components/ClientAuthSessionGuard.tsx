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

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
        redirectToLogin();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return null;
}

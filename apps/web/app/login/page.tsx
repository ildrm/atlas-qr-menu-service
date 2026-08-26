"use client";

import { ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Brand } from "../../components/brand";
import { ApiClientError, apiFetch } from "../../lib/api";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "register") {
        await apiFetch("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            displayName: String(form.get("displayName")),
            email: String(form.get("email")),
            password: String(form.get("password")),
            locale: "en",
          }),
        });
      }
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: String(form.get("email")),
          password: String(form.get("password")),
          rememberMe: form.get("rememberMe") === "on",
        }),
      });
      const businesses = await apiFetch<Array<{ id: string }>>("/businesses");
      router.push(
        businesses[0]
          ? `/dashboard?business=${businesses[0].id}`
          : "/onboarding",
      );
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Could not connect to AtlasQR.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story" aria-label="Product introduction">
        <Brand light />
        <div className="auth-story-copy">
          <h1>
            One scan.
            <br />
            Every detail.
          </h1>
          <p>
            Beautiful, multilingual catalogs for the places and businesses
            people discover in the real world.
          </p>
        </div>
        <ul className="auth-points">
          <li>
            <Check aria-hidden="true" /> Publish updates without reprinting QR
            codes
          </li>
          <li>
            <Check aria-hidden="true" /> Built for products, menus, services,
            and price lists
          </li>
          <li>
            <Check aria-hidden="true" /> Fast public pages with accessible RTL
            support
          </li>
        </ul>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form-card">
          <p className="auth-mobile-brand">
            <Brand />
          </p>
          <h2>{mode === "login" ? "Welcome back" : "Create your workspace"}</h2>
          <p>
            {mode === "login"
              ? "Sign in to manage your catalogs and QR codes."
              : "Start with a business-ready catalog in a few minutes."}
          </p>
          <form onSubmit={handleSubmit} noValidate>
            {mode === "register" ? (
              <label>
                <span>Your name</span>
                <input
                  name="displayName"
                  autoComplete="name"
                  required
                  minLength={2}
                  placeholder="Mina Rahimi"
                />
              </label>
            ) : null}
            <label>
              <span>Email address</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@business.com"
              />
            </label>
            <label>
              <span>Password</span>
              <span className="password-field">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={mode === "register" ? 12 : 1}
                  placeholder={
                    mode === "register"
                      ? "At least 12 characters"
                      : "Your password"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={
                    showPassword ? "Hide characters" : "Show characters"
                  }
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </span>
            </label>
            {mode === "login" ? (
              <label className="checkbox-label">
                <input name="rememberMe" type="checkbox" />{" "}
                <span>Keep me signed in on this device</span>
              </label>
            ) : null}
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              className="button button-primary auth-submit"
              disabled={submitting}
              type="submit"
            >
              {submitting
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
              {!submitting ? <ArrowRight aria-hidden="true" /> : null}
            </button>
          </form>
          <p className="auth-switch">
            {mode === "login" ? "New to AtlasQR?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

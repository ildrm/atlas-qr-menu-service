"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coffee,
  Scissors,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Brand } from "../../components/brand";
import { ApiClientError, apiFetch } from "../../lib/api";

const businessTypes = [
  { code: "cafe", name: "Café or restaurant", icon: Coffee },
  { code: "beauty", name: "Beauty or wellness", icon: Scissors },
  { code: "retail", name: "Retail or showroom", icon: ShoppingBag },
  { code: "services", name: "Professional services", icon: Sparkles },
];

const defaults = {
  businessName: "",
  businessTypeCode: "cafe",
  countryCode: "IR",
  city: "Tehran",
  timezone: "Asia/Tehran",
  currency: "USD",
  locale: "en",
  branchName: "Downtown",
  catalogName: "All day menu",
  categoryName: "Coffee",
  itemName: "Espresso",
  price: "2.50",
};

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `business-${Date.now()}`
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [values, setValues] = useState(defaults);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<Array<{ id: string }>>("/businesses").catch((caught) => {
      if (caught instanceof ApiClientError && caught.status === 401)
        router.replace("/login");
    });
  }, [router]);

  function update<K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function finish(event: FormEvent) {
    event.preventDefault();
    if (step < 4) {
      setStep((current) => current + 1);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const business = await apiFetch<{ id: string; slug: string }>(
        "/businesses",
        {
          method: "POST",
          body: JSON.stringify({
            name: values.businessName,
            slug: slugify(values.businessName),
            businessTypeCode: values.businessTypeCode,
            countryCode: values.countryCode,
            city: values.city,
            timezone: values.timezone,
            currency: values.currency,
            defaultLocale: values.locale,
          }),
        },
      );
      const branch = await apiFetch<{ id: string }>(
        `/businesses/${business.id}/branches`,
        {
          method: "POST",
          body: JSON.stringify({
            name: values.branchName,
            slug: slugify(values.branchName),
            timezone: values.timezone,
          }),
        },
      );
      const catalog = await apiFetch<{ id: string; slug: string }>(
        `/businesses/${business.id}/catalogs`,
        {
          method: "POST",
          body: JSON.stringify({
            name: values.catalogName,
            slug: slugify(values.catalogName),
            currency: values.currency,
            branchIds: [branch.id],
          }),
        },
      );
      const category = await apiFetch<{ id: string }>(
        `/businesses/${business.id}/categories`,
        {
          method: "POST",
          body: JSON.stringify({
            catalogId: catalog.id,
            name: values.categoryName,
            slug: slugify(values.categoryName),
            sortOrder: 0,
          }),
        },
      );
      await apiFetch(`/businesses/${business.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          catalogId: catalog.id,
          categoryId: category.id,
          name: values.itemName,
          slug: slugify(values.itemName),
          shortDescription:
            "Add a clear, inviting description from the Items workspace.",
          priceMinor: Math.round(Number(values.price) * 100),
          currency: values.currency,
          tags: [],
          badges: [],
          featured: true,
          popular: false,
          sortOrder: 0,
        }),
      });
      await apiFetch(
        `/businesses/${business.id}/catalogs/${catalog.id}/publish`,
        { method: "POST" },
      );
      await apiFetch(`/businesses/${business.id}/qr-codes`, {
        method: "POST",
        body: JSON.stringify({
          name: "Main entrance",
          targetType: "catalog",
          targetId: catalog.id,
          branchId: branch.id,
          context: {},
          style: {
            foreground: "#14352B",
            background: "#FFFFFF",
            errorCorrection: "M",
          },
        }),
      });
      router.push(`/dashboard?business=${business.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "We could not finish setting up your business.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header">
        <Brand />
        <span>Step {step} of 4</span>
      </header>
      <div className="onboarding-progress" aria-label={`Step ${step} of 4`}>
        <span style={{ width: `${step * 25}%` }} />
      </div>
      <form className="onboarding-card" onSubmit={finish}>
        {step === 1 ? (
          <section>
            <h1>Tell us about your business</h1>
            <p>AtlasQR adapts its language and tools to the way you work.</p>
            <label>
              <span>Business name</span>
              <input
                required
                autoFocus
                value={values.businessName}
                onChange={(event) => update("businessName", event.target.value)}
                placeholder="Brew & Bloom"
              />
            </label>
            <fieldset className="business-type-grid">
              <legend>What best describes it?</legend>
              {businessTypes.map(({ code, name, icon: Icon }) => (
                <label
                  key={code}
                  className={
                    values.businessTypeCode === code
                      ? "type-option selected"
                      : "type-option"
                  }
                >
                  <input
                    type="radio"
                    name="businessType"
                    value={code}
                    checked={values.businessTypeCode === code}
                    onChange={() => update("businessTypeCode", code)}
                  />
                  <Icon aria-hidden="true" />
                  <span>{name}</span>
                  {values.businessTypeCode === code ? (
                    <Check className="type-check" aria-hidden="true" />
                  ) : null}
                </label>
              ))}
            </fieldset>
          </section>
        ) : null}
        {step === 2 ? (
          <section>
            <h1>Set your local defaults</h1>
            <p>
              Prices and availability will follow this location unless a branch
              overrides them.
            </p>
            <div className="form-grid">
              <label>
                <span>Country code</span>
                <input
                  required
                  maxLength={2}
                  value={values.countryCode}
                  onChange={(event) =>
                    update("countryCode", event.target.value.toUpperCase())
                  }
                />
              </label>
              <label>
                <span>City</span>
                <input
                  value={values.city}
                  onChange={(event) => update("city", event.target.value)}
                />
              </label>
              <label>
                <span>Timezone</span>
                <input
                  required
                  value={values.timezone}
                  onChange={(event) => update("timezone", event.target.value)}
                />
              </label>
              <label>
                <span>Currency</span>
                <input
                  required
                  maxLength={3}
                  value={values.currency}
                  onChange={(event) =>
                    update("currency", event.target.value.toUpperCase())
                  }
                />
              </label>
              <label>
                <span>Default language</span>
                <select
                  value={values.locale}
                  onChange={(event) => update("locale", event.target.value)}
                >
                  <option value="en">English</option>
                  <option value="fa">فارسی</option>
                  <option value="ar">العربية</option>
                </select>
              </label>
              <label>
                <span>First branch</span>
                <input
                  required
                  value={values.branchName}
                  onChange={(event) => update("branchName", event.target.value)}
                />
              </label>
            </div>
          </section>
        ) : null}
        {step === 3 ? (
          <section>
            <h1>Create your first catalog</h1>
            <p>
              This can be a menu, service list, collection, price list, or any
              other set of offerings.
            </p>
            <label>
              <span>Catalog name</span>
              <input
                required
                autoFocus
                value={values.catalogName}
                onChange={(event) => update("catalogName", event.target.value)}
              />
            </label>
            <label>
              <span>First category</span>
              <input
                required
                value={values.categoryName}
                onChange={(event) => update("categoryName", event.target.value)}
              />
            </label>
          </section>
        ) : null}
        {step === 4 ? (
          <section>
            <h1>Add one real item</h1>
            <p>
              You can add photos, translations, variants, and availability rules
              after setup.
            </p>
            <div className="form-grid">
              <label>
                <span>Item or service name</span>
                <input
                  required
                  autoFocus
                  value={values.itemName}
                  onChange={(event) => update("itemName", event.target.value)}
                />
              </label>
              <label>
                <span>Price ({values.currency})</span>
                <input
                  required
                  inputMode="decimal"
                  pattern="\d+(\.\d{1,2})?"
                  value={values.price}
                  onChange={(event) => update("price", event.target.value)}
                />
              </label>
            </div>
            <div className="launch-summary">
              <Check aria-hidden="true" />
              <span>
                We’ll publish the catalog and create a dynamic QR code
                automatically.
              </span>
            </div>
          </section>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="onboarding-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={step === 1 || submitting}
            onClick={() => setStep((current) => current - 1)}
          >
            <ArrowLeft aria-hidden="true" /> Back
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? "Building your catalog…"
              : step === 4
                ? "Publish my catalog"
                : "Continue"}
            {!submitting ? <ArrowRight aria-hidden="true" /> : null}
          </button>
        </footer>
      </form>
    </main>
  );
}

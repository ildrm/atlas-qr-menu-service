import Link from "next/link";

import { Brand } from "../../components/brand";

export const metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <main className="help-page">
      <Brand />
      <h1>Build, publish, scan.</h1>
      <p>
        Start with a catalog, add categories and items, publish when ready, then
        create a dynamic QR code. Updates to the published catalog do not
        require reprinting the code.
      </p>
      <section>
        <h2>Quick answers</h2>
        <details>
          <summary>Why can’t customers see a draft?</summary>
          <p>
            Public routes only return published content. Preview is separate
            from publication.
          </p>
        </details>
        <details>
          <summary>Can I use AtlasQR for services?</summary>
          <p>
            Yes. Catalog, category, and item are generic domain terms; business
            types adapt the language without changing the data model.
          </p>
        </details>
        <details>
          <summary>What happens offline?</summary>
          <p>
            A previously loaded catalog can be shown with an explicit stale-data
            banner. Customers should reconnect to confirm current prices.
          </p>
        </details>
      </section>
      <Link className="button button-primary" href="/dashboard">
        Back to dashboard
      </Link>
    </main>
  );
}

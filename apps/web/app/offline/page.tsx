import Link from "next/link";
import Image from "next/image";

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <Image src="/icon.svg" width={64} height={64} alt="" />
      <h1>You’re offline</h1>
      <p>
        A previously opened catalog will still work. Reconnect to load a new one
        or confirm the latest prices.
      </p>
      <Link className="button button-primary" href="/">
        Try again
      </Link>
    </main>
  );
}

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container py-16">
      <div className="crdg-card mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">Listing not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That listing may have been removed or never existed.
        </p>
        <Link href="/listings" className="mt-4 inline-block text-sm underline">
          Back to listings
        </Link>
      </div>
    </div>
  );
}

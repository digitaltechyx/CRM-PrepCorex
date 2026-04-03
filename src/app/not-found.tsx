import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link href="/dashboard" className="text-primary underline">
        Go to CRM home
      </Link>
    </div>
  );
}

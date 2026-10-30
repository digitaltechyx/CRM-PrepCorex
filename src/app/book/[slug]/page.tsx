import type { Metadata } from "next";
import { PublicBookingClient } from "@/components/crm/appointments/public-booking-client";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Book a call · Prep Services FBA`,
    description: "Schedule a consultation with Prep Services FBA.",
    robots: { index: true, follow: true },
    openGraph: {
      title: "Book with Prep Services FBA",
      description: "Pick a time that works for you.",
      type: "website",
      images: [{ url: "/b-card/prep-services-logo.png" }],
    },
    other: {
      "booking-slug": slug,
    },
  };
}

export default async function PublicBookPage({ params }: Props) {
  const { slug } = await params;
  return <PublicBookingClient slug={slug} />;
}

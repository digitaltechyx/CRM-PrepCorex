import { PublicBookingClient } from "@/components/crm/appointments/public-booking-client";

type Props = { params: Promise<{ slug: string }> };

export default async function PublicBookPage({ params }: Props) {
  const { slug } = await params;
  return <PublicBookingClient slug={slug} />;
}

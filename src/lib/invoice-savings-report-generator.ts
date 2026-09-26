import jsPDF from "jspdf";
import { quotationInvoiceLogoSrc } from "@/lib/quotation-invoice-logo";

export interface InvoiceSavingsSourceItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  compareUnitPrice?: number;
}

export interface InvoiceSavingsLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  compareUnitPrice: number;
  amount: number;
  compareAmount: number;
  savedAmount: number;
}

export interface InvoiceSavingsReportData {
  invoiceNumber: string;
  invoiceDate: string;
  clientName: string;
  items: InvoiceSavingsLineItem[];
  paidSubtotal: number;
  marketSubtotal: number;
  totalSaved: number;
  savingsPercent: number;
}

function logoFormatForPdf(src: string): "PNG" | "JPEG" {
  const path = decodeURIComponent(src.split("?")[0] || "");
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "JPEG";
  return "PNG";
}

const loadLogo = async (src: string): Promise<HTMLImageElement | null> => {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await new Promise((resolve) => {
      img.onload = () => resolve(null);
      img.onerror = () => resolve(null);
      setTimeout(() => resolve(null), 1200);
    });
    return img;
  } catch {
    return null;
  }
};

const money = (n: number) =>
  `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function invoiceHasSavingsCompare(items: InvoiceSavingsSourceItem[] | undefined): boolean {
  return (items || []).some((item) => {
    const compare = Number(item.compareUnitPrice || 0);
    const unit = Number(item.unitPrice || 0);
    return compare > 0 && compare > unit;
  });
}

export function buildInvoiceSavingsReportData(input: {
  invoiceNumber: string;
  invoiceDate: string;
  clientName?: string;
  items: InvoiceSavingsSourceItem[];
}): InvoiceSavingsReportData | null {
  if (!invoiceHasSavingsCompare(input.items)) return null;

  const lines: InvoiceSavingsLineItem[] = input.items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const compareUnitPrice = Number(item.compareUnitPrice || 0);
    const amount = Number(item.amount ?? quantity * unitPrice);
    const hasCompare = compareUnitPrice > 0 && compareUnitPrice > unitPrice;
    const compareAmount = hasCompare ? Number((compareUnitPrice * quantity).toFixed(2)) : amount;
    const savedAmount = hasCompare ? Number((compareAmount - amount).toFixed(2)) : 0;
    return {
      description: String(item.description || "").trim() || "Line item",
      quantity,
      unitPrice,
      compareUnitPrice: hasCompare ? compareUnitPrice : unitPrice,
      amount,
      compareAmount,
      savedAmount,
    };
  });

  const paidSubtotal = Number(lines.reduce((sum, line) => sum + line.amount, 0).toFixed(2));
  const marketSubtotal = Number(lines.reduce((sum, line) => sum + line.compareAmount, 0).toFixed(2));
  const totalSaved = Math.max(0, Number((marketSubtotal - paidSubtotal).toFixed(2)));
  const savingsPercent =
    marketSubtotal > 0 ? Math.round((totalSaved / marketSubtotal) * 100) : 0;

  return {
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    clientName: input.clientName || "",
    items: lines,
    paidSubtotal,
    marketSubtotal,
    totalSaved,
    savingsPercent,
  };
}

export async function generateInvoiceSavingsReportPdfBlob(
  data: InvoiceSavingsReportData
): Promise<Blob> {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - 16) return;
    doc.addPage();
    y = margin;
  };

  const logo = await loadLogo(quotationInvoiceLogoSrc);
  if (logo) {
    doc.addImage(logo, logoFormatForPdf(quotationInvoiceLogoSrc), margin, y, 26, 16);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(28, 25, 23);
  doc.text("YOUR VALUE REPORT", pageWidth - margin, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 90, 80);
  doc.text(`Invoice #${data.invoiceNumber}`, pageWidth - margin, y + 11, { align: "right" });
  doc.text(`Date: ${data.invoiceDate}`, pageWidth - margin, y + 16, { align: "right" });
  y += 24;

  if (data.clientName) {
    doc.setFontSize(10);
    doc.setTextColor(55, 45, 35);
    doc.text(`Prepared for: ${data.clientName}`, margin, y);
    y += 6;
  }

  // Hero card — PrepCorex-style value summary
  ensureSpace(42);
  doc.setFillColor(7, 26, 61);
  doc.roundedRect(margin, y, contentWidth, 38, 3, 3, "F");

  doc.setTextColor(253, 186, 116);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("YOUR ESTIMATED VALUE", margin + 6, y + 8);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("What you save vs typical market / list pricing on this invoice", margin + 6, y + 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(money(data.totalSaved), margin + 6, y + 26);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 231, 183);
  doc.text(
    data.marketSubtotal > 0
      ? `About ${data.savingsPercent}% below typical market totals`
      : "Add compare/list prices on line items to show savings",
    margin + 6,
    y + 33
  );

  // % ring
  const cx = pageWidth - margin - 18;
  const cy = y + 19;
  doc.setDrawColor(249, 115, 22);
  doc.setLineWidth(2.2);
  doc.circle(cx, cy, 12, "S");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`${data.savingsPercent}%`, cx, cy + 1, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(203, 213, 225);
  doc.text("SAVED", cx, cy + 5.5, { align: "center" });

  y += 44;

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `You pay with Prep Services FBA  ${money(data.paidSubtotal)}   ·   Typical market  ${money(data.marketSubtotal)}`,
    margin,
    y
  );
  y += 8;

  // Comparison bars
  ensureSpace(36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 23);
  doc.text("Paid vs typical market", margin, y);
  y += 6;

  const maxBar = Math.max(data.paidSubtotal, data.marketSubtotal, 1);
  const barMaxWidth = contentWidth - 52;

  const drawBar = (label: string, value: number, rgb: [number, number, number]) => {
    ensureSpace(14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(55, 45, 35);
    doc.text(label, margin, y + 3.5);
    const w = Math.max(4, (value / maxBar) * barMaxWidth);
    doc.setFillColor(...rgb);
    doc.roundedRect(margin + 42, y, w, 6, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.text(money(value), margin + 44 + w, y + 4.5);
    y += 11;
  };

  drawBar("You paid", data.paidSubtotal, [249, 115, 22]);
  drawBar("Typical market", data.marketSubtotal, [100, 116, 139]);
  drawBar("You save", data.totalSaved, [16, 185, 129]);
  y += 4;

  // Line detail
  ensureSpace(28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(28, 25, 23);
  doc.text("Line-by-line detail", margin, y);
  y += 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 90, 80);
  doc.text(
    "Compare each charged unit price against the estimated market price so the savings are clear.",
    margin,
    y + 4
  );
  y += 10;

  // Right edges for numeric columns (A4 ~210mm; leave clear gaps so headers never overlap)
  const rightEdge = pageWidth - margin;
  const col = {
    desc: margin,
    qty: margin + 58,
    market: margin + 98,
    yours: margin + 136,
    save: rightEdge,
  };
  const descWidth = col.qty - margin - 8;

  const drawTableHeader = () => {
    doc.setFillColor(254, 243, 226);
    doc.rect(margin, y - 4, contentWidth, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(120, 53, 15);
    doc.text("Description", col.desc + 1, y);
    doc.text("Qty", col.qty, y, { align: "right" });
    doc.text("Est. Market Price", col.market, y, { align: "right" });
    doc.text("Your price", col.yours, y, { align: "right" });
    doc.text("You save", col.save, y, { align: "right" });
    y += 6;
  };

  drawTableHeader();

  for (const line of data.items) {
    const descLines = doc.splitTextToSize(line.description, descWidth) as string[];
    const rowHeight = Math.max(8, descLines.length * 4 + 2);
    ensureSpace(rowHeight + 2);
    if (y < margin + 10) drawTableHeader();

    doc.setDrawColor(245, 230, 210);
    doc.line(margin, y + rowHeight - 1, pageWidth - margin, y + rowHeight - 1);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(40, 35, 30);
    doc.text(descLines, col.desc + 1, y + 3);
    doc.text(String(line.quantity), col.qty, y + 3, { align: "right" });
    doc.text(money(line.compareAmount), col.market, y + 3, { align: "right" });
    doc.text(money(line.amount), col.yours, y + 3, { align: "right" });
    doc.setTextColor(line.savedAmount > 0 ? 5 : 100, line.savedAmount > 0 ? 150 : 116, line.savedAmount > 0 ? 105 : 139);
    doc.setFont("helvetica", "bold");
    doc.text(money(line.savedAmount), col.save, y + 3, { align: "right" });
    y += rowHeight;
  }

  y += 6;
  ensureSpace(28);
  doc.setFillColor(236, 253, 245);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(6, 95, 70);
  doc.text("Total you save on this invoice", margin + 5, y + 9);
  doc.setFontSize(14);
  doc.text(money(data.totalSaved), pageWidth - margin - 5, y + 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(4, 120, 87);
  doc.text(
    `Paid ${money(data.paidSubtotal)} instead of typical market ${money(data.marketSubtotal)}`,
    margin + 5,
    y + 17
  );
  y += 28;

  ensureSpace(16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 113, 108);
  const disclaimer = doc.splitTextToSize(
    "Est. Market Price values are comparison estimates entered for this invoice so you can see the value of Prep Services FBA pricing. Your invoice total is the amount due. Questions? Contact info@prepservicesfba.com.",
    contentWidth
  );
  doc.text(disclaimer, margin, y);

  return doc.output("blob");
}

export async function buildInvoiceSavingsPdfFile(input: {
  invoiceNumber: string;
  invoiceDate: string;
  clientName?: string;
  items: InvoiceSavingsSourceItem[];
}): Promise<File | null> {
  const data = buildInvoiceSavingsReportData(input);
  if (!data) return null;
  const blob = await generateInvoiceSavingsReportPdfBlob(data);
  return new File([blob], `Value-Report-${input.invoiceNumber}.pdf`, {
    type: "application/pdf",
  });
}

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

export interface InvoiceSavingsSection {
  items: InvoiceSavingsLineItem[];
  paidSubtotal: number;
  marketSubtotal: number;
  totalSaved: number;
  savingsPercent: number;
}

export interface InvoiceSavingsReportData {
  invoiceNumber: string;
  invoiceDate: string;
  clientName: string;
  service: InvoiceSavingsSection;
  shippingLabels: InvoiceSavingsSection;
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

function buildSavingsSection(items: InvoiceSavingsSourceItem[]): InvoiceSavingsSection {
  const lines: InvoiceSavingsLineItem[] = (items || [])
    .filter((item) => {
      const description = String(item.description || "").trim();
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const amount = Number(item.amount ?? quantity * unitPrice);
      return Boolean(description || amount || quantity || unitPrice || item.compareUnitPrice);
    })
    .map((item) => {
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
    items: lines,
    paidSubtotal,
    marketSubtotal,
    totalSaved,
    savingsPercent,
  };
}

export function buildInvoiceSavingsReportData(input: {
  invoiceNumber: string;
  invoiceDate: string;
  clientName?: string;
  items: InvoiceSavingsSourceItem[];
  shippingLabelItems?: InvoiceSavingsSourceItem[];
}): InvoiceSavingsReportData | null {
  const hasService = invoiceHasSavingsCompare(input.items);
  const hasShipping = invoiceHasSavingsCompare(input.shippingLabelItems);
  if (!hasService && !hasShipping) return null;

  const service = buildSavingsSection(input.items || []);
  const shippingLabels = buildSavingsSection(input.shippingLabelItems || []);

  const paidSubtotal = Number((service.paidSubtotal + shippingLabels.paidSubtotal).toFixed(2));
  const marketSubtotal = Number(
    (service.marketSubtotal + shippingLabels.marketSubtotal).toFixed(2)
  );
  const totalSaved = Math.max(0, Number((marketSubtotal - paidSubtotal).toFixed(2)));
  const savingsPercent =
    marketSubtotal > 0 ? Math.round((totalSaved / marketSubtotal) * 100) : 0;

  return {
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    clientName: input.clientName || "",
    service,
    shippingLabels,
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
  const footerY = pageHeight - 12;
  const contentMaxY = pageHeight - 22; // keep body above footer
  let y = margin;

  const drawPageFooter = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120, 53, 15);
    doc.text("The Partner Behind Your Fulfillment", pageWidth / 2, footerY, {
      align: "center",
    });
  };

  const ensureSpace = (needed: number) => {
    if (y + needed <= contentMaxY) return;
    doc.addPage();
    y = margin;
  };

  const logo = await loadLogo(quotationInvoiceLogoSrc);
  let logoHeight = 0;
  if (logo && logo.naturalWidth > 0 && logo.naturalHeight > 0) {
    const maxW = 46;
    const maxH = 14;
    const ratio = logo.naturalWidth / logo.naturalHeight;
    let logoW = maxW;
    let logoH = logoW / ratio;
    if (logoH > maxH) {
      logoH = maxH;
      logoW = logoH * ratio;
    }
    doc.addImage(logo, logoFormatForPdf(quotationInvoiceLogoSrc), margin, y, logoW, logoH);
    logoHeight = logoH;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(28, 25, 23);
  doc.text("PSF Value Summary", pageWidth - margin, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 90, 80);
  doc.text(`Invoice #${data.invoiceNumber}`, pageWidth - margin, y + 11, { align: "right" });
  doc.text(`Date: ${data.invoiceDate}`, pageWidth - margin, y + 16, { align: "right" });
  y += Math.max(logoHeight + 6, 24);

  if (data.clientName) {
    doc.setFontSize(10);
    doc.setTextColor(55, 45, 35);
    doc.text(`Prepared for: ${data.clientName}`, margin, y);
    y += 6;
  }

  ensureSpace(48);
  const heroY = y;
  const padX = 6;
  const padTop = 6;
  const padBottom = 5;
  const ringReserve = 40;
  const textMaxW = contentWidth - ringReserve - padX;

  // Measure stacked content to mirror old-design rhythm (tight under amount + green line)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const titleH = 3.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const heroSub = doc.splitTextToSize(
    "Your estimated savings compared with typical market pricing for this invoice",
    textMaxW
  ) as string[];
  const subH = heroSub.length * 3.6;

  const amountH = 6.5;
  const savingsLine =
    data.marketSubtotal > 0
      ? `Estimated ${data.savingsPercent}% savings compared with Estimated market pricing.`
      : "Add Est. Market Price on line items to show savings";
  doc.setFontSize(7.5);
  const savingsWrapped = doc.splitTextToSize(savingsLine, textMaxW) as string[];
  const savingsH = savingsWrapped.length * 3.4;

  // Gaps: title→sub 2.5, sub→amount 3, amount→savings 1.5 (old card was tight under $)
  const gapTitleSub = 2.5;
  const gapSubAmount = 3;
  const gapAmountSavings = 1.5;
  const contentH =
    titleH + gapTitleSub + subH + gapSubAmount + amountH + gapAmountSavings + savingsH;
  const heroH = Math.max(36, padTop + contentH + padBottom);

  doc.setFillColor(7, 26, 61);
  doc.roundedRect(margin, heroY, contentWidth, heroH, 3, 3, "F");

  let textY = heroY + padTop + 2;

  doc.setTextColor(253, 186, 116);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("PSF VALUE SUMMARY", margin + padX, textY);
  textY += titleH + gapTitleSub;

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(heroSub, margin + padX, textY);
  textY += subH + gapSubAmount;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(money(data.totalSaved), margin + padX, textY + 1);
  textY += amountH + gapAmountSavings;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110, 231, 183);
  doc.text(savingsWrapped, margin + padX, textY);

  // % ring — vertically centered in the card
  const cx = pageWidth - margin - 18;
  const cy = heroY + heroH / 2;
  doc.setDrawColor(249, 115, 22);
  doc.setLineWidth(2.2);
  doc.circle(cx, cy, 11, "S");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`${data.savingsPercent}%`, cx, cy + 1, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(203, 213, 225);
  doc.text("SAVED", cx, cy + 5.5, { align: "center" });

  y = heroY + heroH + 6;

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Your PSF total: ${money(data.paidSubtotal)} · Estimated market total: ${money(data.marketSubtotal)}`,
    margin,
    y
  );
  y += 10;

  const gap = 4;
  const chartWidth = (contentWidth - gap) / 2;
  const showServiceChart = data.service.items.length > 0;
  const showShippingChart = data.shippingLabels.items.length > 0;

  const drawMiniChart = (
    left: number,
    width: number,
    title: string,
    section: Pick<InvoiceSavingsSection, "paidSubtotal" | "marketSubtotal" | "totalSaved">,
    options?: { titleSize?: number; labelW?: number; barHeight?: number; rowGap?: number }
  ) => {
    let localY = y;
    const titleSize = options?.titleSize ?? 9;
    const labelW = options?.labelW ?? 34;
    const barHeight = options?.barHeight ?? 5;
    const rowGap = options?.rowGap ?? 9;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(titleSize);
    doc.setTextColor(28, 25, 23);
    doc.text(title, left, localY);
    localY += titleSize >= 11 ? 6 : 5;

    const maxBar = Math.max(section.paidSubtotal, section.marketSubtotal, 1);
    const barMax = Math.max(12, width - labelW - 18);
    const rows: Array<{ label: string; value: number; rgb: [number, number, number] }> = [
      { label: "PSF Total", value: section.paidSubtotal, rgb: [249, 115, 22] },
      { label: "Est. Market", value: section.marketSubtotal, rgb: [100, 116, 139] },
      { label: "Est. Saving", value: section.totalSaved, rgb: [16, 185, 129] },
    ];

    for (const row of rows) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(titleSize >= 11 ? 8 : 6.5);
      doc.setTextColor(55, 45, 35);
      doc.text(row.label, left, localY + barHeight * 0.65);
      const w = Math.max(3, (row.value / maxBar) * barMax);
      doc.setFillColor(...row.rgb);
      doc.roundedRect(left + labelW, localY, w, barHeight, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.text(money(row.value), left + labelW + w + 1.5, localY + barHeight * 0.7);
      localY += rowGap;
    }
    return localY;
  };

  // Overall comparison (combined service + shipping) above the two detail charts
  ensureSpace(40);
  y = drawMiniChart(
    margin,
    contentWidth,
    "Overall Comparison",
    {
      paidSubtotal: data.paidSubtotal,
      marketSubtotal: data.marketSubtotal,
      totalSaved: data.totalSaved,
    },
    { titleSize: 11, labelW: 42, barHeight: 6, rowGap: 11 }
  );
  y += 6;

  if (showServiceChart || showShippingChart) {
    ensureSpace(42);
    const chartStartY = y;
    let serviceEnd = chartStartY;
    let shippingEnd = chartStartY;

    if (showServiceChart && showShippingChart) {
      serviceEnd = drawMiniChart(margin, chartWidth, "Service Comparison", data.service);
      shippingEnd = drawMiniChart(
        margin + chartWidth + gap,
        chartWidth,
        "Shipping Label Comparison",
        data.shippingLabels
      );
    } else if (showServiceChart) {
      serviceEnd = drawMiniChart(margin, contentWidth, "Service Comparison", data.service);
    } else {
      shippingEnd = drawMiniChart(
        margin,
        contentWidth,
        "Shipping Label Comparison",
        data.shippingLabels
      );
    }
    y = Math.max(serviceEnd, shippingEnd) + 4;
  }

  const rightEdge = pageWidth - margin;
  const col = {
    desc: margin,
    qty: margin + 58,
    market: margin + 98,
    yours: margin + 136,
    save: rightEdge,
  };
  const descWidth = col.qty - margin - 8;

  const drawComparisonTable = (
    title: string,
    subtitle: string,
    section: InvoiceSavingsSection
  ) => {
    if (section.items.length === 0) return;

    ensureSpace(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(28, 25, 23);
    doc.text(title, margin, y);
    y += 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 90, 80);
    doc.text(subtitle, margin, y + 4);
    y += 10;

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

    for (const line of section.items) {
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
      doc.setTextColor(
        line.savedAmount > 0 ? 5 : 100,
        line.savedAmount > 0 ? 150 : 116,
        line.savedAmount > 0 ? 105 : 139
      );
      doc.setFont("helvetica", "bold");
      doc.text(money(line.savedAmount), col.save, y + 3, { align: "right" });
      y += rowHeight;
    }
    y += 8;
  };

  drawComparisonTable(
    "Service Price Comparison",
    "See how each invoiced service compares with estimated market pricing.",
    data.service
  );
  drawComparisonTable(
    "Shipping Label Comparison",
    "See how each shipping label charge compares with estimated market pricing.",
    data.shippingLabels
  );

  ensureSpace(28);
  doc.setFillColor(236, 253, 245);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(6, 95, 70);
  doc.text("Estimated savings on this invoice", margin + 5, y + 9);
  doc.setFontSize(14);
  doc.text(money(data.totalSaved), pageWidth - margin - 5, y + 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(4, 120, 87);
  doc.text(
    `Your PSF Total: ${money(data.paidSubtotal)} · Estimated Market Total: ${money(data.marketSubtotal)}`,
    margin + 5,
    y + 17
  );
  y += 28;

  ensureSpace(16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 113, 108);
  const disclaimer = doc.splitTextToSize(
    "Market prices are estimates for comparison. Your invoice total is the amount due. Questions? Contact info@prepservicesfba.com.",
    contentWidth
  );
  doc.text(disclaimer, margin, y);

  // Footer on every page (including the last)
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawPageFooter();
  }

  return doc.output("blob");
}

export async function buildInvoiceSavingsPdfFile(input: {
  invoiceNumber: string;
  invoiceDate: string;
  clientName?: string;
  items: InvoiceSavingsSourceItem[];
  shippingLabelItems?: InvoiceSavingsSourceItem[];
}): Promise<File | null> {
  const data = buildInvoiceSavingsReportData(input);
  if (!data) return null;
  const blob = await generateInvoiceSavingsReportPdfBlob(data);
  return new File([blob], `PSF-Value-Summary-${input.invoiceNumber}.pdf`, {
    type: "application/pdf",
  });
}

import jsPDF from "jspdf";

interface QuoteInvoiceParty {
  name: string;
  email?: string;
  phone?: string;
  addressLine?: string;
  cityStateZip?: string;
  country?: string;
}

interface QuoteInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface QuoteInvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  company: QuoteInvoiceParty;
  soldTo: QuoteInvoiceParty;
  items: QuoteInvoiceItem[];
  subtotal: number;
  salesTax: number;
  shippingCost: number;
  discount?: number;
  lateFee?: number;
  total: number;
  terms?: string;
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

export async function generateQuoteInvoicePdfBlob(data: QuoteInvoiceData): Promise<Blob> {
  if (!data.invoiceNumber || !data.invoiceDate || data.items.length === 0) {
    throw new Error("Missing required invoice data.");
  }

  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const bottomMargin = 20;
  const contentMaxY = pageHeight - bottomMargin; // keep content above footer area
  let y = margin;

  const logo = await loadLogo("/quote-logo.png");
  if (logo) {
    doc.addImage(logo, "PNG", margin, y, 28, 18);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("INVOICE", pageWidth - margin, y + 4, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Invoice #: ${data.invoiceNumber}`, pageWidth - margin, y + 12, { align: "right" });
  doc.text(`Date: ${data.invoiceDate}`, pageWidth - margin, y + 18, { align: "right" });
  if (data.dueDate) {
    doc.text(`Due Date: ${data.dueDate}`, pageWidth - margin, y + 24, { align: "right" });
    y += 32;
  } else {
    y += 26;
  }
  doc.setDrawColor(232, 193, 132);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  const sectionGap = 6;
  const colWidth = (pageWidth - margin * 2 - sectionGap) / 2;

  const boxPaddingX = 4;
  const boxPaddingY = 4;
  const lineHeight = 4.5;

  const leftLines = [
    data.company.name,
    data.company.addressLine || "",
    data.company.cityStateZip || "",
    data.company.country || "",
    data.company.phone ? `Phone: ${data.company.phone}` : "",
    data.company.email ? `Email: ${data.company.email}` : "",
  ].filter(Boolean);
  const rightLines = [
    data.soldTo.name,
    data.soldTo.addressLine || "",
    data.soldTo.cityStateZip || "",
    data.soldTo.country || "",
    data.soldTo.phone ? `Phone: ${data.soldTo.phone}` : "",
    data.soldTo.email ? `Email: ${data.soldTo.email}` : "",
  ].filter(Boolean);

  const contentLines = Math.max(leftLines.length, rightLines.length);
  const boxHeight = boxPaddingY * 2 + 5 + contentLines * lineHeight;

  doc.setDrawColor(232, 193, 132);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y - 2, colWidth, boxHeight, 2, 2);
  doc.roundedRect(margin + colWidth + sectionGap, y - 2, colWidth, boxHeight, 2, 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Company Details", margin + boxPaddingX, y + 3);
  doc.text("Sold To", margin + colWidth + sectionGap + boxPaddingX, y + 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let textY = y + 3 + lineHeight;
  for (let i = 0; i < contentLines; i += 1) {
    if (leftLines[i]) doc.text(leftLines[i], margin + boxPaddingX, textY);
    if (rightLines[i]) doc.text(rightLines[i], margin + colWidth + sectionGap + boxPaddingX, textY);
    textY += lineHeight;
  }

  y += boxHeight + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(
    "NOTE: Please make all payments to Prep Services FBA LLC. All prices are F.O.B.",
    margin,
    y
  );
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text("FOB POINT:", margin, y);
  doc.text("NEW JERSEY", margin + 32, y);
  y += 4.5;
  doc.text("TERMS:", margin, y);
  doc.text("NET", margin + 32, y);
  y += 4.5;
  doc.text("SHIPPED VIA:", margin, y);
  doc.text("Standard", margin + 32, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Item Description", margin, y);
  doc.text("Qty", margin + 92, y);
  doc.text("Unit Price", margin + 120, y);
  doc.text("Amount", pageWidth - margin, y, { align: "right" });
  y += 3;
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const descriptionWidth = 86; // mm — leave gap before Qty column (Qty starts at margin+92)
  data.items.forEach((item) => {
    if (y > contentMaxY) {
      doc.addPage();
      y = margin;
    }
    const desc = item.description || "—";
    const lines = doc.splitTextToSize(desc, descriptionWidth);
    const firstLine = lines[0] ?? "—";
    doc.text(firstLine, margin, y);
    doc.text(String(item.quantity), margin + 92, y);
    doc.text(`$${item.unitPrice.toFixed(2)}`, margin + 120, y);
    doc.text(`$${item.amount.toFixed(2)}`, pageWidth - margin, y, { align: "right" });
    y += 5;
    lines.slice(1).forEach((line: string) => {
      if (y > contentMaxY) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 5;
    });
    y += 2; // spacing before next item
  });

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text(`Subtotal: $${data.subtotal.toFixed(2)}`, pageWidth - margin, y, { align: "right" });
  y += 5;
  doc.text(`Sales Tax: $${data.salesTax.toFixed(2)}`, pageWidth - margin, y, { align: "right" });
  y += 5;
  doc.text(`Shipping: $${data.shippingCost.toFixed(2)}`, pageWidth - margin, y, { align: "right" });
  y += 5;
  if (data.discount != null && data.discount > 0) {
    doc.text(`Discount: -$${data.discount.toFixed(2)}`, pageWidth - margin, y, { align: "right" });
    y += 5;
  }
  if (data.lateFee != null && data.lateFee > 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(220, 38, 38); // Red color for late fee
    doc.text(`Late Fee: $${data.lateFee.toFixed(2)}`, pageWidth - margin, y, { align: "right" });
    doc.setTextColor(0, 0, 0); // Reset to black
    y += 5;
  }
  y += data.discount != null && data.discount > 0 ? 1 : data.lateFee != null && data.lateFee > 0 ? 1 : 6;
  doc.setFont("helvetica", "bold");
  doc.text(`Grand Total: $${data.total.toFixed(2)}`, pageWidth - margin, y, { align: "right" });

  // Add Terms & Conditions if provided (as bullet points)
  if (data.terms) {
    y += 10;
    if (y > contentMaxY) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Terms & Conditions", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const bullet = "• ";
    const termWidth = pageWidth - margin * 2;
    const rawLines = data.terms.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    rawLines.forEach((line: string) => {
      const bulletLine = bullet + line.replace(/^\d+\.\s*/, ""); // strip leading "1. " etc. if present
      const wrapped = doc.splitTextToSize(bulletLine, termWidth);
      wrapped.forEach((textLine: string) => {
        if (y > contentMaxY) {
          doc.addPage();
          y = margin;
        }
        doc.text(textLine, margin, y);
        y += 4;
      });
      y += 2; // extra space between bullets
    });
  }

  // Appreciation line at bottom of invoice
  y += 10;
  if (y > contentMaxY) {
    doc.addPage();
    y = margin;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(180, 83, 9); // amber-700
  doc.text("We appreciate the opportunity to do business with you.", pageWidth / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0);

  return doc.output("blob");
}

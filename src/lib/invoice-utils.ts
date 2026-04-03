/**
 * Shared helpers for invoice generation logic (client + server)
 */

/**
 * Generate a unique invoice number based on current timestamp.
 * Example: INV-20251121-123
 */
export function generateInvoiceNumber(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `INV-${year}${month}${day}-${Date.now().toString().slice(-3)}`;
}





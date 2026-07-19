export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "$0";
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

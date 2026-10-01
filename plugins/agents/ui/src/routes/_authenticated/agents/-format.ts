export function formatUsd(amount: string | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export function formatBalance(balance: string | null | undefined): string {
  if (balance === null || balance === undefined) return "—";
  const value = Number(balance);
  if (!Number.isFinite(value)) return balance;
  if (value !== 0 && Math.abs(value) < 0.0001) return balance;
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortenId(id: string): string {
  return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

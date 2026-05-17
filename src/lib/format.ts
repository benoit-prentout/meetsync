export function formatLastSync(lastSync: string | null, detailed = false): string {
  if (!lastSync) return 'Never';
  if (detailed) return new Date(lastSync).toLocaleString();
  const diffHrs = Math.floor((Date.now() - new Date(lastSync).getTime()) / 3_600_000);
  if (diffHrs < 1) return 'Just now';
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return new Date(lastSync).toLocaleDateString();
}

export function isPathExcluded(filePath: string, excludePatterns: string[]): boolean {
  if (excludePatterns.length === 0) return false;
  for (const pattern of excludePatterns) {
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      if (filePath.startsWith(`${prefix}/`) || filePath === prefix) return true;
    } else if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      const slashIdx = filePath.indexOf("/", prefix.length + 1);
      if (filePath.startsWith(`${prefix}/`) && slashIdx === -1) return true;
    } else if (filePath === pattern || filePath.startsWith(`${pattern}/`)) {
      return true;
    }
  }
  return false;
}

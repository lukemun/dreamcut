export function renderBrowserOptions(env?: Record<string, string | undefined>): { channel: string; executablePath?: never } | { executablePath: string; channel?: never };

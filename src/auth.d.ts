export {};
declare global {
    interface Window {
        GameLoginReady: Promise<{ id: string; email?: string }>;
        GameAccount: { user: { id: string } | null; key(key: string): string };
        GameAuth: { getClient(): any; getDisplayName(user: unknown): string };
    }
}

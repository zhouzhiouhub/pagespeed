declare global {
  interface CloudflareEnv {
    WEBAGENT_KV?: {
      get(key: string): Promise<string | null>;
      put(key: string, value: string): Promise<void>;
    };
  }
}

export {};

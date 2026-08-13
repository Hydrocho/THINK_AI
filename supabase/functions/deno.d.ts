// Deno global type declarations for VS Code editor support
declare namespace Deno {
  export const env: {
    get(key: string): string | undefined;
  };
}

declare module "https://*" {
  export const serve: (handler: (req: Request) => Promise<Response> | Response) => void;
  export const createClient: any;
  export class SupabaseClient {}
}

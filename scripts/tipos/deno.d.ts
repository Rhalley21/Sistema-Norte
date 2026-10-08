// Declarações mínimas só pra o TypeScript conseguir CONFERIR as Edge Functions fora do Deno
// (elas usam o objeto global `Deno` e importam de URLs). Não vão pro Supabase.
declare const Deno: { env: { get(nome: string): string | undefined } };

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(manipulador: (req: Request) => Response | Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createClient(url: string, chave: string, opcoes?: any): any;
}

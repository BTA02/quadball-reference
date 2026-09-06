/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Release-time switch for the Leaders Only stats mode. See src/lib/leadersOnly.ts. */
  readonly VITE_LEADERS_ONLY?: string;
  /** Release tag baked in at build time (set by the deploy workflow). */
  readonly VITE_APP_VERSION?: string;
  /** Short commit SHA baked in at build time (set by the deploy workflow). */
  readonly VITE_APP_COMMIT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

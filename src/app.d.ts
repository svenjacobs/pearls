/// <reference types="vite-plugin-pwa/info" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  const __APP_VERSION__: string

  namespace App {
    // interface Error {}
    // interface Locals {}
    interface PageData {
      vapidPublicKey?: string | null
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {}

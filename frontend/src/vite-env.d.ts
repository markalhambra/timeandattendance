/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_OFFICE_LAT: string;
  readonly VITE_OFFICE_LNG: string;
  readonly VITE_OFFICE_RADIUS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

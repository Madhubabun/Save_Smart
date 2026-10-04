/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'server' to use the SaveSmart server and its licensed price feed; otherwise prices are checked on the device. */
  readonly VITE_PRICE_SOURCE?: string;
  readonly VITE_ROUTER?: 'hash' | 'browser';
  readonly VITE_INSTALLABLE?: 'yes' | 'no';
}

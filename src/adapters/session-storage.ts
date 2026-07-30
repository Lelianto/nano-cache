import { WebStorageAdapter, WebStorageAdapterOptions } from './local-storage';

export function sessionStorageAdapter(options?: WebStorageAdapterOptions): WebStorageAdapter {
  return new WebStorageAdapter(options, 'sessionStorage');
}

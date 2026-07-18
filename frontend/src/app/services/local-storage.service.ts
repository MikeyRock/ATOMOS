import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LocalStorageService {

  private get(key: string): string | null {
    return localStorage.getItem(key);
  }

  private set(key: string, value: string) {
    localStorage.setItem(key, value);
  }

  private remove(key: string): void {
    localStorage.removeItem(key);
  }

}

import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { AppConfigService } from './app-config.service';

export interface IAtomosSettings {
    discordWebhookUrl: string | null;
    webhookFormat: string;
    btcAddress: string | null;
    alertBlockFound: boolean;
    alertBestDifficulty: boolean;
    alertRestart: boolean;
    hasWebhookConfigured: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class SettingsService {

    constructor(
        private httpClient: HttpClient,
        private appConfig: AppConfigService
    ) { }

    public getSettings(): Observable<IAtomosSettings> {
        return this.httpClient.get(`${this.appConfig.apiUrl}/api/settings`) as Observable<IAtomosSettings>;
    }

    public updateSettings(partial: Partial<IAtomosSettings>): Observable<IAtomosSettings> {
        return this.httpClient.patch(`${this.appConfig.apiUrl}/api/settings`, partial) as Observable<IAtomosSettings>;
    }

    public testWebhook(): Observable<{ success: boolean; error?: string }> {
        return this.httpClient.post(`${this.appConfig.apiUrl}/api/settings/test-webhook`, {}) as Observable<{ success: boolean; error?: string }>;
    }
}

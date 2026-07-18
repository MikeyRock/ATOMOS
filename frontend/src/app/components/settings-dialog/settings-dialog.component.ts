import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MessageService } from 'primeng/api';

import { IAtomosSettings, SettingsService } from '../../services/settings.service';

@Component({
    selector: 'app-settings-dialog',
    templateUrl: './settings-dialog.component.html'
})
export class SettingsDialogComponent {

    @Input() visible = false;
    @Output() visibleChange = new EventEmitter<boolean>();

    public settings: IAtomosSettings = {
        discordWebhookUrl: '',
        webhookFormat: 'discord',
        btcAddress: '',
        alertBlockFound: true,
        alertBestDifficulty: true,
        alertRestart: true,
        hasWebhookConfigured: false
    };

    public isSaving = false;
    public isTesting = false;

    constructor(
        private settingsService: SettingsService,
        private messageService: MessageService
    ) { }

    public onShow() {
        this.settingsService.getSettings().subscribe(settings => {
            this.settings = {
                ...settings,
                // Don't show a previously-saved webhook URL in full - mask it,
                // same reasoning as the backend not echoing it back verbatim.
                // An empty field means "leave the saved one unchanged" on save.
                discordWebhookUrl: ''
            };
        });
    }

    public save() {
        this.isSaving = true;

        // Only send the webhook URL field if the user actually typed something -
        // an empty field means "don't touch the saved value".
        const payload: Partial<IAtomosSettings> = {
            webhookFormat: this.settings.webhookFormat,
            btcAddress: this.settings.btcAddress,
            alertBlockFound: this.settings.alertBlockFound,
            alertBestDifficulty: this.settings.alertBestDifficulty,
            alertRestart: this.settings.alertRestart
        };

        if (this.settings.discordWebhookUrl != null && this.settings.discordWebhookUrl.length > 0) {
            payload.discordWebhookUrl = this.settings.discordWebhookUrl;
        }

        this.settingsService.updateSettings(payload).subscribe({
            next: () => {
                this.isSaving = false;
                this.messageService.add({ severity: 'success', summary: 'Saved', detail: 'Settings updated.' });
                this.close();
            },
            error: () => {
                this.isSaving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not save settings.' });
            }
        });
    }

    public testWebhook() {
        this.isTesting = true;
        this.settingsService.testWebhook().subscribe({
            next: (result) => {
                this.isTesting = false;
                if (result.success) {
                    this.messageService.add({ severity: 'success', summary: 'Test sent', detail: 'Check your Discord channel for the test message.' });
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Test failed', detail: result.error || 'Unknown error.' });
                }
            },
            error: () => {
                this.isTesting = false;
                this.messageService.add({ severity: 'error', summary: 'Test failed', detail: 'Could not reach the server.' });
            }
        });
    }

    public close() {
        this.visible = false;
        this.visibleChange.emit(false);
    }
}

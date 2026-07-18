import { Body, Controller, Get, Patch, Post } from '@nestjs/common';

import { AtomosSettingsService } from '../../ORM/atomos-settings/atomos-settings.service';
import { WebhookService } from '../../services/webhook.service';

@Controller('settings')
export class SettingsController {

    constructor(
        private readonly settingsService: AtomosSettingsService,
        private readonly webhookService: WebhookService
    ) { }

    @Get()
    public async getSettings() {
        const settings = await this.settingsService.getSettings();

        // Never echo the raw webhook URL back in full - it's effectively a
        // secret. The UI shows a masked placeholder and only sends a new
        // value when the user actually changes it.
        return {
            discordWebhookUrl: settings.discordWebhookUrl,
            webhookFormat: settings.webhookFormat,
            btcAddress: settings.btcAddress,
            alertBlockFound: settings.alertBlockFound,
            alertBestDifficulty: settings.alertBestDifficulty,
            alertRestart: settings.alertRestart,
            hasWebhookConfigured: settings.discordWebhookUrl != null && settings.discordWebhookUrl.length > 0
        };
    }

    @Patch()
    public async updateSettings(@Body() body: {
        discordWebhookUrl?: string;
        webhookFormat?: string;
        btcAddress?: string;
        alertBlockFound?: boolean;
        alertBestDifficulty?: boolean;
        alertRestart?: boolean;
    }) {
        const updated = await this.settingsService.updateSettings(body);
        return {
            discordWebhookUrl: updated.discordWebhookUrl,
            webhookFormat: updated.webhookFormat,
            btcAddress: updated.btcAddress,
            alertBlockFound: updated.alertBlockFound,
            alertBestDifficulty: updated.alertBestDifficulty,
            alertRestart: updated.alertRestart,
            hasWebhookConfigured: updated.discordWebhookUrl != null && updated.discordWebhookUrl.length > 0
        };
    }

    @Post('test-webhook')
    public async testWebhook() {
        return await this.webhookService.sendTestMessage();
    }
}

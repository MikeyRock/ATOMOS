import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Block } from 'bitcoinjs-lib';

import { AtomosSettingsService } from '../ORM/atomos-settings/atomos-settings.service';

/**
 * Generic webhook notifier.
 *
 * Unlike DiscordService (full bot + guild/channel IDs) or TelegramService
 * (bot token + polling), this just POSTs a JSON payload to a single URL.
 * That means it works out of the box with:
 *   - Discord webhook URLs (Server Settings > Integrations > Webhooks)
 *   - Slack incoming webhooks
 *   - ntfy.sh topics (great for a phone push notification with zero setup)
 *   - your own n8n / Home Assistant / whatever automation endpoint
 *
 * Configuration lives in the database (editable from Settings in the UI),
 * with WEBHOOK_URL / WEBHOOK_FORMAT env vars used only as the initial
 * fallback if nothing has been saved yet (e.g. right after a fresh install).
 */
@Injectable()
export class WebhookService {

    constructor(
        private readonly configService: ConfigService,
        private readonly settingsService: AtomosSettingsService
    ) { }

    private async getActiveConfig(): Promise<{ url: string | null; format: string; alerts: { blockFound: boolean; bestDifficulty: boolean; restart: boolean; } }> {
        const settings = await this.settingsService.getSettings();

        const url = settings.discordWebhookUrl
            ?? this.configService.get('WEBHOOK_URL')
            ?? null;

        const format = settings.webhookFormat
            ?? this.configService.get('WEBHOOK_FORMAT')
            ?? 'discord';

        return {
            url: (url == null || url.length < 1) ? null : url,
            format: format.toLowerCase(),
            alerts: {
                blockFound: settings.alertBlockFound,
                bestDifficulty: settings.alertBestDifficulty,
                restart: settings.alertRestart
            }
        };
    }

    public async notifyRestarted() {
        const config = await this.getActiveConfig();
        if (!config.alerts.restart) return;
        await this.send('🔄 Solo pool server restarted.', config.url, config.format);
    }

    public async notifySubscribersBlockFound(address: string, height: number, block: Block, message: string) {
        const config = await this.getActiveConfig();
        if (!config.alerts.blockFound) return;
        const text = `⛏️ BLOCK FOUND!\nAddress: ${address}\nHeight: ${height}\nResult: ${message}`;
        await this.send(text, config.url, config.format);
    }

    public async notifyNewBestDifficulty(address: string, difficulty: number) {
        const config = await this.getActiveConfig();
        if (!config.alerts.bestDifficulty) return;
        const text = `📈 New best difficulty for ${address}: ${difficulty.toLocaleString()}`;
        await this.send(text, config.url, config.format);
    }

    // Called directly from the Settings UI's "Test Webhook" button - bypasses
    // alert toggles entirely, since a manual test should always fire.
    public async sendTestMessage(): Promise<{ success: boolean; error?: string }> {
        const config = await this.getActiveConfig();
        if (config.url == null) {
            return { success: false, error: 'No webhook URL configured.' };
        }
        try {
            const payload = this.buildPayload('✅ ATOMOS test alert - if you can see this, your webhook is working.', config.format);
            await axios.post(config.url, payload, { timeout: 10000 });
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    private async send(text: string, url: string | null, format: string) {
        if (url == null) {
            return;
        }

        try {
            const payload = this.buildPayload(text, format);
            await axios.post(url, payload, { timeout: 10000 });
        } catch (e) {
            console.error('Webhook notify failed', e.message);
        }
    }

    private buildPayload(text: string, format: string): any {
        switch (format) {
            case 'discord':
                return { content: text };
            case 'slack':
                return { text };
            case 'ntfy':
                return text;
            default:
                return { message: text };
        }
    }
}

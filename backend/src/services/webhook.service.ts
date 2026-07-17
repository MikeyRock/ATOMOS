import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Block } from 'bitcoinjs-lib';

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
 * Configure with a single env var: WEBHOOK_URL
 * Optional: WEBHOOK_FORMAT = "discord" | "slack" | "ntfy" | "json" (default "json")
 */
@Injectable()
export class WebhookService {

    private url: string | null;
    private format: string;

    constructor(private readonly configService: ConfigService) {
        this.url = this.configService.get('WEBHOOK_URL') ?? null;
        this.format = (this.configService.get('WEBHOOK_FORMAT') ?? 'json').toLowerCase();

        if (this.url == null || this.url.length < 1) {
            this.url = null;
            return;
        }
        console.log(`Webhook notifier init (format=${this.format})`);
    }

    public async notifyRestarted() {
        await this.send('🔄 Solo pool server restarted.');
    }

    public async notifySubscribersBlockFound(address: string, height: number, block: Block, message: string) {
        const text = `⛏️ BLOCK FOUND!\nAddress: ${address}\nHeight: ${height}\nResult: ${message}`;
        await this.send(text);
    }

    // Optional extra hook: fire on a new best-ever share difficulty for a client.
    // Wire this in from stratum-v1-jobs.service.ts wherever it tracks best difficulty,
    // if you want "getting closer" alerts, not just full block-found alerts.
    public async notifyNewBestDifficulty(address: string, difficulty: number) {
        const text = `📈 New best difficulty for ${address}: ${difficulty.toLocaleString()}`;
        await this.send(text);
    }

    private async send(text: string) {
        if (this.url == null) {
            return;
        }

        try {
            const payload = this.buildPayload(text);
            await axios.post(this.url, payload, { timeout: 10000 });
        } catch (e) {
            console.error('Webhook notify failed', e.message);
        }
    }

    private buildPayload(text: string): any {
        switch (this.format) {
            case 'discord':
                return { content: text };
            case 'slack':
                return { text };
            case 'ntfy':
                // ntfy.sh accepts the raw body as the message text
                return text;
            default:
                return { message: text };
        }
    }
}

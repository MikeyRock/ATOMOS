import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Block } from 'bitcoinjs-lib';

import { AtomosSettingsService } from '../ORM/atomos-settings/atomos-settings.service';

interface IAlertContent {
    emoji: string;
    title: string;
    // Each line is a [label, value] pair, rendered as "**label:** value"
    // in Discord/Slack and "label: value" in plain-text formats.
    lines: [string, string][];
    color: number;
}

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

    // Same convention as the frontend's numberSuffix pipe (k/M/G/T/...),
    // so a difficulty of 1,636,415 shows as "1.64M" instead of a long
    // raw number - matches how Braiins and similar solo mining alerts format values.
    public static formatSuffix(value: number): string {
        const suffixes = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y', 'R', 'Q'];

        if (value == null || value < 0) {
            return '0';
        }
        if (value === 0) {
            return '0';
        }

        let power = Math.floor(Math.log10(value) / 3);
        if (power < 0) {
            power = 0;
        }
        const scaledValue = value / Math.pow(1000, power);
        const suffix = suffixes[power] ?? '';

        return scaledValue.toFixed(2) + suffix;
    }

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
        await this.send({
            emoji: '🔄',
            title: 'ATOMOS server restarted',
            lines: [],
            color: 0x00e5ff
        }, config.url, config.format);
    }

    public async notifySubscribersBlockFound(address: string, worker: string, height: number, block: Block, message: string) {
        const config = await this.getActiveConfig();
        if (!config.alerts.blockFound) return;
        await this.send({
            emoji: '⛏️',
            title: 'BLOCK FOUND!',
            lines: [
                ['Worker', worker || 'unknown'],
                ['Height', height.toLocaleString()],
                ['Result', message]
            ],
            color: 0xff2d8a
        }, config.url, config.format);
    }

    public async notifyNewBestDifficulty(address: string, worker: string, difficulty: number) {
        const config = await this.getActiveConfig();
        if (!config.alerts.bestDifficulty) return;
        await this.send({
            emoji: '🎯',
            title: `${worker || 'Worker'} — New Personal Best!`,
            lines: [
                ['Best difficulty', WebhookService.formatSuffix(difficulty)]
            ],
            color: 0x00e5b0
        }, config.url, config.format);
    }

    // Called directly from the Settings UI's "Test Webhook" button - bypasses
    // alert toggles entirely, since a manual test should always fire.
    public async sendTestMessage(): Promise<{ success: boolean; error?: string }> {
        const config = await this.getActiveConfig();
        if (config.url == null) {
            return { success: false, error: 'No webhook URL configured.' };
        }
        try {
            const payload = this.buildPayload({
                emoji: '✅',
                title: 'ATOMOS test alert',
                lines: [['Status', 'If you can see this, your webhook is working.']],
                color: 0x00e5ff
            }, config.format);
            await axios.post(config.url, payload, { timeout: 10000 });
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    private async send(content: IAlertContent, url: string | null, format: string) {
        if (url == null) {
            return;
        }

        try {
            const payload = this.buildPayload(content, format);
            await axios.post(url, payload, { timeout: 10000 });
        } catch (e) {
            console.error('Webhook notify failed', e.message);
        }
    }

    private buildPayload(content: IAlertContent, format: string): any {
        switch (format) {
            case 'discord':
                return {
                    embeds: [{
                        title: `${content.emoji} ${content.title}`,
                        description: content.lines.map(([label, value]) => `**${label}:** ${value}`).join('\n'),
                        color: content.color,
                        footer: { text: 'ATOMOS Solo Mining' },
                        timestamp: new Date().toISOString()
                    }]
                };
            case 'slack':
                return {
                    text: `*${content.emoji} ${content.title}*\n` + content.lines.map(([label, value]) => `*${label}:* ${value}`).join('\n')
                };
            case 'ntfy':
                // ntfy.sh accepts a plain text body as the message
                return `${content.emoji} ${content.title}\n` + content.lines.map(([label, value]) => `${label}: ${value}`).join('\n');
            default:
                return {
                    title: `${content.emoji} ${content.title}`,
                    fields: Object.fromEntries(content.lines)
                };
        }
    }
}

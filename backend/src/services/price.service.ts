import { Injectable } from '@nestjs/common';
import axios from 'axios';

export interface IBtcPrice {
    usd: number;
    usd_24h_change: number;
    updatedAt: number;
}

/**
 * Fetches BTC/USD price from CoinGecko's free public API.
 * Cached in-memory for 60s so the dashboard can poll frequently without
 * hitting CoinGecko's rate limit (their free tier allows ~10-30 calls/min).
 */
@Injectable()
export class PriceService {

    private cached: IBtcPrice | null = null;
    private lastFetch = 0;
    private readonly CACHE_MS = 60 * 1000;

    public async getBtcPrice(): Promise<IBtcPrice> {
        const now = Date.now();

        if (this.cached != null && (now - this.lastFetch) < this.CACHE_MS) {
            return this.cached;
        }

        try {
            const response = await axios.get(
                'https://api.coingecko.com/api/v3/simple/price',
                {
                    params: {
                        ids: 'bitcoin',
                        vs_currencies: 'usd',
                        include_24hr_change: true
                    },
                    timeout: 8000
                }
            );

            const data = response.data?.bitcoin;
            if (data == null) {
                throw new Error('Unexpected CoinGecko response shape');
            }

            this.cached = {
                usd: data.usd,
                usd_24h_change: data.usd_24h_change,
                updatedAt: now
            };
            this.lastFetch = now;

            return this.cached;

        } catch (e) {
            console.error('Failed to fetch BTC price', e.message);

            // Serve stale cache rather than nothing, if we have it
            if (this.cached != null) {
                return this.cached;
            }

            throw e;
        }
    }
}

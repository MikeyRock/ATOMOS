import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Table } from 'primeng/table';
import { BehaviorSubject, combineLatest, forkJoin, interval, map, Observable, shareReplay, startWith, switchMap } from 'rxjs';

import { HashSuffixPipe } from '../../pipes/hash-suffix.pipe';
import { AppService } from '../../services/app.service';
import { ClientService } from '../../services/client.service';
import { AverageTimeToBlockPipe } from 'src/app/pipes/average-time-to-block.pipe';



@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements AfterViewInit {

  public address: string;

  public clientInfo$: Observable<any>;
  public clientInfoByPayoutMode$: Observable<{ pplns: any; solo: any; }>;
  public chartData$: Observable<any>;

  public chartOptions: any;

  public networkInfo$: Observable<any>;
  private networkInfo:any;

  public btcPrice$: Observable<{ usd: number; usd_24h_change: number; updatedAt: number; }>;
  public halvingInfo$: Observable<{ currentHeight: number; nextHalvingHeight: number; blocksRemaining: number; estimatedDaysRemaining: number; }>;

  public chartRangeHours$ = new BehaviorSubject<number>(24);

  public setChartRange(hours: number) {
    this.chartRangeHours$.next(hours);
  }

  @ViewChild('dataTable') dataTable!: Table;

  public expandedRows$: Observable<any>;



  constructor(
    private clientService: ClientService,
    private route: ActivatedRoute,
    private appService: AppService
  ) {

    // Auto-refresh every 10s so the dashboard stays live without a manual reload
    const refreshTick$ = interval(10 * 1000).pipe(startWith(0));

    this.networkInfo$ = refreshTick$.pipe(
      switchMap(() => this.appService.getNetworkInfo()),
      shareReplay({ refCount: true, bufferSize: 1 })
    );

    // Refresh every 60s to match the backend's price cache window
    this.btcPrice$ = interval(60 * 1000).pipe(
      startWith(0),
      switchMap(() => this.appService.getBtcPrice()),
      shareReplay({ refCount: true, bufferSize: 1 })
    );

    // Halving moves slowly (~every 10 min per block); refresh every 5 min is plenty
    this.halvingInfo$ = interval(5 * 60 * 1000).pipe(
      startWith(0),
      switchMap(() => this.appService.getHalvingInfo()),
      shareReplay({ refCount: true, bufferSize: 1 })
    );

    this.address = this.route.snapshot.params['address'];
    this.clientInfo$ = refreshTick$.pipe(
      switchMap(() => this.clientService.getClientInfo(this.address)),
      shareReplay({ refCount: true, bufferSize: 1 })
    );
    this.clientInfoByPayoutMode$ = refreshTick$.pipe(
      switchMap(() => forkJoin({
        pplns: this.clientService.getClientInfo(this.address, 'pplns'),
        solo: this.clientService.getClientInfo(this.address, 'solo')
      })),
      shareReplay({ refCount: true, bufferSize: 1 })
    );

    this.expandedRows$ = this.clientInfo$.pipe(map((info: any) => {

      return info.workers.reduce((pre: any, cur: any) => { pre[cur.name] = true; return pre; }, {});

    }));

    const documentStyle = getComputedStyle(document.documentElement);
    const textColor = documentStyle.getPropertyValue('--text-color');
    const textColorSecondary = documentStyle.getPropertyValue('--text-color-secondary');
    const surfaceBorder = documentStyle.getPropertyValue('--surface-border');
    const primaryColor = documentStyle.getPropertyValue('--primary-color');
    const soloColor = documentStyle.getPropertyValue('--yellow-600') || '#d97706';


    this.chartData$ = combineLatest([
      refreshTick$.pipe(switchMap(() => this.clientService.getClientInfoChartByPayoutMode(this.address, 'all'))),
      this.networkInfo$,
      this.chartRangeHours$
    ]).pipe(
      map(([chartData, networkInfo, rangeHours]) => {

        this.networkInfo = networkInfo;

        const cutoff = Date.now() - (rangeHours * 60 * 60 * 1000);
        const rangedChartData = chartData.filter((point: any) => Number(point.label) >= cutoff);

        const datasets = this.toPayoutModeDatasets(rangedChartData, {
          pplns: {
            label: 'PPLNS 10 Minute',
            borderColor: primaryColor,
            backgroundColor: (context: any) => this.getChartGradient(context, primaryColor)
          },
          solo: {
            label: 'Solo 10 Minute',
            borderColor: soloColor,
            backgroundColor: (context: any) => this.getChartGradient(context, soloColor)
          }
        });

        return {
          labels: rangedChartData.map((d: any) => d.label),
          datasets
        }
      })
    );



    this.chartOptions = {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: textColor
          }
        },
        tooltip: {
          callbacks: {
            label: (context: any) => this.getTooltipLabel(context),
            afterLabel: (context: any) => this.getTooltipDetails(context)
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'hour', // Set the unit to 'minute'
          },
          ticks: {
            color: textColorSecondary
          },
          grid: {
            color: surfaceBorder,
            drawBorder: false,
            display: true
          }
        },
        yPplns: {
          position: 'left',
          title: {
            display: true,
            text: 'PPLNS',
            color: primaryColor
          },
          ticks: {
            color: primaryColor,
            callback: (value: number) => {
              return HashSuffixPipe.transform(value);
            }
          },
          grid: {
            color: surfaceBorder,
            drawBorder: false
          },
          beginAtZero: true
        },
        ySolo: {
          position: 'right',
          title: {
            display: true,
            text: 'Solo',
            color: soloColor
          },
          ticks: {
            color: soloColor,
            callback: (value: number) => {
              return HashSuffixPipe.transform(value);
            }
          },
          grid: {
            color: surfaceBorder,
            drawBorder: false,
            drawOnChartArea: false
          },
          beginAtZero: true
        }
      }
    };

  }



  ngAfterViewInit() {

  }

  public getSessionCount(name: string, workers: any[]) {
    const workersByName = workers.filter(w => w.name == name);
    return workersByName.length;
  }

  public getTotalHashRate(name: string, workers: any[]) {
    const workersByName = workers.filter(w => w.name == name);
    const sum = workersByName.reduce((pre, cur, idx, arr) => {
      return pre += Math.floor(cur.hashRate);
    }, 0);
    return Math.floor(sum);
  }

  public getBestDifficulty(name: string, workers: any[]) {
    const workersByName = workers.filter(w => w.name == name);
    const best = workersByName.reduce((pre, cur, idx, arr) => {
      if (cur.bestDifficulty > pre) {
        return cur.bestDifficulty;
      }
      return pre;
    }, 0);

    return best;
  }

  public getTotalUptime(name: string, workers: any[]) {
    const now = new Date().getTime();
    const workersByName = workers.filter(w => w.name == name);
    const sum = workersByName.reduce((pre, cur, idx, arr) => {
      return pre += now - new Date(cur.startTime).getTime();
    }, 0);
    return new Date(now - sum);
  }

  public getTotalHashRateAll(workers: any[]): number {
    if (workers == null) return 0;
    return workers.reduce((sum, w) => sum + Math.floor(w.hashRate || 0), 0);
  }

  public getYourNetworkSharePercent(yourHashRate: number, networkInfo: any): number {
    if (networkInfo == null || networkInfo.networkhashps == null || yourHashRate <= 0) {
      return 0;
    }
    return (yourHashRate / networkInfo.networkhashps) * 100;
  }

  public getMostRecentLastSeen(workers: any[]): Date | null {
    if (workers == null || workers.length === 0) return null;
    return workers.reduce((latest: Date | null, w: any) => {
      const seen = new Date(w.lastSeen);
      return (latest == null || seen > latest) ? seen : latest;
    }, null);
  }

  // Visual-only progress bar: how close the best submitted difficulty is to
  // a full block (network difficulty). Capped at 100% for display purposes -
  // in practice this ratio is astronomically small for a home miner.
  public getWarmingProgressPercent(bestDifficulty: number, networkInfo: any): number {
    if (networkInfo == null || networkInfo.difficulty == null || bestDifficulty <= 0) {
      return 0;
    }
    return Math.min(100, (bestDifficulty / networkInfo.difficulty) * 100);
  }

  private toChartPoint(point: any) {
    return {
      y: Number(point.data),
      x: point.label,
      creditedWork: point.shares,
      payoutMode: point.payoutMode
    };
  }

  private toPayoutModeDatasets(chartData: any[], modes: Record<string, { label: string; borderColor: string; backgroundColor: any; }>) {
    return Object.entries(modes)
      .map(([mode, config]) => {
        const rows = chartData.filter(point => point.payoutMode === mode);

        return {
          type: 'line',
          label: config.label,
          data: rows.map((d: any) => this.toChartPoint(d)),
          yAxisID: mode === 'solo' ? 'ySolo' : 'yPplns',
          fill: true,
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
          tension: .4,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2
        };
      })
      .filter(dataset => dataset.data.length > 0);
  }

  public getWorkerPayoutModes(name: string, workers: any[]): string[] {
    const modes = workers
      .filter(worker => worker.name === name)
      .map(worker => worker.payoutMode)
      .filter(mode => mode != null);
    return [...new Set(modes)];
  }

  public formatPayoutMode(mode: string | null | undefined): string {
    return mode === 'pplns' ? 'PPLNS' : 'Solo';
  }

  public getPayoutModeClass(mode: string | null | undefined): string {
    return mode === 'pplns' ? 'mode-badge mode-badge-pplns' : 'mode-badge mode-badge-solo';
  }

  private getTooltipLabel(context: any) {
    return `${context.dataset.label}: ${HashSuffixPipe.transform(context.parsed.y)}`;
  }

  private getTooltipDetails(context: any) {
    const raw = context.raw || {};
    const lines = [];
    if (raw.creditedWork !== undefined) {
      lines.push(`Credited work: ${Number(raw.creditedWork).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
    }

    if (this.networkInfo?.difficulty && context.parsed.y > 0) {
      lines.push(`Average time to block: ${AverageTimeToBlockPipe.transform(context.parsed.y, this.networkInfo.difficulty)}`);
    }

    return lines;
  }

  private getChartGradient(context: any, color: string) {
    const chart = context.chart;
    const chartArea = chart.chartArea;

    if (chartArea == null) {
      return this.toRgba(color, 0.2);
    }

    const gradient = chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, this.toRgba(color, 0.32));
    gradient.addColorStop(0.65, this.toRgba(color, 0.09));
    gradient.addColorStop(1, this.toRgba(color, 0));
    return gradient;
  }

  private toRgba(color: string, alpha: number): string {
    const trimmed = color.trim();
    const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex != null) {
      const value = hex[1].length === 3
        ? hex[1].split('').map(part => part + part).join('')
        : hex[1];
      const red = parseInt(value.slice(0, 2), 16);
      const green = parseInt(value.slice(2, 4), 16);
      const blue = parseInt(value.slice(4, 6), 16);
      return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }

    const rgb = trimmed.match(/^rgba?\(([^)]+)\)$/i);
    if (rgb != null) {
      const parts = rgb[1].split(',').map(part => part.trim()).slice(0, 3);
      return `rgba(${parts.join(', ')}, ${alpha})`;
    }

    return trimmed || `rgba(99, 102, 241, ${alpha})`;
  }
}

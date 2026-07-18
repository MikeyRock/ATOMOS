import 'chartjs-adapter-moment';

import { CommonModule, HashLocationStrategy, LocationStrategy } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { PrimeNGModule } from '../prime-ng.module';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { SplashComponent } from './components/splash/splash.component';
import { UserAgentLinkComponent } from './components/user-agent-link/user-agent-link.component';
import { WorkerGroupComponent } from './components/worker-group/worker-group.component';
import { WorkerComponent } from './components/worker/worker.component';
import { AppLayoutModule } from './layout/app.layout.module';
import { DateAgoPipe } from './pipes/date-ago.pipe';
import { HashSuffixPipe } from './pipes/hash-suffix.pipe';
import { NumberSuffixPipe } from './pipes/number-suffix.pipe';
import { AverageTimeToBlockPipe } from './pipes/average-time-to-block.pipe';



@NgModule({
  declarations: [
    AppComponent,
    SplashComponent,
    DashboardComponent,
    WorkerComponent,
    NumberSuffixPipe,
    DateAgoPipe,
    WorkerGroupComponent,
    HashSuffixPipe,
    UserAgentLinkComponent
  ],
  imports: [
    CommonModule,
    BrowserModule,
    AppRoutingModule,
    PrimeNGModule,
    AppLayoutModule,
    FormsModule,
    ReactiveFormsModule,
    AverageTimeToBlockPipe
  ],
  providers: [
    { provide: LocationStrategy, useClass: HashLocationStrategy },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

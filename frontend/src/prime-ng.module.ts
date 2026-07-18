import { NgModule } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';

export const primeNgServices = [
    MessageService,
    ConfirmationService
]

const primeNgModules = [
    TableModule,
    ChartModule,
    InputSwitchModule,
    ButtonModule,
    TooltipModule,
    SkeletonModule,
    DialogModule,
    CheckboxModule,
    InputTextModule,
    ToastModule
    // DropdownModule,
    // CardModule,
    // StepsModule,
    // DividerModule,
    // ProgressSpinnerModule,
    // DynamicDialogModule,
    // FieldsetModule,
    // InputTextareaModule,

    // InputNumberModule,
    // ConfirmDialogModule,
    // TabViewModule,
    // MenuModule,
    // OverlayPanelModule,
    // DataViewModule,

    // TagModule,
    // StyleClassModule,
    // PanelModule,
    // SelectButtonModule,

];


@NgModule({
    providers: [
        ...primeNgServices
    ],
    imports: [
        ...primeNgModules
    ],
    exports: [
        ...primeNgModules
    ],
})
export class PrimeNGModule { }
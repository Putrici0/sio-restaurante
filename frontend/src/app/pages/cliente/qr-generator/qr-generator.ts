import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QRCodeComponent } from 'angularx-qrcode';

@Component({
  selector: 'app-qr-generator',
  standalone: true,
  imports: [FormsModule, QRCodeComponent],
  templateUrl: './qr-generator.html',
  styleUrls: ['./qr-generator.css'],
})
export class QrGenerator {

  tableNumber = signal(1);


  private readonly fallbackIp = '88.25.36.222';

  get baseUrl(): string {
    const { protocol, hostname, port } = window.location;


    const host = hostname === 'localhost' ? this.fallbackIp : hostname;

    return `${protocol}//${host}${port ? ':' + port : ''}`;
  }

  get qrUrl(): string {
    return `${this.baseUrl}/acceso/${this.tableNumber()}`;
  }
}

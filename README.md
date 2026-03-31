# PrestamoApp - Sistema de Control de Prestamos

Aplicacion web para el control y gestion de prestamos a terceros con calculo automatico de intereses, seguimiento de mora mes a mes y notificaciones por WhatsApp.

## Funcionalidades

- **Dashboard** con estadisticas en tiempo real (capital, intereses, mora)
- **Gestion de clientes** (crear, editar, eliminar)
- **Registro de prestamos** con interes adelantado descontado
- **Sistema de pagos**: interes mensual, pago libre, abono a capital, pago total
- **Calculo de mora** mes a mes con timeline visual
- **Notificaciones WhatsApp** para cobros y recordatorios
- **Descarga PDF** de respaldo con todos los datos
- **Login** con usuario y contrasena
- **Firebase Realtime Database** para persistencia en la nube
- **Modo offline** con fallback a localStorage

## Tecnologias

- HTML5 / CSS3 / JavaScript (vanilla)
- Firebase Realtime Database
- jsPDF + jspdf-autotable (generacion de PDF)
- Font Awesome (iconos)
- WhatsApp Web API (wa.me links)

## Configuracion

1. Clonar el repositorio
2. Configurar las credenciales de Firebase en `js/firebase-config.js`
3. Abrir `index.html` en un navegador o desplegar en GitHub Pages

## Credenciales por defecto

- **Usuario:** fredy
- **Password:** fredy2024

## Autor

Fredy - Sistema de prestamos personales

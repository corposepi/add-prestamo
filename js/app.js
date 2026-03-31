// ============================================
// APP - Logica principal de la aplicacion
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingStatus = document.getElementById('loading-status');

    try {
        loadingStatus.textContent = 'Conectando con Firebase...';
        const connected = await FirebaseSync.init();

        if (connected) {
            loadingStatus.textContent = 'Datos cargados correctamente';
        } else {
            loadingStatus.textContent = 'Modo offline - usando datos locales';
        }
    } catch (err) {
        console.error('Error inicializando:', err);
        loadingStatus.textContent = 'Error de conexion - modo offline';
    }

    // Ocultar loading y mostrar login
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
        setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500);
        App.initLogin();
    }, 800);
});

const App = {
    // ==========================================
    // AUTENTICACION
    // ==========================================
    // Usuario y contraseña por defecto (se puede cambiar)
    CREDENTIALS: {
        usuario: 'fredy',
        password: 'fredy2024'
    },

    initLogin() {
        // Verificar si ya hay sesion activa
        if (sessionStorage.getItem('prestamo_sesion') === 'activa') {
            this.mostrarApp();
            return;
        }

        // Mostrar login
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';

        document.getElementById('form-login').addEventListener('submit', (e) => {
            e.preventDefault();
            this.intentarLogin();
        });
    },

    intentarLogin() {
        const usuario = document.getElementById('login-usuario').value.trim().toLowerCase();
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');

        // Verificar credenciales
        const credGuardadas = JSON.parse(localStorage.getItem('prestamo_credenciales') || 'null');
        const creds = credGuardadas || this.CREDENTIALS;

        if (usuario === creds.usuario.toLowerCase() && password === creds.password) {
            errorDiv.style.display = 'none';
            sessionStorage.setItem('prestamo_sesion', 'activa');
            this.mostrarApp();
        } else {
            errorDiv.style.display = 'flex';
            document.getElementById('login-password').value = '';
            document.getElementById('login-password').focus();
        }
    },

    mostrarApp() {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        this.init();
    },

    cerrarSesion() {
        sessionStorage.removeItem('prestamo_sesion');
        document.getElementById('app-container').style.display = 'none';
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('form-login').reset();
        document.getElementById('login-error').style.display = 'none';
    },

    init() {
        this.setupNavigation();
        this.setupForms();
        this.setupFilters();
        this.refreshAll();
    },

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    },

    // ==========================================
    // NAVEGACION
    // ==========================================
    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section;
                // Activar nav item
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                // Mostrar seccion
                document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
                document.getElementById(section).classList.add('active');
                // Cerrar sidebar en movil
                if (window.innerWidth <= 768) this.toggleSidebar();
                // Refrescar datos de la seccion
                this.refreshAll();
            });
        });
    },

    // ==========================================
    // FORMULARIOS
    // ==========================================
    setupForms() {
        // Form Cliente
        document.getElementById('form-cliente').addEventListener('submit', (e) => {
            e.preventDefault();
            this.guardarCliente();
        });

        // Form Prestamo
        document.getElementById('form-prestamo').addEventListener('submit', (e) => {
            e.preventDefault();
            this.guardarPrestamo();
        });

        // Calcular resumen prestamo en tiempo real
        ['prestamo-monto', 'prestamo-tasa'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.calcularResumenPrestamo());
        });

        // Form Pago
        document.getElementById('form-pago').addEventListener('submit', (e) => {
            e.preventDefault();
            this.guardarPago();
        });

        // Seleccion de prestamo para pago
        document.getElementById('pago-prestamo').addEventListener('change', () => this.mostrarInfoPago());

        // Tipo de pago
        document.getElementById('pago-tipo').addEventListener('change', () => this.calcularResumenPago());
        document.getElementById('pago-monto-abono').addEventListener('input', () => this.calcularResumenPago());
        document.getElementById('pago-monto-libre').addEventListener('input', () => this.calcularResumenPago());

        // Form Extender
        document.getElementById('form-extender').addEventListener('submit', (e) => {
            e.preventDefault();
            this.extenderPlazo();
        });

        // Setear fecha de hoy como default
        document.getElementById('prestamo-fecha').value = Utils.hoy();
        document.getElementById('pago-fecha').value = Utils.hoy();
    },

    setupFilters() {
        document.getElementById('historial-cliente').addEventListener('change', () => this.renderHistorial());
        document.getElementById('historial-prestamo').addEventListener('change', () => this.renderHistorial());
    },

    // ==========================================
    // REFRESCAR VISTAS
    // ==========================================
    refreshAll() {
        this.renderDashboard();
        this.renderAlertasWhatsApp();
        this.renderClientes();
        this.renderSelectClientes();
        this.renderSelectPrestamos();
        this.renderHistorial();
    },

    // ==========================================
    // DASHBOARD
    // ==========================================
    renderDashboard() {
        const stats = DB.getEstadisticas();
        document.getElementById('total-clientes').textContent = stats.clientesActivos;
        document.getElementById('total-prestamos').textContent = stats.prestamosActivos;
        document.getElementById('total-capital').textContent = Utils.formatMoney(stats.totalCapital);
        document.getElementById('total-intereses').textContent = Utils.formatMoney(stats.totalIntereses);
        document.getElementById('total-mora').textContent = Utils.formatMoney(stats.totalMora);

        // Tabla prestamos activos con info de mora
        const activos = DB.getPrestamosActivos();
        const tbody = document.querySelector('#tabla-prestamos-activos tbody');

        if (activos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><i class="fas fa-folder-open"></i><p>No hay prestamos activos</p></div></td></tr>`;
            document.getElementById('seccion-detalle-mora').innerHTML = '';
            return;
        }

        tbody.innerHTML = activos.map(p => {
            const cliente = DB.getClienteById(p.clienteId);
            const interesMensual = p.saldoCapital * (p.tasaInteres / 100);
            const diasRestantes = Utils.diasEntre(Utils.hoy(), p.fechaVencimiento);
            const resumenMora = DB.getResumenMora(p.id);

            let estadoClass = 'badge-active';
            let estadoText = 'Al dia';
            if (resumenMora.mesesMora > 0) {
                estadoClass = 'badge-overdue';
                estadoText = 'En Mora';
            } else if (diasRestantes <= 15 && diasRestantes > 0) {
                estadoClass = 'badge-extended';
                estadoText = 'Por vencer';
            }
            if (diasRestantes < 0 && resumenMora.mesesMora === 0) {
                estadoClass = 'badge-extended';
                estadoText = 'Vencido';
            }

            return `<tr>
                <td><strong>${cliente ? cliente.nombre : 'N/A'}</strong></td>
                <td>${Utils.formatMoney(p.montoCapital)}</td>
                <td><strong>${Utils.formatMoney(p.saldoCapital)}</strong></td>
                <td>${p.tasaInteres}%</td>
                <td>${Utils.formatMoney(interesMensual)}</td>
                <td style="color:${resumenMora.mesesMora > 0 ? '#dc2626' : '#16a34a'};font-weight:700">${resumenMora.mesesMora > 0 ? resumenMora.mesesMora + ' mes(es)' : 'Ninguno'}</td>
                <td style="color:${resumenMora.totalInteresMora > 0 ? '#dc2626' : '#16a34a'};font-weight:700">${Utils.formatMoney(resumenMora.totalInteresMora)}</td>
                <td style="font-weight:700">${Utils.formatMoney(resumenMora.deudaTotal)}</td>
                <td>${Utils.formatDate(p.fechaVencimiento)}</td>
                <td><span class="badge ${estadoClass}">${estadoText}</span></td>
            </tr>`;
        }).join('');

        // Tabla vencimientos proximos
        const vencimientos = activos
            .map(p => {
                const cliente = DB.getClienteById(p.clienteId);
                const diasRestantes = Utils.diasEntre(Utils.hoy(), p.fechaVencimiento);
                return { ...p, clienteNombre: cliente ? cliente.nombre : 'N/A', diasRestantes };
            })
            .sort((a, b) => a.diasRestantes - b.diasRestantes);

        const tbodyVenc = document.querySelector('#tabla-vencimientos tbody');
        if (vencimientos.length === 0) {
            tbodyVenc.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>No hay vencimientos proximos</p></div></td></tr>`;
        } else {
            tbodyVenc.innerHTML = vencimientos.map(p => {
                let color = 'var(--success)';
                if (p.diasRestantes < 0) color = 'var(--danger)';
                else if (p.diasRestantes <= 15) color = 'var(--warning)';

                return `<tr>
                    <td><strong>${p.clienteNombre}</strong></td>
                    <td>${Utils.formatMoney(p.saldoCapital)}</td>
                    <td>${Utils.formatDate(p.fechaVencimiento)}</td>
                    <td style="color:${color};font-weight:600">${p.diasRestantes < 0 ? 'Vencido hace ' + Math.abs(p.diasRestantes) + ' dias' : p.diasRestantes + ' dias'}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="App.irAPago('${p.id}')"><i class="fas fa-money-bill"></i> Pagar</button>
                        <button class="btn btn-sm btn-warning" onclick="App.irAExtender('${p.id}')"><i class="fas fa-calendar-plus"></i> Extender</button>
                    </td>
                </tr>`;
            }).join('');
        }

        // Detalle de mora mes a mes por cada prestamo
        this.renderDetalleMora(activos);
    },

    renderDetalleMora(activos) {
        const container = document.getElementById('seccion-detalle-mora');

        const cards = activos.map(p => {
            const cliente = DB.getClienteById(p.clienteId);
            const resumen = DB.getResumenMora(p.id);
            const tieneMora = resumen.mesesMora > 0;
            const cardClass = tieneMora ? 'mora-detail-card' : 'mora-detail-card sin-mora';

            let cuotasHTML = '';
            if (resumen.cuotas.length > 0) {
                cuotasHTML = resumen.cuotas.map(c => {
                    const iconos = {
                        mora: '<i class="fas fa-times-circle" style="color:#dc2626"></i> NO PAGO',
                        pagado: '<i class="fas fa-check-circle" style="color:#16a34a"></i> PAGADO',
                        pendiente: '<i class="fas fa-clock" style="color:#64748b"></i> PENDIENTE'
                    };
                    return `<div class="cuota-item ${c.estado}">
                        <div class="cuota-mes">${c.mes}</div>
                        <div class="cuota-monto">${Utils.formatMoney(c.interesMes)}</div>
                        <div class="cuota-estado">${iconos[c.estado]}</div>
                    </div>`;
                }).join('');
            } else {
                cuotasHTML = '<p style="color:var(--text-light);font-size:13px;">Primer mes de interes descontado por adelantado. Aun no hay cuotas vencidas.</p>';
            }

            return `<div class="${cardClass}">
                <div class="mora-detail-header">
                    <h3>
                        <i class="fas fa-${tieneMora ? 'exclamation-triangle' : 'check-circle'}" style="color:${tieneMora ? '#dc2626' : '#16a34a'}"></i>
                        ${cliente ? cliente.nombre : 'N/A'} - Prestamo ${Utils.formatMoney(p.montoCapital)}
                    </h3>
                    <div class="mora-resumen-badges">
                        ${tieneMora ? `<span class="badge-mora">${resumen.mesesMora} mes(es) en mora</span>` : '<span class="badge-ok">Al dia</span>'}
                        <span class="badge-ok">${resumen.mesesPagados} pagado(s)</span>
                    </div>
                </div>
                <div class="cuotas-timeline">
                    ${cuotasHTML}
                </div>
                <div class="mora-total-bar ${tieneMora ? '' : 'sin-mora-bar'}">
                    <div class="mora-total-item">
                        <span>Saldo Capital</span>
                        <strong>${Utils.formatMoney(p.saldoCapital)}</strong>
                    </div>
                    <div class="mora-total-item ${tieneMora ? 'texto-mora' : 'texto-ok'}">
                        <span>Intereses en Mora</span>
                        <strong>${Utils.formatMoney(resumen.totalInteresMora)}</strong>
                    </div>
                    <div class="mora-total-item texto-ok">
                        <span>Intereses Pagados</span>
                        <strong>${Utils.formatMoney(resumen.totalInteresPagado)}</strong>
                    </div>
                    <div class="mora-total-item ${tieneMora ? 'texto-mora' : ''}">
                        <span>Deuda Total (Capital + Mora)</span>
                        <strong style="font-size:20px">${Utils.formatMoney(resumen.deudaTotal)}</strong>
                    </div>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = activos.length > 0 ? `<div class="card" style="background:transparent;box-shadow:none;padding:0;">
            <h2 style="margin-bottom:16px;"><i class="fas fa-calendar-check"></i> Detalle de Pagos Mes a Mes</h2>
            ${cards}
        </div>` : '';
    },

    // ==========================================
    // GENERAR PDF DE RESPALDO
    // ==========================================
    descargarPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const hoy = new Date();
        const fechaStr = hoy.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: '2-digit' });
        const horaStr = hoy.toLocaleTimeString('es-CO');

        // --- ENCABEZADO ---
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, 297, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('PrestamoApp - Reporte de Respaldo', 14, 14);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Prestamista: Fredy | Fecha: ${fechaStr} | Hora: ${horaStr}`, 14, 22);

        let y = 36;

        // --- RESUMEN GENERAL ---
        const stats = DB.getEstadisticas();
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Resumen General', 14, y);
        y += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Clientes Activos: ${stats.clientesActivos}`, 14, y);
        doc.text(`Prestamos Activos: ${stats.prestamosActivos}`, 90, y);
        doc.text(`Capital Prestado: ${Utils.formatMoney(stats.totalCapital)}`, 170, y);
        y += 6;
        doc.text(`Intereses Generados: ${Utils.formatMoney(stats.totalIntereses)}`, 14, y);
        doc.setTextColor(220, 38, 38);
        doc.setFont('helvetica', 'bold');
        doc.text(`Intereses en Mora: ${Utils.formatMoney(stats.totalMora)}`, 120, y);
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'normal');
        y += 10;

        // --- TABLA DE CLIENTES ---
        const clientes = DB.getClientes();
        if (clientes.length > 0) {
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Clientes Registrados', 14, y);
            y += 2;

            doc.autoTable({
                startY: y,
                head: [['Nombre', 'Cedula', 'Telefono', 'Direccion', 'Correo']],
                body: clientes.map(c => [
                    c.nombre, c.cedula, c.telefono, c.direccion || '-', c.email || '-'
                ]),
                theme: 'grid',
                headStyles: { fillColor: [37, 99, 235], fontSize: 9 },
                bodyStyles: { fontSize: 8 },
                margin: { left: 14, right: 14 }
            });
            y = doc.lastAutoTable.finalY + 12;
        }

        // --- TABLA DE PRESTAMOS ---
        const prestamos = DB.getPrestamos();
        if (prestamos.length > 0) {
            if (y > 160) { doc.addPage('landscape'); y = 20; }

            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text('Todos los Prestamos', 14, y);
            y += 2;

            doc.autoTable({
                startY: y,
                head: [['Cliente', 'Capital', 'Saldo Capital', 'Tasa %', 'Int. Mensual', 'Meses Mora', 'Deuda Int. Mora', 'Deuda Total', 'Vencimiento', 'Estado']],
                body: prestamos.map(p => {
                    const cliente = DB.getClienteById(p.clienteId);
                    const interes = p.saldoCapital * (p.tasaInteres / 100);
                    const resumenMora = p.estado === 'activo' ? DB.getResumenMora(p.id) : { mesesMora: 0, totalInteresMora: 0, deudaTotal: 0 };
                    let estado = p.estado === 'pagado' ? 'PAGADO' : (resumenMora.mesesMora > 0 ? 'EN MORA' : 'AL DIA');
                    return [
                        cliente ? cliente.nombre : 'N/A',
                        Utils.formatMoney(p.montoCapital),
                        Utils.formatMoney(p.saldoCapital),
                        p.tasaInteres + '%',
                        Utils.formatMoney(interes),
                        resumenMora.mesesMora > 0 ? resumenMora.mesesMora + ' mes(es)' : '-',
                        resumenMora.totalInteresMora > 0 ? Utils.formatMoney(resumenMora.totalInteresMora) : '-',
                        p.estado === 'activo' ? Utils.formatMoney(resumenMora.deudaTotal) : '-',
                        Utils.formatDate(p.fechaVencimiento),
                        estado
                    ];
                }),
                theme: 'grid',
                headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
                bodyStyles: { fontSize: 7 },
                margin: { left: 14, right: 14 },
                didParseCell(data) {
                    if (data.column.index === 9 && data.section === 'body') {
                        if (data.cell.raw === 'EN MORA') {
                            data.cell.styles.textColor = [220, 38, 38];
                            data.cell.styles.fontStyle = 'bold';
                        } else if (data.cell.raw === 'PAGADO') {
                            data.cell.styles.textColor = [16, 185, 129];
                            data.cell.styles.fontStyle = 'bold';
                        } else {
                            data.cell.styles.textColor = [37, 99, 235];
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                    // Columnas de mora en rojo
                    if ((data.column.index === 5 || data.column.index === 6) && data.section === 'body') {
                        if (data.cell.raw !== '-') {
                            data.cell.styles.textColor = [220, 38, 38];
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                }
            });
            y = doc.lastAutoTable.finalY + 12;
        }

        // --- DETALLE DE MORA MES A MES ---
        const activosConMora = DB.getPrestamosActivos();
        if (activosConMora.length > 0) {
            activosConMora.forEach(p => {
                const cliente = DB.getClienteById(p.clienteId);
                const resumen = DB.getResumenMora(p.id);
                if (resumen.cuotas.length === 0) return;

                if (y > 150) { doc.addPage('landscape'); y = 20; }

                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(30, 41, 59);
                const moraLabel = resumen.mesesMora > 0 ? ` [${resumen.mesesMora} MES(ES) EN MORA]` : ' [AL DIA]';
                doc.text(`Detalle Cuotas: ${cliente ? cliente.nombre : 'N/A'} - ${Utils.formatMoney(p.montoCapital)}${moraLabel}`, 14, y);
                y += 2;

                doc.autoTable({
                    startY: y,
                    head: [['#', 'Mes', 'Saldo Capital', 'Interes del Mes', 'Estado']],
                    body: resumen.cuotas.map(c => [
                        c.numero,
                        c.mes.charAt(0).toUpperCase() + c.mes.slice(1),
                        Utils.formatMoney(c.saldoCapital),
                        Utils.formatMoney(c.interesMes),
                        c.estado === 'mora' ? 'NO PAGO - MORA' : c.estado === 'pagado' ? 'PAGADO' : 'PENDIENTE'
                    ]),
                    theme: 'grid',
                    headStyles: { fillColor: [100, 116, 139], fontSize: 8 },
                    bodyStyles: { fontSize: 8 },
                    margin: { left: 14, right: 14 },
                    didParseCell(data) {
                        if (data.column.index === 4 && data.section === 'body') {
                            if (data.cell.raw.includes('MORA')) {
                                data.cell.styles.textColor = [220, 38, 38];
                                data.cell.styles.fontStyle = 'bold';
                                data.cell.styles.fillColor = [254, 242, 242];
                            } else if (data.cell.raw === 'PAGADO') {
                                data.cell.styles.textColor = [22, 163, 74];
                                data.cell.styles.fontStyle = 'bold';
                                data.cell.styles.fillColor = [240, 253, 244];
                            }
                        }
                    }
                });
                y = doc.lastAutoTable.finalY + 4;

                // Resumen debajo de la tabla
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                if (resumen.mesesMora > 0) {
                    doc.setTextColor(220, 38, 38);
                    doc.text(`Intereses en Mora: ${Utils.formatMoney(resumen.totalInteresMora)} | Deuda Total (Capital + Mora): ${Utils.formatMoney(resumen.deudaTotal)}`, 14, y + 4);
                } else {
                    doc.setTextColor(22, 163, 74);
                    doc.text(`Sin mora. Intereses pagados: ${Utils.formatMoney(resumen.totalInteresPagado)}`, 14, y + 4);
                }
                doc.setTextColor(30, 41, 59);
                y += 14;
            });
        }

        // --- HISTORIAL DE MOVIMIENTOS POR PRESTAMO ---
        const prestamosConMov = prestamos.filter(p => {
            const movs = DB.getMovimientosPorPrestamo(p.id);
            return movs.length > 0;
        });

        if (prestamosConMov.length > 0) {
            prestamosConMov.forEach(p => {
                const cliente = DB.getClienteById(p.clienteId);
                const movimientos = DB.getMovimientosPorPrestamo(p.id)
                    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

                if (y > 150) { doc.addPage('landscape'); y = 20; }

                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(30, 41, 59);
                doc.text(`Movimientos: ${cliente ? cliente.nombre : 'N/A'} - Capital: ${Utils.formatMoney(p.montoCapital)} (${p.estado.toUpperCase()})`, 14, y);
                y += 2;

                const tipoLabels = {
                    'desembolso': 'Desembolso',
                    'pago_interes': 'Pago Interes',
                    'pago_libre': 'Pago Libre',
                    'abono_capital': 'Abono Capital',
                    'pago_total': 'Pago Total',
                    'extension': 'Extension Plazo'
                };

                doc.autoTable({
                    startY: y,
                    head: [['Fecha', 'Tipo', 'Interes', 'Capital', 'Saldo Capital', 'Detalle']],
                    body: movimientos.map(m => [
                        Utils.formatDate(m.fecha),
                        tipoLabels[m.tipo] || m.tipo,
                        m.interesPagado ? Utils.formatMoney(m.interesPagado) : (m.interesDescontado ? Utils.formatMoney(m.interesDescontado) : '-'),
                        m.capitalMovimiento ? Utils.formatMoney(m.capitalMovimiento) : '-',
                        Utils.formatMoney(m.saldoCapital),
                        (m.notas || '-').substring(0, 60)
                    ]),
                    theme: 'grid',
                    headStyles: { fillColor: [100, 116, 139], fontSize: 8 },
                    bodyStyles: { fontSize: 7 },
                    margin: { left: 14, right: 14 },
                    columnStyles: { 5: { cellWidth: 70 } }
                });
                y = doc.lastAutoTable.finalY + 12;
            });
        }

        // --- PIE DE PAGINA EN TODAS LAS PAGINAS ---
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(
                `PrestamoApp - Respaldo generado el ${fechaStr} a las ${horaStr} - Pagina ${i} de ${totalPages}`,
                148, 200, { align: 'center' }
            );
        }

        // --- DESCARGAR ---
        const nombreArchivo = `Respaldo_Prestamos_${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}.pdf`;
        doc.save(nombreArchivo);
        Utils.showToast('PDF de respaldo descargado exitosamente');
    },

    // ==========================================
    // PDF PAZ Y SALVO
    // ==========================================
    generarPazYSalvo(prestamoId) {
        const prestamo = DB.getPrestamoById(prestamoId);
        if (!prestamo) return;
        const cliente = DB.getClienteById(prestamo.clienteId);
        const movimientos = DB.getMovimientosPorPrestamo(prestamoId)
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        const totalInteresesPagados = movimientos
            .filter(m => m.interesPagado > 0)
            .reduce((sum, m) => sum + m.interesPagado, 0)
            + (prestamo.interesAdelantado || 0);

        const totalCapitalPagado = movimientos
            .filter(m => m.capitalMovimiento > 0 && m.tipo !== 'desembolso')
            .reduce((sum, m) => sum + m.capitalMovimiento, 0);

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('portrait');
        const hoy = new Date();
        const fechaStr = hoy.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: '2-digit' });
        const horaStr = hoy.toLocaleTimeString('es-CO');

        // --- ENCABEZADO ---
        doc.setFillColor(22, 163, 74);
        doc.rect(0, 0, 210, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('CERTIFICADO DE PAZ Y SALVO', 105, 18, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text('PrestamoApp - Sistema de Control de Prestamos', 105, 28, { align: 'center' });
        doc.text(`Fecha de expedicion: ${fechaStr}`, 105, 35, { align: 'center' });

        let y = 55;

        // --- CUERPO ---
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');

        const texto1 = `El prestamista FREDY certifica que el(la) senor(a):`;
        doc.text(texto1, 20, y);
        y += 12;

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text((cliente ? cliente.nombre : 'N/A').toUpperCase(), 105, y, { align: 'center' });
        y += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Cedula/Documento: ${cliente ? cliente.cedula : 'N/A'}`, 105, y, { align: 'center' });
        y += 15;

        doc.setFontSize(12);
        const texto2 = `Se encuentra a PAZ Y SALVO por concepto del prestamo otorgado bajo las siguientes condiciones:`;
        doc.text(texto2, 20, y, { maxWidth: 170 });
        y += 16;

        // --- DETALLE DEL PRESTAMO ---
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(20, y, 170, 60, 3, 3, 'F');
        doc.setDrawColor(22, 163, 74);
        doc.roundedRect(20, y, 170, 60, 3, 3, 'S');
        y += 10;

        doc.setFontSize(11);
        const detalles = [
            ['Capital del prestamo:', Utils.formatMoney(prestamo.montoCapital)],
            ['Tasa de interes mensual:', prestamo.tasaInteres + '%'],
            ['Fecha del prestamo:', Utils.formatDate(prestamo.fechaPrestamo)],
            ['Fecha de pago total:', Utils.formatDate(prestamo.fechaPago || Utils.hoy())],
            ['Total intereses pagados:', Utils.formatMoney(totalInteresesPagados)],
            ['Total capital pagado:', Utils.formatMoney(totalCapitalPagado)]
        ];

        detalles.forEach(([label, valor]) => {
            doc.setFont('helvetica', 'normal');
            doc.text(label, 30, y);
            doc.setFont('helvetica', 'bold');
            doc.text(valor, 130, y);
            y += 8;
        });

        y += 12;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        const texto3 = `Por lo anterior, se certifica que no existe obligacion pendiente alguna derivada de este prestamo y que el(la) deudor(a) ha cumplido satisfactoriamente con todas las condiciones pactadas.`;
        doc.text(texto3, 20, y, { maxWidth: 170 });
        y += 25;

        const texto4 = `Este certificado se expide a solicitud del interesado a los ${hoy.getDate()} dias del mes de ${hoy.toLocaleDateString('es-CO', { month: 'long' })} de ${hoy.getFullYear()}.`;
        doc.text(texto4, 20, y, { maxWidth: 170 });
        y += 30;

        // --- FIRMA ---
        doc.setDrawColor(30, 41, 59);
        doc.line(40, y, 170, y);
        y += 6;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('FREDY', 105, y, { align: 'center' });
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Prestamista', 105, y, { align: 'center' });

        // --- PIE ---
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`PrestamoApp - Paz y Salvo generado el ${fechaStr} a las ${horaStr}`, 105, 285, { align: 'center' });

        const nombreArchivo = `Paz_y_Salvo_${(cliente ? cliente.nombre : 'cliente').replace(/\s+/g, '_')}_${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}.pdf`;
        doc.save(nombreArchivo);
        Utils.showToast('Paz y Salvo descargado exitosamente');
    },

    // ==========================================
    // PDF ESTADO DE CUENTA POR CLIENTE
    // ==========================================
    generarEstadoCuentaPDF(clienteId) {
        const cliente = DB.getClienteById(clienteId);
        if (!cliente) return;

        const prestamos = DB.getPrestamosPorCliente(clienteId);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        const hoy = new Date();
        const fechaStr = hoy.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: '2-digit' });
        const horaStr = hoy.toLocaleTimeString('es-CO');

        // --- ENCABEZADO ---
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, 297, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('ESTADO DE CUENTA', 14, 14);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Prestamista: Fredy | Fecha: ${fechaStr} | Hora: ${horaStr}`, 14, 22);

        let y = 36;

        // --- DATOS DEL CLIENTE ---
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Datos del Cliente', 14, y);
        y += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Nombre: ${cliente.nombre}`, 14, y);
        doc.text(`Cedula: ${cliente.cedula}`, 120, y);
        doc.text(`Telefono: ${cliente.telefono}`, 200, y);
        y += 6;
        if (cliente.direccion) doc.text(`Direccion: ${cliente.direccion}`, 14, y);
        if (cliente.email) doc.text(`Correo: ${cliente.email}`, 150, y);
        y += 10;

        // --- RESUMEN GENERAL DEL CLIENTE ---
        const activos = prestamos.filter(p => p.estado === 'activo');
        const pagados = prestamos.filter(p => p.estado === 'pagado');
        const totalCapitalActivo = activos.reduce((s, p) => s + p.saldoCapital, 0);
        let totalMoraCliente = 0;
        activos.forEach(p => {
            const r = DB.getResumenMora(p.id);
            totalMoraCliente += r.totalInteresMora;
        });

        const todosMovimientos = DB.getMovimientosPorCliente(clienteId);
        const totalInteresesPagados = todosMovimientos
            .filter(m => m.interesPagado > 0)
            .reduce((s, m) => s + m.interesPagado, 0)
            + prestamos.reduce((s, p) => s + (p.interesAdelantado || 0), 0);

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Resumen General', 14, y);
        y += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Prestamos activos: ${activos.length}`, 14, y);
        doc.text(`Prestamos pagados: ${pagados.length}`, 80, y);
        doc.text(`Capital activo: ${Utils.formatMoney(totalCapitalActivo)}`, 150, y);
        y += 6;
        doc.text(`Total intereses pagados: ${Utils.formatMoney(totalInteresesPagados)}`, 14, y);
        if (totalMoraCliente > 0) {
            doc.setTextColor(220, 38, 38);
            doc.setFont('helvetica', 'bold');
            doc.text(`Intereses en mora: ${Utils.formatMoney(totalMoraCliente)}`, 150, y);
            doc.setTextColor(30, 41, 59);
            doc.setFont('helvetica', 'normal');
        }
        y += 10;

        // --- DETALLE POR CADA PRESTAMO ---
        prestamos.forEach((p, idx) => {
            if (y > 155) { doc.addPage('landscape'); y = 20; }

            const resumenMora = p.estado === 'activo' ? DB.getResumenMora(p.id) : { mesesMora: 0, totalInteresMora: 0, deudaTotal: 0, cuotas: [], totalInteresPagado: 0 };
            const interesMensual = p.saldoCapital * (p.tasaInteres / 100);
            const estadoTexto = p.estado === 'pagado' ? 'PAGADO' : (resumenMora.mesesMora > 0 ? 'EN MORA' : 'AL DIA');

            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text(`Prestamo #${idx + 1} - ${Utils.formatMoney(p.montoCapital)} [${estadoTexto}]`, 14, y);
            y += 2;

            // Info del prestamo
            doc.autoTable({
                startY: y,
                head: [['Capital', 'Saldo Capital', 'Tasa', 'Int. Mensual', 'Fecha Prestamo', 'Vencimiento', 'Saldo a Favor', 'Estado']],
                body: [[
                    Utils.formatMoney(p.montoCapital),
                    Utils.formatMoney(p.saldoCapital),
                    p.tasaInteres + '%',
                    Utils.formatMoney(interesMensual),
                    Utils.formatDate(p.fechaPrestamo),
                    Utils.formatDate(p.fechaVencimiento),
                    Utils.formatMoney(p.saldoFavor || 0),
                    estadoTexto
                ]],
                theme: 'grid',
                headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
                bodyStyles: { fontSize: 8 },
                margin: { left: 14, right: 14 },
                didParseCell(data) {
                    if (data.column.index === 7 && data.section === 'body') {
                        if (data.cell.raw === 'EN MORA') { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = 'bold'; }
                        else if (data.cell.raw === 'PAGADO') { data.cell.styles.textColor = [22, 163, 74]; data.cell.styles.fontStyle = 'bold'; }
                        else { data.cell.styles.textColor = [37, 99, 235]; data.cell.styles.fontStyle = 'bold'; }
                    }
                }
            });
            y = doc.lastAutoTable.finalY + 4;

            // Cuotas mes a mes (solo activos)
            if (p.estado === 'activo' && resumenMora.cuotas.length > 0) {
                doc.autoTable({
                    startY: y,
                    head: [['#', 'Mes', 'Saldo Capital', 'Interes del Mes', 'Estado']],
                    body: resumenMora.cuotas.map(c => [
                        c.numero,
                        c.mes.charAt(0).toUpperCase() + c.mes.slice(1),
                        Utils.formatMoney(c.saldoCapital),
                        Utils.formatMoney(c.interesMes),
                        c.estado === 'mora' ? 'NO PAGO - MORA' : c.estado === 'pagado' ? 'PAGADO' : 'PENDIENTE'
                    ]),
                    theme: 'grid',
                    headStyles: { fillColor: [100, 116, 139], fontSize: 8 },
                    bodyStyles: { fontSize: 8 },
                    margin: { left: 14, right: 14 },
                    didParseCell(data) {
                        if (data.column.index === 4 && data.section === 'body') {
                            if (data.cell.raw.includes('MORA')) {
                                data.cell.styles.textColor = [220, 38, 38];
                                data.cell.styles.fontStyle = 'bold';
                                data.cell.styles.fillColor = [254, 242, 242];
                            } else if (data.cell.raw === 'PAGADO') {
                                data.cell.styles.textColor = [22, 163, 74];
                                data.cell.styles.fontStyle = 'bold';
                                data.cell.styles.fillColor = [240, 253, 244];
                            }
                        }
                    }
                });
                y = doc.lastAutoTable.finalY + 4;

                // Resumen mora
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                if (resumenMora.mesesMora > 0) {
                    doc.setTextColor(220, 38, 38);
                    doc.text(`Intereses en Mora: ${Utils.formatMoney(resumenMora.totalInteresMora)} | Deuda Total: ${Utils.formatMoney(resumenMora.deudaTotal)}`, 14, y + 2);
                } else {
                    doc.setTextColor(22, 163, 74);
                    doc.text(`Sin mora. Intereses pagados: ${Utils.formatMoney(resumenMora.totalInteresPagado)}`, 14, y + 2);
                }
                doc.setTextColor(30, 41, 59);
                y += 10;
            }

            // Historial de movimientos del prestamo
            const movimientos = DB.getMovimientosPorPrestamo(p.id)
                .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

            if (movimientos.length > 0) {
                if (y > 155) { doc.addPage('landscape'); y = 20; }

                const tipoLabels = {
                    'desembolso': 'Desembolso', 'pago_interes': 'Pago Interes', 'pago_libre': 'Pago Libre',
                    'abono_capital': 'Abono Capital', 'pago_total': 'Pago Total', 'extension': 'Extension'
                };

                doc.autoTable({
                    startY: y,
                    head: [['Fecha', 'Tipo', 'Interes', 'Capital', 'Saldo Capital', 'Detalle']],
                    body: movimientos.map(m => [
                        Utils.formatDate(m.fecha),
                        tipoLabels[m.tipo] || m.tipo,
                        m.interesPagado ? Utils.formatMoney(m.interesPagado) : (m.interesDescontado ? Utils.formatMoney(m.interesDescontado) : '-'),
                        m.capitalMovimiento ? Utils.formatMoney(m.capitalMovimiento) : '-',
                        Utils.formatMoney(m.saldoCapital),
                        (m.notas || '-').substring(0, 55)
                    ]),
                    theme: 'grid',
                    headStyles: { fillColor: [100, 116, 139], fontSize: 8 },
                    bodyStyles: { fontSize: 7 },
                    margin: { left: 14, right: 14 },
                    columnStyles: { 5: { cellWidth: 65 } }
                });
                y = doc.lastAutoTable.finalY + 12;
            }
        });

        // --- PIE DE PAGINA ---
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(
                `Estado de Cuenta: ${cliente.nombre} - Generado el ${fechaStr} a las ${horaStr} - Pagina ${i} de ${totalPages}`,
                148, 200, { align: 'center' }
            );
        }

        const nombreArchivo = `Estado_Cuenta_${cliente.nombre.replace(/\s+/g, '_')}_${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}.pdf`;
        doc.save(nombreArchivo);
        Utils.showToast('Estado de cuenta descargado exitosamente');
    },

    // ==========================================
    // ALERTAS WHATSAPP
    // ==========================================
    renderAlertasWhatsApp() {
        const alertas = DB.getAlertasPendientes();
        const panel = document.getElementById('panel-alertas');
        const lista = document.getElementById('lista-alertas');

        if (alertas.length === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';
        lista.innerHTML = alertas.map(a => {
            let icono, titulo, badgeClass, detalleLine;

            if (a.tipo === 'mora_intereses') {
                icono = 'fas fa-exclamation-circle';
                titulo = `${a.mesesMora} MES(ES) DE INTERES EN MORA`;
                badgeClass = 'badge-overdue';
                detalleLine = `Mora: ${Utils.formatMoney(a.totalInteresMora)} | Capital: ${Utils.formatMoney(a.saldoCapital)} | Deuda Total: ${Utils.formatMoney(a.deudaTotal)}`;
            } else if (a.tipo === 'pre_vencimiento') {
                icono = 'fas fa-clock';
                titulo = `Capital vence en ${a.diasRestantes} dia${a.diasRestantes > 1 ? 's' : ''}`;
                badgeClass = 'badge-extended';
                detalleLine = `Capital: ${Utils.formatMoney(a.saldoCapital)} | Interes: ${Utils.formatMoney(a.interesMensual)} | Vence: ${Utils.formatDate(a.fechaVencimiento)}`;
            } else { // capital_vencido
                icono = 'fas fa-exclamation-triangle';
                titulo = `Capital vencido hace ${a.diasMora} dias`;
                badgeClass = 'badge-overdue';
                detalleLine = `Capital: ${Utils.formatMoney(a.saldoCapital)} | Interes: ${Utils.formatMoney(a.interesMensual)} | Vencio: ${Utils.formatDate(a.fechaVencimiento)}`;
            }

            const mensaje = this.generarMensajeWhatsApp(a);
            const whatsappUrl = this.generarUrlWhatsApp(a.telefono, mensaje);

            return `<div class="alerta-item">
                <div class="alerta-info">
                    <div class="alerta-icon"><i class="${icono}"></i></div>
                    <div class="alerta-detalle">
                        <strong>${a.clienteNombre}</strong>
                        <span class="badge ${badgeClass}">${titulo}</span>
                        <p>${detalleLine}</p>
                    </div>
                </div>
                <div class="alerta-acciones">
                    <a href="${whatsappUrl}" target="_blank" class="btn btn-sm btn-whatsapp"
                       onclick="App.marcarNotificado('${a.prestamoId}', '${a.tipo}')">
                        <i class="fab fa-whatsapp"></i> Enviar WhatsApp
                    </a>
                </div>
            </div>`;
        }).join('');
    },

    generarMensajeWhatsApp(alerta) {
        const saludo = `Hola ${alerta.clienteNombre}, le saluda Fredy.`;

        if (alerta.tipo === 'mora_intereses') {
            // Detalle de meses en mora
            const mesesDetalle = alerta.cuotasMora
                ? alerta.cuotasMora.map(c => `- ${c.mes}: ${Utils.formatMoney(c.interesMes)}`).join('\n')
                : '';

            return `${saludo}\n\nLe informo que su prestamo tiene ${alerta.mesesMora} mes(es) de interes SIN PAGAR:\n\n${mesesDetalle}\n\nTotal intereses en mora: ${Utils.formatMoney(alerta.totalInteresMora)}\nSaldo capital: ${Utils.formatMoney(alerta.saldoCapital)}\nDeuda total: ${Utils.formatMoney(alerta.deudaTotal)}\n${alerta.diasMora > 0 ? `\nAdemas el capital vencio hace ${alerta.diasMora} dias (${Utils.formatDate(alerta.fechaVencimiento)}).\n` : `\nEl capital vence el ${Utils.formatDate(alerta.fechaVencimiento)}.\n`}\nPor favor comuniquese conmigo lo antes posible para ponerse al dia. Quedo atento. Gracias.`;
        } else if (alerta.tipo === 'pre_vencimiento') {
            return `${saludo}\n\nLe recuerdo que su prestamo vence el ${Utils.formatDate(alerta.fechaVencimiento)} (faltan ${alerta.diasRestantes} dia${alerta.diasRestantes > 1 ? 's' : ''}).\n\nSaldo capital: ${Utils.formatMoney(alerta.saldoCapital)}\nInteres mensual: ${Utils.formatMoney(alerta.interesMensual)}\n\nPor favor realice el pago correspondiente antes de la fecha de vencimiento. Quedo atento. Gracias.`;
        } else { // capital_vencido
            return `${saludo}\n\nLe informo que su prestamo vencio el ${Utils.formatDate(alerta.fechaVencimiento)} (hace ${alerta.diasMora} dias) y el capital sigue pendiente.\n\nSaldo capital: ${Utils.formatMoney(alerta.saldoCapital)}\nInteres mensual: ${Utils.formatMoney(alerta.interesMensual)}\n\nPor favor comuniquese conmigo para resolver esta situacion. Quedo atento. Gracias.`;
        }
    },

    generarUrlWhatsApp(telefono, mensaje) {
        // Limpiar telefono: quitar espacios, guiones, parentesis
        let tel = telefono.replace(/[\s\-\(\)\+]/g, '');
        // Si no empieza con codigo de pais, agregar Colombia (57)
        if (tel.length === 10) tel = '57' + tel;
        return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
    },

    marcarNotificado(prestamoId, tipo) {
        DB.registrarNotificacion(prestamoId, tipo, Utils.hoy());
        Utils.showToast('Notificacion registrada como enviada');
        // Refrescar despues de un momento para que el link abra primero
        setTimeout(() => this.renderAlertasWhatsApp(), 1000);
    },

    async enviarTodasWhatsApp() {
        const alertas = DB.getAlertasPendientes();
        if (alertas.length === 0) return;

        const ok = await Utils.confirm(
            'Enviar todas las notificaciones',
            `Se abriran ${alertas.length} ventana${alertas.length > 1 ? 's' : ''} de WhatsApp para enviar los mensajes.<br><br>¿Continuar?`
        );
        if (!ok) return;

        alertas.forEach((a, i) => {
            const mensaje = this.generarMensajeWhatsApp(a, a.tipo);
            const url = this.generarUrlWhatsApp(a.telefono, mensaje);
            // Abrir con retraso para que el navegador no bloquee popups
            setTimeout(() => {
                window.open(url, '_blank');
                DB.registrarNotificacion(a.prestamoId, a.tipo, Utils.hoy());
            }, i * 1500);
        });

        setTimeout(() => {
            Utils.showToast(`${alertas.length} notificacion(es) enviada(s)`);
            this.renderAlertasWhatsApp();
        }, alertas.length * 1500 + 500);
    },

    // ==========================================
    // CLIENTES
    // ==========================================
    guardarCliente() {
        const editId = document.getElementById('cliente-edit-id').value;
        const nombre = document.getElementById('cliente-nombre').value.trim();
        const cedula = document.getElementById('cliente-cedula').value.trim();
        const telefono = document.getElementById('cliente-telefono').value.trim();
        const direccion = document.getElementById('cliente-direccion').value.trim();
        const email = document.getElementById('cliente-email').value.trim();
        const notas = document.getElementById('cliente-notas').value.trim();

        if (!nombre || !cedula || !telefono) {
            Utils.showToast('Complete los campos obligatorios', 'error');
            return;
        }

        if (editId) {
            // Modo edicion
            const existente = DB.getClientes().find(c => c.cedula === cedula && c.id !== editId);
            if (existente) {
                Utils.showToast('Ya existe otro cliente con esa cedula', 'error');
                return;
            }
            DB.actualizarCliente(editId, { nombre, cedula, telefono, direccion, email, notas });
            Utils.showToast('Cliente actualizado exitosamente');
        } else {
            // Modo nuevo
            const existente = DB.getClientes().find(c => c.cedula === cedula);
            if (existente) {
                Utils.showToast('Ya existe un cliente con esa cedula', 'error');
                return;
            }
            DB.agregarCliente({ nombre, cedula, telefono, direccion, email, notas });
            Utils.showToast('Cliente registrado exitosamente');
        }

        this.cancelarEdicionCliente();
        this.refreshAll();
    },

    editarCliente(id) {
        const cliente = DB.getClienteById(id);
        if (!cliente) return;

        document.getElementById('cliente-edit-id').value = cliente.id;
        document.getElementById('cliente-nombre').value = cliente.nombre;
        document.getElementById('cliente-cedula').value = cliente.cedula;
        document.getElementById('cliente-telefono').value = cliente.telefono;
        document.getElementById('cliente-direccion').value = cliente.direccion || '';
        document.getElementById('cliente-email').value = cliente.email || '';
        document.getElementById('cliente-notas').value = cliente.notas || '';

        document.getElementById('form-cliente-titulo').textContent = 'Editar Cliente: ' + cliente.nombre;
        document.getElementById('btn-guardar-cliente').innerHTML = '<i class="fas fa-save"></i> Actualizar Cliente';

        // Scroll al formulario
        document.getElementById('form-cliente').scrollIntoView({ behavior: 'smooth' });
    },

    cancelarEdicionCliente() {
        document.getElementById('cliente-edit-id').value = '';
        document.getElementById('form-cliente').reset();
        document.getElementById('form-cliente-titulo').textContent = 'Nuevo Cliente';
        document.getElementById('btn-guardar-cliente').innerHTML = '<i class="fas fa-save"></i> Guardar Cliente';
    },

    renderClientes() {
        const clientes = DB.getClientes();
        const tbody = document.querySelector('#tabla-clientes tbody');

        if (clientes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-users"></i><p>No hay clientes registrados</p></div></td></tr>`;
            return;
        }

        tbody.innerHTML = clientes.map(c => {
            const prestamos = DB.getPrestamosPorCliente(c.id).filter(p => p.estado === 'activo');
            const deuda = prestamos.reduce((sum, p) => sum + p.saldoCapital, 0);

            const tienePagados = DB.getPrestamosPorCliente(c.id).some(p => p.estado === 'pagado');
            return `<tr>
                <td><strong>${c.nombre}</strong></td>
                <td>${c.cedula}</td>
                <td>${c.telefono}</td>
                <td>${prestamos.length}</td>
                <td>${Utils.formatMoney(deuda)}</td>
                <td class="acciones-cell">
                    <button class="btn btn-sm btn-primary" onclick="App.editarCliente('${c.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-info" onclick="App.generarEstadoCuentaPDF('${c.id}')" title="Estado de Cuenta PDF"><i class="fas fa-file-pdf"></i></button>
                    ${tienePagados ? `<button class="btn btn-sm btn-success" onclick="App.mostrarPazYSalvoCliente('${c.id}')" title="Paz y Salvo"><i class="fas fa-certificate"></i></button>` : ''}
                    <button class="btn btn-sm btn-danger" onclick="App.eliminarCliente('${c.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    },

    async eliminarCliente(id) {
        const cliente = DB.getClienteById(id);
        const ok = await Utils.confirm(
            'Eliminar Cliente',
            `¿Esta seguro de eliminar a <strong>${cliente.nombre}</strong>?<br>Solo se puede eliminar si no tiene prestamos activos.`
        );
        if (!ok) return;

        const result = DB.eliminarCliente(id);
        if (result) {
            Utils.showToast('Cliente eliminado');
            this.refreshAll();
        } else {
            Utils.showToast('No se puede eliminar: tiene prestamos activos', 'error');
        }
    },

    // ==========================================
    // SELECTS
    // ==========================================
    renderSelectClientes() {
        const clientes = DB.getClientes();
        const selects = ['prestamo-cliente', 'historial-cliente'];

        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            const currentVal = select.value;
            const firstOption = select.options[0].outerHTML;
            select.innerHTML = firstOption + clientes.map(c =>
                `<option value="${c.id}">${c.nombre} - ${c.cedula}</option>`
            ).join('');
            select.value = currentVal;
        });
    },

    renderSelectPrestamos() {
        const activos = DB.getPrestamosActivos();

        // Select para pagos
        const selectPago = document.getElementById('pago-prestamo');
        const currentPago = selectPago.value;
        selectPago.innerHTML = '<option value="">Seleccione un prestamo</option>' +
            activos.map(p => {
                const cliente = DB.getClienteById(p.clienteId);
                return `<option value="${p.id}">${cliente ? cliente.nombre : 'N/A'} - ${Utils.formatMoney(p.saldoCapital)} (${p.tasaInteres}%)</option>`;
            }).join('');
        selectPago.value = currentPago;

        // Select para extender
        const selectExt = document.getElementById('extender-prestamo');
        const currentExt = selectExt.value;
        selectExt.innerHTML = '<option value="">Seleccione un prestamo</option>' +
            activos.map(p => {
                const cliente = DB.getClienteById(p.clienteId);
                return `<option value="${p.id}">${cliente ? cliente.nombre : 'N/A'} - Vence: ${Utils.formatDate(p.fechaVencimiento)}</option>`;
            }).join('');
        selectExt.value = currentExt;

        // Select historial
        const todos = DB.getPrestamos();
        const selectHist = document.getElementById('historial-prestamo');
        const currentHist = selectHist.value;
        selectHist.innerHTML = '<option value="">Todos los prestamos</option>' +
            todos.map(p => {
                const cliente = DB.getClienteById(p.clienteId);
                return `<option value="${p.id}">${cliente ? cliente.nombre : 'N/A'} - ${Utils.formatMoney(p.montoCapital)} (${p.estado})</option>`;
            }).join('');
        selectHist.value = currentHist;
    },

    // ==========================================
    // PRESTAMOS
    // ==========================================
    calcularResumenPrestamo() {
        const monto = parseFloat(document.getElementById('prestamo-monto').value) || 0;
        const tasa = parseFloat(document.getElementById('prestamo-tasa').value) || 0;

        const resumenDiv = document.getElementById('prestamo-resumen');
        if (monto > 0 && tasa > 0) {
            const interes = monto * (tasa / 100);
            const entrega = monto - interes;
            resumenDiv.style.display = 'block';
            document.getElementById('resumen-capital').textContent = Utils.formatMoney(monto);
            document.getElementById('resumen-tasa').textContent = tasa;
            document.getElementById('resumen-interes').textContent = Utils.formatMoney(interes);
            document.getElementById('resumen-entrega').textContent = Utils.formatMoney(entrega);
            document.getElementById('resumen-mensual').textContent = Utils.formatMoney(interes);
        } else {
            resumenDiv.style.display = 'none';
        }
    },

    async guardarPrestamo() {
        const clienteId = document.getElementById('prestamo-cliente').value;
        const monto = parseFloat(document.getElementById('prestamo-monto').value);
        const tasa = parseFloat(document.getElementById('prestamo-tasa').value);
        const fecha = document.getElementById('prestamo-fecha').value;
        const vencimiento = document.getElementById('prestamo-vencimiento').value;
        const notas = document.getElementById('prestamo-notas').value.trim();

        if (!clienteId || !monto || !tasa || !fecha || !vencimiento) {
            Utils.showToast('Complete todos los campos obligatorios', 'error');
            return;
        }

        if (vencimiento <= fecha) {
            Utils.showToast('La fecha de vencimiento debe ser posterior a la fecha del prestamo', 'error');
            return;
        }

        const interes = monto * (tasa / 100);
        const entrega = monto - interes;
        const cliente = DB.getClienteById(clienteId);

        const ok = await Utils.confirm(
            'Confirmar Prestamo',
            `<strong>Cliente:</strong> ${cliente.nombre}<br>
            <strong>Capital:</strong> ${Utils.formatMoney(monto)}<br>
            <strong>Interes adelantado (${tasa}%):</strong> ${Utils.formatMoney(interes)}<br>
            <strong>Monto a entregar:</strong> ${Utils.formatMoney(entrega)}<br>
            <strong>Vencimiento:</strong> ${Utils.formatDate(vencimiento)}<br><br>
            ¿Confirmar el registro del prestamo?`
        );

        if (!ok) return;

        DB.agregarPrestamo({
            clienteId,
            montoCapital: monto,
            tasaInteres: tasa,
            fechaPrestamo: fecha,
            fechaVencimiento: vencimiento,
            interesAdelantado: interes,
            montoEntregado: entrega,
            notas
        });

        Utils.showToast('Prestamo registrado exitosamente');
        document.getElementById('form-prestamo').reset();
        document.getElementById('prestamo-fecha').value = Utils.hoy();
        document.getElementById('prestamo-resumen').style.display = 'none';
        this.refreshAll();
    },

    // ==========================================
    // PAGOS
    // ==========================================
    mostrarInfoPago() {
        const prestamoId = document.getElementById('pago-prestamo').value;
        const infoDiv = document.getElementById('pago-info');

        if (!prestamoId) {
            infoDiv.style.display = 'none';
            document.getElementById('pago-distribucion').style.display = 'none';
            return;
        }

        const prestamo = DB.getPrestamoById(prestamoId);
        const cliente = DB.getClienteById(prestamo.clienteId);
        const interesMensual = prestamo.saldoCapital * (prestamo.tasaInteres / 100);
        const resumenMora = DB.getResumenMora(prestamoId);

        document.getElementById('pago-cliente-nombre').textContent = cliente ? cliente.nombre : 'N/A';
        document.getElementById('pago-capital-original').textContent = Utils.formatMoney(prestamo.montoCapital);
        document.getElementById('pago-saldo-capital').textContent = Utils.formatMoney(prestamo.saldoCapital);
        document.getElementById('pago-tasa').textContent = prestamo.tasaInteres + '%';
        document.getElementById('pago-interes-mensual').textContent = Utils.formatMoney(interesMensual) +
            (resumenMora.mesesMora > 0 ? ` (${resumenMora.mesesMora} mes(es) en mora: ${Utils.formatMoney(resumenMora.totalInteresMora)})` : '');
        document.getElementById('pago-vencimiento').textContent = Utils.formatDate(prestamo.fechaVencimiento);

        const saldoFavor = prestamo.saldoFavor || 0;
        const grupoFavor = document.getElementById('pago-saldo-favor-grupo');
        if (saldoFavor > 0) {
            document.getElementById('pago-saldo-favor').textContent = Utils.formatMoney(saldoFavor);
            grupoFavor.style.display = 'flex';
        } else {
            grupoFavor.style.display = 'none';
        }

        infoDiv.style.display = 'block';
        this.calcularResumenPago();
    },

    // Calcula como se distribuye el pago libre
    calcularDistribucion(prestamoId, montoPago) {
        const prestamo = DB.getPrestamoById(prestamoId);
        const resumenMora = DB.getResumenMora(prestamoId);
        const totalInteresMora = resumenMora.totalInteresMora;

        let restante = montoPago;
        let aplicadoIntereses = 0;
        let mesesCubiertos = 0;

        // 1. Cubrir cuotas de interes en mora (solo meses COMPLETOS)
        const cuotasMora = resumenMora.cuotas.filter(c => c.estado === 'mora');
        cuotasMora.forEach(c => {
            if (restante >= c.interesMes) {
                aplicadoIntereses += c.interesMes;
                restante -= c.interesMes;
                mesesCubiertos++;
            }
            // Si no alcanza para el mes completo, NO se aplica parcial
        });

        // 2. Lo que sobra queda como SALDO A FAVOR para la proxima cuota (NO va a capital)
        const saldoFavor = restante;
        const pendiente = totalInteresMora - aplicadoIntereses;

        return {
            aplicadoIntereses,
            mesesCubiertos,
            totalMesesMora: resumenMora.mesesMora,
            pendienteIntereses: pendiente > 0 ? pendiente : 0,
            saldoFavor,
            totalInteresMora
        };
    },

    calcularResumenPago() {
        const prestamoId = document.getElementById('pago-prestamo').value;
        const tipoPago = document.getElementById('pago-tipo').value;
        const resumenDiv = document.getElementById('pago-resumen');
        const grupoAbono = document.getElementById('grupo-monto-abono');
        const grupoLibre = document.getElementById('grupo-monto-libre');
        const distDiv = document.getElementById('pago-distribucion');
        const grupoUsarFavor = document.getElementById('pago-usar-favor-grupo');

        if (!prestamoId || !tipoPago) {
            resumenDiv.style.display = 'none';
            grupoAbono.style.display = 'none';
            grupoLibre.style.display = 'none';
            distDiv.style.display = 'none';
            if (grupoUsarFavor) grupoUsarFavor.style.display = 'none';
            return;
        }

        const prestamo = DB.getPrestamoById(prestamoId);
        const resumenMora = DB.getResumenMora(prestamoId);
        const interesMensual = prestamo.saldoCapital * (prestamo.tasaInteres / 100);
        const saldoFavor = prestamo.saldoFavor || 0;
        let capitalPagar = 0;
        let interesPagar = 0;
        let total = 0;
        let nuevoSaldo = prestamo.saldoCapital;
        let favorUsado = 0;

        grupoAbono.style.display = tipoPago === 'abono_capital' ? 'flex' : 'none';
        grupoLibre.style.display = tipoPago === 'monto_libre' ? 'flex' : 'none';
        distDiv.style.display = 'none';

        // Mostrar checkbox de saldo a favor si tiene y NO es pago libre
        const mostrarFavor = saldoFavor > 0 && tipoPago !== 'monto_libre';
        if (grupoUsarFavor) {
            grupoUsarFavor.style.display = mostrarFavor ? 'flex' : 'none';
            if (mostrarFavor) {
                document.getElementById('pago-favor-valor').textContent = Utils.formatMoney(saldoFavor);
            }
        }
        const usarFavor = mostrarFavor && document.getElementById('pago-usar-favor').checked;

        switch (tipoPago) {
            case 'interes':
                interesPagar = interesMensual;
                if (usarFavor) {
                    favorUsado = Math.min(saldoFavor, interesMensual);
                }
                total = interesMensual - favorUsado;
                break;
            case 'monto_libre': {
                const montoLibre = parseFloat(document.getElementById('pago-monto-libre').value) || 0;
                if (montoLibre > 0) {
                    const dist = this.calcularDistribucion(prestamoId, montoLibre);
                    interesPagar = dist.aplicadoIntereses;
                    capitalPagar = 0;
                    total = montoLibre;
                    nuevoSaldo = prestamo.saldoCapital;

                    document.getElementById('dist-meses-mora').textContent = dist.totalMesesMora;
                    document.getElementById('dist-mora').textContent = Utils.formatMoney(dist.totalInteresMora);
                    document.getElementById('dist-intereses').textContent = Utils.formatMoney(dist.aplicadoIntereses) +
                        (dist.mesesCubiertos > 0 ? ` (${dist.mesesCubiertos} mes/es cubierto/s)` : '');
                    document.getElementById('dist-pendiente').textContent = Utils.formatMoney(dist.pendienteIntereses);
                    document.getElementById('dist-favor').textContent = Utils.formatMoney(dist.saldoFavor);
                    distDiv.style.display = 'block';
                }
                break;
            }
            case 'abono_capital':
                capitalPagar = parseFloat(document.getElementById('pago-monto-abono').value) || 0;
                if (capitalPagar > prestamo.saldoCapital) capitalPagar = prestamo.saldoCapital;
                interesPagar = interesMensual;
                if (usarFavor) {
                    favorUsado = Math.min(saldoFavor, interesMensual);
                }
                total = (interesMensual - favorUsado) + capitalPagar;
                nuevoSaldo = prestamo.saldoCapital - capitalPagar;
                break;
            case 'pago_total':
                capitalPagar = prestamo.saldoCapital;
                interesPagar = resumenMora.totalInteresMora > 0 ? resumenMora.totalInteresMora : interesMensual;
                if (usarFavor) {
                    favorUsado = Math.min(saldoFavor, interesPagar + capitalPagar);
                }
                total = interesPagar + capitalPagar - favorUsado;
                nuevoSaldo = 0;
                break;
        }

        document.getElementById('pago-resumen-interes').textContent = Utils.formatMoney(interesPagar);
        document.getElementById('pago-resumen-capital').textContent = Utils.formatMoney(capitalPagar);
        document.getElementById('pago-resumen-total').textContent = Utils.formatMoney(total) +
            (favorUsado > 0 ? ` (descuenta ${Utils.formatMoney(favorUsado)} de saldo a favor)` : '');
        document.getElementById('pago-resumen-nuevo-saldo').textContent = Utils.formatMoney(nuevoSaldo);
        resumenDiv.style.display = 'block';
    },

    async guardarPago() {
        const prestamoId = document.getElementById('pago-prestamo').value;
        const tipoPago = document.getElementById('pago-tipo').value;
        const fecha = document.getElementById('pago-fecha').value;
        const notas = document.getElementById('pago-notas').value.trim();

        if (!prestamoId || !tipoPago || !fecha) {
            Utils.showToast('Complete todos los campos obligatorios', 'error');
            return;
        }

        const prestamo = DB.getPrestamoById(prestamoId);
        const cliente = DB.getClienteById(prestamo.clienteId);
        const resumenMora = DB.getResumenMora(prestamoId);
        const interesMensual = prestamo.saldoCapital * (prestamo.tasaInteres / 100);
        const saldoFavor = prestamo.saldoFavor || 0;
        const usarFavorCheck = document.getElementById('pago-usar-favor');
        const usarFavor = saldoFavor > 0 && tipoPago !== 'monto_libre' && usarFavorCheck && usarFavorCheck.checked;
        let interesPagar = 0;
        let capitalPagar = 0;
        let saldoFavorNuevo = 0;
        let total = 0;
        let favorUsado = 0;
        let notaDetalle = '';

        switch (tipoPago) {
            case 'interes':
                interesPagar = interesMensual;
                if (usarFavor) favorUsado = Math.min(saldoFavor, interesMensual);
                total = interesMensual - favorUsado;
                notaDetalle = 'Pago de interes mensual';
                if (favorUsado > 0) notaDetalle += ` (${Utils.formatMoney(favorUsado)} de saldo a favor)`;
                break;

            case 'monto_libre': {
                const montoLibre = parseFloat(document.getElementById('pago-monto-libre').value) || 0;
                if (montoLibre <= 0) {
                    Utils.showToast('Ingrese un monto valido', 'error');
                    return;
                }
                const dist = this.calcularDistribucion(prestamoId, montoLibre);
                interesPagar = dist.aplicadoIntereses;
                capitalPagar = 0;
                saldoFavorNuevo = dist.saldoFavor;
                total = montoLibre;
                notaDetalle = `Pago libre: ${Utils.formatMoney(montoLibre)}. Intereses cubiertos: ${Utils.formatMoney(interesPagar)} (${dist.mesesCubiertos} mes/es)`;
                if (saldoFavorNuevo > 0) {
                    notaDetalle += `. Saldo a favor: ${Utils.formatMoney(saldoFavorNuevo)}`;
                }
                if (dist.pendienteIntereses > 0) {
                    notaDetalle += `. Queda debiendo intereses: ${Utils.formatMoney(dist.pendienteIntereses)}`;
                }
                break;
            }

            case 'abono_capital': {
                const montoAbono = parseFloat(document.getElementById('pago-monto-abono').value) || 0;
                if (montoAbono <= 0) {
                    Utils.showToast('Ingrese un monto de abono valido', 'error');
                    return;
                }
                if (montoAbono > prestamo.saldoCapital) {
                    Utils.showToast('El abono no puede superar el saldo de capital', 'error');
                    return;
                }
                capitalPagar = montoAbono;
                interesPagar = interesMensual;
                if (usarFavor) favorUsado = Math.min(saldoFavor, interesMensual);
                total = (interesMensual - favorUsado) + capitalPagar;
                notaDetalle = `Abono a capital: ${Utils.formatMoney(capitalPagar)} + interes: ${Utils.formatMoney(interesMensual)}`;
                if (favorUsado > 0) notaDetalle += ` (${Utils.formatMoney(favorUsado)} de saldo a favor)`;
                break;
            }

            case 'pago_total':
                capitalPagar = prestamo.saldoCapital;
                interesPagar = resumenMora.totalInteresMora > 0 ? resumenMora.totalInteresMora : interesMensual;
                if (usarFavor) favorUsado = Math.min(saldoFavor, interesPagar + capitalPagar);
                total = interesPagar + capitalPagar - favorUsado;
                notaDetalle = `Pago total. Capital: ${Utils.formatMoney(capitalPagar)} + intereses: ${Utils.formatMoney(interesPagar)}`;
                if (favorUsado > 0) notaDetalle += ` (${Utils.formatMoney(favorUsado)} de saldo a favor aplicado)`;
                break;
        }

        const tipoTexto = {
            'interes': 'Pago de Interes del Mes',
            'monto_libre': 'Pago Libre',
            'abono_capital': 'Abono a Capital + Interes',
            'pago_total': 'Pago Total (Capital + Intereses)'
        };

        let confirmMsg = `<strong>Cliente:</strong> ${cliente ? cliente.nombre : 'N/A'}<br>
            <strong>Tipo:</strong> ${tipoTexto[tipoPago]}<br>
            <strong>Aplicado a intereses:</strong> ${Utils.formatMoney(interesPagar)}<br>`;
        if (capitalPagar > 0) {
            confirmMsg += `<strong>Aplicado a capital:</strong> ${Utils.formatMoney(capitalPagar)}<br>`;
        }
        if (favorUsado > 0) {
            confirmMsg += `<strong style="color:#16a34a">Saldo a favor usado:</strong> -${Utils.formatMoney(favorUsado)}<br>`;
        }
        confirmMsg += `<strong>Total que paga el cliente:</strong> ${Utils.formatMoney(total)}<br>`;
        if (saldoFavorNuevo > 0) {
            confirmMsg += `<strong>Saldo a favor restante:</strong> ${Utils.formatMoney(saldoFavorNuevo)}<br>`;
        }
        confirmMsg += `<strong>Saldo capital:</strong> ${Utils.formatMoney(prestamo.saldoCapital - capitalPagar)}<br><br>¿Confirmar el registro del pago?`;

        const ok = await Utils.confirm('Confirmar Pago', confirmMsg);
        if (!ok) return;

        // Registrar con la nueva API
        const datos = { montoAbono: capitalPagar, montoPago: total, usarSaldoFavor: usarFavor };
        const resultado = DB.registrarPago(prestamoId, tipoPago, datos, fecha, notas || notaDetalle);

        if (resultado) {
            let msg = `Pago registrado: ${Utils.formatMoney(total)}`;
            if (resultado.nuevoSaldoFavor > 0) {
                msg += ` | Saldo a favor: ${Utils.formatMoney(resultado.nuevoSaldoFavor)}`;
            }
            Utils.showToast(msg);
            document.getElementById('form-pago').reset();
            document.getElementById('pago-fecha').value = Utils.hoy();
            document.getElementById('pago-info').style.display = 'none';
            document.getElementById('pago-resumen').style.display = 'none';
            document.getElementById('grupo-monto-abono').style.display = 'none';
            document.getElementById('grupo-monto-libre').style.display = 'none';
            document.getElementById('pago-distribucion').style.display = 'none';
            document.getElementById('pago-usar-favor-grupo').style.display = 'none';
            this.refreshAll();
        }
    },

    // ==========================================
    // EXTENDER PLAZO
    // ==========================================
    async extenderPlazo() {
        const prestamoId = document.getElementById('extender-prestamo').value;
        const nuevaFecha = document.getElementById('extender-fecha').value;
        const notas = document.getElementById('extender-notas').value.trim();

        if (!prestamoId || !nuevaFecha) {
            Utils.showToast('Seleccione prestamo y nueva fecha', 'error');
            return;
        }

        const prestamo = DB.getPrestamoById(prestamoId);
        const cliente = DB.getClienteById(prestamo.clienteId);

        if (nuevaFecha <= prestamo.fechaVencimiento) {
            Utils.showToast('La nueva fecha debe ser posterior a la actual', 'error');
            return;
        }

        const ok = await Utils.confirm(
            'Extender Plazo',
            `<strong>Cliente:</strong> ${cliente ? cliente.nombre : 'N/A'}<br>
            <strong>Vencimiento actual:</strong> ${Utils.formatDate(prestamo.fechaVencimiento)}<br>
            <strong>Nuevo vencimiento:</strong> ${Utils.formatDate(nuevaFecha)}<br><br>
            ¿Confirmar la extension del plazo?`
        );

        if (!ok) return;

        DB.extenderPlazo(prestamoId, nuevaFecha, notas);
        Utils.showToast('Plazo extendido exitosamente');
        document.getElementById('form-extender').reset();
        this.refreshAll();
    },

    // ==========================================
    // HISTORIAL
    // ==========================================
    renderHistorial() {
        let movimientos = DB.getMovimientos();

        // Filtros
        const clienteId = document.getElementById('historial-cliente').value;
        const prestamoId = document.getElementById('historial-prestamo').value;

        if (clienteId) movimientos = movimientos.filter(m => m.clienteId === clienteId);
        if (prestamoId) movimientos = movimientos.filter(m => m.prestamoId === prestamoId);

        // Ordenar por fecha descendente
        movimientos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        const tbody = document.querySelector('#tabla-historial tbody');

        if (movimientos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-history"></i><p>No hay movimientos registrados</p></div></td></tr>`;
            document.getElementById('estado-cuenta-card').style.display = 'none';
            return;
        }

        const tipoLabels = {
            'desembolso': { text: 'Desembolso', class: 'tipo-prestamo' },
            'pago_interes': { text: 'Pago Interes', class: 'tipo-interes' },
            'pago_libre': { text: 'Pago Libre', class: 'tipo-interes' },
            'abono_capital': { text: 'Abono Capital', class: 'tipo-abono' },
            'pago_total': { text: 'Pago Total', class: 'tipo-pago-total' },
            'extension': { text: 'Extension Plazo', class: 'tipo-extension' }
        };

        tbody.innerHTML = movimientos.map(m => {
            const cliente = DB.getClienteById(m.clienteId);
            const tipoInfo = tipoLabels[m.tipo] || { text: m.tipo, class: '' };

            return `<tr>
                <td>${Utils.formatDate(m.fecha)}</td>
                <td>${cliente ? cliente.nombre : 'N/A'}</td>
                <td><span class="${tipoInfo.class}">${tipoInfo.text}</span></td>
                <td>${m.notas || '-'}</td>
                <td>${m.interesPagado ? Utils.formatMoney(m.interesPagado) : (m.interesDescontado ? Utils.formatMoney(m.interesDescontado) : '-')}</td>
                <td>${m.capitalMovimiento ? Utils.formatMoney(m.capitalMovimiento) : '-'}</td>
                <td><strong>${Utils.formatMoney(m.saldoCapital)}</strong></td>
            </tr>`;
        }).join('');

        // Estado de cuenta si hay filtro de prestamo
        if (prestamoId) {
            this.renderEstadoCuenta(prestamoId);
        } else {
            document.getElementById('estado-cuenta-card').style.display = 'none';
        }
    },

    renderEstadoCuenta(prestamoId) {
        const prestamo = DB.getPrestamoById(prestamoId);
        if (!prestamo) return;

        const cliente = DB.getClienteById(prestamo.clienteId);
        const movimientos = DB.getMovimientosPorPrestamo(prestamoId);

        const totalIntereses = movimientos
            .filter(m => m.interesPagado > 0)
            .reduce((sum, m) => sum + m.interesPagado, 0)
            + (prestamo.interesAdelantado || 0);

        const totalAbonos = movimientos
            .filter(m => m.capitalMovimiento > 0 && m.tipo !== 'desembolso')
            .reduce((sum, m) => sum + m.capitalMovimiento, 0);

        document.getElementById('estado-cuenta-nombre').textContent = cliente ? cliente.nombre : 'N/A';
        document.getElementById('ec-capital-original').textContent = Utils.formatMoney(prestamo.montoCapital);
        document.getElementById('ec-saldo-capital').textContent = Utils.formatMoney(prestamo.saldoCapital);
        document.getElementById('ec-intereses-pagados').textContent = Utils.formatMoney(totalIntereses);
        document.getElementById('ec-abonos-capital').textContent = Utils.formatMoney(totalAbonos);
        document.getElementById('estado-cuenta-card').style.display = 'block';
        // Guardar clienteId para el botón PDF
        document.getElementById('btn-ec-pdf').dataset.clienteId = prestamo.clienteId;
    },

    generarEstadoCuentaPDFDesdeHistorial() {
        const clienteId = document.getElementById('btn-ec-pdf').dataset.clienteId;
        if (clienteId) this.generarEstadoCuentaPDF(clienteId);
    },

    // ==========================================
    // ACCIONES RAPIDAS
    // ==========================================
    async mostrarPazYSalvoCliente(clienteId) {
        const prestamos = DB.getPrestamosPorCliente(clienteId).filter(p => p.estado === 'pagado');
        if (prestamos.length === 0) {
            Utils.showToast('Este cliente no tiene prestamos pagados', 'error');
            return;
        }
        if (prestamos.length === 1) {
            this.generarPazYSalvo(prestamos[0].id);
            return;
        }
        // Multiples prestamos pagados: seleccionar
        const opciones = prestamos.map(p =>
            `<button class="btn btn-success" style="margin:4px;width:100%" onclick="App.generarPazYSalvo('${p.id}');document.getElementById('modal-cancelar').click();">
                ${Utils.formatMoney(p.montoCapital)} - ${Utils.formatDate(p.fechaPrestamo)}
            </button>`
        ).join('');
        await Utils.confirm('Seleccionar Prestamo', `<p>Seleccione el prestamo para generar Paz y Salvo:</p>${opciones}`);
    },

    async aplicarSaldoFavorACapital() {
        const prestamoId = document.getElementById('pago-prestamo').value;
        if (!prestamoId) {
            Utils.showToast('Seleccione un prestamo primero', 'error');
            return;
        }
        const prestamo = DB.getPrestamoById(prestamoId);
        const cliente = DB.getClienteById(prestamo.clienteId);
        const saldoFavor = prestamo.saldoFavor || 0;

        if (saldoFavor <= 0) {
            Utils.showToast('No hay saldo a favor disponible', 'error');
            return;
        }

        const abonar = Math.min(saldoFavor, prestamo.saldoCapital);
        const ok = await Utils.confirm(
            'Aplicar Saldo a Favor a Capital',
            `<strong>Cliente:</strong> ${cliente ? cliente.nombre : 'N/A'}<br>
            <strong>Saldo a favor disponible:</strong> ${Utils.formatMoney(saldoFavor)}<br>
            <strong>Se abonara a capital:</strong> ${Utils.formatMoney(abonar)}<br>
            <strong>Saldo capital actual:</strong> ${Utils.formatMoney(prestamo.saldoCapital)}<br>
            <strong>Nuevo saldo capital:</strong> ${Utils.formatMoney(prestamo.saldoCapital - abonar)}<br><br>
            ¿Confirmar el abono del saldo a favor al capital?`
        );

        if (!ok) return;

        const resultado = DB.aplicarSaldoFavorACapital(prestamoId);
        if (resultado) {
            Utils.showToast(`Saldo a favor aplicado: ${Utils.formatMoney(resultado.abonoCapital)} abonado a capital. Nuevo saldo: ${Utils.formatMoney(resultado.nuevoSaldo)}`);
            this.mostrarInfoPago();
            this.refreshAll();
        }
    },

    irAPago(prestamoId) {
        // Navegar a pagos
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector('[data-section="pagos"]').classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById('pagos').classList.add('active');
        // Seleccionar prestamo
        document.getElementById('pago-prestamo').value = prestamoId;
        this.mostrarInfoPago();
    },

    irAExtender(prestamoId) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector('[data-section="pagos"]').classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById('pagos').classList.add('active');
        document.getElementById('extender-prestamo').value = prestamoId;
    }
};

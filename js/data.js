// ============================================
// DATA LAYER - Manejo de datos con localStorage
// ============================================

const DB = {
    KEYS: {
        CLIENTES: 'prestamo_clientes',
        PRESTAMOS: 'prestamo_prestamos',
        MOVIMIENTOS: 'prestamo_movimientos'
    },

    // Obtener datos
    getClientes() {
        return JSON.parse(localStorage.getItem(this.KEYS.CLIENTES) || '[]');
    },

    getPrestamos() {
        return JSON.parse(localStorage.getItem(this.KEYS.PRESTAMOS) || '[]');
    },

    getMovimientos() {
        return JSON.parse(localStorage.getItem(this.KEYS.MOVIMIENTOS) || '[]');
    },

    // Guardar datos
    saveClientes(clientes) {
        localStorage.setItem(this.KEYS.CLIENTES, JSON.stringify(clientes));
    },

    savePrestamos(prestamos) {
        localStorage.setItem(this.KEYS.PRESTAMOS, JSON.stringify(prestamos));
    },

    saveMovimientos(movimientos) {
        localStorage.setItem(this.KEYS.MOVIMIENTOS, JSON.stringify(movimientos));
    },

    // CRUD Clientes
    agregarCliente(cliente) {
        const clientes = this.getClientes();
        cliente.id = Date.now().toString();
        cliente.fechaRegistro = new Date().toISOString();
        clientes.push(cliente);
        this.saveClientes(clientes);
        return cliente;
    },

    actualizarCliente(id, datos) {
        const clientes = this.getClientes();
        const idx = clientes.findIndex(c => c.id === id);
        if (idx !== -1) {
            clientes[idx] = { ...clientes[idx], ...datos };
            this.saveClientes(clientes);
            return clientes[idx];
        }
        return null;
    },

    eliminarCliente(id) {
        const prestamos = this.getPrestamos().filter(p => p.clienteId === id && p.estado === 'activo');
        if (prestamos.length > 0) return false;
        const clientes = this.getClientes().filter(c => c.id !== id);
        this.saveClientes(clientes);
        return true;
    },

    getClienteById(id) {
        return this.getClientes().find(c => c.id === id) || null;
    },

    // CRUD Prestamos
    agregarPrestamo(prestamo) {
        const prestamos = this.getPrestamos();
        prestamo.id = Date.now().toString();
        prestamo.estado = 'activo';
        prestamo.saldoCapital = prestamo.montoCapital;
        prestamo.fechaCreacion = new Date().toISOString();
        prestamos.push(prestamo);
        this.savePrestamos(prestamos);

        // Registrar movimiento de desembolso
        this.agregarMovimiento({
            prestamoId: prestamo.id,
            clienteId: prestamo.clienteId,
            tipo: 'desembolso',
            fecha: prestamo.fechaPrestamo,
            interesDescontado: prestamo.interesAdelantado,
            montoEntregado: prestamo.montoEntregado,
            capitalMovimiento: 0,
            saldoCapital: prestamo.saldoCapital,
            notas: `Prestamo creado. Capital: ${Utils.formatMoney(prestamo.montoCapital)}. Interes adelantado: ${Utils.formatMoney(prestamo.interesAdelantado)}. Entregado: ${Utils.formatMoney(prestamo.montoEntregado)}`
        });

        return prestamo;
    },

    getPrestamoById(id) {
        return this.getPrestamos().find(p => p.id === id) || null;
    },

    getPrestamosActivos() {
        return this.getPrestamos().filter(p => p.estado === 'activo');
    },

    getPrestamosPorCliente(clienteId) {
        return this.getPrestamos().filter(p => p.clienteId === clienteId);
    },

    actualizarPrestamo(id, datos) {
        const prestamos = this.getPrestamos();
        const idx = prestamos.findIndex(p => p.id === id);
        if (idx !== -1) {
            prestamos[idx] = { ...prestamos[idx], ...datos };
            this.savePrestamos(prestamos);
            return prestamos[idx];
        }
        return null;
    },

    // Registrar Pago
    registrarPago(prestamoId, tipoPago, montoAbono, fechaPago, notas) {
        const prestamo = this.getPrestamoById(prestamoId);
        if (!prestamo) return null;

        const interesMensual = prestamo.saldoCapital * (prestamo.tasaInteres / 100);
        let capitalPagado = 0;
        let nuevoSaldo = prestamo.saldoCapital;
        let tipo = '';

        switch (tipoPago) {
            case 'interes':
                tipo = 'pago_interes';
                break;
            case 'abono_capital':
                capitalPagado = montoAbono;
                nuevoSaldo = prestamo.saldoCapital - capitalPagado;
                tipo = 'abono_capital';
                break;
            case 'pago_total':
                capitalPagado = prestamo.saldoCapital;
                nuevoSaldo = 0;
                tipo = 'pago_total';
                break;
        }

        // Actualizar saldo del prestamo
        const updates = { saldoCapital: nuevoSaldo };
        if (nuevoSaldo === 0) {
            updates.estado = 'pagado';
            updates.fechaPago = fechaPago;
        }
        this.actualizarPrestamo(prestamoId, updates);

        // Registrar movimiento
        const movimiento = this.agregarMovimiento({
            prestamoId,
            clienteId: prestamo.clienteId,
            tipo,
            fecha: fechaPago,
            interesPagado: interesMensual,
            capitalMovimiento: capitalPagado,
            saldoCapital: nuevoSaldo,
            notas: notas || `${tipoPago === 'interes' ? 'Pago de interes mensual' : tipoPago === 'abono_capital' ? 'Abono a capital + interes' : 'Pago total del capital'}`
        });

        return {
            movimiento,
            interesPagado: interesMensual,
            capitalPagado,
            nuevoSaldo,
            totalPagado: interesMensual + capitalPagado
        };
    },

    // Extender plazo
    extenderPlazo(prestamoId, nuevaFecha, notas) {
        const prestamo = this.getPrestamoById(prestamoId);
        if (!prestamo) return null;

        const fechaAnterior = prestamo.fechaVencimiento;
        this.actualizarPrestamo(prestamoId, { fechaVencimiento: nuevaFecha });

        this.agregarMovimiento({
            prestamoId,
            clienteId: prestamo.clienteId,
            tipo: 'extension',
            fecha: new Date().toISOString().split('T')[0],
            interesPagado: 0,
            capitalMovimiento: 0,
            saldoCapital: prestamo.saldoCapital,
            notas: notas || `Plazo extendido de ${fechaAnterior} a ${nuevaFecha}`
        });

        return true;
    },

    // Movimientos
    agregarMovimiento(movimiento) {
        const movimientos = this.getMovimientos();
        movimiento.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        movimiento.fechaRegistro = new Date().toISOString();
        movimientos.push(movimiento);
        this.saveMovimientos(movimientos);
        return movimiento;
    },

    getMovimientosPorPrestamo(prestamoId) {
        return this.getMovimientos().filter(m => m.prestamoId === prestamoId);
    },

    getMovimientosPorCliente(clienteId) {
        return this.getMovimientos().filter(m => m.clienteId === clienteId);
    },

    // ==========================================
    // NOTIFICACIONES WHATSAPP
    // ==========================================
    NOTIF_KEY: 'prestamo_notificaciones',

    getNotificaciones() {
        return JSON.parse(localStorage.getItem(this.NOTIF_KEY) || '[]');
    },

    saveNotificaciones(notifs) {
        localStorage.setItem(this.NOTIF_KEY, JSON.stringify(notifs));
    },

    registrarNotificacion(prestamoId, tipo, fecha) {
        const notifs = this.getNotificaciones();
        notifs.push({
            id: Date.now().toString(),
            prestamoId,
            tipo, // 'pre_vencimiento', 'mora', 'mora_recurrente'
            fecha,
            fechaEnvio: new Date().toISOString()
        });
        this.saveNotificaciones(notifs);
    },

    fueNotificadoHoy(prestamoId, tipo) {
        const hoy = Utils.hoy();
        return this.getNotificaciones().some(
            n => n.prestamoId === prestamoId && n.tipo === tipo && n.fecha === hoy
        );
    },

    // Obtener alertas pendientes de envio
    // Siempre muestra alerta si hay mora de intereses o si faltan 5 dias para vencer
    getAlertasPendientes() {
        const activos = this.getPrestamosActivos();
        const hoy = Utils.hoy();
        const alertas = [];

        activos.forEach(p => {
            const cliente = this.getClienteById(p.clienteId);
            if (!cliente || !cliente.telefono) return;

            const diasRestantes = Utils.diasEntre(hoy, p.fechaVencimiento);
            const resumenMora = this.getResumenMora(p.id);

            // 1. Si tiene meses en mora de interes -> SIEMPRE mostrar alerta
            if (resumenMora.mesesMora > 0) {
                if (!this.fueNotificadoHoy(p.id, 'mora_intereses')) {
                    alertas.push({
                        prestamoId: p.id,
                        clienteId: p.clienteId,
                        clienteNombre: cliente.nombre,
                        telefono: cliente.telefono,
                        tipo: 'mora_intereses',
                        mesesMora: resumenMora.mesesMora,
                        totalInteresMora: resumenMora.totalInteresMora,
                        deudaTotal: resumenMora.deudaTotal,
                        diasMora: diasRestantes < 0 ? Math.abs(diasRestantes) : 0,
                        saldoCapital: p.saldoCapital,
                        interesMensual: p.saldoCapital * (p.tasaInteres / 100),
                        fechaVencimiento: p.fechaVencimiento,
                        tasaInteres: p.tasaInteres,
                        cuotasMora: resumenMora.cuotas.filter(c => c.estado === 'mora')
                    });
                }
            }

            // 2. Faltando 5 dias para vencer capital (y sin mora de intereses)
            if (resumenMora.mesesMora === 0 && diasRestantes > 0 && diasRestantes <= 5) {
                if (!this.fueNotificadoHoy(p.id, 'pre_vencimiento')) {
                    alertas.push({
                        prestamoId: p.id,
                        clienteId: p.clienteId,
                        clienteNombre: cliente.nombre,
                        telefono: cliente.telefono,
                        tipo: 'pre_vencimiento',
                        diasRestantes,
                        saldoCapital: p.saldoCapital,
                        interesMensual: p.saldoCapital * (p.tasaInteres / 100),
                        fechaVencimiento: p.fechaVencimiento,
                        tasaInteres: p.tasaInteres
                    });
                }
            }

            // 3. Capital vencido pero sin mora de intereses
            if (resumenMora.mesesMora === 0 && diasRestantes < 0) {
                if (!this.fueNotificadoHoy(p.id, 'capital_vencido')) {
                    alertas.push({
                        prestamoId: p.id,
                        clienteId: p.clienteId,
                        clienteNombre: cliente.nombre,
                        telefono: cliente.telefono,
                        tipo: 'capital_vencido',
                        diasMora: Math.abs(diasRestantes),
                        saldoCapital: p.saldoCapital,
                        interesMensual: p.saldoCapital * (p.tasaInteres / 100),
                        fechaVencimiento: p.fechaVencimiento,
                        tasaInteres: p.tasaInteres
                    });
                }
            }
        });

        return alertas;
    },

    // ==========================================
    // CALCULO DE MORA MES A MES
    // ==========================================
    // Genera las cuotas mensuales de interes esperadas desde el inicio
    // del prestamo hasta hoy, y verifica cuales fueron pagadas
    getCuotasMensuales(prestamoId) {
        const prestamo = this.getPrestamoById(prestamoId);
        if (!prestamo) return [];

        const movimientos = this.getMovimientosPorPrestamo(prestamoId)
            .filter(m => m.tipo === 'pago_interes' || m.tipo === 'abono_capital' || m.tipo === 'pago_total')
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        const cuotas = [];
        const fechaInicio = new Date(prestamo.fechaPrestamo + 'T00:00:00');
        const hoy = new Date(Utils.hoy() + 'T00:00:00');

        // El primer mes de interes ya se desconto adelantado
        // Las cuotas empiezan desde el mes siguiente al prestamo
        let fechaCuota = new Date(fechaInicio);
        fechaCuota.setMonth(fechaCuota.getMonth() + 1);

        // Reconstruir saldo de capital en cada periodo
        let saldoCapital = prestamo.montoCapital;
        let cuotaNum = 1;

        // Rastrear abonos a capital para saber el saldo en cada momento
        const abonosCapital = this.getMovimientosPorPrestamo(prestamoId)
            .filter(m => m.tipo === 'abono_capital' || m.tipo === 'pago_total')
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        while (fechaCuota <= hoy) {
            const fechaStr = fechaCuota.toISOString().split('T')[0];
            const mesStr = fechaCuota.toLocaleDateString('es-CO', { year: 'numeric', month: 'long' });

            // Verificar si hubo abonos a capital ANTES de esta cuota
            // que reduzcan el saldo para calcular el interes correcto
            abonosCapital.forEach(ab => {
                const fechaAbono = new Date(ab.fecha + 'T00:00:00');
                // Si el abono fue antes o en la fecha de esta cuota
                // y aun no lo hemos descontado
                if (fechaAbono <= fechaCuota && ab._procesado !== true) {
                    saldoCapital -= ab.capitalMovimiento;
                    ab._procesado = true;
                }
            });

            if (saldoCapital <= 0) break; // Ya pago todo

            const interesMes = saldoCapital * (prestamo.tasaInteres / 100);

            // Buscar si hay un pago que cubra esta cuota
            // Un pago cubre la cuota del mes si su fecha es cercana a la fecha de cuota
            // (dentro del mismo periodo mensual)
            const fechaInicioMes = new Date(fechaCuota);
            fechaInicioMes.setMonth(fechaInicioMes.getMonth() - 1);
            fechaInicioMes.setDate(fechaInicioMes.getDate() + 1);

            const pagoDelMes = movimientos.find(m => {
                const fechaPago = new Date(m.fecha + 'T00:00:00');
                return fechaPago > fechaInicioMes && fechaPago <= fechaCuota && !m._usada;
            });

            // Tambien buscar pagos hechos despues de la cuota pero antes de la siguiente
            const fechaSiguiente = new Date(fechaCuota);
            fechaSiguiente.setMonth(fechaSiguiente.getMonth() + 1);

            const pagoTardio = !pagoDelMes ? movimientos.find(m => {
                const fechaPago = new Date(m.fecha + 'T00:00:00');
                return fechaPago > fechaCuota && fechaPago < fechaSiguiente && !m._usada;
            }) : null;

            const pago = pagoDelMes || pagoTardio;
            let estado = 'mora';

            if (pago) {
                pago._usada = true;
                estado = 'pagado';
            } else if (fechaCuota > hoy) {
                estado = 'pendiente';
            }

            cuotas.push({
                numero: cuotaNum,
                fechaVencimiento: fechaStr,
                mes: mesStr,
                saldoCapital: saldoCapital,
                interesMes: interesMes,
                estado: estado,
                pago: pago || null
            });

            cuotaNum++;
            fechaCuota.setMonth(fechaCuota.getMonth() + 1);
        }

        return cuotas;
    },

    // Resumen de mora de un prestamo
    getResumenMora(prestamoId) {
        const cuotas = this.getCuotasMensuales(prestamoId);
        const enMora = cuotas.filter(c => c.estado === 'mora');
        const pagadas = cuotas.filter(c => c.estado === 'pagado');
        const prestamo = this.getPrestamoById(prestamoId);

        const totalInteresMora = enMora.reduce((sum, c) => sum + c.interesMes, 0);
        const totalInteresPagado = pagadas.reduce((sum, c) => sum + c.interesMes, 0);
        // La deuda total es: saldo capital + intereses en mora
        const deudaTotal = (prestamo ? prestamo.saldoCapital : 0) + totalInteresMora;

        return {
            cuotas,
            mesesMora: enMora.length,
            mesesPagados: pagadas.length,
            totalCuotas: cuotas.length,
            totalInteresMora,
            totalInteresPagado,
            deudaTotal
        };
    },

    // Estadisticas
    getEstadisticas() {
        const prestamos = this.getPrestamos();
        const activos = prestamos.filter(p => p.estado === 'activo');
        const movimientos = this.getMovimientos();

        const totalCapital = activos.reduce((sum, p) => sum + p.saldoCapital, 0);
        const totalIntereses = movimientos
            .filter(m => m.interesPagado > 0)
            .reduce((sum, m) => sum + m.interesPagado, 0)
            + movimientos
                .filter(m => m.interesDescontado > 0)
                .reduce((sum, m) => sum + m.interesDescontado, 0);

        // Total mora acumulada
        const totalMora = activos.reduce((sum, p) => {
            const resumen = this.getResumenMora(p.id);
            return sum + resumen.totalInteresMora;
        }, 0);

        const clientesActivos = [...new Set(activos.map(p => p.clienteId))].length;

        return {
            clientesActivos,
            prestamosActivos: activos.length,
            totalCapital,
            totalIntereses,
            totalMora
        };
    }
};

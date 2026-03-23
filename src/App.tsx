import React, { useState, useMemo, useEffect } from 'react';
import { Package, Search, Plus, Trash2, Edit, FileSpreadsheet, ArrowLeftRight, Boxes, Printer, LogOut } from 'lucide-react';
import { useShippingStore } from './store';
import { ShippingForm } from './components/ShippingForm';
import { ShippingEntry } from './types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const { entries, loading: storeLoading, addEntry, updateEntry, deleteEntry } = useShippingStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ShippingEntry | undefined>();

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const matchesSearch = e.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            e.orderNumber.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDate = filterDate ? e.date === filterDate : true;
      return matchesSearch && matchesDate;
    });
  }, [entries, searchTerm, filterDate]);

  const handleEdit = (entry: ShippingEntry) => {
    setEditingEntry(entry);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este registro?')) {
      deleteEntry(id);
    }
  };

  const handleSave = (entryData: Omit<ShippingEntry, 'id'>) => {
    if (editingEntry) {
      updateEntry(editingEntry.id, entryData);
    } else {
      addEntry(entryData);
    }
    setIsFormOpen(false);
    setEditingEntry(undefined);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permita a abertura de pop-ups para imprimir.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório de Conferência</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              color: black; 
            }
            h2 { margin-bottom: 5px; font-size: 18px; }
            p { margin: 5px 0; color: #333; font-size: 14px; }
            table { 
              border-collapse: collapse; 
              margin-top: 20px; 
              width: 100%; 
            }
            th, td { 
              border: 1px solid black; 
              padding: 6px 8px; 
              text-align: center; 
              font-size: 13px; 
            }
            th { 
              background-color: #f0f0f0; 
              font-weight: bold; 
            }
            .date-cell { 
              font-weight: bold; 
              text-transform: uppercase;
            }
            @media print {
              @page { margin: 1cm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <h2>Relatório de Conferência - Expedição Madeiramar</h2>
          <p>Data de emissão: ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
          ${filterDate ? `<p>Filtrado para a data: ${formatDate(filterDate)}</p>` : ''}
          
          <table>
            <thead>
              <tr>
                <th style="width: 15%">DATA VENDA</th>
                <th style="width: 20%">VENDA</th>
                <th style="width: 40%">CLIENTE</th>
                <th style="width: 25%">STATUS / VOLUMES</th>
              </tr>
            </thead>
            <tbody>
              ${groupedEntries.map(group => `
                <tr>
                  <td class="date-cell">${formatDate(group.date)}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
                ${group.entries.map(entry => `
                  <tr>
                    <td></td>
                    <td>${entry.orderNumber}</td>
                    <td>${entry.customer}</td>
                    <td><strong>${formatStatus(entry)}</strong></td>
                  </tr>
                `).join('')}
              `).join('')}
            </tbody>
          </table>
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
              }, 200);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const formatStatus = (entry: ShippingEntry) => {
    switch (entry.statusType) {
      case 'MDF_ONLY': return 'X';
      case 'RETURN': return 'RETIRAR P/ DEV';
      case 'HARDWARE': return `${entry.volumes} VOLUME${entry.volumes !== 1 ? 'S' : ''}`;
      case 'OTHER': return entry.otherDescription?.toUpperCase() || 'OUTROS';
      default: return '-';
    }
  };

  // Group by date for display
  const groupedEntries = useMemo(() => {
    const groups: Record<string, ShippingEntry[]> = {};
    filteredEntries.forEach(entry => {
      if (!groups[entry.date]) {
        groups[entry.date] = [];
      }
      groups[entry.date].push(entry);
    });
    
    // Sort dates descending
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(date => ({
      date,
      entries: groups[date]
    }));
  }, [filteredEntries]);

  const stats = useMemo(() => {
    let totalOrders = entries.length;
    let totalVolumes = 0;
    let totalReturns = 0;

    entries.forEach(e => {
      if (e.statusType === 'HARDWARE' && e.volumes) {
        totalVolumes += e.volumes;
      }
      if (e.statusType === 'RETURN') {
        totalReturns += 1;
      }
    });

    return { totalOrders, totalVolumes, totalReturns };
  }, [entries]);

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), "dd/MMM", { locale: ptBR }).replace('.', '');
    } catch {
      return dateString;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 max-w-md w-full text-center space-y-6">
          <div className="flex justify-center text-blue-600">
            <Package size={48} className="stroke-[2]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Expedição<span className="text-blue-600">Madeiramar</span></h1>
            <p className="text-gray-500 mt-2">Faça login para gerenciar as expedições</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-600">
            <Package size={24} className="stroke-[2.5]" />
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Expedição<span className="text-blue-600">Madeiramar</span></h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={handlePrint} className="text-gray-500 hover:text-gray-900 p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Imprimir Conferência">
              <Printer size={20} />
            </button>
            <button 
              onClick={() => {
                setEditingEntry(undefined);
                setIsFormOpen(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Nova Expedição</span>
            </button>
            <div className="h-6 w-px bg-gray-300 mx-1"></div>
            <button onClick={handleLogout} className="text-gray-500 hover:text-red-600 p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Sair">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 print:p-0 print:m-0 print:space-y-0">
        
        {/* Print Header */}
        <div className="hidden print:block mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Relatório de Conferência - Expedição Madeiramar</h2>
          <p className="text-gray-600">Data de emissão: {format(new Date(), "dd/MM/yyyy HH:mm")}</p>
          {filterDate && <p className="text-gray-600">Filtrado para a data: {formatDate(filterDate)}</p>}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Total de Pedidos</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalOrders}</p>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center shrink-0">
              <Boxes size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Total de Volumes (Ferragem)</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalVolumes}</p>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center shrink-0">
              <ArrowLeftRight size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Devoluções</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalReturns}</p>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col print:border-none print:shadow-none">
          
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50 print:hidden">
            <h2 className="text-lg font-semibold text-gray-800">Registros de Expedição</h2>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-48">
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-shadow text-gray-700"
                  title="Filtrar por data"
                />
                {filterDate && (
                  <button 
                    onClick={() => setFilterDate('')} 
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-medium bg-white px-1"
                  >
                    Limpar
                  </button>
                )}
              </div>
              <div className="relative w-full sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar pedido ou cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-shadow"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-left border-collapse min-w-[600px] print:min-w-0 print:w-full print:border print:border-black">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider print:bg-transparent print:text-black print:border-black">
                  <th className="px-6 py-3 w-32 print:px-2 print:py-1 print:border print:border-black print:w-24 text-center">DATA VENDA</th>
                  <th className="px-6 py-3 w-40 print:px-2 print:py-1 print:border print:border-black print:w-32 text-center">VENDA</th>
                  <th className="px-6 py-3 print:px-2 print:py-1 print:border print:border-black text-center">CLIENTE</th>
                  <th className="px-6 py-3 w-48 print:px-2 print:py-1 print:border print:border-black print:w-40 text-center">
                    <span className="print:hidden">STATUS / VOLUMES</span>
                  </th>
                  <th className="px-6 py-3 w-24 text-right print:hidden">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm text-gray-700 print:divide-none">
                {groupedEntries.map(group => (
                  <React.Fragment key={group.date}>
                    <tr className="bg-gray-100/80 border-t border-gray-200 print:bg-transparent print:border-none">
                      <td className="px-6 py-2 font-semibold text-gray-800 text-xs uppercase tracking-wider print:px-2 print:py-1 print:border print:border-black print:text-center">
                        {formatDate(group.date)}
                      </td>
                      <td className="print:border print:border-black print:px-2 print:py-1"></td>
                      <td className="print:border print:border-black print:px-2 print:py-1"></td>
                      <td className="print:border print:border-black print:px-2 print:py-1"></td>
                      <td className="print:hidden"></td>
                    </tr>
                    {group.entries.map(entry => (
                      <tr key={entry.id} className="hover:bg-blue-50/50 transition-colors group print:break-inside-avoid">
                        <td className="px-6 py-3 text-gray-500 print:px-2 print:py-1 print:border print:border-black print:text-transparent">
                          <span className="print:hidden">{formatDate(entry.date)}</span>
                        </td>
                        <td className="px-6 py-3 font-medium text-gray-900 print:px-2 print:py-1 print:border print:border-black print:text-center">
                          {entry.orderNumber}
                        </td>
                        <td className="px-6 py-3 font-medium text-gray-700 print:px-2 print:py-1 print:border print:border-black print:text-center">
                          {entry.customer}
                        </td>
                        <td className="px-6 py-3 print:px-2 print:py-1 print:border print:border-black print:text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide print:p-0 print:border-none print:bg-transparent print:text-black ${
                            entry.statusType === 'MDF_ONLY' ? 'bg-blue-100 text-blue-800' :
                            entry.statusType === 'RETURN' ? 'bg-red-100 text-red-800' :
                            entry.statusType === 'HARDWARE' ? 'bg-amber-100 text-amber-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {formatStatus(entry)}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right print:hidden">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleEdit(entry)} 
                              className="text-gray-400 hover:text-blue-600 p-1.5 rounded-md hover:bg-blue-50 transition-colors"
                              title="Editar"
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => handleDelete(entry.id)} 
                              className="text-gray-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                
                {!storeLoading && filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500 print:hidden">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Package size={32} className="text-gray-300" />
                        <p>Nenhum registro encontrado.</p>
                        {searchTerm && (
                          <button 
                            onClick={() => setSearchTerm('')}
                            className="text-blue-600 hover:underline text-sm mt-2"
                          >
                            Limpar busca
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {storeLoading && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500 print:hidden">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {isFormOpen && (
        <ShippingForm 
          entry={editingEntry} 
          onSave={handleSave} 
          onClose={() => {
            setIsFormOpen(false);
            setEditingEntry(undefined);
          }} 
        />
      )}
    </div>
  );
}

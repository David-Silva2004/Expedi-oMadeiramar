import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  Edit,
  FileSpreadsheet,
  LogOut,
  Package,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { ShippingForm } from './components/ShippingForm';
import { isAdminEmail, isLocalTestMode } from './config';
import { auth } from './firebase';
import {
  LegacyImportSkippedRow,
  LegacyParsedEntry,
  parseLegacyImportSheets,
} from './legacyImport';
import { useShippingStore } from './store';
import { ConsistencyNote, ShippingEntry, UserRole } from './types';

type ActivePage = 'dashboard' | 'expeditions' | 'quality';

interface ImportReviewState {
  fileName: string;
  readyEntries: LegacyParsedEntry[];
  skippedRows: LegacyImportSkippedRow[];
  sameDayConflicts: LegacyParsedEntry[];
  historicalConflicts: LegacyParsedEntry[];
  fileConflicts: LegacyParsedEntry[];
  inferredRows: LegacyParsedEntry[];
}

interface DuplicateAuditItem {
  orderNumber: string;
  count: number;
  latestDate: string;
  dates: string[];
  customers: string[];
  statuses: string[];
  hasMultipleDates: boolean;
  hasCustomerDivergence: boolean;
  hasStatusDivergence: boolean;
}

function normalizeOrderNumber(value: string) {
  return value.replace(/\D/g, '');
}

function normalizeComparableText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeCustomerKey(value: string) {
  return normalizeComparableText(value);
}

function formatStatus({
  statusType,
  volumes,
  otherDescription,
}: Pick<ShippingEntry, 'statusType' | 'volumes' | 'otherDescription'>) {
  switch (statusType) {
    case 'MDF_ONLY':
      return 'X';
    case 'RETURN':
      return 'RETIRAR P/ DEV';
    case 'HARDWARE':
      return `${volumes} VOLUME${volumes !== 1 ? 'S' : ''}`;
    case 'OTHER':
      return otherDescription?.toUpperCase() || 'OUTROS';
    default:
      return '-';
  }
}

export default function App() {
  const devUser = { uid: 'dev', displayName: 'Dev Admin', email: 'admin@local.dev' } as User;
  const [user, setUser] = useState<User | null>(isLocalTestMode ? devUser : null);
  const [authLoading, setAuthLoading] = useState(isLocalTestMode ? false : true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(true);

  useEffect(() => {
    if (isLocalTestMode) {
      // In local test mode keep a local user and skip the auth gate.
      setUser(devUser);
      setAuthLoading(false);
      return () => {};
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
    } catch (error) {
      console.error('Error signing in', error);
      setLoginError('Nao foi possivel entrar. Confira email, senha e se o login por email/senha esta ativo no Firebase.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  const {
    entries,
    consistencyNotes,
    loading: storeLoading,
    notesLoading,
    addEntry,
    importEntries,
    updateEntry,
    deleteEntry,
    saveConsistencyNote,
    isLocalMode,
    resetTestData,
  } =
    useShippingStore({ enableConsistencyNotes: isLocalTestMode || isAdminEmail(user?.email) });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ShippingEntry | undefined>();
  const [activePage, setActivePage] = useState<ActivePage>('dashboard');
  const [isImportingLegacyFile, setIsImportingLegacyFile] = useState(false);
  const [isSavingImportReview, setIsSavingImportReview] = useState(false);
  const [savingNoteOrderNumber, setSavingNoteOrderNumber] = useState<string | null>(null);
  const [importReview, setImportReview] = useState<ImportReviewState | null>(null);
  const [qualitySearchTerm, setQualitySearchTerm] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const legacyFileInputRef = useRef<HTMLInputElement | null>(null);
  const deferredQualitySearchTerm = useDeferredValue(qualitySearchTerm);
  const userRole: UserRole = isLocalTestMode || isAdminEmail(user?.email) ? 'admin' : 'operator';
  const canAccessAdminPages = userRole === 'admin';
  const visiblePage: ActivePage = canAccessAdminPages ? activePage : 'expeditions';

  useEffect(() => {
    if (!user) {
      return;
    }

    if (!canAccessAdminPages && activePage !== 'expeditions') {
      setActivePage('expeditions');
    }
  }, [activePage, canAccessAdminPages, user]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesSearch =
        entry.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.orderNumber.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDate = filterDate ? entry.date === filterDate : true;
      return matchesSearch && matchesDate;
    });
  }, [entries, searchTerm, filterDate]);

  const groupedEntries = useMemo(() => {
    const groups: Record<string, ShippingEntry[]> = {};

    filteredEntries.forEach((entry) => {
      if (!groups[entry.date]) {
        groups[entry.date] = [];
      }

      groups[entry.date].push(entry);
    });

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((date) => {
        const sortedEntries = groups[date].sort((a, b) => {
          const order = {
            RETURN: 1,
            MDF_ONLY: 2,
            HARDWARE: 3,
            OTHER: 4,
          };

          return order[a.statusType] - order[b.statusType];
        });

        return {
          date,
          entries: sortedEntries,
        };
      });
  }, [filteredEntries]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (user && !canAccessAdminPages && !filterDate) {
      setFilterDate(todayKey);
    }
  }, [canAccessAdminPages, filterDate, todayKey, user]);

  const stats = useMemo(() => {
    let totalOrders = entries.length;
    let totalVolumes = 0;
    let totalReturns = 0;
    let mdfOnly = 0;
    let hardwareOrders = 0;
    let otherOrders = 0;
    let todayOrders = 0;

    entries.forEach((entry) => {
      if (entry.date === todayKey) {
        todayOrders += 1;
      }

      switch (entry.statusType) {
        case 'MDF_ONLY':
          mdfOnly += 1;
          break;
        case 'HARDWARE':
          hardwareOrders += 1;
          totalVolumes += entry.volumes ?? 0;
          break;
        case 'RETURN':
          totalReturns += 1;
          break;
        case 'OTHER':
          otherOrders += 1;
          break;
      }
    });

    return {
      totalOrders,
      totalVolumes,
      totalReturns,
      mdfOnly,
      hardwareOrders,
      otherOrders,
      todayOrders,
    };
  }, [entries, todayKey]);

  const recentEntries = useMemo(() => {
    return [...entries]
      .sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) {
          return dateCompare;
        }

        return b.createdAt - a.createdAt;
      })
      .slice(0, 5);
  }, [entries]);

  const entriesByNormalizedOrder = useMemo<Record<string, ShippingEntry[]>>(() => {
    const nextEntriesByOrder: Record<string, ShippingEntry[]> = {};

    entries.forEach((entry) => {
      const normalizedOrderNumber = normalizeOrderNumber(entry.orderNumber);

      if (!normalizedOrderNumber) {
        return;
      }

      if (!nextEntriesByOrder[normalizedOrderNumber]) {
        nextEntriesByOrder[normalizedOrderNumber] = [];
      }

      nextEntriesByOrder[normalizedOrderNumber].push(entry);
    });

    return nextEntriesByOrder;
  }, [entries]);

  const duplicateOrders = useMemo<DuplicateAuditItem[]>(() => {
    return (Object.entries(entriesByNormalizedOrder) as Array<[string, ShippingEntry[]]>)
      .filter(([, groupedEntries]) => groupedEntries.length > 1)
      .map(([orderNumber, groupedEntries]) => {
        const sortedEntries = [...groupedEntries].sort((a, b) => {
          const dateCompare = b.date.localeCompare(a.date);
          if (dateCompare !== 0) {
            return dateCompare;
          }

          return b.createdAt - a.createdAt;
        });
        const uniqueDates = [...new Set(sortedEntries.map((entry) => entry.date))];
        const uniqueStatuses = [...new Set(sortedEntries.map((entry) => formatStatus(entry)))];
        const customersByKey = new Map<string, string>();

        sortedEntries.forEach((entry) => {
          const customerKey = normalizeCustomerKey(entry.customer);

          if (!customersByKey.has(customerKey)) {
            customersByKey.set(customerKey, entry.customer);
          }
        });

        return {
          orderNumber,
          count: groupedEntries.length,
          latestDate: sortedEntries[0]?.date ?? '',
          dates: uniqueDates,
          customers: [...customersByKey.values()],
          statuses: uniqueStatuses,
          hasMultipleDates: uniqueDates.length > 1,
          hasCustomerDivergence: customersByKey.size > 1,
          hasStatusDivergence: uniqueStatuses.length > 1,
        };
      })
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }

        const dateCompare = b.latestDate.localeCompare(a.latestDate);
        if (dateCompare !== 0) {
          return dateCompare;
        }

        return a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true });
      });
  }, [entriesByNormalizedOrder]);

  const latestEntry = recentEntries[0];
  const duplicateOrdersCount = duplicateOrders.length;
  const duplicateOccurrencesCount = duplicateOrders.reduce((total, item) => total + item.count, 0);
  const duplicateOrdersWithMultipleDates = duplicateOrders.filter((item) => item.hasMultipleDates).length;
  const duplicateOrdersWithCustomerDivergence = duplicateOrders.filter((item) => item.hasCustomerDivergence).length;
  const duplicateOrdersWithStatusDivergence = duplicateOrders.filter((item) => item.hasStatusDivergence).length;
  const qualitySearchDigits = normalizeOrderNumber(deferredQualitySearchTerm);
  const qualitySearchLabel = normalizeComparableText(deferredQualitySearchTerm);
  const filteredDuplicateOrders = useMemo(() => {
    if (!qualitySearchLabel && !qualitySearchDigits) {
      return duplicateOrders;
    }

    return duplicateOrders.filter((item) => {
      const matchesOrder = qualitySearchDigits ? item.orderNumber.includes(qualitySearchDigits) : false;
      const matchesCustomer = item.customers.some((customer) => normalizeComparableText(customer).includes(qualitySearchLabel));
      return matchesOrder || matchesCustomer;
    });
  }, [duplicateOrders, qualitySearchDigits, qualitySearchLabel]);
  const duplicateOrdersPreview = duplicateOrders.slice(0, 4);
  const consistencyNotesByOrder = useMemo<Record<string, ConsistencyNote>>(() => {
    return consistencyNotes.reduce<Record<string, ConsistencyNote>>((accumulator, note) => {
      accumulator[note.orderNumber] = note;
      return accumulator;
    }, {});
  }, [consistencyNotes]);
  const todayEntries = useMemo(() => entries.filter((entry) => entry.date === todayKey), [entries, todayKey]);
  const todayStatusBreakdown = useMemo(
    () => [
      {
        label: 'Pedidos hoje',
        value: todayEntries.length,
        description: 'Entradas registradas na data atual.',
      },
      {
        label: 'Volumes hoje',
        value: todayEntries.reduce((total, entry) => total + (entry.statusType === 'HARDWARE' ? entry.volumes ?? 0 : 0), 0),
        description: 'Volumes separados em ferragem hoje.',
      },
      {
        label: 'Retiradas hoje',
        value: todayEntries.filter((entry) => entry.statusType === 'RETURN').length,
        description: 'Pedidos marcados como retirada/devolucao.',
      },
    ],
    [todayEntries],
  );
  const importReviewBlockedCount = importReview
    ? importReview.sameDayConflicts.length + importReview.historicalConflicts.length + importReview.fileConflicts.length
    : 0;
  const importReviewFileConflictCounts = useMemo(() => {
    if (!importReview) {
      return {} as Record<string, number>;
    }

    return importReview.fileConflicts.reduce<Record<string, number>>((accumulator, item) => {
      const orderNumber = normalizeOrderNumber(item.entry.orderNumber);
      accumulator[orderNumber] = (accumulator[orderNumber] ?? 0) + 1;
      return accumulator;
    }, {});
  }, [importReview]);
  useEffect(() => {
    setNoteDrafts((currentDrafts) => {
      const nextDrafts: Record<string, string> = {};

      duplicateOrders.forEach((item) => {
        nextDrafts[item.orderNumber] =
          currentDrafts[item.orderNumber] ?? consistencyNotesByOrder[item.orderNumber]?.note ?? '';
      });

      return nextDrafts;
    });
  }, [consistencyNotesByOrder, duplicateOrders]);
  const statusBreakdown = [
    {
      label: 'So MDF',
      description: 'Corte, colagem e producao simples',
      value: stats.mdfOnly,
      badgeClassName: 'bg-blue-50 text-blue-700',
      barClassName: 'bg-blue-600',
    },
    {
      label: 'Ferragem',
      description: 'Pedidos com volumes separados',
      value: stats.hardwareOrders,
      badgeClassName: 'bg-amber-50 text-amber-700',
      barClassName: 'bg-amber-500',
    },
    {
      label: 'Devolucao',
      description: 'Materiais para retirada ou retorno',
      value: stats.totalReturns,
      badgeClassName: 'bg-red-50 text-red-700',
      barClassName: 'bg-red-500',
    },
    {
      label: 'Outros',
      description: 'Separacoes fora do fluxo padrao',
      value: stats.otherOrders,
      badgeClassName: 'bg-gray-100 text-gray-700',
      barClassName: 'bg-gray-500',
    },
  ];
  const maxStatusValue = Math.max(...statusBreakdown.map((item) => item.value), 1);

  const handleEdit = (entry: ShippingEntry) => {
    setEditingEntry(entry);
    setIsFormOpen(true);
    setActivePage('expeditions');
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este registro?')) {
      deleteEntry(id);
    }
  };

  const handleSave = async (entryData: Omit<ShippingEntry, 'id' | 'userId' | 'createdAt'>) => {
    const normalizedOrderNumber = normalizeOrderNumber(entryData.orderNumber);

    if (!normalizedOrderNumber) {
      alert('O código do pedido deve conter apenas números.');
      return;
    }

    const hasDuplicateOrderForDate = entries.some((entry) => {
      const normalizedExistingOrderNumber = normalizeOrderNumber(entry.orderNumber);

      return (
        entry.date === entryData.date &&
        normalizedExistingOrderNumber === normalizedOrderNumber &&
        entry.id !== editingEntry?.id
      );
    });

    if (hasDuplicateOrderForDate) {
      alert('Já existe um pedido com esse código nesta mesma data.');
      return;
    }

    const normalizedEntryData = {
      ...entryData,
      orderNumber: normalizedOrderNumber,
    };

    if (editingEntry) {
      await updateEntry(editingEntry.id, normalizedEntryData);
    } else {
      await addEntry(normalizedEntryData);
    }

    setIsFormOpen(false);
    setEditingEntry(undefined);
    setActivePage('expeditions');
  };

  const openNewEntryForm = () => {
    setEditingEntry(undefined);
    setActivePage('expeditions');
    setIsFormOpen(true);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'dd/MMM', { locale: ptBR }).replace('.', '');
    } catch {
      return dateString;
    }
  };

  const formatFullDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  const getEntryDateOrderKey = (date: string, orderNumber: string) => {
    return `${date}::${normalizeOrderNumber(orderNumber)}`;
  };

  const getSkippedReasonLabel = (reason: LegacyImportSkippedRow['reason']) => {
    switch (reason) {
      case 'missing_date':
        return 'sem data associada';
      case 'missing_order_number':
        return 'sem codigo numerico';
      case 'missing_customer':
        return 'sem cliente';
      default:
        return 'ignorado';
    }
  };

  const getDuplicateIssueLabels = (item: DuplicateAuditItem) => {
    const labels: string[] = [];

    if (item.hasMultipleDates) {
      labels.push('datas diferentes');
    }

    if (item.hasCustomerDivergence) {
      labels.push('clientes divergentes');
    }

    if (item.hasStatusDivergence) {
      labels.push('status divergentes');
    }

    if (labels.length === 0) {
      labels.push('repeticao simples');
    }

    return labels;
  };

  const getOrderSourceLabel = (source: LegacyParsedEntry['orderSource']) => {
    switch (source) {
      case 'order_column':
        return 'pedido lido da coluna venda';
      case 'status_column':
        return 'pedido encontrado na coluna status';
      case 'customer_text':
        return 'pedido extraido do texto do cliente';
      default:
        return 'origem nao identificada';
    }
  };

  const getStatusSourceLabel = (source: LegacyParsedEntry['statusSource']) => {
    switch (source) {
      case 'explicit_x':
        return 'status lido como X';
      case 'blank_default_mdf':
        return 'status vazio assumido como MDF';
      case 'volume_text':
        return 'status inferido por volume';
      case 'return_keyword':
        return 'status inferido como devolucao';
      case 'other_text':
        return 'status mantido como outro';
      default:
        return 'status sem classificacao';
    }
  };

  const getInferenceFlagLabel = (flag: LegacyParsedEntry['inferenceFlags'][number]) => {
    switch (flag) {
      case 'order_number_from_status':
        return 'codigo veio da coluna status';
      case 'order_number_from_customer':
        return 'codigo veio do texto do cliente';
      case 'status_defaulted_to_mdf':
        return 'status vazio assumido como MDF';
      case 'status_inferred_as_return':
        return 'texto indica devolucao';
      case 'status_inferred_from_volume':
        return 'texto indica volume/ferragem';
      case 'status_imported_as_other':
        return 'status entrou como outro';
      default:
        return 'linha com inferencia';
    }
  };

  const getImportPreviewKey = (item: LegacyParsedEntry) => {
    return `${item.sheetName}-${item.rowNumber}-${item.entry.orderNumber}`;
  };

  const handleConsistencyNoteChange = (orderNumber: string, value: string) => {
    setNoteDrafts((currentDrafts) => ({
      ...currentDrafts,
      [orderNumber]: value,
    }));
  };

  const handleConsistencyNoteSave = async (orderNumber: string) => {
    if (!canAccessAdminPages || savingNoteOrderNumber) {
      return;
    }

    setSavingNoteOrderNumber(orderNumber);

    try {
      await saveConsistencyNote(orderNumber, noteDrafts[orderNumber] ?? '');
    } finally {
      setSavingNoteOrderNumber(null);
    }
  };

  const openLegacyImportPicker = () => {
    if (!canAccessAdminPages || isImportingLegacyFile) {
      return;
    }

    legacyFileInputRef.current?.click();
  };

  const handleLegacyImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canAccessAdminPages) {
      event.target.value = '';
      return;
    }

    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsImportingLegacyFile(true);
    setImportReview(null);

    try {
      const fileBuffer = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(fileBuffer, {
        type: 'array',
        cellDates: true,
      });

      const sheets = workbook.SheetNames.map((sheetName) => ({
        name: sheetName,
        rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
          defval: null,
          raw: true,
        }) as unknown[][],
      }));

      const parseResult = parseLegacyImportSheets(sheets);
      const existingDateKeys = new Set(entries.map((entry) => getEntryDateOrderKey(entry.date, entry.orderNumber)));
      const fileRowsByOrder: Record<string, LegacyParsedEntry[]> = {};

      parseResult.parsedEntries.forEach((parsedEntry) => {
        const normalizedOrderNumber = normalizeOrderNumber(parsedEntry.entry.orderNumber);

        if (!fileRowsByOrder[normalizedOrderNumber]) {
          fileRowsByOrder[normalizedOrderNumber] = [];
        }

        fileRowsByOrder[normalizedOrderNumber].push(parsedEntry);
      });

      const nextReview: ImportReviewState = {
        fileName: file.name,
        readyEntries: [],
        skippedRows: parseResult.skippedRows,
        sameDayConflicts: [],
        historicalConflicts: [],
        fileConflicts: [],
        inferredRows: [],
      };

      parseResult.parsedEntries.forEach((parsedEntry) => {
        const normalizedOrderNumber = normalizeOrderNumber(parsedEntry.entry.orderNumber);
        const dateKey = getEntryDateOrderKey(parsedEntry.entry.date, parsedEntry.entry.orderNumber);
        const hasSameDayConflict = existingDateKeys.has(dateKey);
        const appearsInCurrentHistory = (entriesByNormalizedOrder[normalizedOrderNumber]?.length ?? 0) > 0;
        const repeatsInsideFile = (fileRowsByOrder[normalizedOrderNumber]?.length ?? 0) > 1;

        if (parsedEntry.inferenceFlags.length > 0) {
          nextReview.inferredRows.push(parsedEntry);
        }

        if (hasSameDayConflict) {
          nextReview.sameDayConflicts.push(parsedEntry);
          return;
        }

        if (repeatsInsideFile) {
          nextReview.fileConflicts.push(parsedEntry);
          return;
        }

        if (appearsInCurrentHistory) {
          nextReview.historicalConflicts.push(parsedEntry);
          return;
        }

        nextReview.readyEntries.push(parsedEntry);
      });

      setImportReview(nextReview);
    } catch (error) {
      console.error('Legacy import error', error);
      alert('Nao foi possivel ler a planilha antiga. Se quiser, me envie o outro modelo para eu ajustar o parser.');
    } finally {
      setIsImportingLegacyFile(false);
      event.target.value = '';
    }
  };

  const handleConfirmImportReview = async () => {
    if (!canAccessAdminPages || !importReview || importReview.readyEntries.length === 0 || isSavingImportReview) {
      return;
    }

    setIsSavingImportReview(true);

    try {
      const importedCount = await importEntries(importReview.readyEntries.map((item) => item.entry));

      if (importedCount === 0) {
        alert('Nao foi possivel concluir a importacao.');
        return;
      }

      const blockedCount =
        importReview.sameDayConflicts.length +
        importReview.historicalConflicts.length +
        importReview.fileConflicts.length;

      setImportReview(null);
      setActivePage('expeditions');
      alert(
        `Importacao concluida.\n\nRegistros importados: ${importedCount}\nLinhas com conflito bloqueadas: ${blockedCount}\nLinhas invalidas: ${importReview.skippedRows.length}\nLinhas com inferencia para revisao: ${importReview.inferredRows.length}`,
      );
    } finally {
      setIsSavingImportReview(false);
    }
  };

  const getExistingHistoryDatesPreview = (orderNumber: string) => {
    const relatedEntries = entriesByNormalizedOrder[normalizeOrderNumber(orderNumber)] ?? [];
    const uniqueDates = [...new Set(relatedEntries.map((entry) => formatFullDate(entry.date)))];
    const previewDates = uniqueDates.slice(0, 4).join(', ');

    if (uniqueDates.length <= 4) {
      return previewDates;
    }

    return `${previewDates}...`;
  };

  const renderImportEntryPreview = (
    rows: LegacyParsedEntry[],
    emptyMessage: string,
    detailClassName: string,
    buildDetail: (item: LegacyParsedEntry) => string,
  ) => {
    if (rows.length === 0) {
      return <p className="mt-4 text-sm leading-6 text-gray-600">{emptyMessage}</p>;
    }

    const previewRows = rows.slice(0, 6);

    return (
      <div className="mt-4 space-y-3">
        {previewRows.map((item) => {
          const rowTags = [
            getOrderSourceLabel(item.orderSource),
            getStatusSourceLabel(item.statusSource),
            ...item.inferenceFlags.map((flag) => getInferenceFlagLabel(flag)),
          ];
          const uniqueRowTags = [...new Set(rowTags)];

          return (
            <article key={getImportPreviewKey(item)} className="rounded-2xl border border-white/70 bg-white/90 px-4 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">Pedido {item.entry.orderNumber}</p>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
                      {item.sheetName} L{item.rowNumber}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {formatFullDate(item.entry.date)} • {item.entry.customer}
                  </p>
                </div>

                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {formatStatus(item.entry)}
                </span>
              </div>

              <p className={`mt-3 text-sm leading-6 ${detailClassName}`}>{buildDetail(item)}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {uniqueRowTags.map((tag) => (
                  <span
                    key={`${getImportPreviewKey(item)}-${tag}`}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          );
        })}

        {rows.length > previewRows.length && (
          <p className="text-xs font-medium text-gray-500">+ {rows.length - previewRows.length} outra(s) linha(s) nesta categoria.</p>
        )}
      </div>
    );
  };

  const renderSkippedRowsPreview = (rows: LegacyImportSkippedRow[]) => {
    if (rows.length === 0) {
      return <p className="mt-4 text-sm leading-6 text-gray-600">Nenhuma linha invalida encontrada.</p>;
    }

    const previewRows = rows.slice(0, 6);

    return (
      <div className="mt-4 space-y-3">
        {previewRows.map((row) => (
          <article
            key={`${row.sheetName}-${row.rowNumber}-${row.rawOrderNumber}-${row.customer}`}
            className="rounded-2xl border border-white/70 bg-white/90 px-4 py-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">{row.sheetName} L{row.rowNumber}</p>
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                {getSkippedReasonLabel(row.reason)}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Pedido: {row.rawOrderNumber || '-'} • Cliente: {row.customer || '-'} • Status: {row.rawStatus || '-'}
            </p>
          </article>
        ))}

        {rows.length > previewRows.length && (
          <p className="text-xs font-medium text-gray-500">+ {rows.length - previewRows.length} outra(s) linha(s) invalidas.</p>
        )}
      </div>
    );
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
          <title>Relatorio de Conferencia</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: black; }
            h2 { margin-bottom: 5px; font-size: 18px; }
            p { margin: 5px 0; color: #333; font-size: 14px; }
            table { border-collapse: collapse; margin-top: 20px; width: 100%; }
            th, td { border: 1px solid black; padding: 6px 8px; text-align: center; font-size: 13px; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .date-cell { font-weight: bold; text-transform: uppercase; }
            @media print {
              @page { margin: 1cm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <h2>Relatorio de Conferencia - Expedicao Madeiramar</h2>
          <p>Data de emissao: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
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
              ${groupedEntries
                .map(
                  (group) => `
                <tr>
                  <td class="date-cell">${formatDate(group.date)}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
                ${group.entries
                  .map(
                    (entry) => `
                  <tr>
                    <td></td>
                    <td>${entry.orderNumber}</td>
                    <td>${entry.customer}</td>
                    <td><strong>${formatStatus(entry)}</strong></td>
                  </tr>
                `,
                  )
                  .join('')}
              `,
                )
                .join('')}
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isLocalTestMode && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <form onSubmit={handleLogin} className="w-full max-w-md space-y-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex justify-center text-blue-600">
            <Package size={48} className="stroke-[2]" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">
              Expedicao<span className="text-blue-600">Madeiramar</span>
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Entre com email e senha. Contas listadas em `VITE_ADMIN_EMAILS` entram com acesso de admin; as demais ficam na operacao de expedicao.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition-shadow focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                placeholder="voce@empresa.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Senha</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition-shadow focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                placeholder="Sua senha"
              />
            </div>
          </div>

          {loginError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loginError}</p>}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingIn ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    );
  }

  const dashboardContent = (
    <section className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_320px] print:hidden">
      <div className="space-y-6">
        <div className="rounded-3xl border border-gray-200 bg-white px-6 py-6 shadow-sm lg:px-8">
          <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div className="min-w-0 max-w-xl space-y-3">
              <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                Dashboard
              </span>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-[1.95rem]">
                  Operacao da expedicao
                </h2>
                <p className="text-sm leading-6 text-gray-600">
                  KPIs, alertas e leitura de contexto para acompanhar a operacao sem perder tempo abrindo varias areas.
                </p>
              </div>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 2xl:max-w-[320px]">
              <button
                onClick={() => setActivePage('expeditions')}
                className="rounded-2xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Abrir Expedicoes
              </button>
              <button
                onClick={openNewEntryForm}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Cadastrar pedido
              </button>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Foco do painel</p>
                <p className="mt-1 text-sm leading-6 text-gray-700">
                  Acompanhar volume, duplicidades e ritmo do dia; o trabalho detalhado segue na tela de Expedicoes.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {[
              {
                label: 'Pedidos',
                value: stats.totalOrders,
                description: 'Base total registrada',
                icon: <FileSpreadsheet size={22} />,
                iconClassName: 'bg-blue-50 text-blue-600',
              },
              {
                label: 'Hoje',
                value: stats.todayOrders,
                description: 'Entradas feitas hoje',
                icon: <Package size={22} />,
                iconClassName: 'bg-emerald-50 text-emerald-600',
              },
              {
                label: 'Ferragem',
                value: stats.totalVolumes,
                description: 'Volumes no historico',
                icon: <Boxes size={22} />,
                iconClassName: 'bg-amber-50 text-amber-600',
              },
              {
                label: 'Devolucoes',
                value: stats.totalReturns,
                description: 'Pedidos para retirada',
                icon: <ArrowLeftRight size={22} />,
                iconClassName: 'bg-red-50 text-red-600',
              },
            ].map((item) => (
              <div key={item.label} className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50/80 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-500">{item.label}</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{item.value}</p>
                    <p className="mt-2 text-sm leading-5 text-gray-600">{item.description}</p>
                  </div>
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.iconClassName}`}
                  >
                    {item.icon}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className={`rounded-3xl border p-6 shadow-sm ${
            duplicateOrdersCount > 0 ? 'border-red-200 bg-red-50/70' : 'border-emerald-200 bg-emerald-50/70'
          }`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                    duplicateOrdersCount > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  <AlertTriangle size={20} />
                </div>

                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${duplicateOrdersCount > 0 ? 'text-red-900' : 'text-emerald-900'}`}>
                    {duplicateOrdersCount > 0 ? 'Auditoria de consistencia' : 'Historico sem conflitos aparentes'}
                  </p>
                  <p
                    className={`mt-1 text-sm leading-6 ${duplicateOrdersCount > 0 ? 'text-red-800' : 'text-emerald-800'}`}
                  >
                    {duplicateOrdersCount > 0
                      ? 'O historico tem pedidos repetidos e a auditoria agora separa o que e conflito de data, cliente e status para voce revisar com mais clareza.'
                      : 'Nenhum pedido repetido apareceu no historico atual.'}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setActivePage('quality')}
              className={`shrink-0 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                duplicateOrdersCount > 0
                  ? 'bg-red-100 text-red-800 hover:bg-red-200'
                  : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
              }`}
            >
              Abrir auditoria
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/70 bg-white/85 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Pedidos afetados</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{duplicateOrdersCount}</p>
              <p className="mt-1 text-sm text-gray-600">{duplicateOccurrencesCount} ocorrencias no historico.</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/85 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Datas divergentes</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{duplicateOrdersWithMultipleDates}</p>
              <p className="mt-1 text-sm text-gray-600">Mesmo pedido em mais de uma data.</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/85 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Clientes divergentes</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{duplicateOrdersWithCustomerDivergence}</p>
              <p className="mt-1 text-sm text-gray-600">Codigo ligado a clientes diferentes.</p>
            </div>
          </div>

          {duplicateOrdersPreview.length > 0 && (
            <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
              {duplicateOrdersPreview.slice(0, 3).map((duplicate) => (
                <div key={duplicate.orderNumber} className="rounded-2xl border border-red-100 bg-white/85 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-900">Pedido {duplicate.orderNumber}</p>
                    <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                      {duplicate.count}x
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{getDuplicateIssueLabels(duplicate).join(' / ')}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-200 px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold tracking-tight text-gray-900">Expedicoes recentes</h3>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                Ultimos registros adicionados ao sistema, com leitura direta de data, pedido, cliente e status.
              </p>
            </div>

            <button
              onClick={() => setActivePage('expeditions')}
              className="rounded-2xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              Ver lista completa
            </button>
          </div>

          {storeLoading ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
            </div>
          ) : recentEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center text-gray-500">
              <Package size={32} className="text-gray-300" />
              <p>Nenhuma expedicao cadastrada ainda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    <th className="px-6 py-4">Data</th>
                    <th className="px-6 py-4">Venda</th>
                    <th className="px-6 py-4">Cliente</th>
                    <th className="px-6 py-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-sm text-gray-700">
                  {recentEntries.map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-gray-50/80">
                      <td className="px-6 py-4 font-medium text-gray-900">{formatDate(entry.date)}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">{entry.orderNumber}</td>
                      <td className="px-6 py-4">{entry.customer}</td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                            entry.statusType === 'MDF_ONLY'
                              ? 'bg-blue-100 text-blue-800'
                              : entry.statusType === 'RETURN'
                                ? 'bg-red-100 text-red-800'
                                : entry.statusType === 'HARDWARE'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {formatStatus(entry)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <aside className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-500">Painel rapido</p>
            <h3 className="text-xl font-semibold tracking-tight text-gray-900">Contexto do momento</h3>
            <p className="text-sm leading-6 text-gray-600">
              Resumo lateral de orientacao para manter a leitura da operacao mais objetiva.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl bg-gray-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Ultimo pedido</p>
              <p className="mt-2 break-words text-xl font-semibold text-gray-900">
                {latestEntry ? latestEntry.orderNumber : '-'}
              </p>
              <p className="mt-2 break-words text-sm leading-6 text-gray-600">
                {latestEntry ? `${latestEntry.customer} - ${formatDate(latestEntry.date)}` : 'Nenhum registro ainda.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-xs font-medium text-gray-500">Maior fluxo</p>
                <p className="mt-1 text-base font-semibold text-gray-900">
                  {stats.hardwareOrders > stats.mdfOnly ? 'Ferragem' : 'So MDF'}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-xs font-medium text-gray-500">Duplicados</p>
                <p className="mt-1 text-base font-semibold text-gray-900">{duplicateOrdersCount}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Proximo passo</p>
              <p className="mt-2 text-lg font-semibold text-blue-900">Operar pela tela de Expedicoes</p>
              <p className="mt-2 text-sm leading-6 text-blue-800">
                Cadastre, revise filtros e use a importacao de planilha quando precisar puxar historico antigo.
              </p>
            </div>
          </div>
        </aside>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-500">Status da operacao</p>
            <h3 className="text-xl font-semibold tracking-tight text-gray-900">Distribuicao do fluxo</h3>
            <p className="text-sm leading-6 text-gray-600">
              Leitura de peso relativo por status, sem apertar a coluna com textos longos.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            {statusBreakdown.map((item) => (
              <div key={item.label} className="rounded-2xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                    <p className="mt-1 text-sm leading-5 text-gray-500">{item.description}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${item.badgeClassName}`}>
                    {item.value}
                  </span>
                </div>

                <div className="mt-4 h-2 rounded-full bg-gray-100">
                  <div
                    className={`h-2 rounded-full ${item.barClassName}`}
                    style={{
                      width: `${item.value > 0 ? Math.max((item.value / maxStatusValue) * 100, 12) : 0}%`,
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  const qualityContent = (
    <>
      <section className="flex flex-col gap-4 print:hidden lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
            Consistencia
          </span>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Auditoria do historico</h2>
          <p className="max-w-3xl text-sm leading-6 text-gray-600">
            Esta tela trata os erros reais do banco: pedidos repetidos, datas diferentes para o mesmo codigo,
            clientes divergentes e variacao de status para o mesmo pedido.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => setActivePage('dashboard')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Voltar ao Dashboard
          </button>
          <button
            onClick={openLegacyImportPicker}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Revisar planilha antiga
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 print:hidden md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Pedidos duplicados',
            value: duplicateOrdersCount,
            description: 'Codigos que aparecem mais de uma vez no historico.',
            className: 'border-red-100 bg-red-50/70',
          },
          {
            label: 'Datas divergentes',
            value: duplicateOrdersWithMultipleDates,
            description: 'Mesmo pedido encontrado em mais de uma data.',
            className: 'border-orange-100 bg-orange-50/70',
          },
          {
            label: 'Clientes divergentes',
            value: duplicateOrdersWithCustomerDivergence,
            description: 'Mesmo codigo associado a clientes diferentes.',
            className: 'border-amber-100 bg-amber-50/70',
          },
          {
            label: 'Status divergentes',
            value: duplicateOrdersWithStatusDivergence,
            description: 'Mesmo pedido com classificacoes diferentes.',
            className: 'border-blue-100 bg-blue-50/70',
          },
        ].map((item) => (
          <div key={item.label} className={`rounded-3xl border p-5 shadow-sm ${item.className}`}>
            <p className="text-sm font-medium text-gray-500">{item.label}</p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900">{item.value}</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 items-start gap-6 print:hidden xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-200 px-6 py-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold tracking-tight text-gray-900">Pedidos para revisar</h3>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                Use a busca para localizar um codigo ou cliente e entender porque esse pedido entrou em auditoria.
              </p>
            </div>

            <div className="relative w-full lg:max-w-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar pedido ou cliente..."
                value={qualitySearchTerm}
                onChange={(event) => setQualitySearchTerm(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none transition-shadow focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {filteredDuplicateOrders.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-12 text-center text-gray-500">
              <AlertTriangle size={28} className="text-gray-300" />
              <p className="font-medium text-gray-700">
                {duplicateOrdersCount === 0 ? 'Nenhum pedido duplicado encontrado.' : 'Nenhum pedido bate com a busca.'}
              </p>
              <p className="max-w-md text-sm leading-6">
                {duplicateOrdersCount === 0
                  ? 'Quando houver repeticoes no historico, elas aparecerao aqui com o motivo detalhado.'
                  : 'Tente buscar por outro codigo ou pelo nome do cliente.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredDuplicateOrders.map((item) => (
                <article key={item.orderNumber} className="px-6 py-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="text-lg font-semibold text-gray-900">Pedido {item.orderNumber}</h4>
                        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                          {item.count} registro(s)
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {getDuplicateIssueLabels(item).map((label) => (
                          <span
                            key={`${item.orderNumber}-${label}`}
                            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="text-sm text-gray-500">Ultima ocorrencia: {formatFullDate(item.latestDate)}</p>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Datas</p>
                      <p className="mt-2 text-sm leading-6 text-gray-700">
                        {item.dates.map((date) => formatFullDate(date)).join(', ')}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Clientes</p>
                      <p className="mt-2 text-sm leading-6 text-gray-700">{item.customers.join(', ')}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Status</p>
                      <p className="mt-2 text-sm leading-6 text-gray-700">{item.statuses.join(', ')}</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Observacao do admin</p>
                        <p className="mt-1 text-sm leading-6 text-gray-600">
                          Registre o que foi conferido, a justificativa ou a proxima acao desse pedido.
                        </p>
                      </div>

                      {consistencyNotesByOrder[item.orderNumber]?.updatedAt ? (
                        <p className="text-xs text-gray-500">
                          Ultima atualizacao: {format(new Date(consistencyNotesByOrder[item.orderNumber].updatedAt), 'dd/MM/yyyy HH:mm')}
                        </p>
                      ) : null}
                    </div>

                    <textarea
                      value={noteDrafts[item.orderNumber] ?? ''}
                      onChange={(event) => handleConsistencyNoteChange(item.orderNumber, event.target.value)}
                      rows={3}
                      className="mt-4 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 text-gray-700 outline-none transition-shadow focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                      placeholder="Ex: pedido reaproveitado pelo comercial, alinhado com o time em 25/03."
                    />

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-gray-500">
                        {consistencyNotesByOrder[item.orderNumber]?.updatedByEmail
                          ? `Atualizado por ${consistencyNotesByOrder[item.orderNumber].updatedByEmail}`
                          : notesLoading
                            ? 'Carregando observacoes...'
                            : 'Sem observacao salva ainda.'}
                      </p>

                      <button
                        onClick={() => handleConsistencyNoteSave(item.orderNumber)}
                        disabled={savingNoteOrderNumber === item.orderNumber}
                        className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingNoteOrderNumber === item.orderNumber ? 'Salvando...' : 'Salvar observacao'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <aside className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-500">Como a revisao funciona</p>
              <h3 className="text-xl font-semibold tracking-tight text-gray-900">Leitura de consistencia</h3>
            </div>

            <div className="mt-6 space-y-3 text-sm leading-6 text-gray-600">
              <p>
                `datas diferentes`: o mesmo codigo apareceu em dias diferentes e merece conferencia no historico.
              </p>
              <p>
                `clientes divergentes`: o mesmo codigo esta ligado a nomes de cliente diferentes.
              </p>
              <p>
                `status divergentes`: o pedido recebeu classificacoes diferentes ao longo do banco.
              </p>
              <p>
                Na importacao, a planilha agora separa conflito com banco, repeticao dentro do arquivo, linha invalida
                e linha com inferencia automatica.
              </p>
              <p>Cada pedido em auditoria aceita uma observacao salva pelo admin para registrar o contexto.</p>
            </div>
          </aside>

          <aside className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-500">Casos mais pesados</p>
                <h3 className="text-xl font-semibold tracking-tight text-gray-900">Pedidos mais repetidos</h3>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                {duplicateOrdersCount}
              </span>
            </div>

            {duplicateOrdersPreview.length === 0 ? (
              <p className="mt-6 text-sm leading-6 text-gray-600">Nenhum pedido duplicado para revisar agora.</p>
            ) : (
              <div className="mt-6 space-y-3">
                {duplicateOrdersPreview.map((item) => (
                  <div key={`preview-${item.orderNumber}`} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900">Pedido {item.orderNumber}</p>
                      <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                        {item.count}x
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      {getDuplicateIssueLabels(item).join(' • ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>
    </>
  );

  const expeditionsContent = (
    <>
      <section className="flex flex-col gap-4 print:hidden lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
            Expedicoes
          </span>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            {canAccessAdminPages ? 'Cadastro e conferencia' : 'Operacao de expedicao'}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-gray-600">
            {canAccessAdminPages
              ? 'Esta pagina e a operacao do dia a dia. Aqui o time adiciona expedicoes, pesquisa registros, edita entradas e imprime a conferencia.'
              : 'A conta operacional fica focada na expedicao do dia, com leitura rapida dos indices de hoje e acesso direto aos registros.'}
          </p>
        </div>

        {canAccessAdminPages && (
          <button
            onClick={() => setActivePage('dashboard')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Voltar ao Dashboard
          </button>
        )}
      </section>

      {!canAccessAdminPages && (
        <section className="grid grid-cols-1 gap-4 print:hidden md:grid-cols-3">
          {todayStatusBreakdown.map((item) => (
            <div key={item.label} className="rounded-3xl border border-gray-200 bg-white px-5 py-5 shadow-sm">
              <p className="text-sm font-medium text-gray-500">{item.label}</p>
              <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900">{item.value}</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
            </div>
          ))}
        </section>
      )}

      <div className="mb-4 hidden print:block">
        <h2 className="text-2xl font-bold text-gray-900">Relatorio de Conferencia - Expedicao Madeiramar</h2>
        <p className="text-gray-600">Data de emissao: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
        {filterDate && <p className="text-gray-600">Filtrado para a data: {formatDate(filterDate)}</p>}
      </div>

      <section className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm print:border-none print:shadow-none">
        <div className="flex flex-col items-center justify-between gap-4 border-b border-gray-200 bg-gray-50/50 p-4 sm:flex-row print:hidden">
          <h3 className="text-lg font-semibold text-gray-800">Registros de Expedicao</h3>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <div className="relative w-full sm:w-48">
              <input
                type="date"
                value={filterDate}
                onChange={(event) => setFilterDate(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 outline-none transition-shadow focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                title="Filtrar por data"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white px-1 text-xs font-medium text-gray-400 hover:text-gray-600"
                >
                  Limpar
                </button>
              )}
            </div>

            <div className="relative w-full sm:w-72">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search size={18} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar pedido ou cliente..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm outline-none transition-shadow focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[600px] border-collapse text-left print:min-w-0 print:w-full print:border print:border-black">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500 print:border-black print:bg-transparent print:text-black">
                <th className="w-32 px-6 py-3 text-center print:w-24 print:border print:border-black print:px-2 print:py-1">
                  Data venda
                </th>
                <th className="w-40 px-6 py-3 text-center print:w-32 print:border print:border-black print:px-2 print:py-1">
                  Venda
                </th>
                <th className="px-6 py-3 text-center print:border print:border-black print:px-2 print:py-1">
                  Cliente
                </th>
                <th className="w-48 px-6 py-3 text-center print:w-40 print:border print:border-black print:px-2 print:py-1">
                  <span className="print:hidden">Status / Volumes</span>
                </th>
                <th className="w-24 px-6 py-3 text-right print:hidden">Acoes</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 text-sm text-gray-700 print:divide-none">
              {groupedEntries.map((group) => (
                <React.Fragment key={group.date}>
                  <tr className="border-t border-gray-200 bg-gray-100/80 print:border-none print:bg-transparent">
                    <td className="px-6 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-800 print:border print:border-black print:px-2 print:py-1">
                      {formatDate(group.date)}
                    </td>
                    <td className="print:border print:border-black print:px-2 print:py-1"></td>
                    <td className="print:border print:border-black print:px-2 print:py-1"></td>
                    <td className="print:border print:border-black print:px-2 print:py-1"></td>
                    <td className="print:hidden"></td>
                  </tr>

                  {group.entries.map((entry) => (
                    <tr key={entry.id} className="group transition-colors hover:bg-blue-50/50 print:break-inside-avoid">
                      <td className="px-6 py-3 text-gray-500 print:border print:border-black print:px-2 print:py-1 print:text-transparent">
                        <span className="print:hidden">{formatDate(entry.date)}</span>
                      </td>
                      <td className="px-6 py-3 text-center font-medium text-gray-900 print:border print:border-black print:px-2 print:py-1">
                        {entry.orderNumber}
                      </td>
                      <td className="px-6 py-3 text-center font-medium text-gray-700 print:border print:border-black print:px-2 print:py-1">
                        {entry.customer}
                      </td>
                      <td className="px-6 py-3 text-center print:border print:border-black print:px-2 print:py-1">
                        <span
                          className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide print:border-none print:bg-transparent print:p-0 print:text-black ${
                            entry.statusType === 'MDF_ONLY'
                              ? 'bg-blue-100 text-blue-800'
                              : entry.statusType === 'RETURN'
                                ? 'bg-red-100 text-red-800'
                                : entry.statusType === 'HARDWARE'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {formatStatus(entry)}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right print:hidden">
                        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => handleEdit(entry)}
                            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                            title="Editar"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
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
                        <button onClick={() => setSearchTerm('')} className="mt-2 text-sm text-blue-600 hover:underline">
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
                      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white print:hidden">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 text-blue-600">
            <div className="flex items-center gap-2">
              <Package size={24} className="stroke-[2.5]" />
              <h1 className="text-xl font-bold tracking-tight text-gray-900">
                Expedicao<span className="text-blue-600">Madeiramar</span>
              </h1>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
              <button
                onClick={() => setActivePage('expeditions')}
                className={`rounded-md px-3 py-1 text-sm font-semibold ${
                  visiblePage === 'expeditions' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                Expedicoes
              </button>
              {canAccessAdminPages && (
                <>
                  <button
                    onClick={() => setActivePage('dashboard')}
                    className={`rounded-md px-3 py-1 text-sm font-semibold ${
                      visiblePage === 'dashboard' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={() => setActivePage('quality')}
                    className={`rounded-md px-3 py-1 text-sm font-semibold ${
                      visiblePage === 'quality' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Consistencia
                  </button>
                </>
              )}
            </div>

            <span
              className={`hidden rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] sm:inline-flex ${
                canAccessAdminPages ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {canAccessAdminPages ? 'Admin' : 'Operacao'}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {visiblePage === 'expeditions' && (
              <button
                onClick={handlePrint}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                title="Imprimir conferencia"
              >
                <Printer size={20} />
              </button>
            )}

            {canAccessAdminPages && (
              <button
                onClick={openLegacyImportPicker}
                disabled={isImportingLegacyFile}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload size={18} />
                <span className="hidden sm:inline">{isImportingLegacyFile ? 'Lendo planilha...' : 'Revisar planilha'}</span>
              </button>
            )}

            <button
              onClick={openNewEntryForm}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Nova Expedicao</span>
            </button>

            {isLocalMode ? (
              <button
                onClick={resetTestData}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
              >
                Resetar teste
              </button>
            ) : (
              <>
                <div className="mx-1 h-6 w-px bg-gray-300"></div>

                <button
                  onClick={handleLogout}
                  className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600"
                  title="Sair"
                >
                  <LogOut size={20} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 print:m-0 print:space-y-0 print:p-0">
        {isLocalMode && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950 print:hidden">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">Modo de teste local ativo</p>
                <p className="mt-1 text-amber-900">
                  Tudo que voce cadastrar aqui fica salvo no navegador para voce ir testando sem depender do Firebase.
                </p>
              </div>

              <button
                onClick={resetTestData}
                className="rounded-lg border border-amber-300 bg-white px-4 py-2 font-medium text-amber-900 transition-colors hover:bg-amber-100"
              >
                Recarregar dados de exemplo
              </button>
            </div>
          </section>
        )}

        {visiblePage === 'dashboard'
          ? dashboardContent
          : visiblePage === 'quality'
            ? qualityContent
            : expeditionsContent}
      </main>

      <input
        ref={legacyFileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleLegacyImport}
        className="hidden"
      />

      {importReview && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-950/45 p-4 print:hidden">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-6 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                    Revisao de importacao
                  </span>
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight text-gray-900">{importReview.fileName}</h3>
                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      A planilha foi lida, classificada e separada antes de qualquer gravacao no banco.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (!isSavingImportReview) {
                      setImportReview(null);
                    }
                  }}
                  className="rounded-2xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
                {[
                  {
                    label: 'Prontas',
                    value: importReview.readyEntries.length,
                    tone: 'border-emerald-100 bg-emerald-50/70',
                  },
                  {
                    label: 'Mesmo dia',
                    value: importReview.sameDayConflicts.length,
                    tone: 'border-red-100 bg-red-50/70',
                  },
                  {
                    label: 'Historico',
                    value: importReview.historicalConflicts.length,
                    tone: 'border-orange-100 bg-orange-50/70',
                  },
                  {
                    label: 'No arquivo',
                    value: importReview.fileConflicts.length,
                    tone: 'border-amber-100 bg-amber-50/70',
                  },
                  {
                    label: 'Inferidas',
                    value: importReview.inferredRows.length,
                    tone: 'border-blue-100 bg-blue-50/70',
                  },
                  {
                    label: 'Invalidas',
                    value: importReview.skippedRows.length,
                    tone: 'border-gray-200 bg-gray-50',
                  },
                ].map((item) => (
                  <div key={item.label} className={`rounded-2xl border px-4 py-4 ${item.tone}`}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{item.label}</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <section className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5">
                  <div>
                    <h4 className="text-lg font-semibold text-emerald-950">Prontas para importar</h4>
                    <p className="mt-1 text-sm leading-6 text-emerald-900">
                      Linhas sem conflito bloqueante. Sao essas que vao para o banco ao confirmar.
                    </p>
                  </div>
                  {renderImportEntryPreview(
                    importReview.readyEntries,
                    'Nenhuma linha ficou pronta para importar.',
                    'text-emerald-900',
                    () => 'Linha validada sem conflito com o banco e sem repeticao bloqueante dentro do arquivo.',
                  )}
                </section>

                <section className="rounded-3xl border border-red-200 bg-red-50/60 p-5">
                  <div>
                    <h4 className="text-lg font-semibold text-red-950">Conflito na mesma data</h4>
                    <p className="mt-1 text-sm leading-6 text-red-900">
                      O sistema ja possui esse mesmo pedido na mesma data. Essas linhas ficam bloqueadas.
                    </p>
                  </div>
                  {renderImportEntryPreview(
                    importReview.sameDayConflicts,
                    'Nenhum conflito exato de data + pedido encontrado.',
                    'text-red-900',
                    (item) => `Ja existe no banco com a chave ${formatFullDate(item.entry.date)} + pedido ${item.entry.orderNumber}.`,
                  )}
                </section>

                <section className="rounded-3xl border border-orange-200 bg-orange-50/60 p-5">
                  <div>
                    <h4 className="text-lg font-semibold text-orange-950">Conflito com o historico</h4>
                    <p className="mt-1 text-sm leading-6 text-orange-900">
                      O codigo ja existe no banco em outra data. Vale conferir se e repeticao real ou reaproveitamento indevido.
                    </p>
                  </div>
                  {renderImportEntryPreview(
                    importReview.historicalConflicts,
                    'Nenhum conflito com o historico atual.',
                    'text-orange-900',
                    (item) => `Ja existe no banco em: ${getExistingHistoryDatesPreview(item.entry.orderNumber)}.`,
                  )}
                </section>

                <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5">
                  <div>
                    <h4 className="text-lg font-semibold text-amber-950">Pedido repetido no arquivo</h4>
                    <p className="mt-1 text-sm leading-6 text-amber-900">
                      O mesmo codigo apareceu mais de uma vez na planilha enviada. Essas linhas tambem ficam bloqueadas.
                    </p>
                  </div>
                  {renderImportEntryPreview(
                    importReview.fileConflicts,
                    'Nenhum codigo repetido dentro da propria planilha.',
                    'text-amber-900',
                    (item) =>
                      `Esse codigo aparece ${importReviewFileConflictCounts[normalizeOrderNumber(item.entry.orderNumber)] ?? 0} vez(es) neste arquivo.`,
                  )}
                </section>

                <section className="rounded-3xl border border-blue-200 bg-blue-50/60 p-5">
                  <div>
                    <h4 className="text-lg font-semibold text-blue-950">Linhas com inferencia automatica</h4>
                    <p className="mt-1 text-sm leading-6 text-blue-900">
                      Aqui entram linhas em que o parser precisou deduzir pedido ou status. Elas aparecem para revisao, mesmo quando estao prontas.
                    </p>
                  </div>
                  {renderImportEntryPreview(
                    importReview.inferredRows,
                    'Nenhuma linha exigiu inferencia automatica.',
                    'text-blue-900',
                    () => 'Revise os chips abaixo para entender de onde o parser tirou o codigo e como classificou o status.',
                  )}
                </section>

                <section className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900">Linhas invalidas</h4>
                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      Linhas sem data, sem codigo numerico ou sem cliente. Elas nao entram na importacao.
                    </p>
                  </div>
                  {renderSkippedRowsPreview(importReview.skippedRows)}
                </section>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-sm leading-6 text-gray-600">
                  {importReview.readyEntries.length} linha(s) prontas, {importReviewBlockedCount} bloqueada(s), {importReview.skippedRows.length} invalida(s).
                </p>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => setImportReview(null)}
                    disabled={isSavingImportReview}
                    className="rounded-2xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Fechar revisao
                  </button>
                  <button
                    onClick={handleConfirmImportReview}
                    disabled={importReview.readyEntries.length === 0 || isSavingImportReview}
                    className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingImportReview
                      ? 'Importando...'
                      : `Importar ${importReview.readyEntries.length} linha(s) prontas`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Database, Eye, Info, Lock, RefreshCw, ShieldAlert, Undo2, X } from 'lucide-react';
import { AuthLockScreen, AuthSession } from './components/AuthLockScreen';
import { BackupConfirmationModal } from './components/BackupConfirmationModal';
import { BeneficiariesDashboard } from './components/BeneficiariesDashboard';
import { BeneficiaryReportModal } from './components/BeneficiaryReportModal';
import { DailySummaryReport } from './components/DailySummaryReport';
import { DatabaseSettingsModal } from './components/DatabaseSettingsModal';
import { DayEntriesModal } from './components/DayEntriesModal';
import { EntryEditModal } from './components/EntryEditModal';
import { ExportModal } from './components/ExportModal';
import { GlobalHeaderSearch } from './components/GlobalHeaderSearch';
import { HeaderToolsMenu } from './components/HeaderToolsMenu';
import { ImportPanel } from './components/ImportPanel';
import { LedgerTable } from './components/LedgerTable';
import {
  OfflineIndicator,
  PWAInstallButton,
  WindowsDesktopModal,
} from './components/PWAInstallControl';
import { PrintPayload, PrintView } from './components/PrintView';
import { QuickEntryModal } from './components/QuickEntryModal';
import { SecuritySettingsModal } from './components/SecuritySettingsModal';
import { SignaturePanel } from './components/SignaturePanel';
import {
  AppState,
  BackupFrequency,
  DailySummaryRow,
  Entry,
  LedgerPrintPage,
  NumeralStyle,
  ReportScope,
  SheetKey,
  SignerInfo,
} from './types/ledger';
import {
  drawBeneficiaryReportPNG,
  drawDailyReportPNG,
  drawLedgerPNG,
} from './utils/canvasExport';
import {
  buildBeneficiaryStatementExcelBlob,
  buildDailySummaryExcelBlob,
  buildLedgersExcelBlob,
} from './utils/excelExport';
import {
  BeneficiaryStatement,
  DEFAULT_STATE,
  MAX_IMPORT_FILE_BYTES,
  SHEETS,
  STORE_KEY,
  applyHighContrastMode,
  buildBeneficiaryRows,
  buildDailySummaryRows,
  createSampleEntries,
  csvEscape,
  downloadBlob,
  filterByPeriod,
  formatNum,
  formatPeriodLabel,
  formatQtyWithUnit,
  getAvailablePeriods,
  importCSVText,
  loadHighContrastPref,
  makeEntry,
  parseRawText,
  roundQty,
  sanitizeEntry,
  sanitizeState,
} from './utils/ledgerLogic';
import {
  DbStatusInfo,
  LocalDeviceFileHandle,
  UnauthorizedError,
  changeLocalDbLocation,
  createLocalDbBackup,
  downloadBackupFileBlob,
  downloadSqliteDbBlob,
  fetchLocalDbInfo,
  fetchLocalDbState,
  importSqliteDbFile,
  isPeriodicBackupDue,
  restoreLocalDbBackup,
  saveLocalDbState,
  syncBlobToDeviceFileHandle,
} from './utils/localDbClient';

type ActiveTab = SheetKey | 'daily-report';

export default function App() {
  // Auth token stays strictly in React memory — never persisted to localStorage/sessionStorage
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [lockReason, setLockReason] = useState<string | null>(null);

  const handleLockedOut = useCallback((reason?: string) => {
    setAuthSession(null);
    setLockReason(reason || null);
  }, []);

  if (!authSession) {
    return (
      <AuthLockScreen
        lockReason={lockReason}
        onUnlocked={(session) => {
          setLockReason(null);
          setAuthSession(session);
        }}
      />
    );
  }

  return (
    <AuthenticatedLedgerApp
      session={authSession}
      onSessionUpdated={setAuthSession}
      onLock={handleLockedOut}
    />
  );
}

interface AuthenticatedLedgerAppProps {
  session: AuthSession;
  onSessionUpdated: (next: AuthSession) => void;
  onLock: (reason?: string) => void;
}

function AuthenticatedLedgerApp({
  session,
  onSessionUpdated,
  onLock,
}: AuthenticatedLedgerAppProps) {
  const [state, setState] = useState<AppState>(() => ({
    ...DEFAULT_STATE,
    highContrast: loadHighContrastPref(),
  }));
  const [dbLoaded, setDbLoaded] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbInfo, setDbInfo] = useState<DbStatusInfo | null>(null);
  const [savingDb, setSavingDb] = useState(false);
  const [dbReloadNonce, setDbReloadNonce] = useState(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>('order');
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [databaseModalOpen, setDatabaseModalOpen] = useState(false);
  const [windowsGuideOpen, setWindowsGuideOpen] = useState(false);
  const [backupPromptOpen, setBackupPromptOpen] = useState(false);
  const [linkedDeviceFile, setLinkedDeviceFile] = useState<LocalDeviceFileHandle | null>(null);
  const [defaultPwdBannerDismissed, setDefaultPwdBannerDismissed] = useState(false);
  const [beneficiaryReportTarget, setBeneficiaryReportTarget] = useState<string | null>(null);
  const [printPayload, setPrintPayload] = useState<PrintPayload | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [dayEntriesModalDay, setDayEntriesModalDay] = useState<number | null | undefined>(
    undefined
  );
  const [highlightedTarget, setHighlightedTarget] = useState<{
    name: string;
    day?: number;
    nonce: number;
  } | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);
  const lastSyncedJsonRef = useRef<string>('');
  const linkedDeviceFileRef = useRef<LocalDeviceFileHandle | null>(null);
  const backupPromptCheckedRef = useRef(false);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const performServerLogout = useCallback(
    (reason?: string) => {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      }).catch(() => {
        // Ignore network errors on lock
      });
      onLock(reason);
    },
    [session.token, onLock]
  );

  // Verify session token periodically with the server
  useEffect(() => {
    const check = () => {
      if (Date.now() >= session.expiresAt) {
        onLock('انتهت مدة الجلسة، يرجى إدخال كلمة المرور للمتابعة.');
        return;
      }
      fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${session.token}` },
        cache: 'no-store',
      })
        .then((res) => {
          if (res.status === 401) {
            onLock('انتهت الجلسة، يرجى تسجيل الدخول مجددًا.');
          }
        })
        .catch(() => {
          // Offline / temporary hiccup shouldn't unexpectedly lock local work
        });
    };

    const intervalId = window.setInterval(check, 60_000);
    return () => window.clearInterval(intervalId);
  }, [session.token, session.expiresAt, onLock]);

  // Auto-lock on inactivity
  const autoLockMinutes = state.autoLockMinutes ?? 15;
  useEffect(() => {
    if (!autoLockMinutes || autoLockMinutes <= 0) return;

    let idleTimer: number | null = null;
    const timeoutMs = autoLockMinutes * 60 * 1000;

    const resetTimer = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        performServerLogout(`تم قفل التطبيق تلقائيًا بعد ${autoLockMinutes} دقيقة من الخمول.`);
      }, timeoutMs);
    };

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [autoLockMinutes, performServerLogout]);

  // Daily reminder check
  const lastRemindedDateRef = useRef<string>('');
  useEffect(() => {
    const reminderTime = state.dailyReminderTime;
    if (!reminderTime || !/^\d{2}:\d{2}$/.test(reminderTime)) return;

    const checkReminder = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${hours}:${minutes}`;

      if (currentTimeStr === reminderTime) {
        const todayIso = now.toISOString().slice(0, 10);
        if (lastRemindedDateRef.current === todayIso) return;

        const hasEntriesToday = state.entries.some((e) => {
          if (e.date === todayIso) return true;
          const [y, m, d] = todayIso.split('-').map(Number);
          if (e.day === d && (!e.date || e.date.slice(0, 7) === todayIso.slice(0, 7))) {
            return true;
          }
          return false;
        });

        if (!hasEntriesToday) {
          lastRemindedDateRef.current = todayIso;
          notify('تذكير يومي: لم تقم بتسجيل أي قيود لليوم الحالي حتى الآن.');
        }
      }
    };

    const intervalId = window.setInterval(checkReminder, 30_000);
    checkReminder();
    return () => window.clearInterval(intervalId);
  }, [state.dailyReminderTime, state.entries, notify]);

  // Load application state from local SQLite database (with one-time legacy browser migration)
  useEffect(() => {
    let cancelled = false;

    async function loadDatabase() {
      setDbError(null);
      try {
        const fetched = await fetchLocalDbState(session.token);
        if (cancelled) return;

        let activeState = fetched.state;
        let activeInfo = fetched.dbInfo;

        try {
          const legacyRaw = localStorage.getItem(STORE_KEY);
          if (legacyRaw) {
            const legacyParsed = JSON.parse(legacyRaw) as Record<string, unknown>;
            const legacySafe = sanitizeState(legacyParsed);
            const dbIsEmpty =
              activeState.entries.length === 0 &&
              !activeState.signer.name &&
              !activeState.signer.image;
            const legacyHasData =
              legacySafe.entries.length > 0 ||
              Boolean(legacySafe.signer.name) ||
              Boolean(legacySafe.signer.image);

            if (dbIsEmpty && legacyHasData) {
              const migrated = await saveLocalDbState(session.token, {
                ...legacySafe,
                highContrast: activeState.highContrast || Boolean(legacySafe.highContrast),
              });
              if (cancelled) return;
              activeState = migrated.state;
              activeInfo = migrated.dbInfo;
              notify('تم ترحيل البيانات السابقة إلى قاعدة البيانات المحلية (.db) بنجاح.');
            }
            // Clear browser-bound ledger DB cache so storage remains independent of browser
            localStorage.removeItem(STORE_KEY);
          }
        } catch {
          // Ignore malformed legacy browser cache
        }

        lastSyncedJsonRef.current = JSON.stringify(activeState);
        setState(activeState);
        setDbInfo(activeInfo);
        setDbLoaded(true);

        if (
          !backupPromptCheckedRef.current &&
          isPeriodicBackupDue(
            activeState.backupFrequency,
            activeState.lastBackupAt,
            activeState.entries.length
          )
        ) {
          backupPromptCheckedRef.current = true;
          setBackupPromptOpen(true);
        } else {
          backupPromptCheckedRef.current = true;
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          onLock(err.message);
          return;
        }
        setDbError((err as Error).message || 'تعذر تحميل قاعدة البيانات المحلية.');
      }
    }

    loadDatabase();
    return () => {
      cancelled = true;
    };
  }, [session.token, dbReloadNonce, onLock, notify]);

  // Persist changes to local SQLite database file (and optional linked device file)
  useEffect(() => {
    if (!dbLoaded) return;
    const serialized = JSON.stringify(state);
    if (serialized === lastSyncedJsonRef.current) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSavingDb(true);
      try {
        const saved = await saveLocalDbState(session.token, state);
        if (cancelled) return;
        lastSyncedJsonRef.current = serialized;
        setDbInfo(saved.dbInfo);

        if (linkedDeviceFileRef.current) {
          try {
            const { blob } = await downloadSqliteDbBlob(session.token);
            await syncBlobToDeviceFileHandle(linkedDeviceFileRef.current, blob);
          } catch {
            // Device file handle permission might need re-selection after idle; non-fatal for main SQLite save
          }
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          onLock(err.message);
          return;
        }
        notify((err as Error).message || 'تعذر حفظ التعديلات في قاعدة البيانات المحلية.');
      } finally {
        if (!cancelled) setSavingDb(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [state, dbLoaded, session.token, onLock, notify]);

  const periods = useMemo(() => getAvailablePeriods(state.entries), [state.entries]);

  // Keep selected period valid if periods change
  const effectivePeriod = useMemo(() => {
    if (state.period === 'all') return 'all';
    if (periods.includes(state.period)) return state.period;
    return periods.length ? periods[0] : 'all';
  }, [state.period, periods]);

  const numeralStyle: NumeralStyle = state.numeralStyle || 'ar';
  const unit = state.unit ?? 'لتر';
  const readOnly = Boolean(state.readOnly);
  const highContrast = Boolean(state.highContrast);
  const currentSheet: SheetKey = activeTab === 'daily-report' ? 'order' : activeTab;

  useEffect(() => {
    applyHighContrastMode(highContrast);
  }, [highContrast]);

  const setHighContrastEnabled = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, highContrast: enabled }));
  }, []);

  const toggleHighContrast = useCallback(() => {
    setState((prev) => {
      const next = !prev.highContrast;
      notify(
        next
          ? 'تم تفعيل وضع التباين العالي لتحسين وضوح العرض.'
          : 'تم إيقاف وضع التباين العالي والعودة للعرض القياسي.'
      );
      return { ...prev, highContrast: next };
    });
  }, [notify]);

  const toggleReadOnly = useCallback(() => {
    setState((prev) => {
      const next = !prev.readOnly;
      if (next) {
        setQuickAddOpen(false);
        setImportModalOpen(false);
        setEditingEntry(null);
      }
      notify(
        next
          ? 'تم تفعيل وضع القراءة فقط: تم تعطيل حقول الإدخال وأزرار التعديل والحذف.'
          : 'تم إلغاء وضع القراءة فقط: يمكنك التعديل وإضافة القيود الآن.'
      );
      return { ...prev, readOnly: next };
    });
  }, [notify]);

  const periodScopedEntries = useMemo(
    () => filterByPeriod(state.entries, effectivePeriod),
    [state.entries, effectivePeriod]
  );

  const activeSheetEntries = useMemo(
    () => periodScopedEntries.filter((e) => e.sheet === currentSheet),
    [periodScopedEntries, currentSheet]
  );

  const beneficiaryRows = useMemo(
    () => buildBeneficiaryRows(activeSheetEntries, search),
    [activeSheetEntries, search]
  );

  const dailySummaryCount = useMemo(
    () => buildDailySummaryRows(state.entries, effectivePeriod, 'all', 'date_asc', false).length,
    [state.entries, effectivePeriod]
  );

  const sheetTotal = useMemo(
    () => roundQty(activeSheetEntries.reduce((s, e) => roundQty(s + (Number(e.qty) || 0)), 0)),
    [activeSheetEntries]
  );

  const grandTotal = useMemo(
    () => roundQty(periodScopedEntries.reduce((s, e) => roundQty(s + (Number(e.qty) || 0)), 0)),
    [periodScopedEntries]
  );

  const allBeneficiariesCount = useMemo(
    () => new Set(periodScopedEntries.map((e) => e.name)).size,
    [periodScopedEntries]
  );

  const snapshot = useCallback((currentEntries: Entry[]) => {
    setHistory((prev) => {
      const next = [...prev, JSON.stringify(currentEntries)];
      return next.length > 20 ? next.slice(next.length - 20) : next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (readOnly) {
      notify('وضع القراءة فقط نشط — قم بإلغائه للتراجع عن التعديلات.');
      return;
    }
    if (!history.length) return;
    const prevSnapshot = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    try {
      const rawParsed = JSON.parse(prevSnapshot) as unknown;
      const parsedEntries = Array.isArray(rawParsed)
        ? rawParsed.map(sanitizeEntry).filter((e): e is Entry => Boolean(e))
        : [];
      setState((prev) => ({ ...prev, entries: parsedEntries }));
      notify('تم التراجع عن آخر تعديل.');
    } catch {
      notify('تعذر استعادة النسخة السابقة.');
    }
  }, [readOnly, history, notify]);

  // Global keyboard shortcuts: Ctrl/Cmd+K (search) and Ctrl/Cmd+Z (undo outside inputs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        globalSearchInputRef.current?.focus();
        globalSearchInputRef.current?.select();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (readOnly) return;
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          if (history.length > 0) {
            e.preventDefault();
            handleUndo();
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readOnly, history.length, handleUndo]);

  const isEntryInScope = useCallback(
    (e: Entry, targetSheet: SheetKey) => {
      if (e.sheet !== targetSheet) return false;
      if (effectivePeriod === 'all') return true;
      return Boolean(e.date && e.date.slice(0, 7) === effectivePeriod);
    },
    [effectivePeriod]
  );

  const handleSetCell = useCallback(
    (name: string, day: number, qty: number) => {
      if (readOnly) return;
      setState((prev) => {
        snapshot(prev.entries);
        const retained = prev.entries.filter(
          (e) => !(e.name === name && e.day === day && isEntryInScope(e, currentSheet))
        );

        if (qty > 0) {
          const date =
            effectivePeriod !== 'all'
              ? `${effectivePeriod}-${String(day).padStart(2, '0')}`
              : '';
          const created = makeEntry(name, day, 'تعديل يدوي', qty, date, currentSheet);
          if (created) retained.push(created);
        } else if (!retained.some((e) => e.name === name && isEntryInScope(e, currentSheet))) {
          const emptyDate = effectivePeriod === 'all' ? '' : `${effectivePeriod}-01`;
          const placeholder = makeEntry(name, 1, '', 0, emptyDate, currentSheet);
          if (placeholder) retained.push(placeholder);
        }

        return { ...prev, entries: retained };
      });
      notify('تم حفظ كمية اليوم.');
    },
    [readOnly, snapshot, isEntryInScope, currentSheet, effectivePeriod, notify]
  );

  const handleAddBeneficiary = useCallback(
    (name: string) => {
      if (readOnly) return;
      if (beneficiaryRows.some((r) => r.name === name)) {
        notify('هذا الاسم موجود بالفعل في الكشف.');
        return;
      }
      snapshot(state.entries);
      const date = effectivePeriod !== 'all' ? `${effectivePeriod}-01` : '';
      const created = makeEntry(name, 1, '', 0, date, currentSheet);
      if (!created) return;
      setState((prev) => ({ ...prev, entries: [...prev.entries, created] }));
      notify('تمت إضافة المستفيد.');
    },
    [readOnly, beneficiaryRows, notify, snapshot, state.entries, effectivePeriod, currentSheet]
  );

  const handleRenameBeneficiary = useCallback(
    (oldName: string, newName: string) => {
      if (readOnly) return;
      snapshot(state.entries);
      setState((prev) => ({
        ...prev,
        entries: prev.entries.map((e) =>
          e.name === oldName && isEntryInScope(e, currentSheet) ? { ...e, name: newName } : e
        ),
      }));
      notify('تم تعديل اسم المستفيد.');
    },
    [readOnly, snapshot, state.entries, isEntryInScope, currentSheet, notify]
  );

  const handleDeleteBeneficiary = useCallback(
    (name: string) => {
      if (readOnly) return;
      snapshot(state.entries);
      setState((prev) => ({
        ...prev,
        entries: prev.entries.filter(
          (e) => !(e.name === name && isEntryInScope(e, currentSheet))
        ),
      }));
      notify('تم حذف المستفيد من نطاق الكشف الحالي.');
    },
    [readOnly, snapshot, state.entries, isEntryInScope, currentSheet, notify]
  );

  const handleDeleteSelected = useCallback(
    (names: string[]) => {
      if (readOnly) return;
      snapshot(state.entries);
      const nameSet = new Set(names);
      setState((prev) => ({
        ...prev,
        entries: prev.entries.filter(
          (e) => !(nameSet.has(e.name) && isEntryInScope(e, currentSheet))
        ),
      }));
      notify('تم حذف المستفيدين المحددين.');
    },
    [readOnly, snapshot, state.entries, isEntryInScope, currentSheet, notify]
  );

  const handleMergeBeneficiaries = useCallback(
    (names: string[], targetName: string) => {
      if (readOnly) return;
      snapshot(state.entries);
      const nameSet = new Set(names);
      setState((prev) => ({
        ...prev,
        entries: prev.entries.map((e) =>
          nameSet.has(e.name) && isEntryInScope(e, currentSheet)
            ? { ...e, name: targetName }
            : e
        ),
      }));
      notify(`تم دمج ${names.length} مستفيدين.`);
    },
    [readOnly, snapshot, state.entries, isEntryInScope, currentSheet, notify]
  );

  const handleUpdateEntry = useCallback(
    (updated: Entry) => {
      if (readOnly) {
        notify('وضع القراءة فقط نشط — لا يمكن تعديل القيود.');
        return;
      }
      const clean = sanitizeEntry(updated);
      if (!clean) return;
      snapshot(state.entries);
      setState((prev) => ({
        ...prev,
        entries: prev.entries.map((e) => (e.id === clean.id ? clean : e)),
      }));
      notify('تم حفظ تعديلات القيد بنجاح.');
    },
    [readOnly, snapshot, state.entries, notify]
  );

  const handleDeleteEntry = useCallback(
    (entryId: string) => {
      if (readOnly) {
        notify('وضع القراءة فقط نشط — لا يمكن حذف القيود.');
        return;
      }
      snapshot(state.entries);
      setState((prev) => ({
        ...prev,
        entries: prev.entries.filter((e) => e.id !== entryId),
      }));
      notify('تم حذف القيد المحدد.');
    },
    [readOnly, snapshot, state.entries, notify]
  );

  const handleDeleteDayEntries = useCallback(
    (entryIds: string[], dayLabel?: string) => {
      if (readOnly) {
        notify('وضع القراءة فقط نشط — لا يمكن حذف القيود.');
        return;
      }
      if (!entryIds.length) return;
      const idSet = new Set(entryIds);
      snapshot(state.entries);
      setState((prev) => ({
        ...prev,
        entries: prev.entries.filter((e) => !idSet.has(e.id)),
      }));
      notify(
        dayLabel
          ? `تم حذف ${formatNum(entryIds.length, numeralStyle)} قيد من تاريخ ${dayLabel}.`
          : `تم حذف ${formatNum(entryIds.length, numeralStyle)} قيد من اليوم المحدد.`
      );
    },
    [readOnly, snapshot, state.entries, numeralStyle, notify]
  );

  const handleParsePaste = (text: string): boolean => {
    if (readOnly) {
      notify('وضع القراءة فقط نشط — لا يمكن إضافة قيود.');
      return false;
    }
    const res = parseRawText(text);
    if (!res.added.length) {
      notify('لم أتعرف على قيود كاملة. استخدم الصيغة المقترحة أو CSV.');
      return false;
    }
    snapshot(state.entries);
    const nextEntries = [...state.entries, ...res.added];
    const nextPeriods = getAvailablePeriods(nextEntries);
    setState((prev) => ({
      ...prev,
      entries: nextEntries,
      period: nextPeriods.length ? nextPeriods[0] : prev.period,
    }));
    notify(
      `تمت إضافة ${res.added.length} قيد${res.skipped ? `، وتجاوز ${res.skipped}` : ''}.`
    );
    return true;
  };

  const handleImportCsvFile = (file: File) => {
    if (readOnly) {
      notify('وضع القراءة فقط نشط — لا يمكن استيراد قيود.');
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      notify('حجم الملف يتجاوز الحد المسموح (5 ميجابايت).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const res = importCSVText(String(reader.result || ''));
      if (!res.added.length) {
        notify(`لم تُستورد قيود. تم تجاوز ${res.skipped} صفًا غير مكتمل.`);
        return;
      }
      snapshot(state.entries);
      const nextEntries = [...state.entries, ...res.added];
      const nextPeriods = getAvailablePeriods(nextEntries);
      setState((prev) => ({
        ...prev,
        entries: nextEntries,
        period: nextPeriods.length ? nextPeriods[0] : prev.period,
      }));
      notify(
        `تم استيراد ${res.added.length} قيدًا${res.skipped ? `، وتجاوز ${res.skipped}` : ''}.`
      );
    };
    reader.onerror = () => {
      notify('تعذر قراءة الملف المختار.');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleDownloadTemplate = () => {
    const csv =
      'المستفيد,التاريخ,اليوم,الوصف,الكمية,الكشف\r\n"أنس محمد علي","2026-11-29",29,"أمر من قائد اللواء",40,"المنصرف بأمر"\r\n';
    downloadBlob(
      new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }),
      'نموذج_استيراد_القيود.csv'
    );
  };

  const handleLoadSampleData = () => {
    if (readOnly) {
      notify('وضع القراءة فقط نشط — لا يمكن إدراج بيانات.');
      return;
    }
    snapshot(state.entries);
    const sample = createSampleEntries();
    const nextEntries = [...state.entries, ...sample];
    const nextPeriods = getAvailablePeriods(nextEntries);
    setState((prev) => ({
      ...prev,
      entries: nextEntries,
      period: nextPeriods.length ? nextPeriods[0] : prev.period,
    }));
    notify(`تم إدراج ${sample.length} قيدًا تجريبيًا (منها ١٥ قيدًا في يوم ٢٩ بإجمالي ٤٥٠ لتر).`);
  };

  const handleSaveQuickEntry = (entry: Entry) => {
    if (readOnly) {
      notify('وضع القراءة فقط نشط — لا يمكن إضافة قيود.');
      return;
    }
    snapshot(state.entries);
    const nextEntries = [...state.entries, entry];
    const nextPeriods = getAvailablePeriods(nextEntries);
    setState((prev) => ({
      ...prev,
      entries: nextEntries,
      period: nextPeriods.length && prev.period === 'all' ? nextPeriods[0] : prev.period,
    }));
    notify('تمت إضافة القيد وحفظه بنجاح.');
  };

  const handleExportSheetCsv = useCallback(() => {
    const lines = ['المستفيد,التاريخ,اليوم,الوصف,الكمية,الكشف'];
    for (const e of activeSheetEntries) {
      lines.push(
        [e.name, e.date || '', e.day, e.desc, e.qty, SHEETS[e.sheet]].map(csvEscape).join(',')
      );
    }
    const filename = `${SHEETS[currentSheet]}_${formatPeriodLabel(effectivePeriod).replace(
      '/',
      '-'
    )}.csv`;
    downloadBlob(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
    notify(`تم تصدير ${activeSheetEntries.length} قيدًا.`);
  }, [activeSheetEntries, currentSheet, effectivePeriod, notify]);

  const buildLedgerPages = useCallback(
    (sheets: SheetKey[]): LedgerPrintPage[] => {
      const pages: LedgerPrintPage[] = [];
      for (const sheet of sheets) {
        const rows = buildBeneficiaryRows(
          periodScopedEntries.filter((e) => e.sheet === sheet),
          ''
        );
        const chunks = rows.length
          ? Array.from({ length: Math.ceil(rows.length / 25) }, (_, i) =>
              rows.slice(i * 25, (i + 1) * 25)
            )
          : [[]];
        chunks.forEach((chunk, i) =>
          pages.push({
            sheet,
            rows: chunk,
            pageNo: i + 1,
            totalPages: chunks.length,
          })
        );
      }
      return pages;
    },
    [periodScopedEntries]
  );

  const triggerPrintWithOrientation = useCallback(
    (orientation: 'landscape' | 'portrait', payload: PrintPayload) => {
      document.getElementById('dynamic-page-orientation')?.remove();
      setPrintPayload(payload);
      const styleEl = document.createElement('style');
      styleEl.id = 'dynamic-page-orientation';
      styleEl.textContent = `@page { size: A4 ${orientation}; margin: ${
        orientation === 'landscape' ? '5mm' : '10mm'
      }; }`;
      document.head.appendChild(styleEl);

      const cleanup = () => {
        setPrintPayload(null);
        styleEl.remove();
      };

      window.addEventListener('afterprint', cleanup, { once: true });
      window.setTimeout(() => window.print(), 180);
    },
    []
  );

  const handlePrintLedger = (sheets: SheetKey[]) => {
    const pages = buildLedgerPages(sheets);
    if (!pages.length) {
      notify('اختر كشفًا واحدًا على الأقل.');
      return;
    }
    setExportOpen(false);
    triggerPrintWithOrientation('landscape', {
      kind: 'ledger',
      pages,
      period: effectivePeriod,
    });
  };

  const handleExportLedgerPng = (sheets: SheetKey[]) => {
    const pages = buildLedgerPages(sheets);
    if (!pages.length) {
      notify('اختر كشفًا واحدًا على الأقل.');
      return;
    }
    setExportOpen(false);
    notify(`جارٍ إنشاء ${pages.length} صورة عالية الدقة…`);

    let i = 0;
    const next = () => {
      if (i >= pages.length) {
        notify(`تم تصدير ${pages.length} صفحة PNG بدقة 8K.`);
        return;
      }
      const p = pages[i];
      drawLedgerPNG(p, effectivePeriod, state.signer)
        .then((blob) => {
          downloadBlob(blob, `كشف_${SHEETS[p.sheet]}_صفحة_${p.pageNo}_8K.png`);
          i++;
          window.setTimeout(next, 450);
        })
        .catch(() => {
          notify('تعذر إنشاء PNG على هذا الجهاز؛ استخدم طباعة / حفظ PDF.');
        });
    };
    next();
  };

  const handlePrintDailyReport = ({
    rows,
    scope,
    showSheetBreakdown,
  }: {
    rows: DailySummaryRow[];
    scope: ReportScope;
    showSheetBreakdown: boolean;
  }) => {
    if (!rows.length) return;
    triggerPrintWithOrientation('portrait', {
      kind: 'daily',
      rows,
      period: effectivePeriod,
      scope,
      unit,
      numeralStyle,
      showSheetBreakdown,
    });
  };

  const handleExportDailyPng = ({
    rows,
    scope,
    showSheetBreakdown,
  }: {
    rows: DailySummaryRow[];
    scope: ReportScope;
    showSheetBreakdown: boolean;
  }) => {
    if (!rows.length) return;
    notify('جارٍ إنشاء صورة التقرير اليومي عالية الدقة…');
    drawDailyReportPNG({
      rows,
      period: effectivePeriod,
      scope,
      unit,
      numeralStyle,
      showSheetBreakdown,
      signer: state.signer,
    })
      .then((blob) => {
        downloadBlob(
          blob,
          `تقرير_المنصرف_حسب_التاريخ_${formatPeriodLabel(effectivePeriod).replace('/', '-')}.png`
        );
        notify('تم تصدير صورة التقرير اليومي بنجاح.');
      })
      .catch(() => {
        notify('تعذر إنشاء PNG؛ استخدم طباعة / حفظ PDF.');
      });
  };

  const handlePrintBeneficiaryReport = ({
    statement,
    scope,
  }: {
    statement: BeneficiaryStatement;
    scope: ReportScope;
  }) => {
    if (!statement.entries.length) return;
    setBeneficiaryReportTarget(null);
    triggerPrintWithOrientation('portrait', {
      kind: 'beneficiary',
      statement,
      period: effectivePeriod,
      scope,
      unit,
      numeralStyle,
    });
  };

  const handleExportBeneficiaryPng = ({
    statement,
    scope,
  }: {
    statement: BeneficiaryStatement;
    scope: ReportScope;
  }) => {
    if (!statement.entries.length) return;
    notify(`جارٍ إنشاء صورة تقرير المستفيد «${statement.beneficiaryName}»…`);
    drawBeneficiaryReportPNG({
      statement,
      period: effectivePeriod,
      scope,
      unit,
      numeralStyle,
      signer: state.signer,
    })
      .then((blob) => {
        downloadBlob(
          blob,
          `تقرير_المستفيد_${statement.beneficiaryName}_${formatPeriodLabel(
            effectivePeriod
          ).replace('/', '-')}.png`
        );
        notify(`تم تصدير صورة تقرير المستفيد «${statement.beneficiaryName}» بنجاح.`);
      })
      .catch(() => {
        notify('تعذر إنشاء PNG؛ استخدم طباعة / حفظ PDF.');
      });
  };

  const handleExportLedgersExcel = useCallback(
    (sheets: SheetKey[]) => {
      if (!sheets.length) {
        notify('اختر كشفًا واحدًا على الأقل.');
        return;
      }
      const { blob, filename } = buildLedgersExcelBlob({
        entries: state.entries,
        sheets,
        period: effectivePeriod,
        unit,
        signer: state.signer,
      });
      downloadBlob(blob, filename);
      setExportOpen(false);
      notify(
        sheets.length === 1
          ? `تم تصدير «${SHEETS[sheets[0]]}» بصيغة Excel (.xlsx).`
          : `تم تصدير ${sheets.length} كشوفات في ملف Excel واحد (.xlsx).`
      );
    },
    [state.entries, state.signer, effectivePeriod, unit, notify]
  );

  const handleExportSheetExcel = useCallback(() => {
    handleExportLedgersExcel([currentSheet]);
  }, [handleExportLedgersExcel, currentSheet]);

  const handleExportAllExcel = useCallback(() => {
    handleExportLedgersExcel(['order', 'dispatch', 'single']);
  }, [handleExportLedgersExcel]);

  const handleExportDailyExcel = useCallback(
    ({
      rows,
      scope,
      showSheetBreakdown,
    }: {
      rows: DailySummaryRow[];
      scope: ReportScope;
      showSheetBreakdown: boolean;
    }) => {
      if (!rows.length) {
        notify('لا توجد بيانات للتصدير.');
        return;
      }
      const { blob, filename } = buildDailySummaryExcelBlob({
        rows,
        period: effectivePeriod,
        scope,
        unit,
        showSheetBreakdown,
        numeralStyle,
        signer: state.signer,
      });
      downloadBlob(blob, filename);
      notify('تم تصدير التقرير الإجمالي بالتاريخ بصيغة Excel (.xlsx).');
    },
    [effectivePeriod, unit, numeralStyle, state.signer, notify]
  );

  const handleExportBeneficiaryExcel = useCallback(
    ({ statement, scope }: { statement: BeneficiaryStatement; scope: ReportScope }) => {
      if (!statement.entries.length) {
        notify('لا توجد قيود للتصدير.');
        return;
      }
      const { blob, filename } = buildBeneficiaryStatementExcelBlob({
        statement,
        period: effectivePeriod,
        scope,
        unit,
        numeralStyle,
        signer: state.signer,
      });
      downloadBlob(blob, filename);
      notify(`تم تصدير تقرير المستفيد «${statement.beneficiaryName}» بصيغة Excel (.xlsx).`);
    },
    [effectivePeriod, unit, numeralStyle, state.signer, notify]
  );

  const handleJumpFromGlobalSearch = (
    name: string,
    sheet: SheetKey,
    entryDate?: string,
    day?: number,
    highlightQuery?: string
  ) => {
    const entryMonth = entryDate ? entryDate.slice(0, 7) : '';
    if (effectivePeriod !== 'all' && (!entryMonth || entryMonth !== effectivePeriod)) {
      setState((prev) => ({ ...prev, period: entryMonth || 'all' }));
    }
    setActiveTab(sheet);
    setSearch(highlightQuery || name);
    setHighlightedTarget({ name, day, nonce: Date.now() });
  };

  const handleOpenBeneficiaryReportFromSearch = (name: string, entryDate?: string) => {
    const entryMonth = entryDate ? entryDate.slice(0, 7) : '';
    if (effectivePeriod !== 'all' && entryMonth && entryMonth !== effectivePeriod) {
      setState((prev) => ({ ...prev, period: entryMonth }));
    }
    setBeneficiaryReportTarget(name);
  };

  const updateSigner = (signer: SignerInfo) => {
    if (readOnly) {
      notify('وضع القراءة فقط نشط — لا يمكن تعديل بيانات التوقيع.');
      return;
    }
    setState((prev) => ({ ...prev, signer }));
  };

  const handleRestoreBackup = (restoredState: AppState) => {
    if (readOnly) {
      notify('وضع القراءة فقط نشط — لا يمكن استعادة نسخة احتياطية.');
      return;
    }
    snapshot(state.entries);
    setState(restoredState);
  };

  const handleRefreshDbInfo = useCallback(async () => {
    try {
      const nextInfo = await fetchLocalDbInfo(session.token);
      setDbInfo(nextInfo);
      notify('تم تحديث حالة قاعدة البيانات المحلية.');
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onLock(err.message);
        return;
      }
      notify((err as Error).message || 'تعذر تحديث معلومات قاعدة البيانات.');
    }
  }, [session.token, onLock, notify]);

  const handleChangeDbLocation = useCallback(
    async (relativePath: string, mode: 'move_or_copy' | 'open_or_create') => {
      try {
        const res = await changeLocalDbLocation(session.token, relativePath, mode);
        lastSyncedJsonRef.current = JSON.stringify(res.state);
        setState(res.state);
        setDbInfo(res.dbInfo);
        setHistory([]);
        notify(`تم اعتماد مسار قاعدة البيانات المحلية: ${res.dbInfo.relativePath}`);

        if (linkedDeviceFileRef.current) {
          try {
            const { blob } = await downloadSqliteDbBlob(session.token);
            await syncBlobToDeviceFileHandle(linkedDeviceFileRef.current, blob);
          } catch {
            // ignore non-fatal mirror error
          }
        }
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onLock(err.message);
          return;
        }
        throw err;
      }
    },
    [session.token, onLock, notify]
  );

  const handleDownloadSqliteDb = useCallback(async () => {
    try {
      const { blob, filename } = await downloadSqliteDbBlob(session.token);
      downloadBlob(blob, filename);
      setState((prev) => ({ ...prev, lastBackupAt: new Date().toISOString() }));
      notify(`تم حفظ وتنزيل ملف قاعدة البيانات (${filename}).`);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onLock(err.message);
        return;
      }
      notify((err as Error).message || 'تعذر تصدير ملف قاعدة البيانات.');
    }
  }, [session.token, onLock, notify]);

  const handleImportSqliteDb = useCallback(
    async (file: File, targetPath?: string) => {
      if (readOnly) {
        throw new Error('وضع القراءة فقط نشط — قم بإلغائه قبل استيراد قاعدة بيانات.');
      }
      try {
        const res = await importSqliteDbFile(session.token, file, targetPath);
        snapshot(state.entries);
        lastSyncedJsonRef.current = JSON.stringify(res.state);
        setState(res.state);
        setDbInfo(res.dbInfo);
        notify(
          `تم استيراد قاعدة البيانات (${formatNum(res.state.entries.length, numeralStyle)} قيد) بنجاح.`
        );
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onLock(err.message);
          return;
        }
        throw err;
      }
    },
    [readOnly, session.token, snapshot, state.entries, numeralStyle, onLock, notify]
  );

  const handleImportJsonDbState = useCallback(
    async (nextState: AppState) => {
      if (readOnly) {
        throw new Error('وضع القراءة فقط نشط — قم بإلغائه قبل استيراد البيانات.');
      }
      try {
        const res = await saveLocalDbState(session.token, nextState);
        snapshot(state.entries);
        lastSyncedJsonRef.current = JSON.stringify(res.state);
        setState(res.state);
        setDbInfo(res.dbInfo);
        notify(
          `تم استيراد ${formatNum(res.state.entries.length, numeralStyle)} قيدًا إلى قاعدة البيانات المحلية.`
        );
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onLock(err.message);
          return;
        }
        throw err;
      }
    },
    [readOnly, session.token, snapshot, state.entries, numeralStyle, onLock, notify]
  );

  const handleLinkDeviceFile = useCallback(
    async (handle: LocalDeviceFileHandle | null) => {
      linkedDeviceFileRef.current = handle;
      setLinkedDeviceFile(handle);
      if (handle) {
        try {
          const { blob } = await downloadSqliteDbBlob(session.token);
          await syncBlobToDeviceFileHandle(handle, blob);
          notify(`تم ربط المزامنة المباشرة مع الملف: ${handle.name}`);
        } catch (err) {
          if (err instanceof UnauthorizedError) {
            onLock(err.message);
            return;
          }
          notify('تم تحديد الملف لكن تعذرت الكتابة المباشرة؛ أعد المحاولة عند التعديل التالي.');
        }
      }
    },
    [session.token, onLock, notify]
  );

  const handleCreatePeriodicBackup = useCallback(
    async (alsoDownloadCopy = false) => {
      try {
        const res = await createLocalDbBackup(session.token);
        lastSyncedJsonRef.current = JSON.stringify(res.state);
        setState(res.state);
        setDbInfo(res.dbInfo);

        if (alsoDownloadCopy) {
          const { blob, filename } = await downloadSqliteDbBlob(session.token);
          downloadBlob(blob, filename);
        }

        setBackupPromptOpen(false);
        notify(
          alsoDownloadCopy
            ? `تم حفظ النسخة الاحتياطية محليًا وتنزيل نسخة (.db) على جهازك.`
            : `تم حفظ النسخة الاحتياطية الدورية بنجاح في: ${res.backupFile}`
        );
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onLock(err.message);
          return;
        }
        throw err;
      }
    },
    [session.token, onLock, notify]
  );

  const handleDownloadSavedBackup = useCallback(
    async (relativePath: string) => {
      try {
        const { blob, filename } = await downloadBackupFileBlob(session.token, relativePath);
        downloadBlob(blob, filename);
        notify(`تم تنزيل النسخة الاحتياطية (${filename}).`);
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onLock(err.message);
          return;
        }
        notify((err as Error).message || 'تعذر تنزيل النسخة الاحتياطية.');
      }
    },
    [session.token, onLock, notify]
  );

  const handleRestoreSavedBackup = useCallback(
    async (relativePath: string) => {
      if (readOnly) {
        throw new Error('وضع القراءة فقط نشط — قم بإلغائه قبل استعادة نسخة احتياطية.');
      }
      try {
        const res = await restoreLocalDbBackup(session.token, relativePath);
        snapshot(state.entries);
        lastSyncedJsonRef.current = JSON.stringify(res.state);
        setState(res.state);
        setDbInfo(res.dbInfo);
        notify(
          `تمت استعادة النسخة الاحتياطية (${formatNum(res.state.entries.length, numeralStyle)} قيد) بنجاح.`
        );
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onLock(err.message);
          return;
        }
        throw err;
      }
    },
    [readOnly, session.token, snapshot, state.entries, numeralStyle, onLock, notify]
  );

  const multiPeriodWarning = periods.length > 1 && effectivePeriod === 'all';

  if (!dbLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f5f7f5]">
        <div className="w-full max-w-md rounded-2xl bg-white border border-[#d9dfdb] shadow-lg p-6 text-center space-y-4">
          <div
            className="w-12 h-12 rounded-2xl bg-[#e8f0eb] text-[#173f2e] grid place-items-center mx-auto"
            aria-hidden="true"
          >
            <Database className="w-6 h-6" />
          </div>
          {dbError ? (
            <>
              <h2 className="text-base font-black text-[#9e3029]">
                تعذر الاتصال بقاعدة البيانات المحلية
              </h2>
              <p className="text-xs text-[#46534b] leading-relaxed">{dbError}</p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDbReloadNonce((n) => n + 1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold bg-[#173f2e] text-white"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>إعادة المحاولة</span>
                </button>
                <button
                  type="button"
                  onClick={() => performServerLogout()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#f7f8f6] text-[#17211d] border border-[#d9dfdb]"
                >
                  العودة لشاشة الدخول
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-base font-black text-[#17211d]">
                جارٍ فتح قاعدة البيانات المحلية…
              </h2>
              <p className="text-xs text-[#647069]">
                يتم تحميل السجلات من ملف SQLite المحلي المستقل عن المتصفح.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="no-print min-h-screen flex flex-col">
        {/* Sticky Top Bar */}
        <header className="sticky top-0 z-20 bg-[#173f2e] text-white shadow-[0_4px_18px_rgba(15,44,31,0.22)]">
          <div className="max-w-[1500px] mx-auto min-h-[74px] px-4 sm:px-6 py-3 flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 min-w-0 shrink-0">
              <div
                className="w-11 h-11 rounded-2xl bg-white/10 border border-white/25 grid place-items-center shrink-0"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                  <path d="M5 4.5h14v15H5z" stroke="white" strokeWidth="1.7" />
                  <path
                    d="M8 8h8M8 11.5h8M8 15h5"
                    stroke="white"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path
                    d="M8 2.8v3.4M16 2.8v3.4"
                    stroke="white"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-black leading-tight truncate">
                  كشوفات المنصرف
                </h1>
                <p className="text-[11px] sm:text-xs text-[#d6e2da] truncate">
                  إدارة محمية بكلمة مرور · تقارير المستفيدين والتجميع اليومي
                </p>
              </div>
            </div>

            <div className="w-full md:w-auto md:flex-1 flex items-center justify-end gap-2 min-w-0">
              <GlobalHeaderSearch
                entries={state.entries}
                unit={unit}
                numeralStyle={numeralStyle}
                inputRef={globalSearchInputRef}
                onJumpToBeneficiarySheet={handleJumpFromGlobalSearch}
                onOpenBeneficiaryReport={handleOpenBeneficiaryReportFromSearch}
              />

              <button
                type="button"
                role="switch"
                aria-checked={readOnly}
                onClick={toggleReadOnly}
                title={
                  readOnly
                    ? 'إلغاء وضع القراءة فقط للسماح بالتعديل والحذف'
                    : 'تفعيل وضع القراءة فقط لتعطيل حقول الإدخال وأزرار الحذف والتعديل'
                }
                className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-extrabold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  readOnly
                    ? 'bg-[#fbf1df] hover:bg-[#f6e6c8] text-[#845315] border-[#ebd4aa] shadow-sm'
                    : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
                }`}
              >
                {readOnly ? (
                  <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">
                  {readOnly ? 'القراءة فقط: نشط' : 'وضع القراءة فقط'}
                </span>
                <span className="sm:hidden">{readOnly ? 'للقراءة فقط' : 'قراءة فقط'}</span>
              </button>

              <button
                type="button"
                onClick={handleUndo}
                disabled={readOnly || history.length === 0}
                title="تراجع عن آخر تعديل"
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-extrabold bg-[#ede6d6] hover:bg-[#e4dac3] text-[#173f2e] border border-[#dcd1b8] disabled:opacity-45 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Undo2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">تراجع عن التعديل</span>
                <span className="sm:hidden">تراجع</span>
                {history.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#173f2e] text-white tabular-nums">
                    {history.length}
                  </span>
                )}
              </button>

              <PWAInstallButton onOpenDesktopGuide={() => setWindowsGuideOpen(true)} />

              <HeaderToolsMenu
                activeDailyReport={activeTab === 'daily-report'}
                canUndo={history.length > 0}
                readOnly={readOnly}
                highContrast={highContrast}
                isDefaultPassword={Boolean(session.isDefaultPassword && !session.envOverride)}
                activeDbLabel={dbInfo?.relativePath}
                onToggleReadOnly={toggleReadOnly}
                onToggleHighContrast={toggleHighContrast}
                onOpenQuickAdd={() => !readOnly && setQuickAddOpen(true)}
                onOpenImport={() => !readOnly && setImportModalOpen(true)}
                onLoadSampleData={handleLoadSampleData}
                onDownloadTemplate={handleDownloadTemplate}
                onOpenBeneficiaryReport={() => setBeneficiaryReportTarget('')}
                onToggleDailyReport={() =>
                  setActiveTab((prev) => (prev === 'daily-report' ? 'order' : 'daily-report'))
                }
                onOpenExport={() => setExportOpen(true)}
                onExportCurrentExcel={handleExportSheetExcel}
                onExportAllExcel={handleExportAllExcel}
                onExportCurrentCsv={handleExportSheetCsv}
                onOpenSignature={() => setSignatureModalOpen(true)}
                onUndo={handleUndo}
                onOpenDatabase={() => setDatabaseModalOpen(true)}
                onOpenSecurity={() => setSecurityOpen(true)}
                onOpenWindowsGuide={() => setWindowsGuideOpen(true)}
                onLockApp={() => performServerLogout('تم قفل التطبيق بناءً على طلبك.')}
              />
            </div>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 w-full max-w-[1500px] mx-auto px-4 sm:px-6 pb-10 space-y-5">
          {/* Read-Only Mode Banner */}
          {readOnly && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#fbf1df] border border-[#ebd4aa] text-[#845315] text-xs sm:text-sm font-bold">
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 shrink-0 text-[#845315]" aria-hidden="true" />
                <span>
                  وضع القراءة فقط نشط حاليًا — جميع حقول الإدخال وأزرار التعديل والحذف معطلة لمنع أي
                  تغييرات عرضية أثناء الاستعراض.
                </span>
              </div>
              <button
                type="button"
                onClick={toggleReadOnly}
                className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-[#173f2e] hover:bg-[#215a41] text-white transition-colors whitespace-nowrap"
              >
                إلغاء القراءة فقط
              </button>
            </div>
          )}

          {/* Default Password Recommendation Banner */}
          {session.isDefaultPassword && !session.envOverride && !defaultPwdBannerDismissed && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#fbf6ea] border border-[#e3d4b4] text-[#725020] text-xs sm:text-sm font-bold">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 text-[#845315]" aria-hidden="true" />
                <span>
                  أنت تستخدم كلمة المرور الافتراضية حاليًا. يُنصح بتعيين كلمة مرور خاصة بك لزيادة
                  الأمان.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSecurityOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-[#173f2e] hover:bg-[#215a41] text-white transition-colors"
                >
                  تغيير كلمة المرور
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultPwdBannerDismissed(true)}
                  aria-label="إخفاء التنبيه"
                  className="w-7 h-7 rounded-lg grid place-items-center hover:bg-[#ede6d6] text-[#845315]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Hero & Period Control */}
          <section className="pt-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="text-xs font-black text-[#215a41] tracking-wide">دفتر المنصرف</div>
              <h2 className="text-2xl font-black text-[#17211d] mt-1">
                {activeTab === 'daily-report'
                  ? 'تقرير المنصرف الإجمالي بحسب التاريخ'
                  : SHEETS[currentSheet]}
              </h2>
              <p className="text-sm text-[#647069] mt-0.5">
                {activeTab === 'daily-report'
                  ? 'تجميع تلقائي للمنصرف حسب التاريخ مع عرض الكمية الإجمالية وعدد القيود لكل يوم.'
                  : 'إدخال القيود وتجميع الكميات حسب المستفيد واليوم (يدعم التنقل بالأسهم و Ctrl+Z للتراجع).'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDatabaseModalOpen(true)}
                title="تحديد مسار حفظ قاعدة البيانات المحلية أو استيرادها"
                className="inline-flex items-center gap-2 px-3 py-2 min-h-[42px] bg-white hover:bg-[#f2f7f4] border border-[#d9dfdb] rounded-xl text-xs font-extrabold text-[#173f2e] shadow-[0_2px_8px_rgba(22,39,28,0.04)] transition-colors"
              >
                <Database className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>قاعدة البيانات:</span>
                <code dir="ltr" className="font-mono text-[11px] max-w-[140px] truncate">
                  {dbInfo?.relativePath || 'mansarf-ledger.db'}
                </code>
              </button>

              <div className="flex items-center justify-between sm:justify-start gap-3 px-3.5 py-2 bg-white border border-[#d9dfdb] rounded-xl shadow-[0_2px_8px_rgba(22,39,28,0.04)]">
                <label
                  htmlFor="periodSelect"
                  className="text-xs font-extrabold text-[#647069] whitespace-nowrap"
                >
                  فترة التقرير
                </label>
                <select
                  id="periodSelect"
                  value={effectivePeriod}
                  onChange={(e) => setState((prev) => ({ ...prev, period: e.target.value }))}
                  className="bg-transparent text-sm font-black text-[#173f2e] min-w-[140px] py-1 cursor-pointer focus:outline-none"
                >
                  <option value="all">كل الفترات</option>
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      {p.slice(5, 7)}/{p.slice(0, 4)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Navigation Tabs */}
          <nav
            role="tablist"
            aria-label="أنواع الكشوفات والتقارير"
            className="flex items-center gap-2 overflow-x-auto py-1"
          >
            {(Object.entries(SHEETS) as Array<[SheetKey, string]>).map(([key, label]) => {
              const selected = activeTab === key;
              const count = periodScopedEntries.filter((e) => e.sheet === key).length;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(key)}
                  className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full text-sm font-extrabold whitespace-nowrap border transition-colors ${
                    selected
                      ? 'bg-[#173f2e] text-white border-[#173f2e] shadow-[0_4px_12px_rgba(23,63,46,0.16)]'
                      : 'bg-white text-[#3d4a43] border-[#cfd8d2] hover:bg-[#f7f8f6]'
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`text-[11px] min-w-[24px] px-2 py-0.5 rounded-full tabular-nums ${
                      selected
                        ? 'bg-white/20 text-white'
                        : 'bg-[#edf1ee] text-[#365244]'
                    }`}
                  >
                    {formatNum(count, numeralStyle)}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'daily-report'}
              onClick={() => setActiveTab('daily-report')}
              className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full text-sm font-extrabold whitespace-nowrap border transition-colors ${
                activeTab === 'daily-report'
                  ? 'bg-[#173f2e] text-white border-[#173f2e] shadow-[0_4px_12px_rgba(23,63,46,0.16)]'
                  : 'bg-[#fbf6ea] text-[#173f2e] border-[#dcd1b8] hover:bg-[#f5ebd6]'
              }`}
            >
              <CalendarDays className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>تقرير إجمالي بالتاريخ</span>
              <span
                className={`text-[11px] min-w-[24px] px-2 py-0.5 rounded-full tabular-nums ${
                  activeTab === 'daily-report'
                    ? 'bg-white/20 text-white'
                    : 'bg-[#ede6d6] text-[#173f2e]'
                }`}
              >
                {formatNum(dailySummaryCount, numeralStyle)}
              </span>
            </button>
          </nav>

          {/* Summary KPI Cards */}
          <section aria-label="ملخص الكميات" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-[#d9dfdb] rounded-2xl p-4 shadow-[0_2px_8px_rgba(22,39,28,0.03)]">
              <div className="text-xs font-extrabold text-[#647069]">
                {activeTab === 'daily-report' ? 'إجمالي المستفيدين' : 'مستفيدو الكشف'}
              </div>
              <div className="text-xl sm:text-2xl font-black text-[#173f2e] mt-1 tabular-nums">
                {formatNum(
                  activeTab === 'daily-report' ? allBeneficiariesCount : beneficiaryRows.length,
                  numeralStyle
                )}
              </div>
            </div>

            <div className="bg-white border border-[#d9dfdb] rounded-2xl p-4 shadow-[0_2px_8px_rgba(22,39,28,0.03)]">
              <div className="text-xs font-extrabold text-[#647069]">
                {activeTab === 'daily-report' ? 'إجمالي القيود' : 'قيود الكشف'}
              </div>
              <div className="text-xl sm:text-2xl font-black text-[#173f2e] mt-1 tabular-nums">
                {formatNum(
                  activeTab === 'daily-report'
                    ? periodScopedEntries.filter((e) => e.qty > 0 || e.desc.trim().length > 0).length
                    : activeSheetEntries.length,
                  numeralStyle
                )}
              </div>
            </div>

            <div className="bg-white border border-[#d9dfdb] rounded-2xl p-4 shadow-[0_2px_8px_rgba(22,39,28,0.03)]">
              <div className="text-xs font-extrabold text-[#647069]">
                {activeTab === 'daily-report' ? 'أيام الصرف النشطة' : 'إجمالي الكشف'}
              </div>
              <div className="text-xl sm:text-2xl font-black text-[#173f2e] mt-1 tabular-nums">
                {activeTab === 'daily-report'
                  ? `${formatNum(dailySummaryCount, numeralStyle)} يوم`
                  : formatQtyWithUnit(sheetTotal, numeralStyle, unit)}
              </div>
            </div>

            <div className="bg-[#173f2e] border border-[#173f2e] text-white rounded-2xl p-4 shadow-[0_4px_14px_rgba(23,63,46,0.18)]">
              <div className="text-xs font-extrabold text-[#d8e7dd]">الإجمالي الكلي للفترة</div>
              <div className="text-xl sm:text-2xl font-black text-white mt-1 tabular-nums">
                {formatQtyWithUnit(grandTotal, numeralStyle, unit)}
              </div>
            </div>
          </section>

          {/* Multi-period notice */}
          {multiPeriodWarning && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#fff8e8] border border-[#f0dfaf] text-[#725020] text-xs sm:text-sm font-semibold">
              <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                توجد قيود لأكثر من شهر. اختر فترة محددة قبل تصدير الكشف الشهري حتى لا تختلط
                الأيام المتشابهة.
              </span>
            </div>
          )}

          {/* Mini Beneficiaries Dashboard (top of beneficiaries view) */}
          {activeTab !== 'daily-report' && (
            <BeneficiariesDashboard
              sheet={currentSheet}
              periodLabel={formatPeriodLabel(effectivePeriod)}
              entries={activeSheetEntries}
              periodScopedEntries={periodScopedEntries}
              allEntries={state.entries}
              unit={unit}
              numeralStyle={numeralStyle}
              onSelectBeneficiary={(name) =>
                setSearch((prev) => (prev === name ? '' : name))
              }
            />
          )}

          {/* Main Active Workspace View */}
          {activeTab === 'daily-report' ? (
            <DailySummaryReport
              entries={state.entries}
              period={effectivePeriod}
              unit={unit}
              numeralStyle={numeralStyle}
              readOnly={readOnly}
              onUnitChange={(nextUnit) =>
                !readOnly && setState((prev) => ({ ...prev, unit: nextUnit }))
              }
              onNumeralStyleChange={(nextStyle) =>
                setState((prev) => ({ ...prev, numeralStyle: nextStyle }))
              }
              onPrintReport={handlePrintDailyReport}
              onExportPngReport={handleExportDailyPng}
              onExportExcelReport={handleExportDailyExcel}
              onNotify={notify}
              onOpenQuickAdd={() => !readOnly && setQuickAddOpen(true)}
              onEditEntry={(entry) => !readOnly && setEditingEntry(entry)}
              onDeleteEntry={handleDeleteEntry}
              onDeleteDayEntries={(entryIds, dayLabel) =>
                handleDeleteDayEntries(entryIds, dayLabel)
              }
            />
          ) : (
            <LedgerTable
              sheet={currentSheet}
              periodLabel={formatPeriodLabel(effectivePeriod)}
              rows={beneficiaryRows}
              sheetEntries={activeSheetEntries}
              totalEntriesCount={activeSheetEntries.length}
              search={search}
              onSearchChange={setSearch}
              canUndo={history.length > 0}
              readOnly={readOnly}
              unit={unit}
              numeralStyle={numeralStyle}
              highlightedTarget={highlightedTarget}
              onJumpToTarget={(name, day) =>
                setHighlightedTarget({ name, day, nonce: Date.now() })
              }
              onOpenDayEntries={(day) => setDayEntriesModalDay(day)}
              onUndo={handleUndo}
              onSetCell={handleSetCell}
              onAddBeneficiary={handleAddBeneficiary}
              onRenameBeneficiary={handleRenameBeneficiary}
              onDeleteBeneficiary={handleDeleteBeneficiary}
              onDeleteSelected={handleDeleteSelected}
              onMergeBeneficiaries={handleMergeBeneficiaries}
              onExportCsv={handleExportSheetCsv}
              onExportExcel={handleExportSheetExcel}
              onOpenBeneficiaryReport={(name) => setBeneficiaryReportTarget(name)}
              onEditEntry={(entry) => !readOnly && setEditingEntry(entry)}
              onDeleteEntry={handleDeleteEntry}
            />
          )}

          <footer className="text-center text-xs text-[#7a847e] pt-3 pb-4">
            تُحفظ البيانات والتوقيع في قاعدة بيانات SQLite محلية مستقلة عن المتصفح (
            <code dir="ltr" className="font-mono text-[#173f2e]">
              {dbInfo?.relativePath || 'mansarf-ledger.db'}
            </code>
            ) مع إمكانية تغيير مسار التخزين والاستيراد في أي وقت.
          </footer>
        </main>

        {/* Modals */}
        <QuickEntryModal
          open={!readOnly && quickAddOpen}
          defaultPeriod={effectivePeriod}
          defaultSheet={currentSheet}
          onClose={() => setQuickAddOpen(false)}
          onSave={handleSaveQuickEntry}
        />

        <ExportModal
          open={exportOpen}
          defaultSheet={currentSheet}
          periodLabel={formatPeriodLabel(effectivePeriod)}
          onClose={() => setExportOpen(false)}
          onPrintLedger={handlePrintLedger}
          onExportLedgerPng={handleExportLedgerPng}
          onExportLedgerExcel={handleExportLedgersExcel}
          onOpenDailyReport={() => setActiveTab('daily-report')}
          onOpenBeneficiaryReport={() => setBeneficiaryReportTarget('')}
        />

        <BeneficiaryReportModal
          open={beneficiaryReportTarget !== null}
          initialBeneficiary={beneficiaryReportTarget ?? ''}
          entries={state.entries}
          period={effectivePeriod}
          unit={unit}
          numeralStyle={numeralStyle}
          readOnly={readOnly}
          onClose={() => setBeneficiaryReportTarget(null)}
          onEditEntry={(entry) => !readOnly && setEditingEntry(entry)}
          onDeleteEntry={handleDeleteEntry}
          onPrintReport={handlePrintBeneficiaryReport}
          onExportPngReport={handleExportBeneficiaryPng}
          onExportExcelReport={handleExportBeneficiaryExcel}
          onNotify={notify}
        />

        <DayEntriesModal
          open={dayEntriesModalDay !== undefined}
          initialDay={dayEntriesModalDay ?? null}
          sheet={currentSheet}
          periodLabel={formatPeriodLabel(effectivePeriod)}
          entries={activeSheetEntries}
          unit={unit}
          numeralStyle={numeralStyle}
          readOnly={readOnly}
          onClose={() => setDayEntriesModalDay(undefined)}
          onEditEntry={(entry) => !readOnly && setEditingEntry(entry)}
          onDeleteEntry={handleDeleteEntry}
          onDeleteDayEntries={(day, entryIds) =>
            handleDeleteDayEntries(entryIds, formatNum(day, numeralStyle))
          }
        />

        <EntryEditModal
          entry={editingEntry}
          readOnly={readOnly}
          onClose={() => setEditingEntry(null)}
          onSave={handleUpdateEntry}
          onDelete={handleDeleteEntry}
        />

        <SecuritySettingsModal
          open={securityOpen}
          readOnly={readOnly}
          highContrast={highContrast}
          activeDbLabel={dbInfo?.relativePath}
          session={session}
          state={state}
          onClose={() => setSecurityOpen(false)}
          onSessionUpdated={onSessionUpdated}
          onAutoLockChange={(mins) =>
            setState((prev) => ({ ...prev, autoLockMinutes: mins }))
          }
          onDailyReminderChange={(time) =>
            setState((prev) => ({ ...prev, dailyReminderTime: time }))
          }
          onHighContrastChange={setHighContrastEnabled}
          onOpenDatabase={() => setDatabaseModalOpen(true)}
          onRestoreBackup={handleRestoreBackup}
          onNotify={notify}
        />

        <DatabaseSettingsModal
          open={databaseModalOpen}
          readOnly={readOnly}
          numeralStyle={numeralStyle}
          dbInfo={dbInfo}
          savingDb={savingDb}
          linkedDeviceFile={linkedDeviceFile}
          backupFrequency={(state.backupFrequency || 'weekly') as BackupFrequency}
          lastBackupAt={state.lastBackupAt}
          onClose={() => setDatabaseModalOpen(false)}
          onRefreshInfo={handleRefreshDbInfo}
          onChangeLocation={handleChangeDbLocation}
          onDownloadSqlite={handleDownloadSqliteDb}
          onImportSqliteFile={handleImportSqliteDb}
          onImportJsonState={handleImportJsonDbState}
          onLinkDeviceFile={handleLinkDeviceFile}
          onChangeBackupFrequency={(freq) =>
            setState((prev) => ({ ...prev, backupFrequency: freq }))
          }
          onTriggerBackupPrompt={() => setBackupPromptOpen(true)}
          onCreateBackupNow={() => handleCreatePeriodicBackup(false)}
          onDownloadBackupFile={handleDownloadSavedBackup}
          onRestoreSavedBackup={handleRestoreSavedBackup}
          onNotify={notify}
        />

        <BackupConfirmationModal
          open={backupPromptOpen}
          dbRelativePath={dbInfo?.relativePath || 'mansarf-ledger.db'}
          entryCount={state.entries.length}
          numeralStyle={numeralStyle}
          frequency={(state.backupFrequency || 'weekly') as BackupFrequency}
          lastBackupAt={state.lastBackupAt}
          onConfirmBackup={handleCreatePeriodicBackup}
          onPostpone={() => setBackupPromptOpen(false)}
          onOpenSettings={() => {
            setBackupPromptOpen(false);
            setDatabaseModalOpen(true);
          }}
        />

        {importModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="استيراد أو لصق القيود"
            onClick={() => setImportModalOpen(false)}
            className="fixed inset-0 z-40 bg-[#0d1912]/55 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
          >
            <div className="w-full max-w-3xl my-auto" onClick={(e) => e.stopPropagation()}>
              <ImportPanel
                readOnly={readOnly}
                onParsePaste={handleParsePaste}
                onImportCsvFile={handleImportCsvFile}
                onDownloadTemplate={handleDownloadTemplate}
                onLoadSampleData={handleLoadSampleData}
                onOpenQuickAdd={() => {
                  if (readOnly) return;
                  setImportModalOpen(false);
                  setQuickAddOpen(true);
                }}
                onClose={() => setImportModalOpen(false)}
              />
            </div>
          </div>
        )}

        {signatureModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="إعدادات التوقيع والمخوّل"
            onClick={() => setSignatureModalOpen(false)}
            className="fixed inset-0 z-40 bg-[#0d1912]/55 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
          >
            <div className="w-full max-w-3xl my-auto" onClick={(e) => e.stopPropagation()}>
              <SignaturePanel
                signer={state.signer}
                readOnly={readOnly}
                onUpdateSigner={updateSigner}
                onNotify={notify}
                onClose={() => setSignatureModalOpen(false)}
              />
            </div>
          </div>
        )}

        <WindowsDesktopModal
          open={windowsGuideOpen}
          onClose={() => setWindowsGuideOpen(false)}
          onNotify={notify}
        />

        <OfflineIndicator />

        {/* Toast */}
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#142a1e] text-white text-xs sm:text-sm font-bold shadow-lg transition-all duration-200 max-w-[92vw] text-center ${
            toast
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          {toast}
        </div>
      </div>

      <PrintView payload={printPayload} signer={state.signer} />
    </>
  );
}

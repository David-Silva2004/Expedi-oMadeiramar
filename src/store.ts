import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { isLocalTestMode } from './config';
import { ConsistencyNote, ShippingEntry } from './types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
  };
}

const LOCAL_STORAGE_KEY = 'expedicao-madeiramar-dev-entries';
const LOCAL_NOTES_STORAGE_KEY = 'expedicao-madeiramar-dev-consistency-notes';
const LOCAL_DEV_USER_ID = 'local-dev-user';

interface UseShippingStoreOptions {
  enableConsistencyNotes?: boolean;
  readAllEntries?: boolean;
}

function formatInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createSeedEntries(): ShippingEntry[] {
  const now = Date.now();
  const today = new Date();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);

  return [
    {
      id: 'demo-1',
      userId: LOCAL_DEV_USER_ID,
      date: formatInputDate(today),
      orderNumber: 'MM-10245',
      customer: 'LOJA CENTRO',
      statusType: 'MDF_ONLY',
      createdAt: now - 1_000,
    },
    {
      id: 'demo-2',
      userId: LOCAL_DEV_USER_ID,
      date: formatInputDate(today),
      orderNumber: 'MM-10246',
      customer: 'ARQ STUDIO NORTE',
      statusType: 'HARDWARE',
      volumes: 3,
      createdAt: now - 2_000,
    },
    {
      id: 'demo-3',
      userId: LOCAL_DEV_USER_ID,
      date: formatInputDate(yesterday),
      orderNumber: 'MM-10212',
      customer: 'CLIENTE RETIRADA',
      statusType: 'RETURN',
      createdAt: now - 3_000,
    },
  ];
}

function removeUndefinedFields<T extends Record<string, unknown>>(value: T): T {
  const next: Record<string, unknown> = { ...value };

  Object.keys(next).forEach((key) => {
    if (next[key] === undefined) {
      delete next[key];
    }
  });

  return next as T;
}

function sortEntries(entries: ShippingEntry[]) {
  return [...entries].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return b.createdAt - a.createdAt;
  });
}

function sortConsistencyNotes(notes: ConsistencyNote[]) {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

function readLocalEntries() {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);

  if (!raw) {
    const seeded = createSeedEntries();
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('Local test data is not an array.');
    }

    return parsed as ShippingEntry[];
  } catch (error) {
    console.warn('Resetting invalid local test data.', error);
    const seeded = createSeedEntries();
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function writeLocalEntries(entries: ShippingEntry[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
}

function readLocalConsistencyNotes() {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(LOCAL_NOTES_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('Local consistency notes are not an array.');
    }

    return sortConsistencyNotes(parsed as ConsistencyNote[]);
  } catch (error) {
    console.warn('Resetting invalid local consistency notes.', error);
    window.localStorage.removeItem(LOCAL_NOTES_STORAGE_KEY);
    return [];
  }
}

function writeLocalConsistencyNotes(notes: ConsistencyNote[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LOCAL_NOTES_STORAGE_KEY, JSON.stringify(sortConsistencyNotes(notes)));
}

function createLocalId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createFirestoreErrorInfo(error: unknown, operationType: OperationType, path: string | null) {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path,
  };
}

function formatFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = createFirestoreErrorInfo(error, operationType, path);

  console.error('Firestore Error:', JSON.stringify(errInfo));
  return JSON.stringify(errInfo);
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  throw new Error(formatFirestoreError(error, operationType, path));
}

export function useShippingStore({
  enableConsistencyNotes = false,
  readAllEntries = false,
}: UseShippingStoreOptions = {}) {
  const [entries, setEntries] = useState<ShippingEntry[]>([]);
  const [consistencyNotes, setConsistencyNotes] = useState<ConsistencyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(enableConsistencyNotes);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const currentUserId = auth.currentUser?.uid;
  const currentUserEmail = auth.currentUser?.email;

  useEffect(() => {
    if (isLocalTestMode) {
      const syncLocalEntries = () => {
        setEntries(sortEntries(readLocalEntries()));
        setEntriesError(null);
        setLoading(false);
      };

      syncLocalEntries();

      const handleStorage = (event: StorageEvent) => {
        if (event.key === LOCAL_STORAGE_KEY) {
          syncLocalEntries();
        }
      };

      window.addEventListener('storage', handleStorage);
      return () => window.removeEventListener('storage', handleStorage);
    }

    if (!currentUserId) {
      setEntries([]);
      setEntriesError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setEntriesError(null);

    const entriesQuery = readAllEntries
      ? query(collection(db, 'shipping_entries'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'shipping_entries'), where('userId', '==', currentUserId), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      entriesQuery,
      (snapshot) => {
        const nextEntries: ShippingEntry[] = [];

        snapshot.forEach((entryDoc) => {
          nextEntries.push({ id: entryDoc.id, ...entryDoc.data() } as ShippingEntry);
        });

        setEntries(nextEntries);
        setEntriesError(null);
        setLoading(false);
      },
      (error) => {
        setEntries([]);
        setEntriesError(formatFirestoreError(error, OperationType.LIST, 'shipping_entries'));
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUserId, readAllEntries]);

  useEffect(() => {
    if (!enableConsistencyNotes) {
      setConsistencyNotes([]);
      setNotesError(null);
      setNotesLoading(false);
      return;
    }

    if (isLocalTestMode) {
      const syncLocalNotes = () => {
        setConsistencyNotes(readLocalConsistencyNotes());
        setNotesError(null);
        setNotesLoading(false);
      };

      syncLocalNotes();

      const handleStorage = (event: StorageEvent) => {
        if (event.key === LOCAL_NOTES_STORAGE_KEY) {
          syncLocalNotes();
        }
      };

      window.addEventListener('storage', handleStorage);
      return () => window.removeEventListener('storage', handleStorage);
    }

    if (!currentUserId) {
      setConsistencyNotes([]);
      setNotesError(null);
      setNotesLoading(false);
      return;
    }

    setNotesLoading(true);
    setNotesError(null);

    const unsubscribe = onSnapshot(
      collection(db, 'consistency_notes'),
      (snapshot) => {
        const nextNotes: ConsistencyNote[] = [];

        snapshot.forEach((noteDoc) => {
          nextNotes.push({ id: noteDoc.id, ...noteDoc.data() } as ConsistencyNote);
        });

        setConsistencyNotes(sortConsistencyNotes(nextNotes));
        setNotesError(null);
        setNotesLoading(false);
      },
      (error) => {
        setConsistencyNotes([]);
        setNotesError(formatFirestoreError(error, OperationType.LIST, 'consistency_notes'));
        setNotesLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUserId, enableConsistencyNotes]);

  const addEntry = async (entry: Omit<ShippingEntry, 'id' | 'userId' | 'createdAt'>) => {
    if (isLocalTestMode) {
      const nextEntries = sortEntries([
        removeUndefinedFields({
          ...entry,
          id: createLocalId(),
          userId: LOCAL_DEV_USER_ID,
          createdAt: Date.now(),
        }) as ShippingEntry,
        ...readLocalEntries(),
      ]);

      writeLocalEntries(nextEntries);
      setEntries(nextEntries);
      return;
    }

    if (!currentUserId) {
      return;
    }

    try {
      const dataToSave = removeUndefinedFields({
        ...entry,
        userId: currentUserId,
        createdAt: Date.now(),
      });

      await addDoc(collection(db, 'shipping_entries'), dataToSave);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'shipping_entries');
    }
  };

  const updateEntry = async (id: string, updated: Partial<ShippingEntry>) => {
    if (isLocalTestMode) {
      const nextEntries = sortEntries(
        readLocalEntries().map((entry) => {
          if (entry.id !== id) {
            return entry;
          }

          const nextEntry = { ...entry, ...removeUndefinedFields(updated) } as ShippingEntry;

          if ('volumes' in updated && updated.volumes === undefined) {
            delete nextEntry.volumes;
          }

          if ('otherDescription' in updated && updated.otherDescription === undefined) {
            delete nextEntry.otherDescription;
          }

          return nextEntry;
        }),
      );

      writeLocalEntries(nextEntries);
      setEntries(nextEntries);
      return;
    }

    try {
      const dataToUpdate: Record<string, unknown> = removeUndefinedFields({ ...updated });

      if ('volumes' in updated && updated.volumes === undefined) {
        dataToUpdate.volumes = deleteField();
      }

      if ('otherDescription' in updated && updated.otherDescription === undefined) {
        dataToUpdate.otherDescription = deleteField();
      }

      await updateDoc(doc(db, 'shipping_entries', id), dataToUpdate);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `shipping_entries/${id}`);
    }
  };

  const deleteEntry = async (id: string) => {
    if (isLocalTestMode) {
      const nextEntries = readLocalEntries().filter((entry) => entry.id !== id);
      writeLocalEntries(nextEntries);
      setEntries(sortEntries(nextEntries));
      return;
    }

    try {
      await deleteDoc(doc(db, 'shipping_entries', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `shipping_entries/${id}`);
    }
  };

  const importEntries = async (entriesToImport: Array<Omit<ShippingEntry, 'id' | 'userId' | 'createdAt'>>) => {
    if (entriesToImport.length === 0) {
      return 0;
    }

    if (isLocalTestMode) {
      const baseCreatedAt = Date.now();
      const nextEntries = sortEntries([
        ...entriesToImport.map((entry, index) =>
          removeUndefinedFields({
            ...entry,
            id: createLocalId(),
            userId: LOCAL_DEV_USER_ID,
            createdAt: baseCreatedAt + index,
          }) as ShippingEntry,
        ),
        ...readLocalEntries(),
      ]);

      writeLocalEntries(nextEntries);
      setEntries(nextEntries);
      return entriesToImport.length;
    }

    if (!currentUserId) {
      return 0;
    }

    try {
      const chunkSize = 400;
      const baseCreatedAt = Date.now();

      for (let start = 0; start < entriesToImport.length; start += chunkSize) {
        const batch = writeBatch(db);
        const chunk = entriesToImport.slice(start, start + chunkSize);

        chunk.forEach((entry, index) => {
          const entryRef = doc(collection(db, 'shipping_entries'));
          const dataToSave = removeUndefinedFields({
            ...entry,
            userId: currentUserId,
            createdAt: baseCreatedAt + start + index,
          });

          batch.set(entryRef, dataToSave);
        });

        await batch.commit();
      }

      return entriesToImport.length;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'shipping_entries');
    }

    return 0;
  };

  const saveConsistencyNote = async (orderNumber: string, note: string) => {
    const normalizedOrderNumber = orderNumber.replace(/\D/g, '');
    const normalizedNote = note.trim();

    if (!normalizedOrderNumber) {
      return;
    }

    if (isLocalTestMode) {
      const nextNotes = readLocalConsistencyNotes().filter((item) => item.orderNumber !== normalizedOrderNumber);

      if (normalizedNote) {
        nextNotes.unshift({
          id: normalizedOrderNumber,
          orderNumber: normalizedOrderNumber,
          note: normalizedNote,
          updatedAt: Date.now(),
          updatedByUid: LOCAL_DEV_USER_ID,
          updatedByEmail: 'admin@local.dev',
        });
      }

      writeLocalConsistencyNotes(nextNotes);
      setConsistencyNotes(sortConsistencyNotes(nextNotes));
      return;
    }

    if (!currentUserId) {
      return;
    }

    try {
      const noteRef = doc(db, 'consistency_notes', normalizedOrderNumber);

      if (!normalizedNote) {
        await deleteDoc(noteRef);
        return;
      }

      await setDoc(noteRef, {
        orderNumber: normalizedOrderNumber,
        note: normalizedNote,
        updatedAt: Date.now(),
        updatedByUid: currentUserId,
        updatedByEmail: currentUserEmail ?? null,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `consistency_notes/${normalizedOrderNumber}`);
    }
  };

  const resetTestData = () => {
    if (!isLocalTestMode) {
      return;
    }

    const seeded = sortEntries(createSeedEntries());
    writeLocalEntries(seeded);
    writeLocalConsistencyNotes([]);
    setEntries(seeded);
    setConsistencyNotes([]);
  };

  return {
    entries,
    consistencyNotes,
    loading,
    notesLoading,
    entriesError,
    notesError,
    addEntry,
    importEntries,
    updateEntry,
    deleteEntry,
    saveConsistencyNote,
    isLocalMode: isLocalTestMode,
    resetTestData,
  };
}

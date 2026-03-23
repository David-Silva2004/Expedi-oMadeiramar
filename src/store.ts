import { useState, useEffect } from 'react';
import { ShippingEntry } from './types';
import { db, auth } from './firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function useShippingStore() {
  const [entries, setEntries] = useState<ShippingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) {
      setEntries([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'shipping_entries'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newEntries: ShippingEntry[] = [];
      snapshot.forEach((doc) => {
        newEntries.push({ id: doc.id, ...doc.data() } as ShippingEntry);
      });
      setEntries(newEntries);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'shipping_entries');
    });

    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  const addEntry = async (entry: Omit<ShippingEntry, 'id' | 'userId' | 'createdAt'>) => {
    if (!auth.currentUser) return;
    try {
      const dataToSave = {
        ...entry,
        userId: auth.currentUser.uid,
        createdAt: Date.now()
      };
      
      // Firestore does not support undefined values
      Object.keys(dataToSave).forEach(key => {
        if (dataToSave[key as keyof typeof dataToSave] === undefined) {
          delete dataToSave[key as keyof typeof dataToSave];
        }
      });

      await addDoc(collection(db, 'shipping_entries'), dataToSave);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'shipping_entries');
    }
  };

  const updateEntry = async (id: string, updated: Partial<ShippingEntry>) => {
    try {
      const dataToUpdate = { ...updated };
      
      // Firestore does not support undefined values
      Object.keys(dataToUpdate).forEach(key => {
        if (dataToUpdate[key as keyof typeof dataToUpdate] === undefined) {
          delete dataToUpdate[key as keyof typeof dataToUpdate];
        }
      });

      await updateDoc(doc(db, 'shipping_entries', id), dataToUpdate);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `shipping_entries/${id}`);
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'shipping_entries', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `shipping_entries/${id}`);
    }
  };

  return { entries, loading, addEntry, updateEntry, deleteEntry };
}

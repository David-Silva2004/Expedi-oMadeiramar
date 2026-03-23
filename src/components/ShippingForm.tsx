import React, { useState } from 'react';
import { StatusType, ShippingEntry } from '../types';
import { X } from 'lucide-react';

interface Props {
  entry?: ShippingEntry;
  onSave: (entry: Omit<ShippingEntry, 'id' | 'userId' | 'createdAt'>) => void;
  onClose: () => void;
}

export function ShippingForm({ entry, onSave, onClose }: Props) {
  const [date, setDate] = useState(entry?.date || new Date().toISOString().split('T')[0]);
  const [orderNumber, setOrderNumber] = useState(entry?.orderNumber || '');
  const [customer, setCustomer] = useState(entry?.customer || '');
  const [statusType, setStatusType] = useState<StatusType>(entry?.statusType || 'MDF_ONLY');
  const [volumes, setVolumes] = useState<number>(entry?.volumes || 1);
  const [otherDescription, setOtherDescription] = useState(entry?.otherDescription || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      date,
      orderNumber,
      customer,
      statusType,
      volumes: statusType === 'HARDWARE' ? volumes : undefined,
      otherDescription: statusType === 'OTHER' ? otherDescription : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-800">
            {entry ? 'Editar Expedição' : 'Nova Expedição'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data da Venda</label>
            <input 
              type="date" 
              required 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Número do Pedido / Venda</label>
            <input 
              type="text" 
              required 
              value={orderNumber} 
              onChange={e => setOrderNumber(e.target.value)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
              placeholder="Ex: 172974" 
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <input 
              type="text" 
              required 
              value={customer} 
              onChange={e => setCustomer(e.target.value)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
              placeholder="Ex: MARCOS EVANGELISTA" 
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Expedição</label>
            <select 
              value={statusType} 
              onChange={e => setStatusType(e.target.value as StatusType)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow bg-white"
            >
              <option value="MDF_ONLY">Só MDF / Corte / Colagem (X)</option>
              <option value="HARDWARE">Com Ferragem (Volumes)</option>
              <option value="RETURN">Devolução / Retirar</option>
              <option value="OTHER">Outros</option>
            </select>
          </div>
          
         {statusType === 'HARDWARE' && (
            <div className="animate-in slide-in-from-top-2 duration-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade de Volumes (Máx: 10)</label>
              <input 
                type="number" 
                min="1" 
                max="10"
                required 
                value={volumes} 
                onChange={e => {
                  if (e.target.value === '') {
                    setVolumes('');
                    return;
                  }
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) {
                    setVolumes(val > 10 ? 10 : val);
                  }
                }} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
              />
            </div>
          )}
          
          {statusType === 'OTHER' && (
            <div className="animate-in slide-in-from-top-2 duration-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <input 
                type="text" 
                required 
                value={otherDescription} 
                onChange={e => setOtherDescription(e.target.value)} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
                placeholder="Ex: COLETA/MATERIAL" 
              />
            </div>
          )}
          
          <div className="pt-6 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors shadow-sm"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

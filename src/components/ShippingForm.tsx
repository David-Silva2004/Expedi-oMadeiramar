import React, { useState } from 'react';
import { StatusType, ShippingEntry } from '../types';
import { X } from 'lucide-react';

interface Props {
  customerSuggestions?: string[];
  entry?: ShippingEntry;
  onSave: (entry: Omit<ShippingEntry, 'id' | 'userId' | 'createdAt'>) => void;
  onClose: () => void;
}

function normalizeCustomerSuggestion(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function ShippingForm({ customerSuggestions = [], entry, onSave, onClose }: Props) {
  const [date, setDate] = useState(entry?.date || new Date().toISOString().split('T')[0]);
  const [orderNumber, setOrderNumber] = useState((entry?.orderNumber || '').replace(/\D/g, ''));
  const [customer, setCustomer] = useState(entry?.customer || '');
  const [statusType, setStatusType] = useState<StatusType>(entry?.statusType || 'MDF_ONLY');
  const [volumes, setVolumes] = useState<number>(entry?.volumes || 1);
  const [otherDescription, setOtherDescription] = useState(entry?.otherDescription || '');
  const normalizedCustomerSearch = normalizeCustomerSuggestion(customer);
  const filteredCustomerSuggestions = customerSuggestions
    .filter((suggestion) => {
      const normalizedSuggestion = normalizeCustomerSuggestion(suggestion);

      if (!normalizedCustomerSearch) {
        return true;
      }

      return normalizedSuggestion.includes(normalizedCustomerSearch);
    })
    .filter((suggestion) => normalizeCustomerSuggestion(suggestion) !== normalizedCustomerSearch)
    .slice(0, 6);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedOrderNumber = orderNumber.replace(/\D/g, '');

    if (!normalizedOrderNumber) {
      alert('O código do pedido deve conter apenas números.');
      return;
    }

    onSave({
      date,
      orderNumber: normalizedOrderNumber,
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
              onChange={e => setOrderNumber(e.target.value.replace(/\D/g, ''))} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
              inputMode="numeric"
              pattern="[0-9]*"
              title="Digite apenas números"
              placeholder="Ex: 172974" 
            />
            <p className="mt-1 text-xs text-gray-500">Aceita somente números e não permite repetir o mesmo pedido no mesmo dia.</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <input 
              type="text" 
              required 
              value={customer} 
              onChange={e => setCustomer(e.target.value)} 
              list={customerSuggestions.length > 0 ? 'recent-customer-suggestions' : undefined}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow" 
              placeholder="Ex: MARCOS EVANGELISTA" 
            />
            {customerSuggestions.length > 0 && (
              <datalist id="recent-customer-suggestions">
                {customerSuggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            )}
            {customer.trim() && filteredCustomerSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {filteredCustomerSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setCustomer(suggestion)}
                    className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {customerSuggestions.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Sugestoes opcionais com base nos clientes expedidos nos ultimos 7 dias.
              </p>
            )}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade de Volumes (Máx: 30)</label>
              <input 
                type="number" 
                min="1" 
                max="30"
                required 
                value={volumes} 
                onChange={e => {
                  if (e.target.value === '') {
                    setVolumes('');
                    return;
                  }
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) {
                    setVolumes(val > 30 ? 30 : val);
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
